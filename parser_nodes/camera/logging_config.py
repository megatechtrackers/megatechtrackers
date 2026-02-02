"""
Logging configuration for Camera Parser
Supports JSON format, file rotation, and configurable levels
"""
import logging
import logging.handlers
import os
import sys
import json
from datetime import datetime, timezone
from typing import Optional


class JSONFormatter(logging.Formatter):
    """JSON log formatter for structured logging"""
    
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        
        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        
        # Add extra fields
        if hasattr(record, "extra_fields"):
            log_data.update(record.extra_fields)
        
        return json.dumps(log_data)


def setup_logging(
    level: Optional[str] = None,
    log_file: Optional[str] = None,
    json_format: bool = False,
    max_bytes: int = 10 * 1024 * 1024,  # 10MB
    backup_count: int = 5
):
    """
    Configure logging for the camera parser.
    
    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_file: Path to log file (optional, logs to stdout if not provided)
        json_format: Use JSON format for logs
        max_bytes: Max size of each log file before rotation
        backup_count: Number of backup files to keep
    """
    # Get level from environment or parameter
    log_level = level or os.getenv('LOG_LEVEL', 'INFO').upper()
    use_json = json_format or os.getenv('LOG_JSON', 'false').lower() == 'true'
    log_path = log_file or os.getenv('LOG_FILE')
    
    # Create root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level, logging.INFO))
    
    # Clear existing handlers
    root_logger.handlers.clear()
    
    # Create formatter
    if use_json:
        formatter = JSONFormatter()
    else:
        formatter = logging.Formatter(
            fmt='%(asctime)s | %(levelname)-8s | %(name)s | %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
    
    # Console handler (always add)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    console_handler.setLevel(getattr(logging, log_level, logging.INFO))
    root_logger.addHandler(console_handler)
    
    # File handler (optional)
    if log_path:
        try:
            # Create log directory if needed
            log_dir = os.path.dirname(log_path)
            if log_dir and not os.path.exists(log_dir):
                os.makedirs(log_dir)
            
            # Use rotating file handler
            file_handler = logging.handlers.RotatingFileHandler(
                log_path,
                maxBytes=max_bytes,
                backupCount=backup_count,
                encoding='utf-8'
            )
            file_handler.setFormatter(formatter)
            file_handler.setLevel(getattr(logging, log_level, logging.INFO))
            root_logger.addHandler(file_handler)
            
            logging.info(f"Logging to file: {log_path}")
        except Exception as e:
            logging.warning(f"Could not setup file logging: {e}")
    
    # Reduce noise from third-party libraries
    logging.getLogger('aiohttp').setLevel(logging.WARNING)
    logging.getLogger('asyncio').setLevel(logging.WARNING)
    logging.getLogger('aio_pika').setLevel(logging.WARNING)
    logging.getLogger('asyncpg').setLevel(logging.WARNING)
    logging.getLogger('urllib3').setLevel(logging.WARNING)
    
    logger = logging.getLogger(__name__)
    logger.info(f"Logging configured: level={log_level}, json={use_json}, file={log_path or 'stdout'}")


def setup_logging_from_config():
    """Setup logging from config.json and environment variables"""
    try:
        from config import Config
        config = Config.load()
        log_config = config.get('logging', {})
        
        setup_logging(
            level=log_config.get('level'),
            log_file=log_config.get('log_file'),
            json_format=log_config.get('json_format', False),
            max_bytes=log_config.get('max_bytes', 10 * 1024 * 1024),
            backup_count=log_config.get('backup_count', 5)
        )
    except Exception as e:
        # Fallback to basic setup
        setup_logging()
        logging.warning(f"Could not load logging config: {e}")
