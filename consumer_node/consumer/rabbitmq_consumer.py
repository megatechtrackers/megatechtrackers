"""
RabbitMQ Consumer for Megatechtrackers Fleet Tracking
Consumes messages from RabbitMQ queues and saves to database/CSV
"""
import asyncio
import logging
import json
from typing import Dict, Any, Optional, Callable, List
from collections import deque, defaultdict
import aio_pika
from aio_pika import IncomingMessage, ExchangeType

from config import Config, ServerParams
from .message_deduplicator import get_deduplicator, increment_retry_count, clear_retry_count

logger = logging.getLogger(__name__)


class BatchAccumulator:
    """
    Accumulates messages and processes them in batches for better performance.
    """
    
    def __init__(
        self,
        batch_size: int = 200,  
        batch_timeout: float = 2.0,
        use_orm: bool = True,
        queue_name: Optional[str] = None,
    ):
        """
        Initialize batch accumulator.

        Args:
            batch_size: Number of records to accumulate before processing
            batch_timeout: Maximum time (seconds) to wait before flushing batch
            use_orm: Whether to use ORM method (with fallback to raw SQL)
            queue_name: Queue name for Prometheus metrics (e.g. trackdata_queue)
        """
        self.batch_size = batch_size
        self.batch_timeout = batch_timeout
        self.use_orm = use_orm
        self.queue_name = queue_name
        self.buffer: deque = deque()
        self.last_flush_time = asyncio.get_event_loop().time()
        self._flush_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()
        self._stats = {
            'total_processed': 0,
            'total_failed': 0,
            'batches_processed': 0,
            'orm_count': 0,
            'raw_sql_count': 0
        }
    
    async def add(self, record: Dict[str, Any], model_class):
        """
        Add a record to the batch. Flushes automatically when batch is full.
        
        Args:
            record: Record dictionary to add
            model_class: Model class to use for batch processing
        """
        async with self._lock:
            self.buffer.append(record)
            
            # Start timeout task if not already running
            if self._flush_task is None or self._flush_task.done():
                self._flush_task = asyncio.create_task(self._timeout_flush(model_class))
            
            # Flush if batch is full
            if len(self.buffer) >= self.batch_size:
                await self._flush(model_class)
    
    async def _timeout_flush(self, model_class):
        """Flush batch after timeout"""
        try:
            await asyncio.sleep(self.batch_timeout)
            async with self._lock:
                if len(self.buffer) > 0:
                    await self._flush(model_class)
        except asyncio.CancelledError:
            pass
    
    async def _flush(self, model_class):
        """Flush current batch to database"""
        if len(self.buffer) == 0:
            return
        
        # Extract batch and clear buffer
        batch = list(self.buffer)
        self.buffer.clear()
        
        # Cancel timeout task
        if self._flush_task and not self._flush_task.done():
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
        self._flush_task = None
        
        # Process batch
        try:
            stats = await model_class.create_from_records_batch(
                batch,
                batch_size=self.batch_size
            )
            
            # Update LastStatus for all records in batch
            # This ensures laststatus table is updated even with batch processing
            try:
                from consumer.models import LastStatus
                from datetime import datetime, timezone
                from dateutil import parser

                def _ensure_utc(dt):
                    if dt.tzinfo is None:
                        return dt.replace(tzinfo=timezone.utc)
                    return dt.astimezone(timezone.utc)

                # Update LastStatus for each record in the batch
                for record in batch:
                    try:
                        imei_str = record.get('imei', 'UNKNOWN')
                        if imei_str == 'UNKNOWN':
                            continue
                        
                        imei_int = int(imei_str)
                        
                        # Parse timestamps (ensure UTC for consistency)
                        gps_time_str = record.get('gps_time', '')
                        if isinstance(gps_time_str, str):
                            try:
                                gps_time = _ensure_utc(parser.parse(gps_time_str))
                            except (ValueError, TypeError, AttributeError):
                                gps_time = datetime.now(timezone.utc)
                        elif isinstance(gps_time_str, datetime):
                            gps_time = _ensure_utc(gps_time_str)
                        else:
                            gps_time = datetime.now(timezone.utc)
                        
                        server_time_str = record.get('server_time', '')
                        if isinstance(server_time_str, str):
                            try:
                                server_time = _ensure_utc(parser.parse(server_time_str))
                            except (ValueError, TypeError, AttributeError):
                                server_time = datetime.now(timezone.utc)
                        elif isinstance(server_time_str, datetime):
                            server_time = _ensure_utc(server_time_str)
                        else:
                            server_time = datetime.now(timezone.utc)
                        
                        # Update LastStatus
                        await LastStatus.upsert(
                            imei=imei_int,
                            gps_time=gps_time,
                            server_time=server_time,
                            latitude=record.get('latitude', 0.0),
                            longitude=record.get('longitude', 0.0),
                            altitude=record.get('altitude', 0),
                            angle=record.get('angle', 0),
                            satellites=record.get('satellites', 0),
                            speed=record.get('speed', 0),
                            reference_id=record.get('reference_id'),
                            distance=record.get('distance'),
                            vendor=record.get('vendor', 'teltonika')
                        )
                    except Exception as e:
                        logger.debug(f"Error updating LastStatus for record: {e}")
                        # Don't fail the batch if LastStatus update fails
                        continue
            except Exception as e:
                logger.warning(f"Error updating LastStatus for batch: {e}", exc_info=True)
                # Don't fail the batch if LastStatus update fails
            
            # Update statistics
            self._stats['total_processed'] += stats['success']
            self._stats['total_failed'] += stats['failed']
            self._stats['batches_processed'] += 1

            if self.queue_name:
                try:
                    from metrics import record_processed
                    record_processed(self.queue_name, stats['success'], stats['failed'])
                except Exception:
                    pass

            logger.info(
                f"Batch processed: {stats['success']} success, {stats['failed']} failed"
            )
        except Exception as e:
            logger.error(f"Error processing batch: {e}", exc_info=True)
            self._stats['total_failed'] += len(batch)
            if self.queue_name:
                try:
                    from metrics import record_processed
                    record_processed(self.queue_name, 0, len(batch))
                except Exception:
                    pass
    
    async def flush(self, model_class):
        """Manually flush any remaining records"""
        async with self._lock:
            if len(self.buffer) > 0:
                logger.info(f"Flushing {len(self.buffer)} remaining records in batch...")
                await self._flush(model_class)
    
    async def flush_all(self, model_classes: Dict[str, Any]):
        """
        Flush all batches for multiple model classes.
        Used during graceful shutdown.
        
        Args:
            model_classes: Dict mapping queue/model names to model classes
        """
        async with self._lock:
            for name, model_class in model_classes.items():
                if len(self.buffer) > 0:
                    logger.info(f"Flushing {len(self.buffer)} remaining {name} records...")
                    await self._flush(model_class)
    
    def get_stats(self) -> Dict[str, int]:
        """Get processing statistics"""
        return self._stats.copy()


