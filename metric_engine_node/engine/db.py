"""
Database layer for metric engine: read laststatus state, update state columns, insert metric_events.
Consumer owns position + trackdata mirror; metric engine owns state columns only.
Circuit breaker wraps all DB operations (plan § 2.9).
"""
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .circuit_breaker import db_circuit_breaker, CircuitBreakerOpenError

logger = logging.getLogger(__name__)

_pool = None


async def _get_pool_raw():
    """Create or return asyncpg connection pool (internal, no breaker)."""
    global _pool
    if _pool is not None:
        return _pool
    import asyncpg
    from config import Config
    db = Config.get_database_config()
    _pool = await asyncpg.create_pool(
        host=db.get("host", "localhost"),
        port=int(db.get("port", 5432)),
        database=db.get("name", "megatechtrackers"),
        user=db.get("user", "postgres"),
        password=db.get("password", ""),
        min_size=int(db.get("min_size", 1)),
        max_size=int(db.get("max_size", 5)),
        command_timeout=10,
        statement_cache_size=0,  # Required for pgbouncer transaction pooling
        server_settings={
            "application_name": "megatechtrackers_metric_engine",
            "timezone": "UTC",
        },
        max_inactive_connection_lifetime=1800,  # Recycle idle connections after 30 min (align with consumer/parser)
    )
    return _pool


async def get_pool():
    """Get or create asyncpg connection pool (through circuit breaker)."""
    return await db_circuit_breaker.call(_get_pool_raw)


STATE_COLUMNS = [
    "vehicle_state", "trip_in_progress", "current_trip_id", "current_fence_ids",
    "driving_session_start", "driving_session_distance", "idle_start_time",
    "rest_start_time",
    "speeding_start_time", "speeding_max_speed", "seatbelt_unbuckled_start",
    "seatbelt_unbuckled_distance", "temp_violation_start", "humidity_violation_start",
    "temp_stuck_since", "prev_temp_value", "prev_fuel_level",
    "last_violation_time", "last_violation_type",
    "stoppage_start_time", "stoppage_start_lat", "stoppage_start_lon",
    "last_processed_gps_time",
]


