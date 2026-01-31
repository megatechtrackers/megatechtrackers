"""
Monitoring Server Entry Point
Runs the full monitoring server with dashboard, metrics, and Prometheus support
"""
import asyncio
import logging
import signal
import sys
import os
from typing import Optional

# Add current directory to path
sys.path.insert(0, os.path.dirname(__file__))

from config import Config, ServerParams
from monitoring.monitoring_server import MonitoringServer
from logging_config import setup_logging_from_config

# Configure logging from config.json
setup_logging_from_config()

logger = logging.getLogger(__name__)

# Global monitoring server
_monitoring_server: Optional[MonitoringServer] = None
_shutdown_event = asyncio.Event()


async def main():
    """Main entry point for monitoring server"""
    global _monitoring_server
    
    try:
        # Load configuration
        config = Config.load()
        monitoring_config = config.get('monitoring', {})
        
        # Check if monitoring is enabled
        if not monitoring_config.get('enabled', True):
            logger.info("Monitoring is disabled in configuration")
            return
        
        # Get monitoring server configuration
        host = monitoring_config.get('host', '0.0.0.0')
        port = monitoring_config.get('port', 8080)
        
        logger.info(f"Starting Monitoring Server on {host}:{port}...")
        logger.info("Features: Dashboard, Metrics API, Prometheus Exporter, Health Checks")
        
        # Initialize and start monitoring server (with retry for transient errors)
        _monitoring_server = MonitoringServer()
        
        # Retry server startup if it fails (e.g., port already in use, temporary network issues)
        # Use exponential backoff retry logic
        import asyncio
        attempt = 0
        initial_delay = 2.0
        max_delay = 30.0
        exponential_base = 2.0
        
        while True:
            try:
                success = await _monitoring_server.start(host, port)
                if success:
                    break  # Success, exit retry loop
                else:
                    # Start failed, raise to trigger retry
                    raise OSError("Failed to start monitoring server")
            except (OSError, ConnectionError, TimeoutError) as e:
                attempt += 1
                delay = min(initial_delay * (exponential_base ** (attempt - 1)), max_delay)
                logger.warning(
                    f"Monitoring server startup attempt {attempt} failed: {e}. "
                    f"Retrying in {delay:.2f}s... (infinite retries)"
                )
                await asyncio.sleep(delay)
                # Reset server instance for next attempt
                _monitoring_server = MonitoringServer()
            except Exception as e:
                # Non-transient error - log and continue waiting
                logger.error(f"Non-transient error starting monitoring server: {e}")
                logger.info("Monitoring will continue running...")
                await _shutdown_event.wait()
                return
        
        logger.info("=" * 80)
        logger.info("Monitoring Server Started Successfully!")
        logger.info("=" * 80)
        logger.info(f"Dashboard:        http://{host}:{port}/")
        logger.info(f"                  http://localhost:{port}/  (local access)")
        logger.info("")
        logger.info("API Endpoints:")
        logger.info(f"  Health Check:        http://{host}:{port}/health")
        logger.info(f"  Status (JSON):       http://{host}:{port}/status")
        logger.info(f"  Metrics (JSON):      http://{host}:{port}/metrics")
        logger.info(f"  Prometheus Metrics:  http://{host}:{port}/metrics/prometheus")
        logger.info(f"  Parser Services Status: http://{host}:{port}/api/parser-nodes/status")
        logger.info("")
        logger.info("=" * 80)
        logger.info("Open the dashboard URL in your browser to monitor server status in real-time!")
        logger.info("=" * 80)
        
        # Wait for shutdown signal
        await _shutdown_event.wait()
        
    except KeyboardInterrupt:
        logger.info("Received shutdown signal")
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
    finally:
        # Graceful shutdown
        logger.info("Shutting down monitoring server...")
        if _monitoring_server:
            await _monitoring_server.stop()
        logger.info("Monitoring server shutdown complete")


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
