"""
Camera Parser Entry Point
Polls CMS servers for camera device data and publishes to RabbitMQ
Production-ready with graceful shutdown, monitoring, and robust error handling
"""
import asyncio
import logging
import signal
import sys
import os

# Add current directory to path
sys.path.insert(0, os.path.dirname(__file__))

from logging_config import setup_logging_from_config
from config import Config
from camera_infrastructure import (
    close_rabbitmq_producer, 
    close_database_client,
    get_load_monitor,
    close_load_monitor,
    start_health_server,
    stop_health_server,
    get_health_server,
)
from camera_parser import CMSPoller

# Setup logging from config
setup_logging_from_config()
logger = logging.getLogger(__name__)

# Global shutdown event (accessible by connection_retry module)
_shutdown_event = asyncio.Event()
_poller: CMSPoller = None
_load_monitor = None
_health_server = None
_main_task: asyncio.Task = None


def _handle_shutdown(sig=None, frame=None):
    """Handle shutdown signals (sync context)"""
    sig_name = signal.Signals(sig).name if sig else "UNKNOWN"
    logger.info(f"Received {sig_name} signal, initiating shutdown...")
    
    # Set shutdown event - poller shares this same event
    _shutdown_event.set()
    
    # Also mark poller as not running
    if _poller:
        _poller.running = False


async def _async_shutdown():
    """Async shutdown handler"""
    logger.info("Shutdown initiated...")
    _shutdown_event.set()
    
    if _poller:
        try:
            await asyncio.wait_for(_poller.stop(), timeout=10.0)
        except asyncio.TimeoutError:
            logger.warning("Poller shutdown timed out")
        except Exception as e:
            logger.error(f"Error stopping poller: {e}")


def _setup_signal_handlers(loop: asyncio.AbstractEventLoop):
    """Setup signal handlers for graceful shutdown"""
    
    if sys.platform == 'win32':
        # Windows: Use signal.signal for SIGINT (Ctrl+C)
        # SIGTERM is not available on Windows
        signal.signal(signal.SIGINT, _handle_shutdown)
        logger.debug("Registered SIGINT handler for Windows")
    else:
        # Unix: Use asyncio's add_signal_handler for proper async handling
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(
                    sig,
                    lambda s=sig: asyncio.create_task(_async_shutdown())
                )
                logger.debug(f"Registered async handler for {sig.name}")
            except (NotImplementedError, ValueError) as e:
                # Fallback to signal.signal if add_signal_handler not supported
                signal.signal(sig, _handle_shutdown)
                logger.debug(f"Registered sync handler for {sig.name}: {e}")


async def _run_poller():
    """Run the CMS poller with error recovery"""
    global _poller, _load_monitor, _health_server
    
    max_restarts = 5
    restart_count = 0
    restart_delay = 5.0
    
    # Get node ID and data transfer mode from config
    config = Config.load()
    node_id = config.get('parser_node', {}).get('node_id', 'camera-parser-1')
    health_port = int(os.getenv('HEALTH_CHECK_PORT', '8080'))
    data_mode = Config.get_data_transfer_mode()
    
    logger.info(f"Data transfer mode: {data_mode}")
    if data_mode == 'LOGS':
        logger.info("LOGS mode: Data will be saved to CSV files (no RabbitMQ connection)")
    else:
        logger.info("RABBITMQ mode: Data will be published to RabbitMQ")
    
    # Initialize load monitor
    _load_monitor = get_load_monitor(node_id)
    await _load_monitor.start_reporting()
    logger.info(f"Load monitor started for node: {node_id}")
    
    # Define health and metrics callbacks
    async def get_metrics():
        if _load_monitor:
            return await _load_monitor.get_metrics()
        return {}
    
    async def get_health():
        if _load_monitor:
            metrics = await _load_monitor.get_metrics()
            return {
                "cms_servers_healthy": metrics.get("cms_servers_healthy", 0),
                "cms_servers_unhealthy": metrics.get("cms_servers_unhealthy", 0),
                "total_errors": metrics.get("total_errors", 0),
                "publish_success_rate": metrics.get("publish_success_rate", 100.0),
                "events_published": metrics.get("events_published", 0),
                "trackdata_published": metrics.get("trackdata_published", 0),
            }
        return {}
    
    # Start health check server
    try:
        _health_server = await start_health_server(
            port=health_port,
            metrics_callback=get_metrics,
            health_callback=get_health
        )
        logger.info(f"Health check server started on port {health_port}")
    except Exception as e:
        logger.warning(f"Failed to start health check server: {e}")
    
    while not _shutdown_event.is_set() and restart_count < max_restarts:
        try:
            # Create poller with load monitor and shared shutdown event
            _poller = CMSPoller(load_monitor=_load_monitor, shutdown_event=_shutdown_event)
            
            # Mark as ready before starting
            if _health_server:
                _health_server.set_ready(True)
            
            await _poller.start()
            
            # If we get here normally, poller finished (should only happen on shutdown)
            if not _shutdown_event.is_set():
                logger.warning("Poller exited unexpectedly, will restart...")
                restart_count += 1
                if _load_monitor:
                    _load_monitor.record_error("general")
                if _health_server:
                    _health_server.set_ready(False)
            else:
                break  # Normal shutdown
                
        except asyncio.CancelledError:
            logger.info("Poller task cancelled")
            break
        except Exception as e:
            restart_count += 1
            logger.error(f"Poller failed (attempt {restart_count}/{max_restarts}): {e}", exc_info=True)
            if _load_monitor:
                _load_monitor.record_error("general")
            
            if restart_count < max_restarts and not _shutdown_event.is_set():
                logger.info(f"Restarting poller in {restart_delay}s...")
                try:
                    await asyncio.wait_for(_shutdown_event.wait(), timeout=restart_delay)
                    break  # Shutdown requested during wait
                except asyncio.TimeoutError:
                    restart_delay = min(restart_delay * 2, 60.0)  # Exponential backoff
    
    if restart_count >= max_restarts:
        logger.error(f"Poller failed {max_restarts} times, giving up")