async def get_road_speed_limit(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """Return road_type and speed_limit for point from road table (ST_DWithin). Plan § 4 speed by road type."""
    if lat is None or lon is None:
        return None
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT road_type, speed_limit
                FROM road
                WHERE road_linestring IS NOT NULL
                  AND ST_DWithin(
                      road_linestring::geography,
                      ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                      (COALESCE(road_width, 20) / 2.0)::double precision
                  )
                ORDER BY ST_Distance(road_linestring::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)
                LIMIT 1
                """,
                lon,
                lat,
            )
            return dict(row) if row else None
    except Exception as e:
        logger.debug("get_road_speed_limit failed: %s", e)
        return None


async def _read_laststatus_state_impl(imei: int) -> Dict[str, Any]:
    pool = await _get_pool_raw()
    async with pool.acquire() as conn:
        cols = ", ".join(STATE_COLUMNS) + ", gps_time, server_time, latitude, longitude"
        row = await conn.fetchrow(
            f"SELECT {cols} FROM laststatus WHERE imei = $1",
            imei,
        )
        if row is None:
            return {}
        return dict(row)


async def read_laststatus_state(imei: int) -> Dict[str, Any]:
    """Read metric-engine state + position for context. Returns dict of column -> value."""
    try:
        return await db_circuit_breaker.call(_read_laststatus_state_impl, imei)
    except CircuitBreakerOpenError:
        raise
    except Exception as e:
        logger.warning("read_laststatus_state failed for imei=%s: %s", imei, e)
        return {}


async def _handle_trip_actions_impl(imei: int, updates: Dict[str, Any]) -> None:
    """Process _trip_action (start/end): insert/update trip, merge state into updates. Uses _get_pool_raw."""
    out = {}
    action = updates.pop("_trip_action", None)
    if not action:
        return
    pool = await _get_pool_raw()
    async with pool.acquire() as conn:
        if action == "start":
            start_time = updates.pop("_trip_start_time", None)
            start_lat = updates.pop("_trip_start_lat", None)
            start_lon = updates.pop("_trip_start_lon", None)
            vehicle_id = await conn.fetchval(
                "SELECT vehicle_id FROM tracker WHERE imei = $1", imei
            )
            if vehicle_id is not None:
                row = await conn.fetchrow(
                    """
                    INSERT INTO trip (vehicle_id, trip_type, trip_status, creation_mode,
                                     trip_start_time, start_latitude, start_longitude)
                    VALUES ($1, 'Ignition-Based', 'Ongoing', 'Automatic', $2, $3, $4)
                    RETURNING trip_id
                    """,
                    vehicle_id,
                    start_time,
                    start_lat,
                    start_lon,
                )
                if row:
                    out["trip_in_progress"] = True
                    out["current_trip_id"] = row["trip_id"]
            else:
                out["trip_in_progress"] = False
                out["current_trip_id"] = None
        elif action == "end":
            end_time = updates.pop("_trip_end_time", None)
            end_lat = updates.pop("_trip_end_lat", None)
            end_lon = updates.pop("_trip_end_lon", None)
            current_trip_id = await conn.fetchval(
                "SELECT current_trip_id FROM laststatus WHERE imei = $1", imei
            )
            if current_trip_id:
                await conn.execute(
                    """
                    UPDATE trip SET trip_end_time = $1, end_latitude = $2, end_longitude = $3,
                                    trip_status = 'Completed', updated_at = NOW()
                    WHERE trip_id = $4
                    """,
                    end_time,
                    end_lat,
                    end_lon,
                    current_trip_id,
                )
            out["trip_in_progress"] = False
            out["current_trip_id"] = None
    for k in list(updates.keys()):
        if k.startswith("_trip_"):
            updates.pop(k, None)
    updates.update(out)


async def handle_trip_actions(imei: int, updates: Dict[str, Any]) -> Dict[str, Any]:
    """Process _trip_action (start/end): insert/update trip, return state updates. Strips _trip_* from updates."""
    try:
        await _handle_trip_actions_impl(imei, updates)
    except Exception as e:
        logger.warning("handle_trip_actions failed for imei=%s: %s", imei, e)
    return dict(updates)


async def _update_laststatus_state_impl(
    imei: int,
    updates: Dict[str, Any],
    gps_time: Optional[datetime] = None,
    insert_if_missing: Optional[Dict[str, Any]] = None,
) -> None:
    """Plan § 3.5: UPDATE state columns; if row missing and insert_if_missing provided, INSERT minimal row."""
    await _handle_trip_actions_impl(imei, updates)
    if not updates:
        return
    if gps_time is not None:
        updates["last_processed_gps_time"] = gps_time
    new_vehicle_state = updates.get("vehicle_state")
    pool = await _get_pool_raw()
    async with pool.acquire() as conn:
        previous_state = None
        if new_vehicle_state is not None:
            row = await conn.fetchrow(
                "SELECT vehicle_state FROM laststatus WHERE imei = $1", imei
            )
            previous_state = row["vehicle_state"] if row else None
        allowed = set(STATE_COLUMNS)
        set_parts = []
        args = []
        i = 1
        for k, v in updates.items():
            if k not in allowed:
                continue
            if v is None:
                set_parts.append(f'"{k}" = NULL')
            else:
                set_parts.append(f'"{k}" = ${i}')
                args.append(v)
                i += 1
        if not set_parts:
            return
        args.append(imei)
        q = f"UPDATE laststatus SET {', '.join(set_parts)} WHERE imei = ${i}"
        result = await conn.execute(q, *args)
        # Plan § 2.1: if no row (new device), INSERT minimal position + state when insert_if_missing provided
        # asyncpg execute returns e.g. "UPDATE 1" or "UPDATE 0"
        rows_affected = result.strip().split()[-1] if result else "0"
        if rows_affected == "0" and insert_if_missing:
            lat = insert_if_missing.get("latitude")
            lon = insert_if_missing.get("longitude")
            ts = gps_time or datetime.now(timezone.utc)
            cols = ["imei", "gps_time", "latitude", "longitude"]
            vals = [imei, ts, lat, lon]
            for k, v in updates.items():
                if k not in allowed:
                    continue
                cols.append(f'"{k}"')
                vals.append(v)
            placeholders = ", ".join(f"${n}" for n in range(1, len(vals) + 1))
            col_list = ", ".join(cols)
            await conn.execute(
                f"INSERT INTO laststatus ({col_list}) VALUES ({placeholders})",
                *vals,
            )
        # Plan § 6.3: log vehicle_state transition to laststatus_history
        if new_vehicle_state is not None and new_vehicle_state != previous_state:
            ts = gps_time or datetime.now(timezone.utc)
            await conn.execute(
                """
                INSERT INTO laststatus_history (imei, gps_time, vehicle_state, previous_state)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (imei, gps_time) DO UPDATE SET vehicle_state = EXCLUDED.vehicle_state, previous_state = EXCLUDED.previous_state
                """,
                imei,
                ts,
                new_vehicle_state,
                previous_state,
            )


async def update_laststatus_state(
    imei: int,
    updates: Dict[str, Any],
    gps_time: Optional[datetime] = None,
    insert_if_missing: Optional[Dict[str, Any]] = None,
) -> None:
    """Update only metric-engine state columns. If row missing and insert_if_missing (lat/lon) given, INSERT minimal row (plan § 2.1)."""
    try:
        await db_circuit_breaker.call(
            _update_laststatus_state_impl, imei, updates, gps_time, insert_if_missing
        )
    except CircuitBreakerOpenError:
        raise
    except Exception as e:
        logger.warning("update_laststatus_state failed for imei=%s: %s", imei, e)


def _metric_event_metadata(ev: Dict[str, Any]) -> str:
    """Plan § 6.3: include imei and gps_time in metadata for trackdata join."""
    meta = dict(ev.get("metadata") or {})
    if ev.get("imei") is not None:
        meta.setdefault("imei", ev["imei"])
    gt = ev.get("gps_time")
    if gt is not None:
        meta.setdefault("gps_time", gt.isoformat() if hasattr(gt, "isoformat") else str(gt))
    return json.dumps(meta)


async def _insert_metric_events_impl(events: List[Dict[str, Any]]) -> None:
    pool = await _get_pool_raw()
    async with pool.acquire() as conn:
        for ev in events:
            await conn.execute(
                """
                INSERT INTO metric_events (
                    imei, gps_time, event_category, event_type,
                    event_value, threshold_value, duration_sec, severity,
                    fence_id, trip_id, latitude, longitude, metadata, formula_version, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                """,
                ev.get("imei"),
                ev.get("gps_time"),
                ev.get("event_category"),
                ev.get("event_type"),
                ev.get("event_value"),
                ev.get("threshold_value"),
                ev.get("duration_sec"),
                ev.get("severity"),
                ev.get("fence_id"),
                ev.get("trip_id"),
                ev.get("latitude"),
                ev.get("longitude"),
                _metric_event_metadata(ev),
                ev.get("formula_version") or "1.0.0",
                datetime.now(timezone.utc),
            )


async def insert_metric_events(events: List[Dict[str, Any]]) -> None:
    """Insert rows into metric_events."""
    if not events:
        return
    try:
        await db_circuit_breaker.call(_insert_metric_events_impl, events)
    except CircuitBreakerOpenError:
        raise
    except Exception as e:
        logger.warning("insert_metric_events failed: %s", e)


# --- Message retry tracking (plan § 2.6: bounded retries, DLQ after max, persist so restarts do not reset) ---

async def get_message_retry_count(message_signature: str) -> int:
    """Return current retry count for message_signature (0 if not found)."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT retry_count FROM metric_engine_message_retries WHERE message_signature = $1",
                message_signature,
            )
            return int(row["retry_count"]) if row else 0
    except Exception as e:
        logger.debug("get_message_retry_count failed: %s", e)
        return 0


async def increment_message_retry_count(message_signature: str) -> int:
    """Increment retry count for message_signature; return new count."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO metric_engine_message_retries (message_signature, retry_count, updated_at)
                VALUES ($1, 1, NOW())
                ON CONFLICT (message_signature) DO UPDATE SET
                    retry_count = metric_engine_message_retries.retry_count + 1,
                    updated_at = NOW()
                """,
                message_signature,
            )
            row = await conn.fetchrow(
                "SELECT retry_count FROM metric_engine_message_retries WHERE message_signature = $1",
                message_signature,
            )
            return int(row["retry_count"]) if row else 1
    except Exception as e:
        logger.warning("increment_message_retry_count failed: %s", e)
        return 1


