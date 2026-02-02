"""
Prometheus metrics for the consumer service.
Exposes /metrics for health (up) and throughput (messages processed/failed).
Includes data quality metrics for monitoring validation failures.
"""
import os
import logging
from prometheus_client import Counter, Gauge, Histogram, start_http_server, REGISTRY

logger = logging.getLogger(__name__)

# Consumer type from environment (database or alarm)
CONSUMER_TYPE = os.environ.get("CONSUMER_TYPE", "database")

# Counters - Processing
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

# Counters - Data Quality
consumer_invalid_records_total = Counter(
    "consumer_invalid_records_total",
    "Total records that failed validation",
    ["consumer_type", "reason"],
    registry=REGISTRY,
)
consumer_validation_failures_total = Counter(
    "consumer_validation_failures_total",
    "Total validation failures by type",
    ["consumer_type", "field", "error_type"],
    registry=REGISTRY,
)
consumer_db_write_failures_total = Counter(
    "consumer_db_write_failures_total",
    "Total database write failures",
    ["consumer_type", "table"],
    registry=REGISTRY,
)
consumer_dlq_messages_total = Counter(
    "consumer_dlq_messages_total",
    "Total messages sent to dead letter queue",
    ["consumer_type", "queue", "reason"],
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
consumer_pending_retries = Gauge(
    "consumer_pending_retries",
    "Number of messages pending retry",
    ["consumer_type"],
    registry=REGISTRY,
)

# Histograms - Processing Time
consumer_batch_processing_seconds = Histogram(
    "consumer_batch_processing_seconds",
    "Time spent processing a batch",
    ["consumer_type", "table"],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0],
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


def record_invalid_record(reason: str) -> None:
    """Record an invalid record that failed validation."""
    consumer_invalid_records_total.labels(
        consumer_type=CONSUMER_TYPE, reason=reason
    ).inc()


def record_validation_failure(field: str, error_type: str) -> None:
    """Record a validation failure for a specific field."""
    consumer_validation_failures_total.labels(
        consumer_type=CONSUMER_TYPE, field=field, error_type=error_type
    ).inc()


def record_db_write_failure(table: str) -> None:
    """Record a database write failure."""
    consumer_db_write_failures_total.labels(
        consumer_type=CONSUMER_TYPE, table=table
    ).inc()


def record_dlq_message(queue: str, reason: str) -> None:
    """Record a message sent to DLQ."""
    consumer_dlq_messages_total.labels(
        consumer_type=CONSUMER_TYPE, queue=queue, reason=reason
    ).inc()


def set_pending_retries(count: int) -> None:
    """Set the number of messages pending retry."""
    consumer_pending_retries.labels(consumer_type=CONSUMER_TYPE).set(count)


def observe_batch_processing_time(table: str, seconds: float) -> None:
    """Record batch processing time."""
    consumer_batch_processing_seconds.labels(
        consumer_type=CONSUMER_TYPE, table=table
    ).observe(seconds)
