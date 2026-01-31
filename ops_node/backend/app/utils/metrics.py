"""
Prometheus Metrics for Operations Service Backend
Exposes metrics for monitoring command processing, API performance, and database operations.
"""
from prometheus_client import Counter, Gauge, Histogram, Info, generate_latest, CONTENT_TYPE_LATEST
from functools import wraps
import time


# =============================================================================
# Application Info
# =============================================================================
app_info = Info('ops_service', 'Operations Service Backend Information')
app_info.info({
    'version': '1.0.0',
    'service': 'ops-service-backend',
    'description': 'Operations Service'
})


# =============================================================================
# Command Processing Metrics
# =============================================================================
commands_sent_total = Counter(
    'ops_service_commands_sent_total',
    'Total number of commands sent',
    ['send_method', 'device_name', 'status']
)

commands_queued_total = Counter(
    'ops_service_commands_queued_total',
    'Total number of commands added to outbox',
    ['send_method']
)

command_outbox_depth = Gauge(
    'ops_service_command_outbox_depth',
    'Current number of commands in outbox queue'
)

command_sent_pending = Gauge(
    'ops_service_command_sent_pending',
    'Number of sent commands awaiting reply'
)


# =============================================================================
# API Request Metrics
# =============================================================================
http_requests_total = Counter(
    'ops_service_http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status_code']
)

http_request_duration_seconds = Histogram(
    'ops_service_http_request_duration_seconds',
    'HTTP request duration in seconds',
    ['method', 'endpoint'],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
)

http_requests_in_progress = Gauge(
    'ops_service_http_requests_in_progress',
    'Number of HTTP requests currently being processed'
)


# =============================================================================
# Database Metrics
# =============================================================================
db_queries_total = Counter(
    'ops_service_db_queries_total',
    'Total database queries executed',
    ['operation', 'table']
)

db_query_duration_seconds = Histogram(
    'ops_service_db_query_duration_seconds',
    'Database query duration in seconds',
    ['operation'],
    buckets=[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0, 5.0]
)

db_errors_total = Counter(
    'ops_service_db_errors_total',
    'Total database errors',
    ['operation', 'error_type']
)


# =============================================================================
# Unit/Device Operations Metrics
# =============================================================================
unit_operations_total = Counter(
    'ops_service_unit_operations_total',
    'Total unit operations',
    ['operation']  # create, update, delete, get
)

device_config_operations_total = Counter(
    'ops_service_device_config_operations_total',
    'Total device configuration operations',
    ['operation', 'device_name']
)

io_mapping_operations_total = Counter(
    'ops_service_io_mapping_operations_total',
    'Total IO mapping operations',
    ['operation', 'level']  # level: device or tracker
)


# =============================================================================
# Business Metrics
# =============================================================================
units_registered_total = Gauge(
    'ops_service_units_registered_total',
    'Total number of registered units/trackers'
)

device_types_total = Gauge(
    'ops_service_device_types_total',
    'Total number of device types configured'
)

configs_total = Gauge(
    'ops_service_configs_total',
    'Total number of device configurations',
    ['config_type']  # Setting or Command
)


# =============================================================================
# Cleanup Metrics
# =============================================================================
cleanup_commands_expired_total = Counter(
    'ops_service_cleanup_commands_expired_total',
    'Total commands expired during cleanup',
    ['type']  # outbox_timeout, no_reply
)

cleanup_history_deleted_total = Counter(
    'ops_service_cleanup_history_deleted_total',
    'Total history records deleted during cleanup'
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


def track_request_duration(method: str, endpoint: str):
    """Decorator to track request duration"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            http_requests_in_progress.inc()
            start_time = time.time()
            try:
                result = await func(*args, **kwargs)
                return result
            finally:
                duration = time.time() - start_time
                http_request_duration_seconds.labels(method=method, endpoint=endpoint).observe(duration)
                http_requests_in_progress.dec()
        return wrapper
    return decorator


def record_command_sent(send_method: str, device_name: str, status: str):
    """Record a command being sent"""
    commands_sent_total.labels(
        send_method=send_method,
        device_name=device_name,
        status=status
    ).inc()


def record_command_queued(send_method: str):
    """Record a command being added to outbox"""
    commands_queued_total.labels(send_method=send_method).inc()


def record_db_query(operation: str, table: str, duration: float):
    """Record a database query"""
    db_queries_total.labels(operation=operation, table=table).inc()
    db_query_duration_seconds.labels(operation=operation).observe(duration)


def record_db_error(operation: str, error_type: str):
    """Record a database error"""
    db_errors_total.labels(operation=operation, error_type=error_type).inc()


def record_unit_operation(operation: str):
    """Record a unit operation"""
    unit_operations_total.labels(operation=operation).inc()


def record_device_config_operation(operation: str, device_name: str):
    """Record a device config operation"""
    device_config_operations_total.labels(operation=operation, device_name=device_name).inc()


def record_io_mapping_operation(operation: str, level: str):
    """Record an IO mapping operation"""
    io_mapping_operations_total.labels(operation=operation, level=level).inc()


def record_cleanup_expired(cleanup_type: str, count: int = 1):
    """Record commands expired during cleanup"""
    cleanup_commands_expired_total.labels(type=cleanup_type).inc(count)


def record_cleanup_history_deleted(count: int):
    """Record history records deleted during cleanup"""
    cleanup_history_deleted_total.inc(count)


def update_queue_depths(outbox_count: int, sent_pending_count: int):
    """Update queue depth gauges"""
    command_outbox_depth.set(outbox_count)
    command_sent_pending.set(sent_pending_count)


def update_business_metrics(units_count: int, device_types_count: int, 
                           settings_count: int, commands_count: int):
    """Update business metric gauges"""
    units_registered_total.set(units_count)
    device_types_total.set(device_types_count)
    configs_total.labels(config_type='Setting').set(settings_count)
    configs_total.labels(config_type='Command').set(commands_count)