async def clear_message_retry_count(message_signature: str) -> None:
    """Clear retry count on successful processing (plan § 2.6)."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM metric_engine_message_retries WHERE message_signature = $1",
                message_signature,
            )
    except Exception as e:
        logger.debug("clear_message_retry_count failed: %s", e)


# Plan § 2.9: message deduplication — skip if already processed; mark after success
async def is_message_processed(message_signature: str) -> bool:
    """Return True if this message was already successfully processed (idempotency)."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT 1 FROM metric_engine_processed_messages WHERE message_signature = $1",
                message_signature,
            )
            return row is not None
    except Exception as e:
        logger.debug("is_message_processed failed: %s", e)
        return False


async def mark_message_processed(message_signature: str) -> None:
    """Record message as successfully processed (plan § 2.9)."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO metric_engine_processed_messages (message_signature, processed_at)
                VALUES ($1, NOW())
                ON CONFLICT (message_signature) DO UPDATE SET processed_at = NOW()
                """,
                message_signature,
            )
    except Exception as e:
        logger.warning("mark_message_processed failed: %s", e)


async def cleanup_old_processed_messages(max_age_days: int = 7) -> int:
    """Delete processed-message rows older than max_age_days. Returns rows deleted."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM metric_engine_processed_messages
                WHERE processed_at < NOW() - make_interval(days => $1::integer)
                """,
                max_age_days,
            )
            n = int(result.split()[-1]) if result and result.split() else 0
            if n > 0:
                logger.info("Cleanup metric_engine_processed_messages: deleted %s old rows", n)
            return n
    except Exception as e:
        logger.warning("cleanup_old_processed_messages failed: %s", e)
        return 0


