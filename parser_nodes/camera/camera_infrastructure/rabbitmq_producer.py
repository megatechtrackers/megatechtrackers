"""
RabbitMQ Producer for Camera Parser
Publishes parsed tracking data to RabbitMQ with publisher confirms
"""
import asyncio
import logging
import json
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import aio_pika
from aio_pika import ExchangeType, DeliveryMode
import aio_pika.exceptions

import sys
sys.path.insert(0, '..')
from config import Config
from .connection_retry import retry_connection, _is_shutdown_requested

logger = logging.getLogger(__name__)


class RabbitMQProducer:
    """
    RabbitMQ message producer with publisher confirms.
    Ensures messages are persisted before ACK is sent.
    """
    
    def __init__(self):
        """Initialize RabbitMQ producer"""
        self.connection: Optional[aio_pika.Connection] = None
        self.channel: Optional[aio_pika.Channel] = None
        self.exchange: Optional[aio_pika.Exchange] = None
        self._connected = False
        self._shutting_down = False
        self._publish_successes = 0
        self._publish_failures = 0
        self._reconnect_count = 0
        self._connection_lock = asyncio.Lock()
        
    async def connect(self, retry: bool = True):
        """
        Connect to RabbitMQ and set up exchange.
        
        Args:
            retry: If True, retry connection indefinitely with exponential backoff
        """
        if self._shutting_down:
            raise asyncio.CancelledError("Shutdown in progress")
        
        async def _connect():
            # Check for shutdown before attempting
            if self._shutting_down or _is_shutdown_requested():
                raise asyncio.CancelledError("Shutdown requested")
            
            # Load RabbitMQ configuration
            rabbitmq_config = Config.load().get('rabbitmq', {})
            host = rabbitmq_config.get('host', 'localhost')
            port = rabbitmq_config.get('port', 5672)
            virtual_host = rabbitmq_config.get('virtual_host', '/')
            username = rabbitmq_config.get('username', 'guest')
            password = rabbitmq_config.get('password', 'guest')
            exchange_name = rabbitmq_config.get('exchange', 'tracking_data_exchange')
            
            url = f"amqp://{username}:{password}@{host}:{port}/{virtual_host}"
            
            logger.info(f"Connecting to RabbitMQ at {host}:{port}...")
            
            # Check shutdown again before actual connection
            if self._shutting_down or _is_shutdown_requested():
                raise asyncio.CancelledError("Shutdown requested")
            
            # Create connection
            # Use connect_robust for auto-reconnection on startup
            # Use regular connect for fast-fail during publish
            if retry:
                self.connection = await aio_pika.connect_robust(url)
            else:
                self.connection = await aio_pika.connect(url)
            
            # Create channel with publisher confirms enabled
            publisher_confirms = rabbitmq_config.get('publisher_confirms', True)
            self.channel = await self.connection.channel(publisher_confirms=publisher_confirms)
            
            # Declare exchange
            self.exchange = await self.channel.declare_exchange(
                exchange_name,
                ExchangeType.TOPIC,
                durable=True
            )
            
            self._connected = True
            logger.info(f"✓ Connected to RabbitMQ, exchange: {exchange_name}")
        
        if retry:
            await retry_connection(
                _connect,
                max_retries=-1,
                initial_delay=1.0,
                max_delay=30.0,
                operation_name="RabbitMQ connection"
            )
        else:
            await _connect()
    
    async def disconnect(self):
        """Disconnect from RabbitMQ and stop all reconnection attempts"""
        self._shutting_down = True
        async with self._connection_lock:
            try:
                if self.channel:
                    try:
                        await asyncio.wait_for(self.channel.close(), timeout=2.0)
                    except Exception as e:
                        logger.debug(f"Error closing channel: {e}")
                    self.channel = None
                
                if self.connection:
                    try:
                        await asyncio.wait_for(self.connection.close(), timeout=2.0)
                    except Exception as e:
                        logger.debug(f"Error closing connection: {e}")
                    self.connection = None
                
                self.exchange = None
                self._connected = False
                logger.debug("Disconnected from RabbitMQ")
            except Exception as e:
                logger.debug(f"Error disconnecting from RabbitMQ: {e}")
    
    def is_ready(self) -> bool:
        """
        Quick check if producer is ready to publish.
        Does NOT attempt reconnection.
        """
        if self._shutting_down:
            return False
        if not self.connection:
            return False
        if self.connection.is_closed:
            return False
        if not self.channel or self.channel.is_closed:
            return False
        if not self.exchange:
            return False
        return self._connected
    
    async def _ensure_connection(self, reconnect_timeout: float = 10.0) -> bool:
        """
        Ensure connection is ready, attempting reconnect if needed.
        
        Args:
            reconnect_timeout: Timeout for reconnection attempt
            
        Returns:
            True if connection is ready, False otherwise
        """
        async with self._connection_lock:
            if self.is_ready():
                return True
            
            if self._shutting_down:
                return False
            
            # Determine what needs to be fixed
            needs_full_reconnect = False
            needs_channel_recreate = False
            
            if not self.connection or self.connection.is_closed:
                needs_full_reconnect = True
            elif not self.channel or self.channel.is_closed or not self.exchange:
                needs_channel_recreate = True
            
            if needs_full_reconnect:
                logger.warning("RabbitMQ not connected, attempting to reconnect...")
                try:
                    # Cleanup old connection
                    if self.connection:
                        try:
                            if self.channel:
                                await asyncio.wait_for(self.channel.close(), timeout=1.0)
                        except:
                            pass
                        try:
                            if not self.connection.is_closed:
                                await asyncio.wait_for(self.connection.close(), timeout=1.0)
                        except:
                            pass
                        self.connection = None
                    self.channel = None
                    self.exchange = None
                    self._connected = False
                    
                    # Fast reconnect with timeout
                    await asyncio.wait_for(self.connect(retry=False), timeout=reconnect_timeout)
                    self._reconnect_count += 1
                    return True
                except asyncio.TimeoutError:
                    logger.error(f"RabbitMQ reconnection timed out after {reconnect_timeout}s")
                    return False
                except Exception as e:
                    logger.error(f"Failed to reconnect to RabbitMQ: {e}")
                    return False
                    
            elif needs_channel_recreate:
                logger.warning("RabbitMQ channel/exchange missing, recreating...")
                try:
                    if self.channel and not self.channel.is_closed:
                        try:
                            await asyncio.wait_for(self.channel.close(), timeout=1.0)
                        except:
                            pass
                    
                    rabbitmq_config = Config.load().get('rabbitmq', {})
                    exchange_name = rabbitmq_config.get('exchange', 'tracking_data_exchange')
                    publisher_confirms = rabbitmq_config.get('publisher_confirms', True)
                    
                    self.channel = await asyncio.wait_for(
                        self.connection.channel(publisher_confirms=publisher_confirms),
                        timeout=5.0
                    )
                    self.exchange = await asyncio.wait_for(
                        self.channel.declare_exchange(exchange_name, ExchangeType.TOPIC, durable=True),
                        timeout=5.0
                    )
                    self._connected = True
                    logger.info(f"✓ Recreated RabbitMQ channel and exchange")
                    return True
                except asyncio.TimeoutError:
                    logger.error("Timeout recreating channel/exchange")
                    self._connected = False
                    return False
                except Exception as e:
                    logger.error(f"Failed to recreate channel/exchange: {e}")
                    self._connected = False
                    return False
        
        return self.is_ready()
    
    async def publish_tracking_record(
        self,
        record: Dict[str, Any],
        vendor: str = "camera",
        record_type: str = "trackdata",
        timeout: float = 5.0
    ) -> bool:
        """
        Publish tracking record to RabbitMQ with publisher confirms.
        
        Args:
            record: Tracking record dictionary
            vendor: Vendor name (camera, teltonika, etc.)
            record_type: Record type (trackdata, alarm, event)
            timeout: Timeout for publisher confirm (seconds)
            
        Returns:
            bool: True if message was confirmed by RabbitMQ, False otherwise
        """
        # Fast fail if shutting down
        if self._shutting_down:
            logger.warning("RabbitMQ producer shutting down - publish rejected")
            return False
        
        # Ensure connection is ready
        if not await self._ensure_connection():
            self._publish_failures += 1
            return False
        
        # Final check
        if not self.is_ready():
            logger.error("✗ RabbitMQ not ready after connection check - publish failed")
            self._publish_failures += 1
            return False
        
        routing_key = f"tracking.{vendor}.{record_type}"
        
        try:
            # Create message
            message_body = json.dumps(record).encode('utf-8')
            
            # Priority: High for alarms, normal for others
            priority = 10 if record_type == "alarm" else 0
            
            # Publish with persistent delivery mode
            message = aio_pika.Message(
                message_body,
                delivery_mode=DeliveryMode.PERSISTENT,
                priority=priority,
                timestamp=datetime.now(timezone.utc)
            )
            
            # Publish and wait for confirmation with timeout
            confirmed = await asyncio.wait_for(
                self.exchange.publish(
                    message,
                    routing_key=routing_key
                ),
                timeout=timeout
            )
            
            if confirmed:
                self._publish_successes += 1
                logger.debug(f"✓ Published {routing_key}: {record.get('imei', 'unknown')}")
                return True
            else:
                self._publish_failures += 1
                logger.warning(f"✗ Publisher confirm failed for {routing_key}")
                return False
                
        except asyncio.TimeoutError:
            self._publish_failures += 1
            self._connected = False  # Mark for reconnect
            logger.error(f"✗ RabbitMQ publish timeout ({timeout}s) for {routing_key}")
            return False
        except (ConnectionError, OSError, aio_pika.exceptions.AMQPError) as e:
            self._publish_failures += 1
            self._connected = False
            logger.error(f"✗ RabbitMQ connection error during publish: {e}")
            return False
        except Exception as e:
            self._publish_failures += 1
            logger.error(f"✗ Failed to publish to RabbitMQ: {e}", exc_info=True)
            return False
    
    def get_stats(self) -> Dict[str, Any]:
        """Get producer statistics"""
        total = self._publish_successes + self._publish_failures
        success_rate = (self._publish_successes / total * 100) if total > 0 else 100.0
        
        return {
            "connected": self._connected,
            "publish_successes": self._publish_successes,
            "publish_failures": self._publish_failures,
            "success_rate": round(success_rate, 2),
            "reconnect_count": self._reconnect_count
        }


# Global producer instance
_producer_instance: Optional[RabbitMQProducer] = None


async def get_rabbitmq_producer() -> RabbitMQProducer:
    """Get or create global RabbitMQ producer instance."""
    global _producer_instance
    
    if _producer_instance is None:
        _producer_instance = RabbitMQProducer()
        await _producer_instance.connect(retry=True)
    
    return _producer_instance


async def close_rabbitmq_producer():
    """Close global RabbitMQ producer instance"""
    global _producer_instance
    
    if _producer_instance:
        await _producer_instance.disconnect()
        _producer_instance = None
