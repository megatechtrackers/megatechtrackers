"""
Recalculation worker (plan § 9B). Polls recalculation_queue and processes PENDING jobs.
LISTEN config_change (real-time) + poll fallback enqueue jobs; worker processes RECALC_VIOLATIONS, REFRESH_VIEW, REFRESH_VIEWS.
RECALC_VIOLATIONS: DELETE metric_events then reprocess trackdata and INSERT new events (plan 9B.2).
REFRESH_VIEW: refresh one materialized view (reason = view name).
REFRESH_VIEWS: refresh scoring/analytics MVs (plan Phase 7: driver/vehicle scores via mv_weekly_driver_scores, mv_daily_vehicle_scores).
Plan § 9B.9: debounce rapid config changes (5 s) to avoid duplicate enqueues.
"""
import asyncio
import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Plan § 9B.9: debounce same (table, record_key, config_key) for 5 seconds
_config_change_debounce_sec = 5.0
_config_change_last_enqueue: Dict[Tuple[str, str, str], float] = {}
_config_change_lock: Optional[asyncio.Lock] = None

# Plan § 7.7: config_key → affected event_categories and views loaded from recalculation_catalog.json
from .catalog_loader import (
    get_config_affected as _catalog_config_affected,
    get_refreshable_views,
    validate_view_name as _catalog_validate_view_name,
    filter_view_names as _catalog_filter_view_names,
)


def _config_key_to_categories_and_views(config_key: Optional[str]) -> Tuple[Optional[List[str]], Optional[List[str]]]:
    """Return (event_categories to delete, view names to refresh) for config_key. Plan § 7.7: from catalog."""
    return _catalog_config_affected(config_key)


_shutdown = False
# Set by LISTEN callback so worker does immediate poll (plan 9B.1)
config_change_pending: Optional[asyncio.Event] = None


def set_shutdown(value: bool) -> None:
    global _shutdown
    _shutdown = value


async def _get_pool():
    from .db import get_pool
    return await get_pool()


async def _imeis_for_scope(conn, scope_imei, scope_client_id) -> List[int]:
    """Return list of IMEIs to reprocess for the given scope."""
    if scope_imei is not None:
        return [scope_imei]
    if scope_client_id is not None:
        rows = await conn.fetch(
            "SELECT t.imei FROM tracker t JOIN vehicle v ON v.vehicle_id = t.vehicle_id WHERE v.client_id = $1",
            scope_client_id,
        )
        return [r["imei"] for r in rows]
    rows = await conn.fetch("SELECT imei FROM tracker")
    return [r["imei"] for r in rows]


