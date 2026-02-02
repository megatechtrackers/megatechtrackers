"""
Camera Parser Infrastructure
"""
from .rabbitmq_producer import RabbitMQProducer, get_rabbitmq_producer, close_rabbitmq_producer
from .db_client import DatabaseClient, CMSServer, get_database_client, close_database_client
from .connection_retry import retry_connection
from .load_monitor import CameraParserLoadMonitor, get_load_monitor, close_load_monitor
from .health_check import (
    HealthCheckServer,
    start_health_server,
    stop_health_server,
    get_health_server,
)
from .encryption import (
    encrypt,
    decrypt,
    is_encrypted,
    decrypt_password,
    encrypt_if_not_encrypted,
)
from .alarm_config_loader import (
    CameraAlarmConfig,
    AlarmConfigLoader,
    CSVAlarmConfigLoader,
    DatabaseAlarmConfigLoader,
    get_alarm_config_loader,
    reset_alarm_config_loader,
    TEMPLATE_IMEI,
    HARDCODED_DEFAULTS,
)
from .input_validator import (
    validate_imei,
    convert_device_id_to_imei,
    validate_coordinates,
    validate_altitude,
    validate_speed,
    validate_heading,
    validate_timestamp,
    validate_gps_time,
    validate_video_url,
    validate_photo_url,
    sanitize_string,
    sanitize_event_type,
    validate_trackdata_record,
    validate_event_record,
)

__all__ = [
    'RabbitMQProducer',
    'get_rabbitmq_producer',
    'close_rabbitmq_producer',
    'DatabaseClient',
    'CMSServer',
    'get_database_client',
    'close_database_client',
    'retry_connection',
    'CameraParserLoadMonitor',
    'get_load_monitor',
    'close_load_monitor',
    # Health check
    'HealthCheckServer',
    'start_health_server',
    'stop_health_server',
    'get_health_server',
    # Encryption
    'encrypt',
    'decrypt',
    'is_encrypted',
    'decrypt_password',
    'encrypt_if_not_encrypted',
    # Alarm config
    'CameraAlarmConfig',
    'AlarmConfigLoader',
    'CSVAlarmConfigLoader',
    'DatabaseAlarmConfigLoader',
    'get_alarm_config_loader',
    'reset_alarm_config_loader',
    'TEMPLATE_IMEI',
    'HARDCODED_DEFAULTS',
    # Input validation
    'validate_imei',
    'convert_device_id_to_imei',
    'validate_coordinates',
    'validate_altitude',
    'validate_speed',
    'validate_heading',
    'validate_timestamp',
    'validate_gps_time',
    'validate_video_url',
    'validate_photo_url',
    'sanitize_string',
    'sanitize_event_type',
    'validate_trackdata_record',
    'validate_event_record',
]
