"""
Metric Engine Node - Entry Point
Consumes from metrics_queue, calculates metrics (Phase 1: log only).
Resilience: circuit breaker, graceful shutdown, /health, /health/ready.
"""
import asyncio
import logging
import os
import signal
import sys

from logging_config import setup_logging_from_config

# Configure logging from config.json (aligns with consumer/parser nodes)
setup_logging_from_config()

from config import Config
from engine.rabbitmq_consumer import MetricEngineConsumer
from engine.pipeline import process_record
from engine.calculators.registry import register_all
from engine.recalculation_worker import run_worker_loop, run_listener_loop, run_scheduled_refresh_loop, set_shutdown
from engine.pending_writes import flush as pending_flush, size as pending_size
from metrics import (
    start_health_server,
    set_db_ready,
    set_rabbitmq_ready,
)

logger = logging.getLogger(__name__)

_shutdown_event = asyncio.Event()
_consumer: MetricEngineConsumer = None
_health_runner = None


def _signal_handler(signum, frame):
    logger.info("Received signal %s, initiating shutdown...", signum)
    _shutdown_event.set()


def _sighup_handler(signum, frame):
    """Plan § 7.8: reload recalculation catalog without restart."""
    logger.info("Received SIGHUP; reloading recalculation catalog")
    try:
        from engine.catalog_loader import reload_catalog
        reload_catalog()
    except Exception as e:
        logger.warning("Failed to reload catalog on SIGHUP: %s", e)


async def check_db_ready() -> bool:
    """Try to connect to DB for readiness. Returns True if reachable."""
    try:
        import asyncpg
        db = Config.get_database_config()
        conn = await asyncio.wait_for(
            asyncpg.connect(
                host=db.get("host", "localhost"),
                port=int(db.get("port", 5432)),
                database=db.get("name", "megatechtrackers"),
                user=db.get("user", "postgres"),
                password=db.get("password", ""),
                statement_cache_size=0,  # Required for pgbouncer transaction pooling
                server_settings={"application_name": "megatechtrackers_metric_engine", "timezone": "UTC"},
            ),
            timeout=2.0,
        )
        await conn.close()
        return True
    except Exception as e:
        logger.debug("DB readiness check failed: %s", e)
        return False


async def main():
    global _consumer, _health_runner

    # Health/metrics server (same port for /health, /health/ready, /metrics)
    port = int(os.environ.get("METRIC_ENGINE_METRICS_PORT", "9091"))
    _health_runner = await start_health_server(port=port)
    if not _health_runner:
        logger.warning("Health server not started; /health and /health/ready unavailable")

    # Readiness: DB and RabbitMQ (updated when we connect)
    set_db_ready(False)
    set_rabbitmq_ready(False)

    # Optional: init DB pool for config resolution (Phase 1: skip; Phase 2 use it)
    db_ready = await check_db_ready()
    set_db_ready(db_ready)
    if db_ready:
        logger.info("Database reachable (readiness OK)")
    else:
        logger.warning("Database not reachable; readiness will be 503 until DB is up")

    # Register calculators and use pipeline handler
    register_all()
    _consumer = MetricEngineConsumer(queue_name="metrics_queue", handler=process_record)
    try:
        await _consumer.connect(retry=True)
        set_rabbitmq_ready(True)
        logger.info("RabbitMQ connected (readiness OK)")
    except asyncio.CancelledError:
        raise
    except Exception as e:
        logger.warning("RabbitMQ not connected: %s; will retry in consume loop", e)

    # Recalculation worker (plan 9B: config_change -> queue -> RECALC_VIOLATIONS / REFRESH_VIEW)
    me_cfg = Config.get_metric_engine_config()
    poll_interval = float(me_cfg.get("recalculation_poll_interval_sec", 60.0))
    worker_task = asyncio.create_task(run_worker_loop(poll_interval_sec=poll_interval))
    listener_task = asyncio.create_task(run_listener_loop())
    # Phase 7: scheduled REFRESH_VIEWS for scoring MVs (driver/vehicle scores) every 24h
    refresh_interval = float(me_cfg.get("scheduled_refresh_interval_sec", 86400.0))
    refresh_initial_delay = float(me_cfg.get("scheduled_refresh_initial_delay_sec", 300.0))
    scheduler_task = asyncio.create_task(
        run_scheduled_refresh_loop(interval_sec=refresh_interval, initial_delay_sec=refresh_initial_delay)
    )

    # Run consumer until shutdown
    consumer_task = asyncio.create_task(_consumer.start_consuming())
    try:
        await _shutdown_event.wait()
    except asyncio.CancelledError:
        pass
    finally:
        set_shutdown(True)
        _consumer._consuming = False
        # Plan § 2.9: allow in-flight message to complete (up to 30s) before cancelling
        try:
            await asyncio.wait_for(_consumer._message_done_event.wait(), timeout=30.0)
        except asyncio.TimeoutError:
            logger.warning("Shutdown: in-flight message did not complete within 30s")
        except Exception as e:
            logger.debug("Shutdown wait for message done: %s", e)
        consumer_task.cancel()
        worker_task.cancel()
        listener_task.cancel()
        scheduler_task.cancel()
        try:
            await consumer_task
        except asyncio.CancelledError:
            pass
        try:
            await worker_task
        except asyncio.CancelledError:
            pass
        try:
            await listener_task
        except asyncio.CancelledError:
            pass
        try:
            await scheduler_task
        except asyncio.CancelledError:
            pass
        # Plan § 2.9: graceful shutdown — flush pending writes before closing connections
        n = pending_size()
        if n > 0:
            logger.info("Flushing %s pending writes before shutdown...", n)
            try:
                await asyncio.wait_for(pending_flush(), timeout=30.0)
            except asyncio.TimeoutError:
                logger.warning("Pending flush timed out after 30s; %s items may be lost", pending_size())
            except Exception as e:
                logger.warning("Pending flush failed: %s", e)
        await _consumer.disconnect()
        set_rabbitmq_ready(False)
        if _health_runner:
            await _health_runner.cleanup()
        logger.info("Metric engine shutdown complete")


if __name__ == "__main__":
    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)
    if getattr(signal, "SIGHUP", None) is not None:
        signal.signal(signal.SIGHUP, _sighup_handler)
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutdown complete")
    sys.exit(0)
