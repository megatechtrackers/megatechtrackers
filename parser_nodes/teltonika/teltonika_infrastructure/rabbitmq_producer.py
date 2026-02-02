"""
RabbitMQ Producer for Teltonika Gateway
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

from config import Config, ServerParams

logger = logging.getLogger(__name__)


class RabbitMQProducer:
    """
    RabbitMQ message producer with publisher confirms.
    Ensures messages are persisted before ACK is sent to device.
    """
    
    def __init__(self):
        """Initialize RabbitMQ producer"""
        self.connection: Optional[aio_pika.Connection] = None
        self.channel: Optional[aio_pika.Channel] = None
        self.exchange: Optional[aio_pika.Exchange] = None
        self._connected = False
        self._shutting_down = False  # Flag to prevent new connection attempts during shutdown
        self._publish_successes = 0
        self._publish_failures = 0
        self._connection_lock = asyncio.Lock()  # Lock to prevent concurrent connection attempts
        
    async def connect(self, retry: bool = True):
        """
        Connect to RabbitMQ and set up exchange.
        With retry=True, will retry indefinitely until connection succeeds.
        
        Args:
            retry: If True, retry connection indefinitely with exponential backoff
        """
        # Don't attempt connection if shutting down
        if self._shutting_down:
            raise asyncio.CancelledError("Shutdown in progress")
        
        async def _connect():
            # Check for shutdown before attempting connection
            try:
                import sys
                # Check both module names (__main__ when run directly, parser_nodes.teltonika.run when imported)
                for module_name in ['__main__', 'parser_nodes.teltonika.run']:
                    if module_name in sys.modules:
                        run_module = sys.modules[module_name]
                        if hasattr(run_module, '_shutdown_event') and run_module._shutdown_event.is_set():
                            raise asyncio.CancelledError("Shutdown requested")
            except (ImportError, AttributeError, KeyError):
                pass
            
            # Load RabbitMQ configuration
            rabbitmq_config = Config.load().get('rabbitmq', {})
            host = rabbitmq_config.get('host', 'localhost')
            port = rabbitmq_config.get('port', 5672)
            virtual_host = rabbitmq_config.get('virtual_host', '/')
            username = rabbitmq_config.get('username', 'guest')
            password = rabbitmq_config.get('password', 'guest')
            exchange_name = rabbitmq_config.get('exchange', 'tracking_data_exchange')
            
            # Connection URL
            url = f"amqp://{username}:{password}@{host}:{port}/{virtual_host}"
            
            logger.info(f"Connecting to RabbitMQ at {host}:{port}...")
            
            # Check for shutdown again before the actual connection call
            try:
                import sys
                # Check both module names (__main__ when run directly, parser_nodes.teltonika.run when imported)
                for module_name in ['__main__', 'parser_nodes.teltonika.run']:
                    if module_name in sys.modules:
                        run_module = sys.modules[module_name]
                        if hasattr(run_module, '_shutdown_event') and run_module._shutdown_event.is_set():
                            raise asyncio.CancelledError("Shutdown requested")
            except (ImportError, AttributeError, KeyError):
                pass
            
            # Create connection
            # Use connect_robust for startup (handles reconnections automatically)
            # Use regular connect for fast-fail during publish (no internal retries)
            if retry:
                self.connection = await aio_pika.connect_robust(url)
            else:
                # Fast-fail: regular connect without internal reconnection
                self.connection = await aio_pika.connect(url)
            
            # Create channel with publisher confirms enabled (CRITICAL for ACK guarantee)
            publisher_confirms = rabbitmq_config.get('publisher_confirms', True)
            self.channel = await self.connection.channel(publisher_confirms=publisher_confirms)
            
            # Declare exchange (topic, durable)
            self.exchange = await self.channel.declare_exchange(
                exchange_name,
                ExchangeType.TOPIC,
                durable=True
            )
            
            self._connected = True
            logger.info(f"✓ Connected to RabbitMQ, exchange: {exchange_name}")
        
        if retry:
            from .connection_retry import retry_connection
            await retry_connection(_connect, max_retries=-1, initial_delay=1.0, max_delay=30.0)
        else:
            await _connect()
    
    async def disconnect(self):
        """Disconnect from RabbitMQ and stop all reconnection attempts"""
        self._shutting_down = True  # Set flag to prevent new connection attempts
        async with self._connection_lock:
            try:
                # Close channel first
                if self.channel:
                    try:
                        await self.channel.close()
                    except Exception as e:
                        logger.debug(f"Error closing channel: {e}")
                    self.channel = None
                
                # Close connection (this stops the robust reconnection mechanism)
                if self.connection:
                    try:
                        # For robust connections, we need to close properly to stop reconnection
                        if hasattr(self.connection, 'close'):
                            await self.connection.close()
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
        Does NOT attempt reconnection - just returns current state.
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
    
    async def publish_tracking_record(
        self,
        record: Dict[str, Any],
        vendor: str = "teltonika",
        record_type: str = "trackdata",
        timeout: float = 5.0
    ) -> bool:
        """
        Publish tracking record to RabbitMQ with publisher confirms.
        CRITICAL: Returns False immediately if RabbitMQ is unavailable.
        This ensures device won't receive ACK if data couldn't be queued.
        
        Args:
            record: Tracking record dictionary
            vendor: Vendor name (teltonika, calamp, concox, etc.)
            record_type: Record type (trackdata, alarm, event)
            timeout: Timeout for publisher confirm (seconds)
            
        Returns:
            bool: True if message was confirmed by RabbitMQ, False otherwise
        """
        # FAST FAIL: If shutting down, immediately return False
        if self._shutting_down:
            logger.warning("RabbitMQ producer shutting down - publish rejected")
            return False
        
        # Check connection and reconnect if needed (with lock to prevent race conditions)
        async with self._connection_lock:
            # With connect_robust, connection might be reconnecting automatically
            # Check if we have a valid connection with exchange and channel
            needs_reconnect = False
            needs_recreate_channel = False
            
            if not self.connection:
                needs_reconnect = True
            elif self.connection.is_closed:
                # Connection is closed - need full reconnect
                needs_reconnect = True
            elif not self.channel or self.channel.is_closed:
                # Connection exists but channel is missing/closed - need to recreate channel
                needs_recreate_channel = True
            elif not self.exchange:
                # Connection and channel exist but exchange missing - need to recreate
                needs_recreate_channel = True
            elif not self._connected:
                # State flag says not connected - verify actual state
                if self.connection.is_closed or not self.channel or self.channel.is_closed:
                    needs_reconnect = True
                else:
                    # Connection is actually alive, just flag is wrong - fix it
                    self._connected = True
            
            if needs_reconnect:
                logger.warning("RabbitMQ not connected, attempting to reconnect...")
                try:
                    # Clean up old connection if it exists
                    if self.connection:
                        try:
                            if self.channel:
                                try:
                                    await self.channel.close()
                                except Exception:
                                    pass
                            if not self.connection.is_closed:
                                await self.connection.close()
                        except Exception:
                            pass  # Ignore cleanup errors
                        self.connection = None
                    self.channel = None
                    self.exchange = None
                    self._connected = False
                    
                    # CRITICAL: Use timeout for reconnection during publish
                    # If RabbitMQ is down, return False quickly instead of hanging indefinitely
                    # This ensures devices don't get ACK when data wasn't published
                    reconnect_timeout = ServerParams.get_float('rabbitmq.publish_reconnect_timeout', 10.0)
                    try:
                        await asyncio.wait_for(self.connect(retry=False), timeout=reconnect_timeout)
                    except asyncio.TimeoutError:
                        logger.error(f"RabbitMQ reconnection timed out after {reconnect_timeout}s - publish failed")
                        return False
                except Exception as e:
                    logger.error(f"Failed to reconnect to RabbitMQ: {e}")
                    return False
            elif needs_recreate_channel:
                logger.warning("RabbitMQ channel/exchange missing, recreating...")
                try:
                    # Check if connection is actually usable (not in reconnecting state)
                    if hasattr(self.connection, 'is_closed') and self.connection.is_closed:
                        # Connection is closed, need full reconnect
                        logger.warning("Connection closed, need full reconnect")
                        self._connected = False
                        # Try fast reconnect with timeout
                        reconnect_timeout = ServerParams.get_float('rabbitmq.publish_reconnect_timeout', 10.0)
                        try:
                            await asyncio.wait_for(self.connect(retry=False), timeout=reconnect_timeout)
                        except (asyncio.TimeoutError, Exception) as e:
                            logger.error(f"Fast reconnect failed: {e}")
                            return False
                    else:
                        # Connection exists, try to recreate channel with timeout
                        if self.channel and not self.channel.is_closed:
                            try:
                                await self.channel.close()
                            except Exception:
                                pass
                        
                        rabbitmq_config = Config.load().get('rabbitmq', {})
                        exchange_name = rabbitmq_config.get('exchange', 'tracking_data_exchange')
                        publisher_confirms = rabbitmq_config.get('publisher_confirms', True)
                        
                        # Use timeout for channel creation too
                        channel_timeout = ServerParams.get_float('rabbitmq.channel_create_timeout', 5.0)
                        self.channel = await asyncio.wait_for(
                            self.connection.channel(publisher_confirms=publisher_confirms),
                            timeout=channel_timeout
                        )
                        self.exchange = await asyncio.wait_for(
                            self.channel.declare_exchange(exchange_name, ExchangeType.TOPIC, durable=True),
                            timeout=channel_timeout
                        )
                        self._connected = True
                        logger.info(f"✓ Recreated RabbitMQ channel and exchange: {exchange_name}")
                except asyncio.TimeoutError:
                    logger.error("Timeout recreating channel/exchange - RabbitMQ unavailable")
                    self._connected = False
                    return False
                except Exception as e:
                    logger.error(f"Failed to recreate channel/exchange: {e}")
                    self._connected = False
                    return False
        
        # Final check before publish - if connection dropped during lock acquisition
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
            
            # Publish with persistent delivery mode and priority
            message = aio_pika.Message(
                message_body,
                delivery_mode=DeliveryMode.PERSISTENT,
                priority=priority,
                timestamp=datetime.now(timezone.utc)
            )
            
            # Publish and wait for confirmation with timeout
            # This timeout ensures we don't hang if RabbitMQ becomes unavailable during publish
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
            self._connected = False  # Mark as disconnected so next publish triggers reconnect
            logger.error(f"✗ RabbitMQ publish timeout ({timeout}s) for {routing_key} - connection may be down")
            return False
        except (ConnectionError, OSError, aio_pika.exceptions.AMQPError) as e:
            self._publish_failures += 1
            self._connected = False  # Mark as disconnected
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
            "success_rate": round(success_rate, 2)
        }


# Global producer instance
_producer_instance: Optional[RabbitMQProducer] = None


async def get_rabbitmq_producer() -> RabbitMQProducer:
    """
    Get or create global RabbitMQ producer instance.
    Will retry connection indefinitely until successful.
    """
    global _producer_instance
    
    if _producer_instance is None:
        _producer_instance = RabbitMQProducer()
        await _producer_instance.connect(retry=True)  # Retry indefinitely
    
    return _producer_instance


async def close_rabbitmq_producer():
    """Close global RabbitMQ producer instance"""
    global _producer_instance
    
    if _producer_instance:
        await _producer_instance.disconnect()
        _producer_instance = None
