"""
Metric engine pipeline: load config + previous state → run calculators → write state + events.
Plan § 2.6 / Appendix A: validate record; invalid/partial → invalid_data_queue.
Plan § 10.2 Phase 2: shadow_mode = calculate and log only, no DB writes or alarm publish.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from dateutil import parser as date_parser

from config import Config
from .config_resolution import get_config_cached
from .db import (
    get_pool,
    read_laststatus_state,
    update_laststatus_state,
    insert_metric_events,
    update_trip_accumulation,
    insert_stoppage_log,
)
from .alarm_publisher import publish_metric_events as publish_metric_events_to_alarm
from .calculators.registry import get_applicable_calculators, run_calculators
from .calculators.base import CalculatorContext, CalculatorResult
from .pending_writes import push as pending_push, flush as pending_flush
from .circuit_breaker import CircuitBreakerOpenError

logger = logging.getLogger(__name__)

# Plan § 2.6 / Appendix A: validation bounds (invalid → invalid_data_queue)
MAX_SPEED_VALID = 250
LAT_RANGE = (-90.0, 90.0)
LON_RANGE = (-180.0, 180.0)
INVALID_GPS_ZERO = (0.0, 0.0)


def _parse_gps_time(record: Dict[str, Any]) -> datetime:
    gps = record.get("gps_time")
    if gps is None:
        return datetime.now(timezone.utc)
    if isinstance(gps, datetime):
        return gps if gps.tzinfo else gps.replace(tzinfo=timezone.utc)
    try:
        dt = date_parser.parse(str(gps))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return datetime.now(timezone.utc)


async def _get_tracker(imei: int) -> Optional[Dict[str, Any]]:
    """Load tracker row for imei (vehicle_id, has_* flags)."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT imei, vehicle_id, has_fuel_sensor, has_temp_sensor, has_humidity_sensor, has_mdvr, has_seatbelt_sensor FROM tracker WHERE imei = $1",
                imei,
            )
            return dict(row) if row else None
    except Exception as e:
        logger.debug("_get_tracker failed for imei=%s: %s", imei, e)
        return None


async def _get_config_for_imei(imei: int) -> Dict[str, str]:
    """Resolve config for imei via bulk resolution + cache (plan § 2.6: refresh every 5 min)."""
    return await get_config_cached(imei)


def _validate_record(record: Dict[str, Any], imei: int) -> Optional[str]:
    """Plan § 2.6 / Appendix A: validate GPS and speed; return reason if invalid, else None."""
    lat = record.get("latitude")
    lon = record.get("longitude")
    if lat is not None and lon is not None:
        try:
            lat_f, lon_f = float(lat), float(lon)
            if (lat_f, lon_f) == INVALID_GPS_ZERO:
                return "invalid_gps_zero"
            if not (LAT_RANGE[0] <= lat_f <= LAT_RANGE[1]):
                return "invalid_latitude"
            if not (LON_RANGE[0] <= lon_f <= LON_RANGE[1]):
                return "invalid_longitude"
        except (TypeError, ValueError):
            return "invalid_gps_type"
    speed = record.get("speed")
    if speed is not None:
        try:
            s = int(speed)
            if s < 0:
                return "invalid_speed_negative"
            if s > MAX_SPEED_VALID:
                return "invalid_speed_max"
        except (TypeError, ValueError):
            pass
    return None


