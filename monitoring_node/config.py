"""
Simplified JSON-based configuration for Megatechtrackers Fleet Tracking
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
        required_sections = ['monitoring']
        for section in required_sections:
            if section not in config:
                logger.warning(f"Missing required config section: {section}")
        
        # Validate monitoring config
        monitoring_config = config.get('monitoring', {})
        port = monitoring_config.get('port', 8080)
        if not isinstance(port, int) or not (1 <= port <= 65535):
            logger.warning(f"Invalid monitoring port: {port}, using default 8080")
            monitoring_config['port'] = 8080
        
        logger.debug("Configuration validation completed")
    
    @classmethod
    def _find_config_file(cls) -> str:
        """
        Find config.json in the monitoring_node directory.
        Monitoring uses its own config.json file for logical separation.
        """
        # __file__ is monitoring_node/config.py, so config.json is in the same directory
        if hasattr(cls, '_module_file'):
            config_py_path = cls._module_file
        else:
            config_py_path = __file__
        
        monitoring_node_dir = os.path.dirname(os.path.abspath(config_py_path))
        config_file = os.path.join(monitoring_node_dir, "config.json")
        
        if os.path.exists(config_file):
            logger.debug(f"Found config file at: {config_file}")
            return config_file
        
        logger.error(f"Config file not found. Expected at: {config_file}")
        raise FileNotFoundError(f"config.json not found in monitoring_node directory: {monitoring_node_dir}")
    
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
        """Default configuration values for Monitoring"""
        return {
            "monitoring": {
                "enabled": True,
                "host": "0.0.0.0",
                "port": 8080,
                "update_interval_seconds": 2,
                "enable_prometheus": True
            },
            "logging": {
                "log_file": "logs/monitoring.log",
                "level": "INFO",
                "max_bytes": 10485760,
                "backup_count": 5,
                "json_format": False
            }
        }
    


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


# Auto-load config on module import
Config.load()