async def cleanup_old_message_retries(max_age_days: int = 7) -> int:
    """
    Delete retry rows older than max_age_days to avoid unbounded table growth.
    Called periodically (e.g. daily with scheduled refresh). Returns rows deleted.
    """
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM metric_engine_message_retries
                WHERE updated_at < NOW() - make_interval(days => $1::integer)
                """,
                max_age_days,
            )
            # result is like "DELETE 42"
            n = int(result.split()[-1]) if result and result.split() else 0
            if n > 0:
                logger.info("Cleanup metric_engine_message_retries: deleted %s old rows", n)
            return n
    except Exception as e:
        logger.warning("cleanup_old_message_retries failed: %s", e)
        return 0


# --- metrics_alarm_config (plan Phase 8: per-IMEI alarm settings) ---

async def get_metrics_alarm_config_for_events(events: List[Dict[str, Any]]) -> Dict[tuple, Dict[str, Any]]:
    """
    Batch fetch metrics_alarm_config for (imei, event_type) pairs.
    Returns dict keyed by (imei, event_type) with {enabled, is_alarm, start_time, end_time}.
    Missing key = no config = default publish.
    """
    if not events:
        return {}
    keys = set()
    for ev in events:
        imei = ev.get("imei")
        etype = ev.get("event_type")
        if imei is not None and etype:
            keys.add((int(imei), str(etype)))
    if not keys:
        return {}
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            key_list = list(keys)
            # Fetch all config rows for these (imei, event_type); no row = default publish
            conditions = " OR ".join(
                [f"(imei = ${2*i+1} AND event_type = ${2*i+2})" for i in range(len(key_list))]
            )
            params = []
            for (imei, etype) in key_list:
                params.extend([imei, etype])
            rows = await conn.fetch(
                f"""
                SELECT imei, event_type, enabled, is_alarm, start_time, end_time
                FROM metrics_alarm_config
                WHERE {conditions}
                """,
                *params,
            )
            result = {}
            for row in rows:
                k = (int(row["imei"]), str(row["event_type"]))
                result[k] = {
                    "enabled": bool(row["enabled"]) if row["enabled"] is not None else True,
                    "is_alarm": int(row["is_alarm"] or 0),
                    "start_time": row["start_time"],
                    "end_time": row["end_time"],
                }
            return result
    except Exception as e:
        logger.debug("get_metrics_alarm_config_for_events failed: %s", e)
        return {}


# --- calibration (Phase 3: raw fuel sensor -> liters per vehicle) ---

async def get_fuel_liters_from_calibration(
    vehicle_id: Optional[int], raw_value: float
) -> Optional[float]:
    """
    Convert raw fuel sensor value to liters using calibration table (piecewise linear).
    Returns None if vehicle_id is None, no calibration rows, or raw_value out of range.
    """
    if vehicle_id is None:
        return None
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT raw_value_min, raw_value_max, calibrated_liters, sequence
                FROM calibration
                WHERE vehicle_id = $1
                ORDER BY sequence
                """,
                vehicle_id,
            )
        if not rows:
            return None
        # Find segment containing raw_value
        prev_cumulative = 0.0
        for row in rows:
            rmin = float(row["raw_value_min"])
            rmax = float(row["raw_value_max"])
            seg_liters = float(row["calibrated_liters"])
            if rmin <= raw_value <= rmax:
                span = rmax - rmin
                if span <= 0:
                    return prev_cumulative + seg_liters
                frac = (raw_value - rmin) / span
                return prev_cumulative + frac * seg_liters
            # This segment ends at rmax; cumulative liters at end of segment
            prev_cumulative += seg_liters
        return None
    except Exception as e:
        logger.debug("get_fuel_liters_from_calibration failed: %s", e)
        return None