class RabbitMQConsumer:
    """
    RabbitMQ message consumer.
    Processes messages from queues and delegates to handler functions.
    """
    
    def __init__(self, queue_name: str, handler: Callable[[Dict[str, Any]], None], max_retries: int = 3):
        """
        Initialize RabbitMQ consumer
        
        Args:
            queue_name: Name of the queue to consume from
            handler: Async function to handle messages (Dict[str, Any]) -> None
            max_retries: Maximum number of retry attempts before sending to DLQ
        """
        self.queue_name = queue_name
        self.handler = handler
        self.max_retries = max_retries
        self.connection: Optional[aio_pika.Connection] = None
        self.channel: Optional[aio_pika.Channel] = None
        self.queue: Optional[aio_pika.Queue] = None
        self._consuming = False
        self._processed = 0
        self._errors = 0
        # Note: Retry counts are now persisted to database (message_retry_counts table)
        # This survives restarts and prevents infinite retry loops
    
    async def connect(self, retry: bool = True):
        """
        Connect to RabbitMQ and set up queue with proper configuration.
        With retry=True, will retry indefinitely until connection succeeds.
        
        Args:
            retry: If True, retry connection indefinitely with exponential backoff
        """
        async def _connect():
            # Check for shutdown before attempting connection
            try:
                import sys
                for module_name in ['__main__', 'consumer_node.run']:
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
                for module_name in ['__main__', 'consumer_node.run']:
                    if module_name in sys.modules:
                        run_module = sys.modules[module_name]
                        if hasattr(run_module, '_shutdown_event') and run_module._shutdown_event.is_set():
                            raise asyncio.CancelledError("Shutdown requested")
            except (ImportError, AttributeError, KeyError):
                pass
            
            # Create connection (connect_robust handles reconnections automatically)
            self.connection = await aio_pika.connect_robust(url)
            
            # Create channel
            self.channel = await self.connection.channel()
            
            # Set prefetch count
            prefetch = Config.load().get('consumer', {}).get('prefetch_count', 100)
            await self.channel.set_qos(prefetch_count=prefetch)
            
            # Declare exchange (topic, durable)
            exchange = await self.channel.declare_exchange(
                exchange_name,
                ExchangeType.TOPIC,
                durable=True
            )
            
            # Queue arguments based on queue type (per plan requirements)
            queue_arguments = {}
            if self.queue_name == "trackdata_queue":
                queue_arguments = {
                    "x-message-ttl": 3600000,  # 1 hour
                    "x-max-length": 1000000,   # Max 1M messages
                    "x-dead-letter-exchange": "dlx_tracking_data",
                    "x-dead-letter-routing-key": "dlq_tracking_data",
                    "x-queue-mode": "lazy"  # Store messages on disk immediately
                }
            elif self.queue_name == "alarms_queue":
                queue_arguments = {
                    "x-max-priority": 10,  # Enable priority (0-10, 10 = highest)
                    "x-message-ttl": 86400000,  # 24 hours
                    "x-max-length": 100000,
                    "x-dead-letter-exchange": "dlx_tracking_data",
                    "x-dead-letter-routing-key": "dlq_alarms",
                    "x-queue-mode": "lazy"  # Store messages on disk immediately
                }
            elif self.queue_name == "events_queue":
                queue_arguments = {
                    "x-message-ttl": 86400000,  # 24 hours
                    "x-max-length": 500000,
                    "x-dead-letter-exchange": "dlx_tracking_data",
                    "x-dead-letter-routing-key": "dlq_events",
                    "x-queue-mode": "lazy"  # Store messages on disk immediately
                }
            
            # Declare queue with proper arguments (durable + lazy mode)
            self.queue = await self.channel.declare_queue(
                self.queue_name,
                durable=True,
                arguments=queue_arguments
            )
            
            # Bind queue to exchange with routing key pattern
            routing_key_pattern = self._get_routing_key_pattern()
            await self.queue.bind(exchange, routing_key=routing_key_pattern)
            
            logger.info(f"✓ Connected to RabbitMQ, queue: {self.queue_name}, bound to {routing_key_pattern}")
        
        if retry:
            from .retry_handler import retry_with_backoff
            await retry_with_backoff(
                _connect,
                max_retries=-1,  # Infinite retries
                initial_delay=1.0,
                max_delay=30.0
            )
        else:
            await _connect()
    
    def _get_routing_key_pattern(self) -> str:
        """Get routing key pattern for queue binding"""
        if self.queue_name == "trackdata_queue":
            return "tracking.*.trackdata"
        elif self.queue_name == "alarms_queue":
            return "tracking.*.alarm"
        elif self.queue_name == "events_queue":
            return "tracking.*.event"
        else:
            return "#"  # Default: bind to all messages
    
    async def flush_batches(self):
        """Flush any pending batches in handlers (for graceful shutdown)"""
        try:
            # Check if handler has a flush method (for batch accumulators)
            if hasattr(self.handler, '_flush'):
                logger.info(f"[{self.queue_name}] Flushing pending batches...")
                await self.handler._flush()
                logger.info(f"[{self.queue_name}] Batches flushed")
        except Exception as e:
            logger.warning(f"[{self.queue_name}] Error flushing batches: {e}", exc_info=True)
    
    async def disconnect(self):
        """Disconnect from RabbitMQ and stop all reconnection attempts"""
        self._consuming = False  # Stop consuming loop
        
        # Flush any pending batches before disconnecting
        await self.flush_batches()
        try:
            # Close queue first
            if self.queue:
                try:
                    await self.queue.close()
                except Exception as e:
                    logger.debug(f"[{self.queue_name}] Error closing queue: {e}")
                self.queue = None
            
            # Close channel
            if self.channel:
                try:
                    await self.channel.close()
                except Exception as e:
                    logger.debug(f"[{self.queue_name}] Error closing channel: {e}")
                self.channel = None
            
            # Close connection (this stops the robust reconnection mechanism)
            if self.connection:
                try:
                    # For robust connections, we need to close properly to stop reconnection
                    if hasattr(self.connection, 'close'):
                        await self.connection.close()
                except Exception as e:
                    logger.debug(f"[{self.queue_name}] Error closing connection: {e}")
                self.connection = None
            
            logger.debug(f"[{self.queue_name}] Disconnected from RabbitMQ")
        except Exception as e:
            logger.debug(f"[{self.queue_name}] Error disconnecting from RabbitMQ: {e}")
    
    async def _process_message(self, message: aio_pika.IncomingMessage):
        """Process a single message - callback for queue.consume()"""
        # Extract message ID for deduplication
        # Try RabbitMQ message_id first, then message body's message_id
        message_id = message.message_id
        record = None
        
        # Parse message body once to get message_id and record
        try:
            body = message.body.decode('utf-8')
            record = json.loads(body)
            # Use message_id from body if RabbitMQ message_id is not set
            if not message_id and isinstance(record, dict):
                message_id = record.get('message_id')
        except Exception as e:
            logger.warning(f"[{self.queue_name}] Failed to parse message body for deduplication: {e}")
        
        # Generate fallback message ID if still None (hash of message body)
        if not message_id:
            import hashlib
            message_id = hashlib.md5(message.body).hexdigest()
        
        logger.info(f"[{self.queue_name}] ✓✓✓ MESSAGE RECEIVED! Message ID: {message_id}, Routing Key: {message.routing_key}")
        
        # Check for duplicate message (read-only check, don't mark as processed yet)
        deduplicator = get_deduplicator()
        is_duplicate = await deduplicator.check_duplicate(message_id)
        
        if is_duplicate:
            logger.warning(f"[{self.queue_name}] ⚠ DUPLICATE MESSAGE DETECTED - Skipping: {message_id}")
            # Acknowledge duplicate message (don't reprocess, but acknowledge to remove from queue)
            await message.ack()
            return
        
        # Process message manually (not using message.process()) to control ack/nack behavior
        try:
            logger.info(f"[{self.queue_name}] Processing message...")
            
            # Use already parsed record if available, otherwise parse again
            if record is None:
                body = message.body.decode('utf-8')
                logger.info(f"[{self.queue_name}] Message body decoded, length: {len(body)} bytes")
                record = json.loads(body)
            
            logger.info(f"[{self.queue_name}] Message parsed to JSON, calling handler...")
            
            # Handle message (this writes to database)
            await self.handler(record)
            
            # CRITICAL: Only mark as processed AFTER successful database write
            # This ensures that if handler fails, message can be redelivered
            await deduplicator.mark_processed(message_id)
            
            # Clear retry count from database on success (non-blocking)
            try:
                await clear_retry_count(message_id)
            except Exception:
                pass  # Non-critical, don't fail the message
            
            # CRITICAL: Acknowledge message to RabbitMQ ONLY after DB write succeeded
            # This ensures message won't be lost - if we crash before ACK, RabbitMQ will redeliver
            await message.ack()
            
            self._processed += 1
            logger.info(f"[{self.queue_name}] ✓ QUEUE ACK sent - message {self._processed} saved to DB and acknowledged")
            
            # Log deduplication stats periodically
            if self._processed % 1000 == 0:
                stats = deduplicator.get_stats()
                logger.info(
                    f"[{self.queue_name}] Deduplication stats: "
                    f"cache_size={stats['cache_size']}, "
                    f"duplicates_prevented={stats['duplicates_prevented']}, "
                    f"hit_rate={stats['hit_rate']}%"
                )
            
            if self._processed % 100 == 0:
                logger.info(f"[{self.queue_name}] Milestone: Processed {self._processed} messages")
            elif self._processed % 10 == 0:
                logger.info(f"[{self.queue_name}] Processed {self._processed} messages")
                
        except Exception as e:
            self._errors += 1
            
            # Track retry count in DATABASE (survives restarts)
            # This prevents infinite retry loops if consumer keeps restarting
            error_message = str(e)[:500] if e else None
            retry_count = await increment_retry_count(message_id, self.queue_name, error_message)
            
            if retry_count >= self.max_retries:
                # Max retries exceeded - reject without requeue (sends to DLQ)
                logger.error(
                    f"[{self.queue_name}] ✗✗✗ ERROR processing message after {retry_count} retries - sending to DLQ. "
                    f"Message ID: {message_id}, Error: {e}",
                    exc_info=True
                )
                # Clear retry count (message going to DLQ, no longer needed)
                try:
                    await clear_retry_count(message_id)
                except Exception:
                    pass
                # Reject without requeue - this sends message to DLQ
                try:
                    await message.nack(requeue=False)
                    logger.info(f"[{self.queue_name}] Message sent to DLQ: {message_id}")
                except Exception as nack_error:
                    logger.error(f"[{self.queue_name}] Error sending message to DLQ: {nack_error}")
            else:
                # Still have retries left - reject with requeue
                logger.warning(
                    f"[{self.queue_name}] ✗ ERROR processing message (retry {retry_count}/{self.max_retries}): {e}. "
                    f"Message ID: {message_id}, Redelivered: {message.redelivered}"
                )
                # Reject with requeue for retry
                try:
                    await message.nack(requeue=True)
                except Exception as nack_error:
                    logger.error(f"[{self.queue_name}] Error requeuing message: {nack_error}")
    
    async def start_consuming(self):
        """
        Start consuming messages from queue.
        Will automatically retry connection if RabbitMQ is unavailable.
        """
        logger.info(f"[{self.queue_name}] start_consuming() called")
        
        self._consuming = True
        
        # Retry loop for connection and consumption
        while self._consuming:
            # Check for shutdown before attempting connection
            try:
                import sys
                for module_name in ['__main__', 'consumer_node.run']:
                    if module_name in sys.modules:
                        run_module = sys.modules[module_name]
                        if hasattr(run_module, '_shutdown_event') and run_module._shutdown_event.is_set():
                            logger.info(f"[{self.queue_name}] Shutdown detected, stopping consumer")
                            self._consuming = False
                            break
            except (ImportError, AttributeError, KeyError):
                pass
            
            if not self._consuming:
                break
            
            try:
                # Ensure connection is ready (retry if needed)
                # With connect_robust, connection might reconnect automatically, but channel/queue become invalid
                needs_reconnect = False
                needs_recreate_channel = False
                
                if not self.connection:
                    needs_reconnect = True
                elif self.connection.is_closed:
                    needs_reconnect = True
                elif not self.channel or self.channel.is_closed:
                    # Connection exists but channel is missing/closed - need to recreate
                    needs_recreate_channel = True
                elif not self.queue:
                    # Connection and channel exist but queue missing - need to recreate
                    needs_recreate_channel = True
                
                if needs_reconnect:
                    logger.warning(f"[{self.queue_name}] Connection not ready, attempting to connect...")
                    await self.connect(retry=True)  # Retry indefinitely
                elif needs_recreate_channel:
                    logger.warning(f"[{self.queue_name}] Channel/queue invalid after reconnection, recreating...")
                    # Recreate channel and queue (connection is still valid)
                    try:
                        if self.channel and not self.channel.is_closed:
                            try:
                                await self.channel.close()
                            except Exception:
                                pass
                        
                        # Recreate channel
                        self.channel = await self.connection.channel()
                        prefetch = Config.load().get('consumer', {}).get('prefetch_count', 100)
                        await self.channel.set_qos(prefetch_count=prefetch)
                        
                        # Recreate exchange
                        rabbitmq_config = Config.load().get('rabbitmq', {})
                        exchange_name = rabbitmq_config.get('exchange', 'tracking_data_exchange')
                        exchange = await self.channel.declare_exchange(
                            exchange_name,
                            ExchangeType.TOPIC,
                            durable=True
                        )
                        
                        # Recreate queue
                        queue_arguments = {}
                        if self.queue_name == "trackdata_queue":
                            queue_arguments = {
                                "x-message-ttl": 3600000,
                                "x-max-length": 1000000,
                                "x-dead-letter-exchange": "dlx_tracking_data",
                                "x-dead-letter-routing-key": "dlq_tracking_data",
                                "x-queue-mode": "lazy"
                            }
                        elif self.queue_name == "alarms_queue":
                            queue_arguments = {
                                "x-max-priority": 10,
                                "x-message-ttl": 86400000,
                                "x-max-length": 100000,
                                "x-dead-letter-exchange": "dlx_tracking_data",
                                "x-dead-letter-routing-key": "dlq_alarms",
                                "x-queue-mode": "lazy"
                            }
                        elif self.queue_name == "events_queue":
                            queue_arguments = {
                                "x-message-ttl": 86400000,
                                "x-max-length": 500000,
                                "x-dead-letter-exchange": "dlx_tracking_data",
                                "x-dead-letter-routing-key": "dlq_events",
                                "x-queue-mode": "lazy"
                            }
                        
                        self.queue = await self.channel.declare_queue(
                            self.queue_name,
                            durable=True,
                            arguments=queue_arguments
                        )
                        
                        # Rebind queue
                        routing_key_pattern = self._get_routing_key_pattern()
                        await self.queue.bind(exchange, routing_key=routing_key_pattern)
                        
                        logger.info(f"[{self.queue_name}] ✓ Recreated channel and queue, bound to {routing_key_pattern}")
                    except Exception as recreate_err:
                        logger.error(f"[{self.queue_name}] Failed to recreate channel/queue: {recreate_err}")
                        # Fall back to full reconnect
                        await self.connect(retry=True)
                
                logger.info(f"[{self.queue_name}] Queue exists: {self.queue}, type: {type(self.queue)}")
                logger.info(f"[{self.queue_name}] About to call queue.consume()...")
                logger.info(f"[{self.queue_name}] Connection state: {self.connection.is_closed if self.connection else 'None'}")
                logger.info(f"[{self.queue_name}] Channel state: {self.channel.is_closed if self.channel else 'None'}")
                
                # Use consume() method which properly registers as a consumer
                # no_ack=False means we manually ack/nack messages (required for DLQ)
                consumer_tag = await self.queue.consume(self._process_message, no_ack=False)
                logger.info(f"[{self.queue_name}] ✓ Consumer registered! Tag: {consumer_tag}")
                logger.info(f"[{self.queue_name}] Waiting for messages...")
                logger.info(f"[{self.queue_name}] Connection still open: {not self.connection.is_closed if self.connection else 'N/A'}")
                logger.info(f"[{self.queue_name}] Channel still open: {not self.channel.is_closed if self.channel else 'N/A'}")
                
                # Keep the consumer alive - wait indefinitely until _consuming becomes False
                # Use a Future that we can cancel when needed
                future = asyncio.Future()
                
                # Set up a task to check _consuming periodically and cancel future when needed
                async def check_consuming():
                    while self._consuming:
                        await asyncio.sleep(1)
                        # Also check if connection is still alive
                        if self.connection and self.connection.is_closed:
                            logger.warning(f"[{self.queue_name}] Connection closed during consumption, will reconnect...")
                            if not future.done():
                                future.set_exception(ConnectionError("Connection closed during consumption"))
                            break
                        # Also check channel
                        if self.channel and self.channel.is_closed:
                            logger.warning(f"[{self.queue_name}] Channel closed during consumption, will reconnect...")
                            if not future.done():
                                future.set_exception(ConnectionError("Channel closed during consumption"))
                            break
                    # Only set result if future not already done (by exception)
                    if not future.done() and not self._consuming:
                        future.set_result(None)
                
                check_task = asyncio.create_task(check_consuming())
                
                try:
                    # Wait until _consuming is False or connection drops
                    # This will block here indefinitely while consumer is active
                    await future
                except (ConnectionError, OSError) as conn_err:
                    logger.warning(f"[{self.queue_name}] Connection lost during consumption: {conn_err}. Will reconnect...")
                    # Don't break - will retry in outer loop
                except asyncio.CancelledError:
                    logger.info(f"[{self.queue_name}] Consumption cancelled")
                finally:
                    check_task.cancel()
                    # Cancel consumption when _consuming becomes False
                    if not self._consuming:
                        logger.info(f"[{self.queue_name}] Stopping consumption, cancelling consumer...")
                        try:
                            await self.queue.cancel(consumer_tag)
                            logger.info(f"[{self.queue_name}] Consumer cancelled")
                        except Exception as cancel_err:
                            logger.error(f"[{self.queue_name}] Error cancelling consumer: {cancel_err}")
                
                # Check why we exited the future wait
                if not self._consuming:
                    # Normal shutdown - exit loop
                    logger.info(f"[{self.queue_name}] Shutdown requested, exiting consume loop")
                    break
                # Otherwise, connection dropped - continue loop to reconnect
                # The exception handler above will have logged the connection error
                
            except (ConnectionError, OSError) as e:
                # Try to import aio_pika exceptions if available
                try:
                    import aio_pika
                    if isinstance(e, (aio_pika.exceptions.AMQPConnectionError, aio_pika.exceptions.AMQPChannelError)):
                        pass  # Already caught
                except (ImportError, AttributeError):
                    pass
                
                logger.warning(f"[{self.queue_name}] Connection error during consumption: {e}. Retrying in 5s...")
                await asyncio.sleep(5)
                # Will retry connection in next loop iteration
            except Exception as e:
                logger.error(f"[{self.queue_name}] Error in consumption: {e}", exc_info=True)
                await asyncio.sleep(5)  # Wait before retry
                # Continue loop to retry
        
        logger.info(f"[{self.queue_name}] Exiting start_consuming()")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get consumer statistics"""
        return {
            "queue_name": self.queue_name,
            "consuming": self._consuming,
            "processed": self._processed,
            "errors": self._errors
        }


async def create_database_consumer(workers: int = 5) -> list[RabbitMQConsumer]:
    """
    Create database consumers for trackdata, alarms, and events queues
    
    Args:
        workers: Number of worker consumers to create
        
    Returns:
        List of consumer instances
    """
    from consumer.models import TrackData, Alarm, Event
    
    # Get batch configuration from config
    config = Config.load()
    consumer_config = config.get('consumer', {})
    batch_size = int(consumer_config.get('batch_size', 200))  
    batch_timeout = float(consumer_config.get('batch_timeout', 2.0))
    
    # Create shared batch accumulator for trackdata (SQLAlchemy handles composite keys natively)
    trackdata_batch = BatchAccumulator(
        batch_size=batch_size,
        batch_timeout=batch_timeout,
        queue_name="trackdata_queue",
    )
    
    async def handle_trackdata(message: Dict[str, Any]):
        """Handle trackdata record - extract data from standardized message format"""
        try:
            # Extract actual record data from message (standardized format)
            record = message.get('data', message)  # Fallback to message itself for backward compatibility
            imei = message.get('imei') or record.get('imei')
            
            # Add to batch accumulator (will flush automatically when batch is full or timeout)
            await trackdata_batch.add(record, TrackData)
            
            logger.debug(f"Added trackdata to batch: {imei} at {record.get('gps_time')}")
        except Exception as e:
            logger.error(f"Error adding trackdata to batch: {e}", exc_info=True)
            raise
    
    # Store batch accumulator and flush function for later use
    handle_trackdata._batch = trackdata_batch
    handle_trackdata._model_class = TrackData
    
    async def flush_trackdata_batch():
        """Flush any remaining trackdata records"""
        await trackdata_batch.flush(TrackData)
        stats = trackdata_batch.get_stats()
        logger.info(f"TrackData batch processing stats: {stats}")
    
    handle_trackdata._flush = flush_trackdata_batch
    
    async def handle_alarm(message: Dict[str, Any]):
        """Handle alarm record - extract data from standardized message format"""
        try:
            # Extract actual record data from message (standardized format)
            record = message.get('data', message)  # Fallback to message itself for backward compatibility
            imei = message.get('imei') or record.get('imei')
            
            # Create Alarm from record (this already saves to database)
            alarm = await Alarm.create_from_record(record)
            if alarm:
                logger.debug(f"Saved alarm: {imei} at {record.get('gps_time')}")
        except Exception as e:
            logger.error(f"Error saving alarm: {e}", exc_info=True)
            raise
    
    async def handle_event(message: Dict[str, Any]):
        """Handle event record - extract data from standardized message format"""
        try:
            # Extract actual record data from message (standardized format)
            record = message.get('data', message)  # Fallback to message itself for backward compatibility
            imei = message.get('imei') or record.get('imei')
            
            # Create Event from record (this already saves to database)
            event = await Event.create_from_record(record)
            if event:
                logger.debug(f"Saved event: {imei} at {record.get('gps_time')}")
                try:
                    from metrics import record_processed
                    record_processed("events_queue", 1, 0)
                except Exception:
                    pass
        except Exception as e:
            logger.error(f"Error saving event: {e}", exc_info=True)
            try:
                from metrics import record_processed
                record_processed("events_queue", 0, 1)
            except Exception:
                pass
            raise
    
    consumers = []
    
    # Create consumers for trackdata and events queues only
    # Note: alarms_queue is handled by consumer-service-alarm which also publishes to alarm_notifications
    for _ in range(workers):
        consumers.append(RabbitMQConsumer("trackdata_queue", handle_trackdata))
        consumers.append(RabbitMQConsumer("events_queue", handle_event))
    
    return consumers


async def create_alarm_consumer(workers: int = 3) -> list[RabbitMQConsumer]:
    """
    Create alarm-only consumers for high-priority alarm processing
    
    Args:
        workers: Number of worker consumers to create (typically fewer for high-priority)
        
    Returns:
        List of consumer instances (only alarms_queue)
    """
    from consumer.models import Alarm
    
    async def handle_alarm(message: Dict[str, Any]):
        """Handle alarm record - extract data from standardized message format"""
        try:
            # Extract actual record data from message (standardized format)
            record = message.get('data', message)  # Fallback to message itself for backward compatibility
            imei = message.get('imei') or record.get('imei')
            
            # Create Alarm from record (this saves to DB AND publishes to alarm_notifications)
            # Note: Alarm.create_from_record already calls notify_alarm_saved internally
            alarm = await Alarm.create_from_record(record)
            if alarm:
                logger.info(f"Saved alarm: {imei} at {record.get('gps_time')} - Status: {record.get('status', 'Unknown')}")
                try:
                    from metrics import record_processed
                    record_processed("alarms_queue", 1, 0)
                except Exception:
                    pass
        except Exception as e:
            logger.error(f"Error saving alarm: {e}", exc_info=True)
            try:
                from metrics import record_processed
                record_processed("alarms_queue", 0, 1)
            except Exception:
                pass
            raise

    consumers = []

    # Create consumers only for alarms_queue (high priority)
    for _ in range(workers):
        consumers.append(RabbitMQConsumer("alarms_queue", handle_alarm))
    
    return consumers
