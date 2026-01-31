"""
SMS Gateway Service Configuration
Loads from config.json (same pattern as parser_nodes and consumer_node)
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
        Useful for hot-reloading during development.
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
                
                # Merge with defaults
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
        """Validate configuration schema and values."""
        required_sections = ['database', 'polling', 'timeouts']
        for section in required_sections:
            if section not in config:
                logger.warning(f"Missing required config section: {section}")
        
        # Validate database config
        db_config = config.get('database', {})
        if not db_config.get('host'):
            logger.warning("Database host not configured")
        
        logger.debug("Configuration validation completed")
    
    @classmethod
    def _find_config_file(cls) -> str:
        """Find config.json in the sms_gateway_node directory."""
        if hasattr(cls, '_module_file'):
            config_py_path = cls._module_file
        else:
            config_py_path = __file__
        
        sms_gateway_node_dir = os.path.dirname(os.path.abspath(config_py_path))
        config_file = os.path.join(sms_gateway_node_dir, "config.json")
        
        if os.path.exists(config_file):
            logger.debug(f"Found config file at: {config_file}")
            return config_file
        
        # Fallback - return expected path anyway (will use defaults)
        logger.warning(f"Config file not found at: {config_file}")
        return config_file
    
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
        """Default configuration values for SMS Gateway Service"""
        return {
            "database": {
                "host": "localhost",
                "port": 5432,
                "name": "megatechtrackers",
                "user": "postgres",
                "password": "",
                "engine": "PostgreSQL"
            },
            "polling": {
                "outbox_interval_seconds": 5,
                "inbox_interval_seconds": 10,
                "batch_size": 10
            },
            "timeouts": {
                "max_retries": 3,
                "outbox_timeout_minutes": 1,
                "reply_timeout_minutes": 2,
                "cleanup_interval_seconds": 60
            },
            "modem": {
                "health_check_interval_seconds": 60,
                "request_timeout_seconds": 30,
                "ssl_verify": False
            },
            "logging": {
                "log_file": "logs/sms_gateway_node.log",
                "level": "INFO",
                "max_bytes": 10485760,
                "backup_count": 5,
                "json_format": False
            }
        }
    
    @classmethod
    def get_database_config(cls) -> Dict[str, Any]:
        """Get database configuration"""
        return cls.load()["database"]


class ServerParams:
    """Server runtime parameters - provides typed access to config values"""
    
    @classmethod
    def get(cls, key: str, default=None):
        """Get parameter using dot notation (e.g., 'polling.outbox_interval_seconds')"""
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