async def _update_trip_accumulation_impl(
    trip_id: int, distance_km: float, gps_time: datetime
) -> None:
    pool = await _get_pool_raw()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE trip SET
                total_distance_km = COALESCE(total_distance_km, 0) + $1,
                total_duration_sec = EXTRACT(EPOCH FROM ($2 - trip_start_time))::INTEGER,
                updated_at = NOW()
            WHERE trip_id = $3 AND trip_status = 'Ongoing'
            """,
            distance_km,
            gps_time,
            trip_id,
        )


async def update_trip_accumulation(
    trip_id: int, distance_km: float, gps_time: datetime
) -> None:
    """Update trip total_distance_km and total_duration_sec (plan § 8.2 trip core metrics)."""
    if trip_id is None or distance_km is None or distance_km <= 0:
        return
    try:
        await db_circuit_breaker.call(_update_trip_accumulation_impl, trip_id, distance_km, gps_time)
    except CircuitBreakerOpenError:
        raise
    except Exception as e:
        logger.warning("update_trip_accumulation failed trip_id=%s: %s", trip_id, e)


async def update_trip_fuel_consumed_for_vehicle(vehicle_id: int) -> int:
    """
    Plan § 9B.2: After calibration change, recompute trip.fuel_consumed for completed trips of this vehicle.
    Uses trackdata fuel + calibration (raw -> liters) for trip start/end; fuel_consumed = start_liters - end_liters.
    Returns number of trips updated.
    """
    if vehicle_id is None:
        return 0
    try:
        pool = await _get_pool_raw()
        async with pool.acquire() as conn:
            imei_row = await conn.fetchval("SELECT imei FROM tracker WHERE vehicle_id = $1 LIMIT 1", vehicle_id)
            if imei_row is None:
                return 0
            imei = int(imei_row)
            trips = await conn.fetch(
                """
                SELECT trip_id, trip_start_time, trip_end_time
                FROM trip
                WHERE vehicle_id = $1 AND trip_status = 'Completed'
                  AND trip_start_time IS NOT NULL AND trip_end_time IS NOT NULL
                ORDER BY trip_start_time
                """,
                vehicle_id,
            )
            updated = 0
            for t in trips:
                trip_id = t["trip_id"]
                start_ts = t["trip_start_time"]
                end_ts = t["trip_end_time"]
                start_fuel = await conn.fetchval(
                    "SELECT fuel FROM trackdata WHERE imei = $1 AND gps_time >= $2 AND gps_time <= $3 ORDER BY gps_time ASC LIMIT 1",
                    imei,
                    start_ts,
                    end_ts,
                )
                end_fuel = await conn.fetchval(
                    "SELECT fuel FROM trackdata WHERE imei = $1 AND gps_time >= $2 AND gps_time <= $3 ORDER BY gps_time DESC LIMIT 1",
                    imei,
                    start_ts,
                    end_ts,
                )
                if start_fuel is not None and end_fuel is not None:
                    start_liters = await get_fuel_liters_from_calibration(vehicle_id, float(start_fuel))
                    end_liters = await get_fuel_liters_from_calibration(vehicle_id, float(end_fuel))
                    if start_liters is not None and end_liters is not None:
                        consumed = max(0.0, float(start_liters) - float(end_liters))
                        await conn.execute(
                            "UPDATE trip SET fuel_consumed = $1, updated_at = NOW() WHERE trip_id = $2",
                            consumed,
                            trip_id,
                        )
                        updated += 1
            return updated
    except Exception as e:
        logger.warning("update_trip_fuel_consumed_for_vehicle failed vehicle_id=%s: %s", vehicle_id, e)
        return 0


async def _insert_stoppage_log_impl(
    trip_id: int,
    stoppage_type: str,
    start_time: datetime,
    end_time: datetime,
    latitude: Optional[float],
    longitude: Optional[float],
    inside_fence_id: Optional[int],
) -> None:
    duration_sec = int((end_time - start_time).total_seconds())
    pool = await _get_pool_raw()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO trip_stoppage_log (trip_id, stoppage_type, start_time, end_time, duration_sec, latitude, longitude, inside_fence_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            """,
            trip_id,
            stoppage_type or "Stop",
            start_time,
            end_time,
            duration_sec,
            latitude,
            longitude,
            inside_fence_id,
        )


