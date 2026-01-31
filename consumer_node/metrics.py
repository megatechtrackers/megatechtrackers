"""
Prometheus metrics for the consumer service.
Exposes /metrics for health (up) and throughput (messages processed/failed).
"""
import os
import logging
from prometheus_client import Counter, Gauge, start_http_server, REGISTRY

logger = logging.getLogger(__name__)

# Consumer type from environment (database or alarm)
CONSUMER_TYPE = os.environ.get("CONSUMER_TYPE", "database")

# Counters
consumer_messages_processed_total = Counter(
    "consumer_service_messages_processed_total",
    "Total messages processed successfully",
    ["consumer_type", "queue"],
    registry=REGISTRY,
)
consumer_messages_failed_total = Counter(
    "consumer_service_messages_failed_total",
    "Total messages that failed processing",
    ["consumer_type", "queue"],
    registry=REGISTRY,
)

# Gauges
consumer_connection_connected = Gauge(
    "consumer_service_connection_connected",
    "1 if connected to RabbitMQ, 0 otherwise",
    ["consumer_type", "queue"],
    registry=REGISTRY,
)
consumer_service_info = Gauge(
    "consumer_service_info",
    "Consumer service metadata",
    ["consumer_type", "service"],
    registry=REGISTRY,
)

# Set info once (constant label)
consumer_service_info.labels(consumer_type=CONSUMER_TYPE, service="consumer-service").set(1)


def start_metrics_server(port: int = 9090) -> None:
    """Start the Prometheus metrics HTTP server in a daemon thread."""
    try:
        start_http_server(port, addr="0.0.0.0")
        logger.info("Metrics server started on port %s", port)
    except OSError as e:
        logger.warning("Could not start metrics server on port %s: %s", port, e)


def record_processed(queue: str, success_count: int, failed_count: int) -> None:
    """Record batch processing results."""
    if success_count > 0:
        consumer_messages_processed_total.labels(
            consumer_type=CONSUMER_TYPE, queue=queue
        ).inc(success_count)
    if failed_count > 0:
        consumer_messages_failed_total.labels(
            consumer_type=CONSUMER_TYPE, queue=queue
        ).inc(failed_count)


def set_connection_connected(queue: str, connected: bool) -> None:
    """Set RabbitMQ connection status (1=connected, 0=disconnected)."""
    consumer_connection_connected.labels(
        consumer_type=CONSUMER_TYPE, queue=queue
    ).set(1 if connected else 0)
