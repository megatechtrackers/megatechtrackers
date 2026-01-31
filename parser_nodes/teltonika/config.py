"""
Simplified JSON-based configuration for Teltonika Gateway
Single config.json file contains all configuration
"""
import json
import os
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class Config:
    """Main configuration class - loads from single config.json"""
    
    _config: Optional[Dict[str, Any]] = None
    _config_file: str = "config.json"
    
    @classmethod
    def load(cls, file_path: Optional[str] = None) -> Dict[str, Any]:
        """Load configuration from JSON file"""
        if file_path:
            cls._config_file = file_path
        
        if cls._config is None:
            cls._config = cls._load_config()
        
        return cls._config
    
    @classmethod
    def reload(cls):
        """
        Force reload configuration from file.
        
        This method clears the cached configuration and reloads it from the config file.
        Useful for:
        - Hot-reloading configuration during development
        - Applying configuration changes without restarting the server
        - Testing configuration changes
        
        Note: This method is safe to call from any thread, but configuration changes
        may not be immediately reflected in all components that have already loaded
        their configuration.
        
        Returns:
            Dict[str, Any]: Reloaded configuration dictionary
            
        Example:
            # Reload configuration after modifying config.json
            new_config = Config.reload()
            logger.info("Configuration reloaded")
        """
        cls._config = None
        return cls.load()
    
    @classmethod
    def _load_config(cls) -> Dict[str, Any]:
        """Load JSON config with defaults and validation"""
        config_file = cls._find_config_file()
        
        try:
            if os.path.exists(config_file):
                with open(config_file, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                logger.info(f"Loaded configuration from {config_file}")
                
                # Validate configuration
                merged_config = cls._merge_with_defaults(config)
                cls._validate_config(merged_config)
                
                return merged_config
            else:
                logger.warning(f"Config file not found: {config_file}, using defaults")
                return cls._get_defaults()
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in config file: {e}", exc_info=True)
            return cls._get_defaults()
        except Exception as e:
            logger.error(f"Error loading config: {e}", exc_info=True)
            return cls._get_defaults()
    
    @classmethod
    def _validate_config(cls, config: Dict[str, Any]) -> None:
        """
        Validate configuration schema and values.
        
        Args:
            config: Configuration dictionary to validate
            
        Raises:
            ValueError: If configuration is invalid
        """
        # Validate required sections
        required_sections = ['data_transfer_mode', 'server', 'database']
        for section in required_sections:
            if section not in config:
                logger.warning(f"Missing required config section: {section}")
        
        # Validate server port
        server_config = config.get('server', {})
        tcp_port = server_config.get('tcp_port', 2001)
        if not isinstance(tcp_port, int) or not (1 <= tcp_port <= 65535):
            logger.warning(f"Invalid TCP port: {tcp_port}, using default 2001")
            server_config['tcp_port'] = 2001
        
        # Validate data transfer mode (only RABBITMQ and LOGS are supported)
        mode = config.get('data_transfer_mode', {}).get('mode', 'LOGS')
        # Normalize to uppercase
        mode = mode.upper() if isinstance(mode, str) else 'LOGS'
        if mode not in ['LOGS', 'RABBITMQ']:
            logger.warning(f"Invalid data_transfer_mode: {mode}, using default 'LOGS'")
            config.setdefault('data_transfer_mode', {})['mode'] = 'LOGS'
            mode = 'LOGS'
        else:
            # Store normalized uppercase value
            config.setdefault('data_transfer_mode', {})['mode'] = mode
        
        # Validate RabbitMQ config if in RABBITMQ mode
        if mode == 'RABBITMQ':
            rabbitmq_config = config.get('rabbitmq', {})
            if not rabbitmq_config.get('host'):
                logger.warning("RabbitMQ mode enabled but no RabbitMQ host configured")
            parser_config = config.get('parser_node', {})
            if not parser_config.get('node_id'):
                logger.warning("RabbitMQ mode enabled but no parser_node.node_id configured")
        
        # Security: Validate password is set via environment variable in production
        # Database is only needed for:
        # - RABBITMQ mode: For commands/unit_io_mapping (optional in dev mode)
        # - LOGS mode: Database is completely optional (only for commands if enabled)
        development_mode = config.get('system', {}).get('development_mode', False)
        db_config = config.get('database', {})
        password = os.getenv('DATABASE_PASSWORD', db_config.get('password', ''))
        
        # Only validate password in production RABBITMQ mode (database needed for commands/unit_io_mapping)
        # In LOGS mode or development mode, database password is optional
        if mode == 'RABBITMQ' and not development_mode:
            # RABBITMQ mode in production: Warn if no password (database needed for commands/unit_io_mapping)
            if not password:
                logger.warning(
                    "RABBITMQ mode enabled but no DATABASE_PASSWORD set. "
                    "Database features (commands, unit_io_mapping) may not work. "
                    "Set development_mode=true for local development, or set DATABASE_PASSWORD environment variable."
                )
        elif mode == 'RABBITMQ' and development_mode:
            # RABBITMQ mode in development: Password optional
            if not password:
                logger.debug(
                    "RABBITMQ mode in development mode - DATABASE_PASSWORD optional. "
                    "Database features (commands, unit_io_mapping) may not work without database connection."
                )
        # LOGS mode: Database password is completely optional (only needed if commands are enabled)
        
        logger.debug("Configuration validation completed")
    
    @classmethod
    def _find_config_file(cls) -> str:
        """
        Find config.json in the parser_node directory.
        Parser service uses its own config.json file for logical separation.
        """
        # __file__ is parser_nodes/teltonika/config.py, so config.json is in the same directory
        # Use the stored module file path if available, otherwise use __file__
        if hasattr(cls, '_module_file'):
            config_py_path = cls._module_file
        else:
            config_py_path = __file__
        
        parser_node_dir = os.path.dirname(os.path.abspath(config_py_path))
        config_file = os.path.join(parser_node_dir, "config.json")
        
        if os.path.exists(config_file):
            logger.debug(f"Found config file at: {config_file}")
            return config_file
        
        logger.error(f"Config file not found. Expected at: {config_file}")
        raise FileNotFoundError(f"config.json not found in parser_nodes/teltonika directory: {parser_node_dir}")
    
    @classmethod
    def _merge_with_defaults(cls, config: Dict[str, Any]) -> Dict[str, Any]:
        """Merge loaded config with defaults"""
        defaults = cls._get_defaults()
        result = defaults.copy()
        for key, value in config.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = {**result[key], **value}
            else:
                result[key] = value
        return result
    
    @classmethod
    def _get_defaults(cls) -> Dict[str, Any]:
        """Default configuration values for Teltonika"""
        return {
            "data_transfer_mode": {"mode": "LOGS"},
            "server": {"ip": "0.0.0.0", "tcp_port": 2001},
            "database": {
                "host": "localhost", "port": 5432, "name": "megatechtrackers",
                "user": "postgres", "password": "", "engine": "PostgreSQL"
            },
            # Note: SMS commands handled by separate SMS Gateway Service
            "system": {
                "initial_capacity": 100000,
                "deviceinfo_check_interval": 1,
                "send_interval_time": 5000,
                "development_mode": False
            },
            "teltonika_protocol": {
                "connection_timeout": 300,
                "read_timeout": 30
            },
            "tcp_server": {
                "buffer_size": 8192,
                "max_concurrent_connections": 50000,
                "backlog": 1000,
                "connection_reject_timeout": 1.0, "connection_cleanup_timeout": 5.0,
                "log_raw_packets": True, "raw_packet_max_bytes": 256,
                "max_packet_size": 10485760
            },
            "async_queues": {
                "msg_received_capacity": 10000, "msg_parse_capacity": 10000,
                "queue_poll_timeout": 1.0
            },
            "ip_table": {"check_interval": 300},
            "database_connection": {"connection_timeout": 30},
            "shutdown": {
                "tcp_server_stop_timeout": 1.0,
                "sms_listener_stop_timeout": 1.0, "task_completion_timeout": 1.5
            },
            "async_operations": {
                "buffer_wait_timeout": 1.0,
                "feedback_wait_timeout": 1.0
            },
            "logging": {
                "gateway_log_file": "logs/gateway.log",
                "level": "INFO",
                "max_bytes": 10485760,
                "backup_count": 5,
                "json_format": False
            },
            "unit_io_mapping": {
                "cache_ttl_minutes": 30,
                "cache_max_size": 10000,
                "inactive_cleanup_hours": 24,
                "check_db_changes": True,
                "cleanup_interval_minutes": 60
            }
        }
    
    @classmethod
    def get_data_transfer_mode(cls) -> str:
        """Get data transfer mode (returns uppercase: LOGS or RABBITMQ)
        Normalizes to uppercase for robustness - accepts any case input
        """
        mode = cls.load()["data_transfer_mode"]["mode"]
        return mode.upper() if isinstance(mode, str) else "LOGS"
    
    @classmethod
    def get_server_config(cls) -> Dict[str, Any]:
        """Get server configuration"""
        return cls.load()["server"]
    
    @classmethod
    def get_database_config(cls) -> Dict[str, Any]:
        """Get database configuration"""
        return cls.load()["database"]


class ServerParams:
    """Server runtime parameters"""
    
    @classmethod
    def get(cls, key: str, default=None):
        """Get parameter using dot notation (e.g., 'system.initial_capacity')"""
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
    
    @classmethod
    def get_int(cls, key: str, default: int = 0) -> int:
        """Get integer parameter"""
        value = cls.get(key, default)
        try:
            return int(value)
        except (ValueError, TypeError):
            return default
    
    @classmethod
    def get_float(cls, key: str, default: float = 0.0) -> float:
        """Get float parameter"""
        value = cls.get(key, default)
        try:
            return float(value)
        except (ValueError, TypeError):
            return default
    
    @classmethod
    def get_bool(cls, key: str, default: bool = False) -> bool:
        """Get boolean parameter"""
        value = cls.get(key, default)
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in ('true', '1', 'yes', 'on')
        return bool(value) if value is not None else default


# Store module file path for config loading
Config._module_file = __file__

# Auto-load config on module import
Config.load()
