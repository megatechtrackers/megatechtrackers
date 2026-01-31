"""
Consumer Entry Point
Runs a RabbitMQ consumer that processes messages and saves to database/CSV
"""
import asyncio
import logging
import signal
import sys
import os
from typing import List

from config import Config
from consumer.rabbitmq_consumer import RabbitMQConsumer, create_database_consumer, create_alarm_consumer
from consumer.orm_init import init_orm
from consumer.message_deduplicator import get_deduplicator
from logging_config import setup_logging_from_config
from metrics import start_metrics_server

# Configure logging from config.json
setup_logging_from_config()

logger = logging.getLogger(__name__)

# Start Prometheus /metrics server (health + throughput)
METRICS_PORT = int(os.environ.get("CONSUMER_METRICS_PORT", "9090"))
start_metrics_server(METRICS_PORT)

# Global consumers
_consumers: List[RabbitMQConsumer] = []
_shutdown_event = asyncio.Event()


async def main():
    """Main entry point for consumer"""
    global _consumers
    
    try:
        # Load configuration
        config = Config.load()
        consumer_config = config.get('consumer', {})
        # Allow override from environment variable
        consumer_type = os.environ.get('CONSUMER_TYPE') or consumer_config.get('type', 'database')
        workers = int(os.environ.get('WORKERS') or consumer_config.get('workers', 5))
        
        logger.info(f"Starting Consumer: {consumer_type}")
        logger.info(f"Workers: {workers}")
        
        # Initialize database ORM (with retry - will keep trying until connected)
        logger.info("Initializing database connection (will retry if unavailable)...")
        try:
            await init_orm(retry=True)  # Retry indefinitely
            logger.info("✓ Database connection initialized")
        except asyncio.CancelledError:
            logger.info("Database initialization cancelled due to shutdown")
            raise  # Re-raise to exit main() gracefully
        except Exception as e:
            logger.warning(f"Database not available at startup: {e}. Consumer will continue running and retry connection.")
            # Continue anyway - connections will retry when needed
        
        # Start deduplication cleanup task
        try:
            deduplicator = get_deduplicator()
            await deduplicator.start_cleanup_task(interval_seconds=300)  # Cleanup every 5 minutes
            logger.info("✓ Message deduplication cleanup task started")
        except Exception as e:
            logger.warning(f"Could not start deduplication cleanup task: {e}")
        
        if consumer_type == 'database':
            # Create database consumers (all queues: trackdata, alarms, events)
            _consumers = await create_database_consumer(workers=workers)
            
            # Connect all consumers (with retry - will keep trying until connected)
            logger.info(f"Connecting {len(_consumers)} database consumers (will retry if RabbitMQ unavailable)...")
            for consumer in _consumers:
                try:
                    await consumer.connect(retry=True)  # Retry indefinitely
                    logger.info(f"✓ Connected consumer for {consumer.queue_name}")
                except asyncio.CancelledError:
                    logger.info("Consumer connection cancelled due to shutdown")
                    raise  # Re-raise to exit main() gracefully
                except Exception as e:
                    logger.warning(f"Failed to connect consumer for {consumer.queue_name}: {e}. Will retry in background.")
                    # Continue - connection will retry when start_consuming is called
            
            logger.info(f"✓ Connected {len(_consumers)} database consumers")
            
            # Start consuming (run all consumers concurrently)
            # Use return_exceptions=True to prevent one consumer crash from killing all consumers
            results = await asyncio.gather(*[consumer.start_consuming() for consumer in _consumers], return_exceptions=True)
            
            # Log any exceptions from consumers
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    logger.error(f"Consumer {i} ({_consumers[i].queue_name}) crashed: {result}", exc_info=result if isinstance(result, BaseException) else None)
        
        elif consumer_type == 'alarm':
            # Create alarm-only consumers (high priority, only alarms_queue)
            _consumers = await create_alarm_consumer(workers=workers)
            
            # Connect all consumers (with retry - will keep trying until connected)
            logger.info(f"Connecting {len(_consumers)} alarm consumers (will retry if RabbitMQ unavailable)...")
            for consumer in _consumers:
                try:
                    await consumer.connect(retry=True)  # Retry indefinitely
                    logger.info(f"✓ Connected consumer for {consumer.queue_name}")
                except asyncio.CancelledError:
                    logger.info("Consumer connection cancelled due to shutdown")
                    raise  # Re-raise to exit main() gracefully
                except Exception as e:
                    logger.warning(f"Failed to connect consumer for {consumer.queue_name}: {e}. Will retry in background.")
                    # Continue - connection will retry when start_consuming is called
            
            logger.info(f"✓ Connected {len(_consumers)} alarm consumers (high priority)")
            
            # Start consuming (run all consumers concurrently)
            # Use return_exceptions=True to prevent one consumer crash from killing all consumers
            results = await asyncio.gather(*[consumer.start_consuming() for consumer in _consumers], return_exceptions=True)
            
            # Log any exceptions from consumers
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    if isinstance(result, BaseException):
                        logger.error(f"Consumer {i} ({_consumers[i].queue_name}) crashed: {result}", exc_info=result)
                    else:
                        logger.error(f"Consumer {i} ({_consumers[i].queue_name}) crashed: {result}")
        
        else:
            logger.error(f"Unknown consumer type: {consumer_type}")
            return
        
    except asyncio.CancelledError:
        # Shutdown requested during initialization or main loop
        logger.info("Shutdown requested, cleaning up...")
    except KeyboardInterrupt:
        logger.info("Received shutdown signal")
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
    finally:
        # Graceful shutdown
        logger.info("Shutting down consumers gracefully...")
        
        # Stop consuming first (but don't disconnect yet)
        for consumer in _consumers:
            consumer._consuming = False
        
        # Give consumers a moment to finish current messages
        logger.info("Waiting for in-flight messages to complete...")
        await asyncio.sleep(2)  # Allow time for current messages to finish
        
        # Flush any remaining batches before disconnecting
        logger.info("Flushing remaining batches...")
        for consumer in _consumers:
            try:
                await consumer.flush_batches()
            except Exception as e:
                logger.warning(f"Error flushing batches for {consumer.queue_name}: {e}", exc_info=True)
        
        # Now disconnect all consumers
        logger.info("Disconnecting consumers...")
        for consumer in _consumers:
            try:
                await consumer.disconnect()
            except Exception as e:
                logger.warning(f"Error disconnecting {consumer.queue_name}: {e}", exc_info=True)
        
        # Stop deduplication cleanup task and log stats
        try:
            deduplicator = get_deduplicator()
            await deduplicator.stop_cleanup_task()
            
            stats = deduplicator.get_stats()
            logger.info(
                f"Final deduplication stats: "
                f"L1_cache_size={stats['l1_cache_size']}, "
                f"duplicates_prevented={stats['duplicates_prevented']}, "
                f"hit_rate={stats['hit_rate']}%"
            )
            if stats.get('use_database'):
                logger.info(
                    f"Database stats: "
                    f"db_hits={stats.get('db_hits', 0)}, "
                    f"db_misses={stats.get('db_misses', 0)}, "
                    f"db_hit_rate={stats.get('db_hit_rate', 0)}%"
                )
        except Exception as e:
            logger.debug(f"Could not get deduplication stats: {e}")
        
        logger.info("Consumer shutdown complete")


def signal_handler(signum, frame):
    """Handle shutdown signals"""
    logger.info(f"Received signal {signum}, initiating shutdown...")
    _shutdown_event.set()


if __name__ == "__main__":
    # Set up signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Run main
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutdown complete")