async def main():
    """Main entry point"""
    global _main_task
    
    logger.info("=" * 60)
    logger.info("Camera Parser Starting...")
    logger.info(f"Python {sys.version}")
    logger.info(f"Platform: {sys.platform}")
    
    # Log configuration
    config = Config.load()
    node_id = config.get('parser_node', {}).get('node_id', 'camera-parser-1')
    data_mode = Config.get_data_transfer_mode()
    logger.info(f"Node ID: {node_id}")
    logger.info(f"Data Transfer Mode: {data_mode}")
    if data_mode == 'RABBITMQ':
        logger.info(f"RabbitMQ: {config['rabbitmq']['host']}:{config['rabbitmq']['port']}")
    logger.info(f"Database: {config['database']['host']}:{config['database']['port']}")
    logger.info(f"Polling intervals: devices={config['polling']['device_status_interval_seconds']}s, alarms={config['polling']['safety_alarms_interval_seconds']}s")
    logger.info("=" * 60)
    
    # Get event loop and setup signal handlers
    loop = asyncio.get_running_loop()
    _setup_signal_handlers(loop)
    
    try:
        # Run poller
        _main_task = asyncio.current_task()
        await _run_poller()
        
    except asyncio.CancelledError:
        logger.info("Main task cancelled")
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    except Exception as e:
        logger.error(f"Fatal error in main: {e}", exc_info=True)
    finally:
        logger.info("Shutting down...")
        
        # Log final stats
        if _poller:
            try:
                stats = _poller.get_stats()
                logger.info(f"Final stats: devices={stats['devices_polled']}, events={stats['events_published']}, errors={stats['errors']}")
            except:
                pass
        
        # Stop poller
        if _poller:
            try:
                await asyncio.wait_for(_poller.stop(), timeout=5.0)
            except:
                pass
        
        # Stop load monitor
        if _load_monitor:
            try:
                # Log final metrics
                metrics = await _load_monitor.get_metrics()
                logger.info(f"Final metrics: published={metrics['publish_successes']}, failures={metrics['publish_failures']}, errors={metrics['total_errors']}")
                await close_load_monitor()
            except Exception as e:
                logger.debug(f"Error closing load monitor: {e}")
        
        # Close connections (RabbitMQ only in RABBITMQ mode)
        if Config.get_data_transfer_mode() == 'RABBITMQ':
            try:
                await asyncio.wait_for(close_rabbitmq_producer(), timeout=5.0)
            except Exception as e:
                logger.debug(f"Error closing RabbitMQ: {e}")
        
        try:
            await asyncio.wait_for(close_database_client(), timeout=5.0)
        except Exception as e:
            logger.debug(f"Error closing database: {e}")
        
        # Stop health check server
        try:
            await stop_health_server()
        except Exception as e:
            logger.debug(f"Error closing health server: {e}")
        
        logger.info("Camera Parser stopped")


def run():
    """Entry point function"""
    try:
        if sys.platform == 'win32':
            # Windows-specific event loop policy
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    run()
