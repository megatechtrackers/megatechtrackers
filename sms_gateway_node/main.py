"""
SMS Gateway Service Main Entry Point
Runs the SMS command processing service with Prometheus metrics endpoint
"""
import asyncio
import logging
import logging.handlers
import signal
import sys
from pathlib import Path
from aiohttp import web

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sms_gateway_node.config import Config, ServerParams
from sms_gateway_node.services.sms_service import SMSService
from sms_gateway_node.services.modem_pool import ModemPool
from sms_gateway_node.utils.metrics import get_metrics, get_content_type


def setup_logging():
    """Setup logging based on configuration."""
    log_level = ServerParams.get('logging.level', 'INFO')
    log_file = ServerParams.get('logging.log_file', 'logs/sms_gateway_node.log')
    max_bytes = ServerParams.get_int('logging.max_bytes', 10485760)
    backup_count = ServerParams.get_int('logging.backup_count', 5)
    
    # Create logs directory if needed
    log_path = Path(log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Setup handlers
    handlers = [
        logging.StreamHandler(),
        logging.handlers.RotatingFileHandler(
            log_file,
            maxBytes=max_bytes,
            backupCount=backup_count
        )
    ]
    
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=handlers
    )
    
    return logging.getLogger(__name__)


# Setup logging and get logger
logger = setup_logging()


async def health_handler(request):
    """Health check endpoint"""
    return web.json_response({"status": "healthy", "service": "sms-gateway-service"})


async def metrics_handler(request):
    """Prometheus metrics endpoint"""
    return web.Response(
        body=get_metrics(),
        content_type="text/plain"
    )


async def start_metrics_server(port: int = 8080):
    """Start the metrics HTTP server"""
    app = web.Application()
    app.router.add_get('/health', health_handler)
    app.router.add_get('/metrics', metrics_handler)
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', port)
    await site.start()
    logger.info(f"Metrics server started on port {port}")
    logger.info(f"  GET /health  - Health check")
    logger.info(f"  GET /metrics - Prometheus metrics")
    return runner


async def main():
    """Main entry point."""
    logger.info("=" * 60)
    logger.info("SMS Gateway Service Starting")
    logger.info("=" * 60)
    
    # Log configuration summary
    db_config = Config.get_database_config()
    logger.info(f"Database: {db_config['host']}:{db_config['port']}/{db_config['name']}")
    logger.info(f"Polling intervals: outbox={ServerParams.get_int('polling.outbox_interval_seconds', 5)}s, inbox={ServerParams.get_int('polling.inbox_interval_seconds', 10)}s")
    logger.info(f"Timeouts: max_retries={ServerParams.get_int('timeouts.max_retries', 3)}, outbox={ServerParams.get_int('timeouts.outbox_timeout_minutes', 1)}min, reply={ServerParams.get_int('timeouts.reply_timeout_minutes', 2)}min")
    
    # Initialize services
    sms_service = SMSService()
    modem_pool = ModemPool.get_instance()
    
    # Start metrics HTTP server
    metrics_port = ServerParams.get_int('metrics.port', 8080)
    metrics_runner = await start_metrics_server(metrics_port)
    
    # Setup signal handlers
    loop = asyncio.get_event_loop()
    
    def handle_signal():
        logger.info("Shutdown signal received")
        sms_service.stop()
    
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, handle_signal)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            signal.signal(sig, lambda s, f: handle_signal())
    
    try:
        # Run the service
        await sms_service.run()
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
    finally:
        # Cleanup
        await metrics_runner.cleanup()
        await modem_pool.close()
        logger.info("SMS Gateway Service Stopped")


if __name__ == "__main__":
    # Run the service
    asyncio.run(main())
