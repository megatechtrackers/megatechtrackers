"""
Logging configuration utility - configures logging from config.json
Based on original teltonika_gateway_startup.py logging setup
"""
import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from typing import Optional
import json

from config import Config


def setup_logging_from_config() -> None:
    """
    Configure logging from config.json settings.
    Supports log rotation, JSON format, and configurable log levels.
    """
    try:
        config = Config.load()
        log_config = config.get('logging', {})
        
        # Get log file path
        log_file = log_config.get('gateway_log_file', os.path.join('logs', 'gateway.log'))
        
        # Ensure logs directory exists
        logs_dir = os.path.dirname(log_file)
        if logs_dir and not os.path.exists(logs_dir):
            os.makedirs(logs_dir, exist_ok=True)
        
        # Get configurable log level
        log_level_str = log_config.get('level', 'INFO').upper()
        log_level_map = {
            'DEBUG': logging.DEBUG,
            'INFO': logging.INFO,
            'WARNING': logging.WARNING,
            'ERROR': logging.ERROR,
            'CRITICAL': logging.CRITICAL
        }
        log_level = log_level_map.get(log_level_str, logging.INFO)
        
        # Remove existing handlers to avoid duplicates
        root_logger = logging.getLogger()
        for handler in root_logger.handlers[:]:
            root_logger.removeHandler(handler)
        
        # Get log rotation settings from config
        max_bytes = log_config.get('max_bytes', 10 * 1024 * 1024)  # 10MB default
        backup_count = log_config.get('backup_count', 5)  # Keep 5 backup files
        enable_json_logging = log_config.get('json_format', False)  # Structured JSON logging
        
        if enable_json_logging:
            # JSON structured logging
            class JSONFormatter(logging.Formatter):
                def format(self, record):
                    log_entry = {
                        'timestamp': self.formatTime(record, self.datefmt),
                        'level': record.levelname,
                        'logger': record.name,
                        'message': record.getMessage(),
                        'module': record.module,
                        'function': record.funcName,
                        'line': record.lineno
                    }
                    if record.exc_info:
                        log_entry['exception'] = self.formatException(record.exc_info)
                    return json.dumps(log_entry)
            
            file_handler = RotatingFileHandler(
                log_file,
                maxBytes=max_bytes,
                backupCount=backup_count,
                encoding='utf-8'
            )
            file_handler.setFormatter(JSONFormatter())
        else:
            # Standard text logging
            file_handler = RotatingFileHandler(
                log_file,
                maxBytes=max_bytes,
                backupCount=backup_count,
                encoding='utf-8'
            )
            file_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            file_handler.setFormatter(file_formatter)
        
        file_handler.setLevel(log_level)
        
        # Console handler (for development/debugging)
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(log_level)
        console_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        console_handler.setFormatter(console_formatter)
        
        # Configure root logger
        root_logger.setLevel(log_level)
        root_logger.addHandler(file_handler)
        root_logger.addHandler(console_handler)
        
        # Suppress noisy aio_pika/aiormq internal errors during reconnections
        # These are expected when RabbitMQ goes down and don't need full tracebacks
        # The errors like "RuntimeError: <Connection> closed" and "Connect call failed"
        # are internal to the library's auto-reconnect mechanism
        for noisy_logger in ['aio_pika', 'aio_pika.tools', 'aio_pika.robust_channel', 
                              'aio_pika.robust_connection', 'aiormq', 'aiormq.connection']:
            logging.getLogger(noisy_logger).setLevel(logging.CRITICAL)
        
        logger = logging.getLogger(__name__)
        logger.info(f"Logging configured: file={log_file}, level={log_level_str}, json={enable_json_logging}, max_bytes={max_bytes}, backups={backup_count}")
        
    except Exception as e:
        # Fallback to basic logging if config fails
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('logs/gateway.log'),
                logging.StreamHandler(sys.stdout)
            ]
        )
        logging.getLogger(__name__).warning(f"Failed to configure logging from config: {e}, using defaults")
