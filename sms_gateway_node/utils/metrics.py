"""
Prometheus Metrics for SMS Gateway Service
Exposes metrics for monitoring SMS processing, modem health, and queue operations.
"""
from prometheus_client import Counter, Gauge, Histogram, Info, generate_latest, CONTENT_TYPE_LATEST
import time


# =============================================================================
# Application Info
# =============================================================================
app_info = Info('sms_gateway_service', 'SMS Gateway Service Information')
app_info.info({
    'version': '1.0.0',
    'service': 'sms-gateway-service',
    'description': 'SMS Command Processing Service'
})


# =============================================================================
# SMS Processing Metrics
# =============================================================================
sms_sent_total = Counter(
    'sms_gateway_service_sms_sent_total',
    'Total number of SMS messages sent',
    ['modem', 'status']  # status: success, failed
)

sms_received_total = Counter(
    'sms_gateway_service_sms_received_total',
    'Total number of SMS messages received',
    ['modem']
)

sms_send_duration_seconds = Histogram(
    'sms_gateway_service_sms_send_duration_seconds',
    'Time to send an SMS in seconds',
    ['modem'],
    buckets=[0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0]
)


# =============================================================================
# Queue Metrics
# =============================================================================
outbox_depth = Gauge(
    'sms_gateway_service_outbox_depth',
    'Current number of commands in outbox queue'
)

outbox_processed_total = Counter(
    'sms_gateway_service_outbox_processed_total',
    'Total commands processed from outbox',
    ['status']  # sent, failed, skipped
)

inbox_depth = Gauge(
    'sms_gateway_service_inbox_depth',
    'Current number of messages in inbox'
)

inbox_processed_total = Counter(
    'sms_gateway_service_inbox_processed_total',
    'Total messages processed from inbox',
    ['status']  # matched, unmatched
)

sent_pending_count = Gauge(
    'sms_gateway_service_sent_pending_count',
    'Number of sent commands awaiting reply'
)


# =============================================================================
# Modem Health Metrics
# =============================================================================
modem_pool_size = Gauge(
    'sms_gateway_service_modem_pool_size',
    'Total number of modems in pool'
)

modem_healthy_count = Gauge(
    'sms_gateway_service_modem_healthy_count',
    'Number of healthy modems'
)

modem_unhealthy_count = Gauge(
    'sms_gateway_service_modem_unhealthy_count',
    'Number of unhealthy modems'
)

modem_status = Gauge(
    'sms_gateway_service_modem_status',
    'Modem status (1=healthy, 0=unhealthy)',
    ['modem_name']
)

modem_signal_strength = Gauge(
    'sms_gateway_service_modem_signal_strength',
    'Modem signal strength',
    ['modem_name']
)

modem_api_latency_seconds = Histogram(
    'sms_gateway_service_modem_api_latency_seconds',
    'Modem API call latency in seconds',
    ['modem', 'operation'],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0]
)

modem_api_errors_total = Counter(
    'sms_gateway_service_modem_api_errors_total',
    'Total modem API errors',
    ['modem', 'error_type']
)


# =============================================================================
# Polling Metrics
# =============================================================================
polling_cycles_total = Counter(
    'sms_gateway_service_polling_cycles_total',
    'Total polling cycles executed',
    ['type']  # outbox, inbox
)

polling_duration_seconds = Histogram(
    'sms_gateway_service_polling_duration_seconds',
    'Polling cycle duration in seconds',
    ['type'],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0]
)

polling_errors_total = Counter(
    'sms_gateway_service_polling_errors_total',
    'Total polling errors',
    ['type', 'error_type']
)


# =============================================================================
# Command Matching Metrics
# =============================================================================
command_matched_total = Counter(
    'sms_gateway_service_command_matched_total',
    'Total commands matched with responses'
)

command_timeout_total = Counter(
    'sms_gateway_service_command_timeout_total',
    'Total commands that timed out waiting for response'
)

command_retry_total = Counter(
    'sms_gateway_service_command_retry_total',
    'Total command retries'
)


# =============================================================================
# Database Metrics
# =============================================================================
db_query_duration_seconds = Histogram(
    'sms_gateway_service_db_query_duration_seconds',
    'Database query duration in seconds',
    ['operation'],
    buckets=[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0]
)

db_errors_total = Counter(
    'sms_gateway_service_db_errors_total',
    'Total database errors',
    ['operation', 'error_type']
)


# =============================================================================
# Helper Functions
# =============================================================================
def get_metrics():
    """Generate metrics in Prometheus format"""
    return generate_latest()


def get_content_type():
    """Get the content type for Prometheus metrics"""
    return CONTENT_TYPE_LATEST


def record_sms_sent(modem: str, success: bool, duration: float):
    """Record an SMS being sent"""
    status = 'success' if success else 'failed'
    sms_sent_total.labels(modem=modem, status=status).inc()
    sms_send_duration_seconds.labels(modem=modem).observe(duration)


def record_sms_received(modem: str):
    """Record an SMS being received"""
    sms_received_total.labels(modem=modem).inc()


def record_outbox_processed(status: str):
    """Record outbox processing result"""
    outbox_processed_total.labels(status=status).inc()


def record_inbox_processed(matched: bool):
    """Record inbox processing result"""
    status = 'matched' if matched else 'unmatched'
    inbox_processed_total.labels(status=status).inc()


def record_modem_api_call(modem: str, operation: str, duration: float, success: bool, error_type: str = None):
    """Record a modem API call"""
    modem_api_latency_seconds.labels(modem=modem, operation=operation).observe(duration)
    if not success and error_type:
        modem_api_errors_total.labels(modem=modem, error_type=error_type).inc()


def record_polling_cycle(poll_type: str, duration: float, success: bool, error_type: str = None):
    """Record a polling cycle"""
    polling_cycles_total.labels(type=poll_type).inc()
    polling_duration_seconds.labels(type=poll_type).observe(duration)
    if not success and error_type:
        polling_errors_total.labels(type=poll_type, error_type=error_type).inc()


def update_queue_metrics(outbox_count: int, inbox_count: int, pending_count: int):
    """Update queue depth gauges"""
    outbox_depth.set(outbox_count)
    inbox_depth.set(inbox_count)
    sent_pending_count.set(pending_count)


def update_modem_pool_metrics(total: int, healthy: int, unhealthy: int):
    """Update modem pool gauges"""
    modem_pool_size.set(total)
    modem_healthy_count.set(healthy)
    modem_unhealthy_count.set(unhealthy)


def update_modem_status(modem_name: str, is_healthy: bool, signal: int = None):
    """Update individual modem status"""
    modem_status.labels(modem_name=modem_name).set(1 if is_healthy else 0)
    if signal is not None:
        modem_signal_strength.labels(modem_name=modem_name).set(signal)


def record_command_matched():
    """Record a command being matched with response"""
    command_matched_total.inc()


def record_command_timeout():
    """Record a command timeout"""
    command_timeout_total.inc()


def record_command_retry():
    """Record a command retry"""
    command_retry_total.inc()


def record_db_query(operation: str, duration: float):
    """Record a database query"""
    db_query_duration_seconds.labels(operation=operation).observe(duration)


def record_db_error(operation: str, error_type: str):
    """Record a database error"""
    db_errors_total.labels(operation=operation, error_type=error_type).inc()
