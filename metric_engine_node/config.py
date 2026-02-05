"""
Configuration for Metric Engine Node.
Loads from config.json (single file).
"""
import json
import os
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class Config:
    """Configuration class - loads from config.json."""

    _config: Optional[Dict[str, Any]] = None
    _config_file: str = "config.json"

    @classmethod
    def load(cls, file_path: Optional[str] = None) -> Dict[str, Any]:
        """Load configuration from JSON file."""
        if file_path:
            cls._config_file = file_path
        if cls._config is None:
            cls._config = cls._load_config()
        return cls._config

    @classmethod
    def _load_config(cls) -> Dict[str, Any]:
        """Load JSON config with defaults."""
        config_file = cls._find_config_file()
        try:
            if os.path.exists(config_file):
                with open(config_file, "r", encoding="utf-8") as f:
                    config = json.load(f)
                logger.info("Loaded configuration from %s", config_file)
                return cls._merge_with_defaults(config)
            logger.warning("Config file not found: %s, using defaults", config_file)
            return cls._get_defaults()
        except json.JSONDecodeError as e:
            logger.error("Invalid JSON in config file: %s", e, exc_info=True)
            return cls._get_defaults()
        except Exception as e:
            logger.error("Error loading config: %s", e, exc_info=True)
            return cls._get_defaults()

    @classmethod
    def _find_config_file(cls) -> str:
        """Find config.json in metric_engine_node directory."""
        base = os.path.dirname(os.path.abspath(__file__))
        return os.path.join(base, cls._config_file)

    @classmethod
    def _merge_with_defaults(cls, config: Dict[str, Any]) -> Dict[str, Any]:
        """Merge loaded config with defaults."""
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
        """Default configuration. Env overrides: METRIC_ENGINE_DB_*, METRIC_ENGINE_METRICS_PORT, LOG_LEVEL."""
        return {
            "rabbitmq": {
                "host": "localhost",
                "port": 5672,
                "virtual_host": "tracking_gateway",
                "username": "tracking_user",
                "password": "tracking_password",
                "exchange": "tracking_data_exchange",
                "queue": "metrics_queue",
            },
            "database": {
                "host": "localhost",
                "port": 5432,
                "name": "megatechtrackers",
                "user": "postgres",
                "password": "",
                "engine": "PostgreSQL",
                "min_size": 1,
                "max_size": 5,
            },
            "metric_engine": {
                "workers": 1,
                "prefetch_count": 50,
                "batch_size": 100,
                "batch_timeout": 2.0,
                "enabled": True,
                "shadow_mode": False,
                "recalculation_batch_size": 500,
                "recalculation_poll_interval_sec": 60.0,
                "scheduled_refresh_interval_sec": 86400.0,
                "scheduled_refresh_initial_delay_sec": 300.0,
            },
            "logging": {
                "log_file": "logs/metric_engine.log",
                "level": "INFO",
                "max_bytes": 10485760,
                "backup_count": 5,
                "json_format": False,
            },
        }

    @classmethod
    def get_database_config(cls) -> Dict[str, Any]:
        """Get database configuration. Env overrides: METRIC_ENGINE_DB_HOST, PORT, NAME, USER, PASSWORD, MIN_SIZE, MAX_SIZE."""
        cfg = cls.load()["database"].copy()
        if os.environ.get("METRIC_ENGINE_DB_HOST"):
            cfg["host"] = os.environ["METRIC_ENGINE_DB_HOST"]
        if os.environ.get("METRIC_ENGINE_DB_PORT"):
            try:
                cfg["port"] = int(os.environ["METRIC_ENGINE_DB_PORT"])
            except ValueError:
                pass
        if os.environ.get("METRIC_ENGINE_DB_NAME"):
            cfg["name"] = os.environ["METRIC_ENGINE_DB_NAME"]
        if os.environ.get("METRIC_ENGINE_DB_USER"):
            cfg["user"] = os.environ["METRIC_ENGINE_DB_USER"]
        if os.environ.get("METRIC_ENGINE_DB_PASSWORD"):
            cfg["password"] = os.environ["METRIC_ENGINE_DB_PASSWORD"]
        if os.environ.get("METRIC_ENGINE_DB_MIN_SIZE"):
            try:
                cfg["min_size"] = int(os.environ["METRIC_ENGINE_DB_MIN_SIZE"])
            except ValueError:
                pass
        if os.environ.get("METRIC_ENGINE_DB_MAX_SIZE"):
            try:
                cfg["max_size"] = int(os.environ["METRIC_ENGINE_DB_MAX_SIZE"])
            except ValueError:
                pass
        return cfg

    @classmethod
    def get_rabbitmq_config(cls) -> Dict[str, Any]:
        """Get RabbitMQ configuration."""
        return cls.load()["rabbitmq"]

    @classmethod
    def get_metric_engine_config(cls) -> Dict[str, Any]:
        """Get metric_engine section (pool, recalculation, scheduled refresh, shadow_mode)."""
        cfg = cls.load().get("metric_engine", {})
        # Plan § 10.2 Phase 2: METRIC_ENGINE_SHADOW_MODE=true = calculate but only log, no DB writes or alarm publish
        if os.environ.get("METRIC_ENGINE_SHADOW_MODE", "").strip().lower() in ("1", "true", "yes"):
            cfg = {**cfg, "shadow_mode": True}
        return cfg


Config.load()