async def insert_stoppage_log(
    trip_id: int,
    stoppage_type: str,
    start_time: datetime,
    end_time: datetime,
    latitude: Optional[float],
    longitude: Optional[float],
    inside_fence_id: Optional[int] = None,
) -> None:
    """Insert one row into trip_stoppage_log (plan § 8.2)."""
    if not trip_id or not start_time or not end_time:
        return
    try:
        await db_circuit_breaker.call(
            _insert_stoppage_log_impl,
            trip_id,
            stoppage_type,
            start_time,
            end_time,
            latitude,
            longitude,
            inside_fence_id,
        )
    except CircuitBreakerOpenError:
        raise
    except Exception as e:
        logger.warning("insert_stoppage_log failed: %s", e)


async def update_fence_wise_trip(
    trip_id: int,
    source_exit_time: Optional[datetime] = None,
    destination_arrival_time: Optional[datetime] = None,
) -> None:
    """Update trip_fence_wise_extension (plan § 8.4)."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            if source_exit_time is not None:
                await conn.execute(
                    "UPDATE trip_fence_wise_extension SET source_exit_time = $1 WHERE trip_id = $2",
                    source_exit_time,
                    trip_id,
                )
            if destination_arrival_time is not None:
                await conn.execute(
                    "UPDATE trip_fence_wise_extension SET destination_arrival_time = $1 WHERE trip_id = $2",
                    destination_arrival_time,
                    trip_id,
                )
    except Exception as e:
        logger.warning("update_fence_wise_trip failed: %s", e)


async def complete_trip(trip_id: int, end_time: datetime, end_lat: Optional[float], end_lon: Optional[float]) -> None:
    """Set trip to Completed (plan § 8.4)."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE trip SET trip_end_time = $1, end_latitude = $2, end_longitude = $3,
                                trip_status = 'Completed', updated_at = NOW()
                WHERE trip_id = $4
                """,
                end_time,
                end_lat,
                end_lon,
                trip_id,
            )
    except Exception as e:
        logger.warning("complete_trip failed: %s", e)


async def get_active_fence_wise_trips(vehicle_id: int) -> List[Dict[str, Any]]:
    """Load ongoing Fence-Wise trips for vehicle (plan § 8.4)."""
    if vehicle_id is None:
        return []
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT t.trip_id, t.vehicle_id, fw.origin_fence_id, fw.destination_fence_id,
                       fw.source_exit_time, fw.destination_arrival_time
                FROM trip t
                JOIN trip_fence_wise_extension fw ON fw.trip_id = t.trip_id
                WHERE t.vehicle_id = $1 AND t.trip_status = 'Ongoing' AND t.trip_type = 'Fence-Wise'
                """,
                vehicle_id,
            )
            return [dict(r) for r in rows]
    except Exception as e:
        logger.debug("get_active_fence_wise_trips failed: %s", e)
        return []


