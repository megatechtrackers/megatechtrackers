"""TCP listener server for Teltonika devices - Direct processing architecture."""
import asyncio
import logging
import sys
import os
from typing import Optional

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from config import Config, ServerParams

logger = logging.getLogger(__name__)

# Server reference for graceful shutdown
_server_instance: Optional[asyncio.Server] = None


def close_tcp_server_sync() -> None:
    """Close the TCP server immediately (synchronous) to stop accepting new connections."""
    global _server_instance
    if _server_instance and _server_instance.is_serving():
        logger.info("Closing TCP server to stop accepting new connections...")
        try:
            _server_instance.close()
            # Note: close() is synchronous and stops accepting new connections immediately
            # This will cause serve_forever() to exit
        except Exception as e:
            logger.warning(f"Error closing TCP server: {e}")

async def close_tcp_server() -> None:
    """Close the TCP server and wait for it to fully close (with timeout)."""
    global _server_instance
    if _server_instance and _server_instance.is_serving():
        logger.info("Closing TCP server to stop accepting new connections...")
        _server_instance.close()
        # Wait for server to close with timeout (don't wait forever)
        try:
            from config import ServerParams
            timeout = ServerParams.get_float('shutdown.tcp_server_stop_timeout', 1.0)
            await asyncio.wait_for(_server_instance.wait_closed(), timeout=timeout)
            logger.info("TCP server closed - no longer accepting connections")
        except asyncio.TimeoutError:
            logger.warning(f"TCP server close timed out after {timeout}s, continuing shutdown")
        except Exception as e:
            logger.warning(f"Error waiting for server to close: {e}")




async def start_tcp_server(ip: str = None, port: int = None, handler=None) -> None:
    """
    Start the TCP server with a custom connection handler.
    
    Args:
        ip: IP address to bind to (optional, uses config if not provided)
        port: Port to bind to (optional, uses config if not provided)
        handler: Connection handler function (required)
    
    Raises:
        ValueError: If handler is not provided
    """
    if not handler:
        raise ValueError("Handler is required. Current architecture uses direct processing via custom handler.")
    
    # Use provided handler (for RabbitMQ integration)
    server_config = Config.get_server_config()
    bind_ip = ip or server_config.get('ip', '0.0.0.0').strip() or '0.0.0.0'
    bind_port = port or server_config.get('tcp_port', 5027)
    backlog = ServerParams.get_int('tcp_server.backlog', 1000)
    
    logger.info(f"Starting TCP server on {bind_ip}:{bind_port} with custom handler...")
    global _server_instance
    _server_instance = await asyncio.start_server(
        handler,
        bind_ip,
        bind_port,
        backlog=backlog
    )
    addr = _server_instance.sockets[0].getsockname()
    logger.info(f"TCP Server listening on {addr}")
    
    try:
        async with _server_instance:
            # Use serve_forever() - it will exit when server is closed
            # On Windows, serve_forever() may not exit immediately when server closes,
            # so we need to make it cancellable
            try:
                await _server_instance.serve_forever()
            except asyncio.CancelledError:
                # Task was cancelled, ensure server is closed
                if _server_instance.is_serving():
                    _server_instance.close()
                raise
    except asyncio.CancelledError:
        logger.info("TCP server task cancelled")
        if _server_instance and _server_instance.is_serving():
            _server_instance.close()
            try:
                await asyncio.wait_for(_server_instance.wait_closed(), timeout=1.0)
            except (asyncio.TimeoutError, Exception):
                pass
        _server_instance = None
        raise
    except Exception as e:
        logger.error(f"TCP server error: {e}", exc_info=True)
        if _server_instance and _server_instance.is_serving():
            _server_instance.close()
        _server_instance = None
        raise