async def _reprocess_trackdata_for_imei(
    imei: int,
    date_from: datetime,
    date_to: datetime,
    batch_size: int = 500,
) -> int:
    """Fetch trackdata for imei in [date_from, date_to], run pipeline in backfill mode; return records processed.
    Plan § 4.1: use previous_state_override so recalc uses in-memory state, not current laststatus."""
    from .pipeline import process_record
    from .db import get_pool
    pool = await get_pool()
    total = 0
    offset = 0
    running_state: Dict[str, Any] = {}
    while True:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT imei, gps_time, server_time, latitude, longitude, altitude, angle, satellites, speed,
                       status, vendor, ignition, driver_seatbelt, passenger_seatbelt, door_status, passenger_seat,
                       main_battery, battery_voltage, fuel,
                       dallas_temperature_1, dallas_temperature_2, dallas_temperature_3, dallas_temperature_4,
                       ble_temperature_1, ble_temperature_2, ble_temperature_3, ble_temperature_4,
                       ble_humidity_1, ble_humidity_2, ble_humidity_3, ble_humidity_4,
                       green_driving_value, dynamic_io, is_valid, reference_id, distance
                FROM trackdata
                WHERE imei = $1 AND gps_time >= $2 AND gps_time <= $3
                ORDER BY gps_time
                LIMIT $4 OFFSET $5
                """,
                imei,
                date_from,
                date_to,
                batch_size,
                offset,
            )
        if not rows:
            break
        for row in rows:
            record = dict(row)
            await process_record(record, backfill=True, previous_state_override=running_state)
            total += 1
        offset += len(rows)
        if len(rows) < batch_size:
            break
    return total


async def _imeis_for_vehicle(conn, vehicle_id: Optional[int]) -> List[int]:
    """Return list of IMEIs for the given vehicle_id (tracker.vehicle_id)."""
    if vehicle_id is None:
        return []
    rows = await conn.fetch("SELECT imei FROM tracker WHERE vehicle_id = $1", vehicle_id)
    return [r["imei"] for r in rows]


async def process_one_job(conn, row: Dict[str, Any]) -> bool:
    """Process a single recalculation job. Returns True if completed (success or failure)."""
    job_id = row["id"]
    job_type = (row.get("job_type") or "").strip() or "RECALC_VIOLATIONS"
    scope_imei = row.get("scope_imei")
    scope_client_id = row.get("scope_client_id")
    scope_vehicle_id = row.get("scope_vehicle_id")
    scope_fence_id = row.get("scope_fence_id")
    scope_date_from = row.get("scope_date_from")
    scope_date_to = row.get("scope_date_to")
    config_change_id = row.get("config_change_id")
    started_at = datetime.now(timezone.utc)
    failed_views: List[str] = []
    try:
        await conn.execute(
            "UPDATE recalculation_queue SET status = $1, started_at = $2 WHERE id = $3",
            "PROCESSING",
            started_at,
            job_id,
        )
        rows_affected = 0
        if job_type == "RECALC_FUEL":
            # Plan § 9B.2: calibration change -> delete Fuel events, reprocess trackdata, update trip.fuel_consumed
            if scope_vehicle_id is not None:
                imeis = await _imeis_for_vehicle(conn, scope_vehicle_id)
                for imei in imeis:
                    await conn.execute(
                        "DELETE FROM metric_events WHERE imei = $1 AND event_category = 'Fuel'",
                        imei,
                    )
                now = datetime.now(timezone.utc)
                date_from = now - timedelta(days=30)
                date_to = now
                from config import Config
                batch_size = int(Config.get_metric_engine_config().get("recalculation_batch_size", 500))
                for imei in imeis:
                    n = await _reprocess_trackdata_for_imei(imei, date_from, date_to, batch_size=batch_size)
                    rows_affected += n
                from .db import update_trip_fuel_consumed_for_vehicle
                rows_affected += await update_trip_fuel_consumed_for_vehicle(scope_vehicle_id)
                try:
                    await conn.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_fuel_consumption")
                except Exception as e:
                    logger.warning("REFRESH mv_daily_fuel_consumption failed: %s", e)
                    try:
                        await conn.execute("REFRESH MATERIALIZED VIEW mv_daily_fuel_consumption")
                    except Exception:
                        pass
        elif job_type == "RECALC_FENCE":
            # Plan § 9B.2: fence change -> delete fence events for fence_id, reprocess only IMEIs that had events for this fence
            if scope_fence_id is not None:
                # Get affected IMEIs before delete (plan: targeted reprocess)
                cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).date()
                imei_rows = await conn.fetch(
                    "SELECT DISTINCT imei FROM metric_events WHERE fence_id = $1 AND event_category = 'Fence' AND (gps_time AT TIME ZONE 'UTC')::DATE >= $2",
                    scope_fence_id,
                    cutoff,
                )
                imeis = [r["imei"] for r in imei_rows] if imei_rows else await _imeis_for_scope(conn, None, None)
                result = await conn.execute(
                    "DELETE FROM metric_events WHERE fence_id = $1 AND event_category = 'Fence'",
                    scope_fence_id,
                )
                try:
                    rows_affected = int(result.split()[-1]) if result else 0
                except (ValueError, IndexError):
                    rows_affected = 0
                now = datetime.now(timezone.utc)
                date_from = now - timedelta(days=30)
                date_to = now
                from config import Config
                batch_size = int(Config.get_metric_engine_config().get("recalculation_batch_size", 500))
                for imei in imeis:
                    n = await _reprocess_trackdata_for_imei(imei, date_from, date_to, batch_size=batch_size)
                    rows_affected += n
                try:
                    await conn.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_fence_stats")
                except Exception as e:
                    logger.warning("REFRESH mv_daily_fence_stats failed: %s", e)
                    try:
                        await conn.execute("REFRESH MATERIALIZED VIEW mv_daily_fence_stats")
                    except Exception:
                        pass
        elif job_type == "REFRESH_SCORE_VIEWS":
            # Plan § 9B.2: score_weights change -> refresh scoring MVs only (whitelisted)
            score_views = _catalog_filter_view_names(
                ["mv_weekly_driver_scores", "mv_monthly_fleet_summary", "mv_daily_vehicle_scores"]
            )
            for view_name in score_views:
                try:
                    await conn.execute(
                        "REFRESH MATERIALIZED VIEW CONCURRENTLY " + view_name
                    )
                    rows_affected += 1
                except Exception as e:
                    logger.warning("REFRESH %s failed: %s", view_name, e)
                    try:
                        await conn.execute("REFRESH MATERIALIZED VIEW " + view_name)
                        rows_affected += 1
                    except Exception:
                        pass
        elif job_type == "RECALC_VIOLATIONS":
            # Plan § 9B.3: config-key–aware delete (only affected event_categories when config_change_id set)
            config_key: Optional[str] = None
            if config_change_id:
                row_cc = await conn.fetchrow(
                    "SELECT config_key FROM config_change_log WHERE id = $1",
                    config_change_id,
                )
                config_key = row_cc["config_key"] if row_cc else None
            categories, views_to_refresh = _config_key_to_categories_and_views(config_key)
            if categories:
                n = len(categories)
                if scope_imei is not None:
                    ph = ",".join(f"${i+2}" for i in range(n))
                    await conn.execute(
                        f"DELETE FROM metric_events WHERE imei = $1 AND event_category IN ({ph})",
                        scope_imei,
                        *categories,
                    )
                elif scope_client_id is not None:
                    ph = ",".join(f"${i+2}" for i in range(n))
                    await conn.execute(
                        f"""
                        DELETE FROM metric_events me
                        USING tracker t, vehicle v
                        WHERE me.imei = t.imei AND t.vehicle_id = v.vehicle_id AND v.client_id = $1
                          AND me.event_category IN ({ph})
                        """,
                        scope_client_id,
                        *categories,
                    )
                else:
                    ph = ",".join(f"${i+1}" for i in range(n))
                    await conn.execute(
                        f"DELETE FROM metric_events WHERE event_category IN ({ph})",
                        *categories,
                    )
            else:
                if scope_imei is not None:
                    await conn.execute("DELETE FROM metric_events WHERE imei = $1", scope_imei)
                elif scope_client_id is not None:
                    await conn.execute(
                        """
                        DELETE FROM metric_events me
                        USING tracker t, vehicle v
                        WHERE me.imei = t.imei AND t.vehicle_id = v.vehicle_id AND v.client_id = $1
                        """,
                        scope_client_id,
                    )
                else:
                    await conn.execute("DELETE FROM metric_events")
            now = datetime.now(timezone.utc)
            if scope_date_from is not None:
                d = scope_date_from
                date_from = datetime.combine(d, datetime.min.time(), tzinfo=timezone.utc) if hasattr(d, "year") else d
            else:
                date_from = now - timedelta(days=30)
            if scope_date_to is not None:
                d = scope_date_to
                date_to = datetime.combine(d, datetime.max.time(), tzinfo=timezone.utc) if hasattr(d, "year") else d
            else:
                date_to = now
            from config import Config
            batch_size = int(Config.get_metric_engine_config().get("recalculation_batch_size", 500))
            imeis = await _imeis_for_scope(conn, scope_imei, scope_client_id)
            rows_affected = 0
            for imei in imeis:
                n = await _reprocess_trackdata_for_imei(imei, date_from, date_to, batch_size=batch_size)
                rows_affected += n
            # Plan § 9B.3: enqueue targeted view refresh when config_key known, else refresh all
            reason = "all"
            if views_to_refresh:
                reason = ",".join(views_to_refresh)
            await conn.execute(
                """
                INSERT INTO recalculation_queue (job_type, trigger_type, status, priority, reason)
                VALUES ('REFRESH_VIEWS', 'RECALC_FOLLOWUP', 'PENDING', 2, $1)
                """,
                reason,
            )
        elif job_type == "REFRESH_VIEW":
            raw_name = (row.get("reason") or "").strip() or "mv_daily_violations"
            view_name = _catalog_validate_view_name(raw_name) or "mv_daily_violations"
            try:
                await conn.execute(
                    "REFRESH MATERIALIZED VIEW CONCURRENTLY " + view_name
                )
                rows_affected = 1
            except Exception as e:
                logger.warning("REFRESH MATERIALIZED VIEW %s failed: %s", view_name, e)
                try:
                    await conn.execute("REFRESH MATERIALIZED VIEW " + view_name)
                    rows_affected = 1
                except Exception as e2:
                    logger.warning("REFRESH MATERIALIZED VIEW (non-concurrent) failed: %s", e2)
                    raise
        elif job_type == "REFRESH_VIEWS":
            # Phase 7: refresh scoring/analytics MVs (whitelist only; track partial failure)
            view_list = get_refreshable_views()
            reason = (row.get("reason") or "").strip()
            if reason and reason.lower() != "all":
                view_list = _catalog_filter_view_names([v.strip() for v in reason.split(",") if v.strip()])
                if not view_list:
                    view_list = get_refreshable_views()
            rows_affected = 0
            for view_name in view_list:
                try:
                    await conn.execute(
                        "REFRESH MATERIALIZED VIEW CONCURRENTLY " + view_name
                    )
                    rows_affected += 1
                except Exception as e:
                    logger.warning("REFRESH MATERIALIZED VIEW %s failed: %s", view_name, e)
                    try:
                        await conn.execute("REFRESH MATERIALIZED VIEW " + view_name)
                        rows_affected += 1
                    except Exception as e2:
                        logger.warning(
                            "REFRESH MATERIALIZED VIEW (non-concurrent) %s failed: %s",
                            view_name,
                            e2,
                        )
                        failed_views.append(view_name)

        completed_at = datetime.now(timezone.utc)
        error_message = None
        if job_type == "REFRESH_VIEWS" and failed_views:
            error_message = "Partial failure: " + ", ".join(failed_views[:10])
            if len(failed_views) > 10:
                error_message += f" (+{len(failed_views) - 10} more)"
        await conn.execute(
            """
            UPDATE recalculation_queue SET status = $1, completed_at = $2, error_message = $3, rows_affected = $4 WHERE id = $5
            """,
            "COMPLETED",
            completed_at,
            error_message,
            rows_affected,
            job_id,
        )
        if config_change_id:
            await conn.execute(
                "UPDATE config_change_log SET processed = TRUE, processed_at = $1 WHERE id = $2",
                completed_at,
                config_change_id,
            )
        logger.info("Recalculation job %s completed (%s), rows_affected=%s", job_id, job_type, rows_affected)
        return True
    except Exception as e:
        logger.exception("Recalculation job %s failed: %s", job_id, e)
        try:
            await conn.execute(
                """
                UPDATE recalculation_queue SET status = $1, completed_at = $2, error_message = $3 WHERE id = $4
                """,
                "FAILED",
                datetime.now(timezone.utc),
                str(e)[:1000],
                job_id,
            )
        except Exception:
            pass
        return True


async def run_listener_loop() -> None:
    """Dedicated connection LISTEN config_change; set config_change_pending on notify (plan 9B.1 real-time).
    Reconnects when connection drops so notifications are not lost."""
    global config_change_pending
    if config_change_pending is None:
        config_change_pending = asyncio.Event()
    reconnect_delay = 5.0
    while not _shutdown:
        conn = None
        try:
            import asyncpg
            from config import Config
            db = Config.get_database_config()
            conn = await asyncpg.connect(
                host=db.get("host", "localhost"),
                port=int(db.get("port", 5432)),
                database=db.get("name", "megatechtrackers"),
                user=db.get("user", "postgres"),
                password=db.get("password", ""),
                command_timeout=None,  # No timeout for long-lived LISTEN connection
                statement_cache_size=0,  # Required for pgbouncer transaction pooling
                server_settings={"application_name": "megatechtrackers_metric_engine_listen", "timezone": "UTC"},
            )
            def _on_config_change(connection, pid, channel, payload):
                if config_change_pending:
                    config_change_pending.set()
            await conn.add_listener("config_change", _on_config_change)
            logger.info("LISTEN config_change active")
            reconnect_delay = 5.0
            while not _shutdown:
                await asyncio.sleep(5.0)
                if conn.is_closed():
                    logger.warning("LISTEN connection closed; reconnecting")
                    break
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning("Config change listener error: %s; reconnecting in %.1fs", e, reconnect_delay)
            await asyncio.sleep(reconnect_delay)
            reconnect_delay = min(reconnect_delay * 2, 60.0)
        finally:
            if conn and not conn.is_closed():
                try:
                    await conn.close()
                except Exception:
                    pass


async def _enqueue_formula_version_changes(conn) -> None:
    """Plan § 9.3: at startup, compare formula_version_registry with current calculators; enqueue RECALC_VIOLATIONS for any that changed."""
    try:
        from .calculators.registry import get_all
        calculators = get_all()
        for calc in calculators:
            name = getattr(calc, "name", None) or getattr(calc, "__class__", type(calc)).__name__
            version = getattr(calc, "formula_version", "1.0.0")
            row = await conn.fetchrow(
                "SELECT version FROM formula_version_registry WHERE metric_name = $1",
                name,
            )
            old = row["version"] if row else None
            if old != version:
                await conn.execute(
                    """
                    INSERT INTO recalculation_queue (job_type, trigger_type, status, priority, reason)
                    VALUES ('RECALC_VIOLATIONS', 'FORMULA_CHANGE', 'PENDING', 1, $1)
                    """,
                    f"formula:{name}:{old or 'none'}:{version}",
                )
                await conn.execute(
                    """
                    INSERT INTO formula_version_registry (metric_name, version, updated_at)
                    VALUES ($1, $2, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
                    ON CONFLICT (metric_name) DO UPDATE SET version = EXCLUDED.version, updated_at = EXCLUDED.updated_at
                    """,
                    name,
                    version,
                )
                logger.info("Enqueued RECALC_VIOLATIONS for formula change: %s %s -> %s", name, old, version)
    except Exception as e:
        logger.warning("Formula version enqueue failed: %s", e)


async def run_worker_loop(poll_interval_sec: float = 60.0) -> None:
    """Poll config_change_log -> enqueue jobs; then process recalculation_queue PENDING jobs (plan 9B)."""
    global _shutdown, config_change_pending
    if config_change_pending is None:
        config_change_pending = asyncio.Event()
    # Plan § 9.3: once at startup, enqueue RECALC_VIOLATIONS for any calculator whose formula_version changed
    try:
        pool = await _get_pool()
        async with pool.acquire() as conn:
            await _enqueue_formula_version_changes(conn)
    except Exception as e:
        logger.debug("Startup formula version check: %s", e)
    while not _shutdown:
        try:
            interval = poll_interval_sec
            if config_change_pending and config_change_pending.is_set():
                config_change_pending.clear()
                interval = 1.0
            pool = await _get_pool()
            async with pool.acquire() as conn:
                await poll_config_change_and_enqueue(conn)
                rows = await conn.fetch(
                    """
                    SELECT id, job_type, trigger_type, config_change_id, scope_client_id, scope_imei,
                           scope_vehicle_id, scope_fence_id, scope_date_from, scope_date_to, reason
                    FROM recalculation_queue
                    WHERE status IN ('PENDING', 'pending')
                    ORDER BY priority ASC NULLS LAST, created_at ASC NULLS LAST, id ASC
                    LIMIT 5
                    """
                )
                for row in rows:
                    if _shutdown:
                        break
                    await process_one_job(conn, dict(row))
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning("Recalculation worker loop error: %s", e)
        await asyncio.sleep(interval)


def _scope_from_config_row(row) -> tuple:
    """Resolve (scope_client_id, scope_imei) from table_name and record_key. tracker_config → imei; client_config → client_id."""
    table_name = (row.get("table_name") or "").strip()
    record_key = row.get("record_key")
    if not record_key:
        return None, None
    if table_name == "tracker_config":
        try:
            return None, int(record_key)  # scope_imei
        except (ValueError, TypeError):
            return None, None
    # client_config or other: record_key is client_id
    try:
        return int(record_key), None  # scope_client_id
    except (ValueError, TypeError):
        return None, None


async def poll_config_change_and_enqueue(conn) -> None:
    """Poll config_change_log for processed = FALSE and insert into recalculation_queue (plan 9B.1 fallback).
    Plan § 9B.9: debounce rapid changes (5 s); coalesce to latest value per (table_name, record_key, config_key).
    """
    global _config_change_lock
    if _config_change_lock is None:
        _config_change_lock = asyncio.Lock()
    try:
        rows = await conn.fetch(
            """
            SELECT id, table_name, record_key, config_key FROM config_change_log
            WHERE processed = FALSE ORDER BY id ASC LIMIT 100
            """
        )
        # Coalesce to latest: per (table_name, record_key, config_key) keep only the row with max(id).
        coalesced: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
        for row in rows:
            key = (
                (row.get("table_name") or "").strip(),
                str(row.get("record_key") or ""),
                (row.get("config_key") or "").strip(),
            )
            if key not in coalesced or row["id"] > coalesced[key]["id"]:
                coalesced[key] = dict(row)
        now = time.monotonic()
        async with _config_change_lock:
            for row in coalesced.values():
                existing = await conn.fetchval(
                    "SELECT 1 FROM recalculation_queue WHERE config_change_id = $1 AND status IN ('PENDING', 'pending', 'PROCESSING')",
                    row["id"],
                )
                if existing:
                    continue
                key = (
                    (row.get("table_name") or "").strip(),
                    str(row.get("record_key") or ""),
                    (row.get("config_key") or "").strip(),
                )
                last = _config_change_last_enqueue.get(key, 0.0)
                if now - last < _config_change_debounce_sec:
                    continue
                _config_change_last_enqueue[key] = now
                table_name = (row.get("table_name") or "").strip()
                record_key = row.get("record_key")
                try:
                    record_key_int = int(record_key) if record_key is not None else None
                except (ValueError, TypeError):
                    record_key_int = None
                if table_name == "calibration" and record_key_int is not None:
                    await conn.execute(
                        """
                        INSERT INTO recalculation_queue (job_type, trigger_type, config_change_id, scope_vehicle_id, status, priority)
                        VALUES ('RECALC_FUEL', 'CONFIG_CHANGE', $1, $2, 'PENDING', 1)
                        """,
                        row["id"],
                        record_key_int,
                    )
                elif table_name == "fence" and record_key_int is not None:
                    await conn.execute(
                        """
                        INSERT INTO recalculation_queue (job_type, trigger_type, config_change_id, scope_fence_id, status, priority)
                        VALUES ('RECALC_FENCE', 'CONFIG_CHANGE', $1, $2, 'PENDING', 1)
                        """,
                        row["id"],
                        record_key_int,
                    )
                elif table_name == "score_weights" and record_key_int is not None:
                    await conn.execute(
                        """
                        INSERT INTO recalculation_queue (job_type, trigger_type, config_change_id, scope_client_id, status, priority)
                        VALUES ('REFRESH_SCORE_VIEWS', 'CONFIG_CHANGE', $1, $2, 'PENDING', 1)
                        """,
                        row["id"],
                        record_key_int,
                    )
                else:
                    scope_client_id, scope_imei = _scope_from_config_row(row)
                    await conn.execute(
                        """
                        INSERT INTO recalculation_queue (job_type, trigger_type, config_change_id, scope_client_id, scope_imei, status, priority)
                        VALUES ('RECALC_VIOLATIONS', 'CONFIG_CHANGE', $1, $2, $3, 'PENDING', 1)
                        """,
                        row["id"],
                        scope_client_id,
                        scope_imei,
                    )
                logger.info("Enqueued recalculation for config_change_log id=%s", row["id"])
    except Exception as e:
        logger.warning("poll_config_change_and_enqueue failed: %s", e)


async def run_scheduled_refresh_loop(
    interval_sec: float = 86400.0,
    initial_delay_sec: float = 300.0,
) -> None:
    """
    Plan Phase 7: scheduled batch jobs for scoring/analytics.
    After initial_delay_sec (default 5 min), enqueue REFRESH_VIEWS; then every interval_sec (default 24h)
    so mv_weekly_driver_scores, mv_daily_vehicle_scores, etc. are refreshed.
    """
    global _shutdown
    await asyncio.sleep(initial_delay_sec)
    while not _shutdown:
        try:
            if _shutdown:
                break
            pool = await _get_pool()
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO recalculation_queue (job_type, trigger_type, status, priority, reason)
                    VALUES ('REFRESH_VIEWS', 'SCHEDULED', 'PENDING', 3, 'all')
                    """
                )
                logger.info("Enqueued scheduled REFRESH_VIEWS (Phase 7 scoring MVs)")
            # Cleanup old message retry rows to avoid unbounded table growth (daily with refresh)
            try:
                from .db import cleanup_old_message_retries, cleanup_old_processed_messages
                await cleanup_old_message_retries(max_age_days=7)
                await cleanup_old_processed_messages(max_age_days=7)
            except Exception as e:
                logger.debug("Scheduled retry/processed cleanup failed: %s", e)
            await asyncio.sleep(interval_sec)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning("Scheduled refresh enqueue failed: %s", e)
            await asyncio.sleep(min(60.0, interval_sec))
