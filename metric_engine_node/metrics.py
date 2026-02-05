"""
Prometheus metrics and health server for Metric Engine Node.
Serves /metrics, /health (liveness), /health/ready (readiness: DB + RabbitMQ).
Plan § 12.6: expose readiness and circuit breaker state for Prometheus alerts.
"""
import os
import logging
import asyncio
from typing import Optional

from aiohttp import web
from prometheus_client import Counter, Gauge, Histogram, REGISTRY, generate_latest

# Prometheus text format; omit charset so aiohttp accepts it (aiohttp rejects content_type with charset)
PROMETHEUS_CONTENT_TYPE = "text/plain; version=0.0.4"

logger = logging.getLogger(__name__)

# Counters
metric_engine_messages_processed_total = Counter(
    "metric_engine_messages_processed_total",
    "Total trackdata messages processed",
    ["queue"],
    registry=REGISTRY,
)
metric_engine_messages_failed_total = Counter(
    "metric_engine_messages_failed_total",
    "Total messages that failed processing",
    ["queue"],
    registry=REGISTRY,
)
metric_engine_calculator_errors_total = Counter(
    "metric_engine_calculator_errors_total",
    "Total calculator errors",
    ["calculator"],
    registry=REGISTRY,
)
metric_engine_calculator_invocations_total = Counter(
    "metric_engine_calculator_invocations_total",
    "Total times each calculator was invoked (per message)",
    ["calculator"],
    registry=REGISTRY,
)
metric_engine_calculator_events_emitted_total = Counter(
    "metric_engine_calculator_events_emitted_total",
    "Total metric events emitted by each calculator",
    ["calculator"],
    registry=REGISTRY,
)

# Histogram: calculator run duration (seconds)
metric_engine_calculator_duration_seconds = Histogram(
    "metric_engine_calculator_duration_seconds",
    "Duration of each calculator run in seconds",
    ["calculator"],
    buckets=(0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
    registry=REGISTRY,
)

# Gauges: readiness (for MetricEngineNotReady alert) and circuit breaker state (plan § 12.6)
metric_engine_ready = Gauge(
    "metric_engine_ready",
    "1 if DB and RabbitMQ are reachable (readiness), 0 otherwise",
    registry=REGISTRY,
)
metric_engine_circuit_breaker_state = Gauge(
    "metric_engine_circuit_breaker_state",
    "Circuit breaker state: 0=closed, 1=open, 2=half_open",
    ["name"],
    registry=REGISTRY,
)

# Internal readiness state (set by run.py)
_db_ready: bool = False
_rabbitmq_ready: bool = False


def set_db_ready(ready: bool) -> None:
    global _db_ready
    _db_ready = ready


def set_rabbitmq_ready(ready: bool) -> None:
    global _rabbitmq_ready
    _rabbitmq_ready = ready


def is_ready() -> bool:
    return _db_ready and _rabbitmq_ready


async def handle_health(_request: web.Request) -> web.Response:
    """Liveness: process is running."""
    return web.json_response({"status": "ok", "service": "metric_engine_node"})


async def handle_ready(_request: web.Request) -> web.Response:
    """Readiness: DB and RabbitMQ reachable."""
    if is_ready():
        return web.json_response({"status": "ok", "db": _db_ready, "rabbitmq": _rabbitmq_ready})
    return web.json_response(
        {"status": "degraded", "db": _db_ready, "rabbitmq": _rabbitmq_ready},
        status=503,
    )


def _update_prometheus_gauges() -> None:
    """Update readiness and circuit breaker gauges on each scrape (plan § 12.6)."""
    metric_engine_ready.set(1 if is_ready() else 0)
    try:
        from engine.circuit_breaker import db_circuit_breaker, rabbitmq_circuit_breaker
        _state_value = {"closed": 0, "open": 1, "half_open": 2}
        for cb, name in [(db_circuit_breaker, "db"), (rabbitmq_circuit_breaker, "rabbitmq")]:
            state = cb.get_stats().get("state", "closed")
            metric_engine_circuit_breaker_state.labels(name=name).set(
                _state_value.get(state, 0)
            )
    except Exception as e:
        logger.debug("Could not update circuit breaker gauges: %s", e)


async def handle_metrics(_request: web.Request) -> web.Response:
    """Prometheus /metrics. Updates readiness and circuit breaker gauges on each scrape."""
    _update_prometheus_gauges()
    data = generate_latest(REGISTRY)
    return web.Response(body=data, content_type=PROMETHEUS_CONTENT_TYPE)


def create_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/health", handle_health)
    app.router.add_get("/health/ready", handle_ready)
    app.router.add_get("/metrics", handle_metrics)
    return app


async def start_health_server(
    port: int = 9091, host: str = "0.0.0.0"
) -> Optional[web.AppRunner]:
    """Start aiohttp app for /health, /health/ready, /metrics. Returns runner (await runner.cleanup() to stop)."""
    app = create_app()
    try:
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, host, port)
        await site.start()
        logger.info("Health/metrics server started on %s:%s", host, port)
        return runner
    except OSError as e:
        logger.warning("Could not start health server on port %s: %s", port, e)
        return None