async def point_in_fence_simple(fence_id: int, lat: float, lon: float) -> bool:
    """ST_Contains(polygon, point) for fence_id."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT ST_Contains(polygon, ST_SetSRID(ST_MakePoint($1, $2), 4326)) AS inside FROM fence WHERE fence_id = $3",
                lon,
                lat,
                fence_id,
            )
            return row and row["inside"]
    except Exception as e:
        logger.debug("point_in_fence_simple failed: %s", e)
        return False


# --- Round trip (upload_sheet) ---

async def get_pending_upload_sheet_trip(vehicle_id: int) -> Optional[Dict[str, Any]]:
    """One upload_sheet row for vehicle with start_date+start_time in the past and no trip yet for this upload_id."""
    if vehicle_id is None:
        return None
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT u.upload_id, u.vehicle_id, u.client_id, u.destination_fence_id,
                       (u.start_date + COALESCE(u.start_time, '00:00'::time))::timestamptz AS start_ts
                FROM upload_sheet u
                WHERE u.vehicle_id = $1
                  AND (u.start_date + COALESCE(u.start_time, '00:00'::time))::timestamptz <= NOW()
                  AND NOT EXISTS (
                      SELECT 1 FROM trip_round_extension r WHERE r.upload_id = u.upload_id
                  )
                ORDER BY u.upload_id DESC
                LIMIT 1
                """,
                vehicle_id,
            )
            return dict(row) if row else None
    except Exception as e:
        logger.debug("get_pending_upload_sheet_trip failed: %s", e)
        return None


async def create_round_trip_from_upload(
    vehicle_id: int,
    upload_id: int,
    planned_fence_id: int,
    start_ts: datetime,
    start_lat: Optional[float],
    start_lon: Optional[float],
) -> Optional[int]:
    """Create trip (Round-Trip) + trip_round_extension; return trip_id."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO trip (vehicle_id, trip_type, trip_status, creation_mode, trip_start_time, start_latitude, start_longitude)
                VALUES ($1, 'Round-Trip', 'Ongoing', 'Manual', $2, $3, $4)
                RETURNING trip_id
                """,
                vehicle_id,
                start_ts,
                start_lat,
                start_lon,
            )
            if not row:
                return None
            trip_id = row["trip_id"]
            await conn.execute(
                """
                INSERT INTO trip_round_extension (trip_id, planned_fence_id, upload_id)
                VALUES ($1, $2, $3)
                """,
                trip_id,
                planned_fence_id,
                upload_id,
            )
            return trip_id
    except Exception as e:
        logger.warning("create_round_trip_from_upload failed: %s", e)
        return None


async def get_active_round_trips(vehicle_id: int) -> List[Dict[str, Any]]:
    """Ongoing Round-Trip trips for vehicle with extension details."""
    if vehicle_id is None:
        return []
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT t.trip_id, t.vehicle_id, r.planned_fence_id, r.upload_id,
                       r.destination_arrival_time, r.destination_exit_time, r.deviation_status, r.time_compliance
                FROM trip t
                JOIN trip_round_extension r ON r.trip_id = t.trip_id
                WHERE t.vehicle_id = $1 AND t.trip_status = 'Ongoing' AND t.trip_type = 'Round-Trip'
                """,
                vehicle_id,
            )
            return [dict(r) for r in rows]
    except Exception as e:
        logger.debug("get_active_round_trips failed: %s", e)
        return []


async def update_round_trip(
    trip_id: int,
    destination_arrival_time: Optional[datetime] = None,
    destination_exit_time: Optional[datetime] = None,
    deviation_status: Optional[str] = None,
    time_compliance: Optional[str] = None,
) -> None:
    """Update trip_round_extension fields."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            updates = []
            args = []
            i = 1
            if destination_arrival_time is not None:
                updates.append(f"destination_arrival_time = ${i}")
                args.append(destination_arrival_time)
                i += 1
            if destination_exit_time is not None:
                updates.append(f"destination_exit_time = ${i}")
                args.append(destination_exit_time)
                i += 1
            if deviation_status is not None:
                updates.append(f"deviation_status = ${i}")
                args.append(deviation_status)
                i += 1
            if time_compliance is not None:
                updates.append(f"time_compliance = ${i}")
                args.append(time_compliance)
                i += 1
            if updates:
                args.append(trip_id)
                await conn.execute(
                    f"UPDATE trip_round_extension SET {', '.join(updates)} WHERE trip_id = ${i}",
                    *args,
                )
    except Exception as e:
        logger.warning("update_round_trip failed: %s", e)


