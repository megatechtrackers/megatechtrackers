"""
Configuration loader for Camera Parser
Features: JSON config, environment overrides, validation, hot reload
"""
import os
import json
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# Config file path
CONFIG_FILE = os.path.join(os.path.dirname(__file__), 'config.json')

# Cache for loaded config
_config_cache: Optional[Dict[str, Any]] = None


class Config:
    """Configuration loader with environment variable overrides and validation"""
    
    @staticmethod
    def load() -> Dict[str, Any]:
        """Load configuration from config.json with environment variable overrides"""
        global _config_cache
        
        if _config_cache is not None:
            return _config_cache
        
        # Load and merge with defaults
        config = Config._load_from_file()
        config = Config._merge_with_defaults(config)
        
        # Apply environment overrides
        config = Config._apply_env_overrides(config)
        
        # Validate
        Config._validate(config)
        
        _config_cache = config
        return config
    
    @staticmethod
    def reload() -> Dict[str, Any]:
        """
        Force reload configuration from file.
        Useful for hot-reloading configuration changes.
        """
        global _config_cache
        _config_cache = None
        logger.info("Configuration cache cleared, reloading...")
        return Config.load()
    
    @staticmethod
    def _load_from_file() -> Dict[str, Any]:
        """Load config from JSON file"""
        try:
            if os.path.exists(CONFIG_FILE):
                with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                logger.debug(f"Loaded config from {CONFIG_FILE}")
                return config
            else:
                logger.warning(f"Config file not found: {CONFIG_FILE}, using defaults")
                return {}
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in config file: {e}")
            return {}
        except Exception as e:
            logger.error(f"Error loading config: {e}")
            return {}
    
    @staticmethod
    def _get_defaults() -> Dict[str, Any]:
        """Default configuration values"""
        return {
            "parser_node": {
                "node_id": "camera-parser-1",
                "vendor": "camera"
            },
            "rabbitmq": {
                "host": "localhost",
                "port": 5672,
                "virtual_host": "/",
                "username": "guest",
                "password": "guest",
                "exchange": "tracking_data_exchange",
                "publisher_confirms": True
            },
            "database": {
                "host": "localhost",
                "port": 5432,
                "database": "megatechtrackers",
                "username": "postgres",
                "password": ""
            },
            "polling": {
                "device_status_interval_seconds": 30,
                "safety_alarms_interval_seconds": 60,
                "realtime_alarms_interval_seconds": 10,
                "alarm_lookback_minutes": 120,
                "alarm_backfill_hours": 168,
                "gps_backfill_hours": 168,
                "max_concurrent_requests": 10,
                "request_timeout_seconds": 30,
                "parallel_chunk_size": 20,
                "enable_trackdata_polling": True,
                "filter_alarm_types": True
            },
            "circuit_breaker": {
                "failure_threshold": 5,
                "reset_timeout_seconds": 60
            },
            "deduplication": {
                "max_cache_size": 10000,
                "ttl_hours": 1
            },
            "logging": {
                "level": "INFO",
                "log_file": None,
                "json_format": False,
                "max_bytes": 10485760,
                "backup_count": 5
            },
            "load_monitoring": {
                "enabled": True,
                "report_interval_seconds": 30,
                "api_endpoint": None,
                "log_metrics": True
            },
            "health_check": {
                "enabled": True,
                "port": 8080
            },
            "alarm_config": {
                "cache_ttl_minutes": 30,
                "cache_max_size": 10000,
                "auto_provision_enabled": True
            },
            "shutdown": {
                "task_timeout_seconds": 5.0,
                "drain_timeout_seconds": 2.0
            }
        }
    
    @staticmethod
    def _merge_with_defaults(config: Dict[str, Any]) -> Dict[str, Any]:
        """Merge loaded config with defaults"""
        defaults = Config._get_defaults()
        result = defaults.copy()
        
        for key, value in config.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = {**result[key], **value}
            else:
                result[key] = value
        
        return result
    
    @staticmethod
    def _apply_env_overrides(config: Dict[str, Any]) -> Dict[str, Any]:
        """Apply environment variable overrides"""
        
        # Node ID
        if os.getenv('NODE_ID'):
            config['parser_node']['node_id'] = os.getenv('NODE_ID')
        
        # RabbitMQ
        if os.getenv('RABBITMQ_HOST'):
            config['rabbitmq']['host'] = os.getenv('RABBITMQ_HOST')
        if os.getenv('RABBITMQ_PORT'):
            config['rabbitmq']['port'] = int(os.getenv('RABBITMQ_PORT'))
        if os.getenv('RABBITMQ_VHOST'):
            config['rabbitmq']['virtual_host'] = os.getenv('RABBITMQ_VHOST')
        if os.getenv('RABBITMQ_USER'):
            config['rabbitmq']['username'] = os.getenv('RABBITMQ_USER')
        if os.getenv('RABBITMQ_PASS'):
            config['rabbitmq']['password'] = os.getenv('RABBITMQ_PASS')
        
        # Database
        if os.getenv('DATABASE_URL'):
            Config._parse_database_url(config, os.getenv('DATABASE_URL'))
        else:
            if os.getenv('DB_HOST'):
                config['database']['host'] = os.getenv('DB_HOST')
            if os.getenv('DB_PORT'):
                config['database']['port'] = int(os.getenv('DB_PORT'))
            if os.getenv('DB_NAME'):
                config['database']['database'] = os.getenv('DB_NAME')
            if os.getenv('DB_USER'):
                config['database']['username'] = os.getenv('DB_USER')
            if os.getenv('DB_PASS'):
                config['database']['password'] = os.getenv('DB_PASS')
        
        # Polling intervals
        if os.getenv('DEVICE_STATUS_INTERVAL'):
            config['polling']['device_status_interval_seconds'] = int(os.getenv('DEVICE_STATUS_INTERVAL'))
        if os.getenv('SAFETY_ALARMS_INTERVAL'):
            config['polling']['safety_alarms_interval_seconds'] = int(os.getenv('SAFETY_ALARMS_INTERVAL'))
        if os.getenv('MAX_CONCURRENT_REQUESTS'):
            config['polling']['max_concurrent_requests'] = int(os.getenv('MAX_CONCURRENT_REQUESTS'))
        
        # Logging
        if os.getenv('LOG_LEVEL'):
            config['logging']['level'] = os.getenv('LOG_LEVEL').upper()
        if os.getenv('LOG_FILE'):
            config['logging']['log_file'] = os.getenv('LOG_FILE')
        if os.getenv('LOG_JSON'):
            config['logging']['json_format'] = os.getenv('LOG_JSON').lower() == 'true'
        
        # Load monitoring
        if os.getenv('LOAD_MONITORING_ENABLED'):
            config['load_monitoring']['enabled'] = os.getenv('LOAD_MONITORING_ENABLED').lower() == 'true'
        if os.getenv('LOAD_MONITORING_INTERVAL'):
            config['load_monitoring']['report_interval_seconds'] = int(os.getenv('LOAD_MONITORING_INTERVAL'))
        if os.getenv('LOAD_MONITORING_ENDPOINT'):
            config['load_monitoring']['api_endpoint'] = os.getenv('LOAD_MONITORING_ENDPOINT')
        
        # Health check
        if os.getenv('HEALTH_CHECK_ENABLED'):
            config['health_check']['enabled'] = os.getenv('HEALTH_CHECK_ENABLED').lower() == 'true'
        if os.getenv('HEALTH_CHECK_PORT'):
            config['health_check']['port'] = int(os.getenv('HEALTH_CHECK_PORT'))
        
        # Data transfer mode
        if os.getenv('DATA_TRANSFER_MODE'):
            config['data_transfer_mode'] = {'mode': os.getenv('DATA_TRANSFER_MODE').upper()}
        
        # Additional polling settings
        if os.getenv('REALTIME_ALARMS_INTERVAL'):
            config['polling']['realtime_alarms_interval_seconds'] = int(os.getenv('REALTIME_ALARMS_INTERVAL'))
        if os.getenv('ALARM_LOOKBACK_MINUTES'):
            config['polling']['alarm_lookback_minutes'] = int(os.getenv('ALARM_LOOKBACK_MINUTES'))
        if os.getenv('ALARM_BACKFILL_HOURS'):
            config['polling']['alarm_backfill_hours'] = int(os.getenv('ALARM_BACKFILL_HOURS'))
        if os.getenv('GPS_BACKFILL_HOURS'):
            config['polling']['gps_backfill_hours'] = int(os.getenv('GPS_BACKFILL_HOURS'))
        if os.getenv('PARALLEL_CHUNK_SIZE'):
            config['polling']['parallel_chunk_size'] = int(os.getenv('PARALLEL_CHUNK_SIZE'))
        if os.getenv('ENABLE_TRACKDATA_POLLING'):
            config['polling']['enable_trackdata_polling'] = os.getenv('ENABLE_TRACKDATA_POLLING').lower() == 'true'
        if os.getenv('FILTER_ALARM_TYPES'):
            config['polling']['filter_alarm_types'] = os.getenv('FILTER_ALARM_TYPES').lower() == 'true'
        
        return config
    
    @staticmethod
    def _parse_database_url(config: Dict[str, Any], url: str):
        """Parse DATABASE_URL and update config"""
        try:
            # postgresql://user:pass@host:port/database
            if url.startswith('postgresql://'):
                url = url[13:]
            elif url.startswith('postgres://'):
                url = url[11:]
            
            user_pass, host_db = url.split('@')
            user, password = user_pass.split(':')
            host_port, database = host_db.split('/')
            
            if ':' in host_port:
                host, port = host_port.split(':')
            else:
                host, port = host_port, '5432'
            
            config['database']['host'] = host
            config['database']['port'] = int(port)
            config['database']['database'] = database
            config['database']['username'] = user
            config['database']['password'] = password
        except Exception as e:
            logger.warning(f"Could not parse DATABASE_URL: {e}")
    
    @staticmethod
    def _validate(config: Dict[str, Any]):
        """Validate configuration"""
        errors = []
        warnings = []
        
        # Required sections
        required = ['rabbitmq', 'database', 'polling']
        for section in required:
            if section not in config:
                errors.append(f"Missing required section: {section}")
        
        # Validate RabbitMQ
        rabbitmq = config.get('rabbitmq', {})
        if not rabbitmq.get('host'):
            warnings.append("RabbitMQ host not configured")
        
        # Validate database
        database = config.get('database', {})
        if not database.get('host'):
            warnings.append("Database host not configured")
        if not database.get('password'):
            warnings.append("Database password not set (use DB_PASS or DATABASE_URL environment variable)")
        
        # Validate polling intervals
        polling = config.get('polling', {})
        if polling.get('device_status_interval_seconds', 30) < 5:
            warnings.append("Device status interval is very low (<5s), may cause API rate limiting")
        
        # Log results
        for error in errors:
            logger.error(f"Config error: {error}")
        for warning in warnings:
            logger.warning(f"Config warning: {warning}")
        
        if errors:
            raise ValueError(f"Configuration errors: {', '.join(errors)}")
    
    @staticmethod
    def get(key: str, default=None):
        """Get config value using dot notation (e.g., 'rabbitmq.host')"""
        config = Config.load()
        keys = key.split('.')
        value = config
        
        for k in keys:
            if isinstance(value, dict):
                value = value.get(k)
                if value is None:
                    return default
            else:
                return default
        
        return value if value is not None else default
    
    @staticmethod
    def get_int(key: str, default: int = 0) -> int:
        """Get integer config value"""
        value = Config.get(key, default)
        try:
            return int(value)
        except (ValueError, TypeError):
            return default
    
    @staticmethod
    def get_float(key: str, default: float = 0.0) -> float:
        """Get float config value"""
        value = Config.get(key, default)
        try:
            return float(value)
        except (ValueError, TypeError):
            return default
    
    @staticmethod
    def get_bool(key: str, default: bool = False) -> bool:
        """Get boolean config value"""
        value = Config.get(key, default)
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in ('true', '1', 'yes', 'on')
        return bool(value) if value is not None else default
    
    @staticmethod
    def get_database_url() -> str:
        """Get database connection URL"""
        config = Config.load()['database']
        return f"postgresql://{config['username']}:{config['password']}@{config['host']}:{config['port']}/{config['database']}"
    
    @classmethod
    def get_data_transfer_mode(cls) -> str:
        """
        Get data transfer mode (returns uppercase: LOGS or RABBITMQ)
        
        - LOGS mode: Saves to CSV files (for standalone testing)
        - RABBITMQ mode: Publishes to RabbitMQ (for production)
        
        Can be overridden by DATA_TRANSFER_MODE environment variable.
        """
        # Check environment variable first
        env_mode = os.getenv('DATA_TRANSFER_MODE', '').upper()
        if env_mode in ('LOGS', 'RABBITMQ'):
            return env_mode
        
        # Fall back to config file
        config = cls.load()
        mode = config.get('data_transfer_mode', {}).get('mode', 'RABBITMQ')
        return mode.upper() if isinstance(mode, str) else 'RABBITMQ'