async def process_record(
    record: Dict[str, Any],
    backfill: bool = False,
    previous_state_override: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Process one trackdata record: load state + config, run calculators, write state + metric_events.
    When backfill=True (recalculation), do not publish to alarm_exchange (plan 9B.2).
    When previous_state_override is provided (recalc), use it instead of DB and merge state_updates into it.
    Plan § 2.6 / Appendix A: invalid/partial records published to invalid_data_queue.
    """
    imei_raw = record.get("imei")
    if imei_raw is None:
        logger.warning("Record missing imei, skipping")
        try:
            from .invalid_data_publisher import publish_invalid_data
            await publish_invalid_data(record, "missing_imei")
        except Exception:
            pass
        return
    try:
        imei = int(imei_raw)
    except (ValueError, TypeError):
        logger.warning("Invalid imei=%s", imei_raw)
        try:
            from .invalid_data_publisher import publish_invalid_data
            await publish_invalid_data(record, "invalid_imei")
        except Exception:
            pass
        return

    invalid_reason = _validate_record(record, imei)
    if invalid_reason:
        logger.debug("Invalid record imei=%s reason=%s", imei, invalid_reason)
        try:
            from .invalid_data_publisher import publish_invalid_data
            await publish_invalid_data(record, invalid_reason)
        except Exception:
            pass
        return

    gps_time = _parse_gps_time(record)
    if previous_state_override is not None:
        previous_state = dict(previous_state_override)
    else:
        previous_state = await read_laststatus_state(imei)

    # Plan § 12.3: reject stale/out-of-order (use last_processed_gps_time when set to avoid consumer race)
    prev_gps = previous_state.get("last_processed_gps_time") or previous_state.get("gps_time")
    if prev_gps is not None:
        # Normalize both to timestamp (float) for comparison (prev_gps can be datetime or string from DB)
        if hasattr(prev_gps, "timestamp"):
            prev_ts = prev_gps.timestamp()
        elif isinstance(prev_gps, str):
            try:
                prev_ts = date_parser.parse(prev_gps).timestamp()
            except (ValueError, TypeError):
                prev_ts = None
        else:
            prev_ts = float(prev_gps) if prev_gps is not None else None
        rec_ts = gps_time.timestamp() if hasattr(gps_time, "timestamp") else (float(gps_time) if gps_time is not None else None)
        if rec_ts is not None and prev_ts is not None and rec_ts <= prev_ts:
            logger.debug("Skipping stale record imei=%s gps_time=%s <= previous %s", imei, gps_time, prev_gps)
            if previous_state_override is not None:
                previous_state_override.setdefault("last_processed_gps_time", gps_time)
            return

    config = await _get_config_for_imei(imei)
    tracker = await _get_tracker(imei)

    # Plan § 10.2 Phase 2: shadow mode — run calculators, log only, no writes
    me_cfg = Config.get_metric_engine_config()
    shadow_mode = me_cfg.get("shadow_mode") is True

    ctx = CalculatorContext(
        imei=imei,
        record=record,
        gps_time=gps_time,
        previous_state=previous_state,
        config=config,
        scope="global",
        vehicle_id=tracker.get("vehicle_id") if tracker else None,
    )
    calculators = get_applicable_calculators(imei, tracker, config)
    result = await run_calculators(calculators, ctx)

    if shadow_mode:
        logger.info(
            "shadow_mode: imei=%s gps_time=%s state_updates=%s events_count=%s",
            imei, gps_time, result.state_updates, len(result.events or []),
        )
        if result.events:
            for ev in result.events:
                logger.debug("shadow_mode event: %s", ev)
        return

    # Effective current trip after this record (for events + accumulation; plan § 1.1, § 9.1)
    effective_trip_id = result.state_updates.get("current_trip_id") if result.state_updates else None
    if effective_trip_id is None:
        effective_trip_id = previous_state.get("current_trip_id")
    if result.events and effective_trip_id is not None:
        for ev in result.events:
            if ev.get("trip_id") is None:
                ev["trip_id"] = effective_trip_id

    # Plan § 3.5: insert_if_missing so new-device state is persisted (plan § 2.1)
    insert_if_missing = None
    if result.state_updates:
        lat, lon = record.get("latitude"), record.get("longitude")
        if lat is not None and lon is not None:
            insert_if_missing = {"latitude": float(lat), "longitude": float(lon)}

    if result.state_updates:
        try:
            await update_laststatus_state(
                imei, result.state_updates, gps_time=gps_time, insert_if_missing=insert_if_missing
            )
        except CircuitBreakerOpenError:
            dist_km = None
            if record.get("distance") and effective_trip_id:
                try:
                    dist_km = float(record.get("distance", 0)) / 1000.0
                    if dist_km <= 0:
                        dist_km = None
                except (TypeError, ValueError):
                    pass
            await pending_push(
                imei, result.state_updates, result.events or [], gps_time,
                distance_km=dist_km, trip_id=effective_trip_id,
                insert_if_missing=insert_if_missing,
            )
            return
        except Exception as e:
            logger.warning("update_laststatus_state failed (queueing): imei=%s %s", imei, e)
            dist_km = None
            if record.get("distance") and effective_trip_id:
                try:
                    dist_km = float(record.get("distance", 0)) / 1000.0
                    if dist_km <= 0:
                        dist_km = None
                except (TypeError, ValueError):
                    pass
            await pending_push(
                imei, result.state_updates, result.events or [], gps_time,
                distance_km=dist_km, trip_id=effective_trip_id,
                insert_if_missing=insert_if_missing,
            )
            return

    if effective_trip_id and record.get("distance"):
        try:
            dist_km = float(record.get("distance", 0)) / 1000.0
            if dist_km > 0:
                await update_trip_accumulation(effective_trip_id, dist_km, gps_time)
        except (TypeError, ValueError):
            pass

    for entry in getattr(result, "stoppage_log_entries", []) or []:
        try:
            await insert_stoppage_log(
                trip_id=entry.get("trip_id"),
                stoppage_type=entry.get("stoppage_type"),
                start_time=entry.get("start_time"),
                end_time=entry.get("end_time"),
                latitude=entry.get("latitude"),
                longitude=entry.get("longitude"),
                inside_fence_id=entry.get("inside_fence_id"),
            )
        except Exception as e:
            logger.warning("insert_stoppage_log failed: %s", e)

    if result.state_updates.get("_trip_action") == "end" and previous_state.get("stoppage_start_time") and previous_state.get("current_trip_id"):
        try:
            from dateutil import parser as date_parser
            st = previous_state.get("stoppage_start_time")
            st = date_parser.parse(str(st)) if isinstance(st, str) else st
            await insert_stoppage_log(
                trip_id=previous_state.get("current_trip_id"),
                stoppage_type="Stop",
                start_time=st,
                end_time=gps_time,
                latitude=previous_state.get("stoppage_start_lat"),
                longitude=previous_state.get("stoppage_start_lon"),
                inside_fence_id=None,
            )
        except Exception as e:
            logger.warning("Trip-end stoppage log failed: %s", e)

    if result.events:
        try:
            await insert_metric_events(result.events)
        except CircuitBreakerOpenError:
            dist_km = None
            if record.get("distance") and effective_trip_id:
                try:
                    dist_km = float(record.get("distance", 0)) / 1000.0
                    if dist_km <= 0:
                        dist_km = None
                except (TypeError, ValueError):
                    pass
            await pending_push(
                imei, result.state_updates or {}, result.events, gps_time,
                distance_km=dist_km, trip_id=effective_trip_id,
                insert_if_missing=insert_if_missing,
            )
            return
        except Exception as e:
            logger.warning("insert_metric_events failed (queueing): imei=%s %s", imei, e)
            dist_km = None
            if record.get("distance") and effective_trip_id:
                try:
                    dist_km = float(record.get("distance", 0)) / 1000.0
                    if dist_km <= 0:
                        dist_km = None
                except (TypeError, ValueError):
                    pass
            await pending_push(
                imei, result.state_updates or {}, result.events, gps_time,
                distance_km=dist_km, trip_id=effective_trip_id,
                insert_if_missing=insert_if_missing,
            )
            return
        if not backfill:
            try:
                await publish_metric_events_to_alarm(result.events)
            except Exception as e:
                logger.warning("Alarm publish failed (non-fatal): %s", e)
    if previous_state_override is not None and result.state_updates:
        for k, v in result.state_updates.items():
            if k in (
                "vehicle_state", "trip_in_progress", "current_trip_id", "current_fence_ids",
                "driving_session_start", "driving_session_distance", "idle_start_time",
                "speeding_start_time", "speeding_max_speed", "seatbelt_unbuckled_start",
                "seatbelt_unbuckled_distance", "temp_violation_start", "humidity_violation_start",
                "temp_stuck_since", "prev_temp_value", "prev_fuel_level",
                "last_violation_time", "last_violation_type",
                "stoppage_start_time", "stoppage_start_lat", "stoppage_start_lon",
                "rest_start_time",
                "last_processed_gps_time",
            ):
                previous_state_override[k] = v
        previous_state_override["last_processed_gps_time"] = gps_time
    # Plan § 2.6: after successful writes, flush pending queue
    try:
        await pending_flush()
    except Exception as e:
        logger.debug("pending_flush failed: %s", e)
