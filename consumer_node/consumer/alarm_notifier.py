"""
Alarm Notifier - Publishes alarms to alarm_exchange for Alarm Service processing
This is a non-blocking, fire-and-forget service that doesn't affect main database save flow
"""
import asyncio
import logging
import json
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import aio_pika
from aio_pika import ExchangeType

from config import Config

logger = logging.getLogger(__name__)

# Global connection and channel (lazy initialization)
_alarm_connection: Optional[aio_pika.Connection] = None
_alarm_channel: Optional[aio_pika.Channel] = None
_alarm_exchange: Optional[aio_pika.Exchange] = None
_connection_lock = asyncio.Lock()
_initialization_attempted = False


async def _ensure_connection():
    """Ensure RabbitMQ connection for alarm notifications (lazy initialization)"""
    global _alarm_connection, _alarm_channel, _alarm_exchange, _initialization_attempted
    
    if _alarm_exchange is not None:
        return True
    
    if _initialization_attempted:
        return False
    
    async with _connection_lock:
        # Double-check after acquiring lock
        if _alarm_exchange is not None:
            return True
        
        if _initialization_attempted:
            return False
        
        try:
            config = Config.load()
            rabbitmq_config = config.get('rabbitmq', {})
            
            if not rabbitmq_config.get('host'):
                logger.debug("RabbitMQ not configured, skipping alarm notification publishing")
                _initialization_attempted = True
                return False
            
            host = rabbitmq_config.get('host', 'localhost')
            port = rabbitmq_config.get('port', 5672)
            virtual_host = rabbitmq_config.get('virtual_host', '/')
            username = rabbitmq_config.get('username', 'guest')
            password = rabbitmq_config.get('password', 'guest')
            
            # Build connection URL
            if virtual_host == '/':
                url = f"amqp://{username}:{password}@{host}:{port}/"
            else:
                url = f"amqp://{username}:{password}@{host}:{port}/{virtual_host}"
            
            # Connect to RabbitMQ
            _alarm_connection = await aio_pika.connect_robust(url)
            _alarm_channel = await _alarm_connection.channel()
            
            # Declare alarm_exchange (topic type for flexible routing)
            _alarm_exchange = await _alarm_channel.declare_exchange(
                'alarm_exchange',
                ExchangeType.TOPIC,
                durable=True
            )
            
            logger.info("Alarm notification publisher initialized")
            _initialization_attempted = True
            return True
            
        except Exception as e:
            logger.warning(f"Failed to initialize alarm notification publisher: {e}")
            logger.debug("Alarm notifications will be skipped (non-critical)", exc_info=True)
            _initialization_attempted = True
            return False


async def notify_alarm_saved(alarm_record: Dict[str, Any], alarm_id: Optional[int] = None):
    """
    Publish alarm to alarm_exchange for Alarm Service processing
    
    This is a non-blocking, fire-and-forget operation that doesn't affect
    the main database save flow. Errors are logged but not raised.
    
    Args:
        alarm_record: The alarm record dictionary (same format as from RabbitMQ)
        alarm_id: Optional alarm ID if available from database
    """
    try:
        # Ensure connection (lazy initialization)
        if not await _ensure_connection():
            return  # Silently skip if RabbitMQ not available
        
        if _alarm_exchange is None:
            return
        
        # Prepare message for Alarm Service
        # Include all alarm data that Alarm Service needs
        message = {
            'alarmId': alarm_id,
            'id': alarm_id,  # Support both formats
            'imei': alarm_record.get('imei'),
            'status': alarm_record.get('status', 'Normal'),
            'priority': alarm_record.get('priority', 5),
            'scheduledAt': alarm_record.get('scheduled_at'),
            'scheduled_at': alarm_record.get('scheduled_at'),
            'channels': {
                'email': bool(alarm_record.get('is_email', 0)),
                'sms': bool(alarm_record.get('is_sms', 0)),
                'voice': bool(alarm_record.get('is_call', 0)),
            },
            'is_email': alarm_record.get('is_email', 0),
            'is_sms': alarm_record.get('is_sms', 0),
            'is_call': alarm_record.get('is_call', 0),
            'state': alarm_record.get('state', {}),
            'category': alarm_record.get('category'),
            'retry_count': alarm_record.get('retry_count', 0),
            # Include GPS data
            'server_time': alarm_record.get('server_time'),
            'gps_time': alarm_record.get('gps_time'),
            'latitude': alarm_record.get('latitude', 0),
            'longitude': alarm_record.get('longitude', 0),
            'altitude': alarm_record.get('altitude', 0),
            'angle': alarm_record.get('angle', 0),
            'satellites': alarm_record.get('satellites', 0),
            'speed': alarm_record.get('speed', 0),
            'reference_id': alarm_record.get('reference_id'),
            'distance': alarm_record.get('distance'),
            'created_at': alarm_record.get('created_at'),
            'timestamp': alarm_record.get('server_time') or alarm_record.get('gps_time'),
        }
        
        # Publish to alarm_exchange with routing key
        # Use 'alarm.notification' to match Alarm Service binding
        # (also matches 'alarm.*' pattern in definitions.json)
        priority = min(max(alarm_record.get('priority', 5), 0), 10)
        
        await _alarm_exchange.publish(
            aio_pika.Message(
                body=json.dumps(message, default=str).encode(),
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                priority=priority,
                message_id=f"alarm-{alarm_id}" if alarm_id else None,
                timestamp=int(datetime.now(timezone.utc).timestamp()),
                headers={
                    'alarm-type': message.get('status', 'Normal'),
                    'imei': str(message.get('imei', '')),
                }
            ),
            routing_key='alarm.notification'
        )
        
        logger.debug(f"Published alarm notification: imei={message.get('imei')}, id={alarm_id}")
        
    except Exception as e:
        # Log but don't raise - this is non-critical
        logger.debug(f"Failed to publish alarm notification (non-critical): {e}", exc_info=True)


async def close():
    """Close RabbitMQ connection (called on shutdown)"""
    global _alarm_connection, _alarm_channel, _alarm_exchange
    
    try:
        if _alarm_channel:
            await _alarm_channel.close()
        if _alarm_connection:
            await _alarm_connection.close()
        _alarm_connection = None
        _alarm_channel = None
        _alarm_exchange = None
        logger.debug("Alarm notification publisher closed")
    except Exception as e:
        logger.debug(f"Error closing alarm notification publisher: {e}")