# --- Route-based trip ---

async def get_route_assignment_for_vehicle(vehicle_id: int) -> Optional[Dict[str, Any]]:
    """Active route_assignment for vehicle (vehicle_id match or client-wide)."""
    if vehicle_id is None:
        return None
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT ra.assignment_id, ra.route_id, ra.vehicle_id, ra.client_id
                FROM route_assignment ra
                WHERE ra.is_active = TRUE AND (ra.vehicle_id = $1 OR ra.vehicle_id IS NULL)
                ORDER BY ra.vehicle_id DESC NULLS LAST
                LIMIT 1
                """,
                vehicle_id,
            )
            return dict(row) if row else None
    except Exception as e:
        logger.debug("get_route_assignment_for_vehicle failed: %s", e)
        return None


async def point_on_route(route_id: int, lat: float, lon: float, threshold_km: float = 3.5) -> bool:
    """True if point within threshold_km of route polyline (geography distance in m)."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            threshold_m = threshold_km * 1000.0
            row = await conn.fetchrow(
                """
                SELECT ST_DWithin(
                    polyline::geography,
                    ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                    $3
                ) AS on_route
                FROM route WHERE route_id = $4 AND polyline IS NOT NULL
                """,
                lon,
                lat,
                threshold_m,
                route_id,
            )
            return row and row["on_route"]
    except Exception as e:
        logger.debug("point_on_route failed: %s", e)
        return False


async def create_route_trip(vehicle_id: int, route_id: int, start_time: datetime, lat: Optional[float], lon: Optional[float]) -> Optional[int]:
    """Create trip (Route-Based) + trip_route_extension; return trip_id."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO trip (vehicle_id, trip_type, trip_status, creation_mode, trip_start_time, start_latitude, start_longitude)
                VALUES ($1, 'Route-Based', 'Ongoing', 'Automatic', $2, $3, $4)
                RETURNING trip_id
                """,
                vehicle_id,
                start_time,
                lat,
                lon,
            )
            if not row:
                return None
            trip_id = row["trip_id"]
            await conn.execute(
                "INSERT INTO trip_route_extension (trip_id, route_id, deviation_status, deviation_count) VALUES ($1, $2, 'On-Route', 0)",
                trip_id,
                route_id,
            )
            return trip_id
    except Exception as e:
        logger.warning("create_route_trip failed: %s", e)
        return None


async def get_active_route_trip(vehicle_id: int) -> Optional[Dict[str, Any]]:
    """Ongoing Route-Based trip for vehicle with extension."""
    if vehicle_id is None:
        return None
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT t.trip_id, t.vehicle_id, r.route_id, r.deviation_count, r.deviation_status
                FROM trip t
                JOIN trip_route_extension r ON r.trip_id = t.trip_id
                WHERE t.vehicle_id = $1 AND t.trip_status = 'Ongoing' AND t.trip_type = 'Route-Based'
                LIMIT 1
                """,
                vehicle_id,
            )
            return dict(row) if row else None
    except Exception as e:
        logger.debug("get_active_route_trip failed: %s", e)
        return None


async def update_route_trip_deviation(trip_id: int, deviation_count: int, deviation_status: str = "Deviated") -> None:
    """Update trip_route_extension deviation_count and deviation_status."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE trip_route_extension SET deviation_count = $1, deviation_status = $2 WHERE trip_id = $3",
                deviation_count,
                deviation_status,
                trip_id,
            )
    except Exception as e:
        logger.warning("update_route_trip_deviation failed: %s", e)
