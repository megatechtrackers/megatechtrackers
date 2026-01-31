"""
Connection Retry Utility with Exponential Backoff
Handles retries for RabbitMQ, database, and other connections
"""
import asyncio
import logging
import socket
from typing import Callable, Any, Optional, TypeVar, Tuple

logger = logging.getLogger(__name__)

T = TypeVar('T')

# Transient connection errors that should trigger retry
# These are expected during startup when services aren't ready yet
CONNECTION_ERRORS: Tuple[type, ...] = (
    ConnectionError,
    ConnectionRefusedError,
    TimeoutError,
    asyncio.TimeoutError,
    OSError,
    socket.gaierror,  # DNS resolution errors (Name or service not known)
    socket.herror,   # Host errors
)

# Try to import aio_pika exceptions if available
try:
    import aio_pika
    CONNECTION_ERRORS = CONNECTION_ERRORS + (
        aio_pika.exceptions.AMQPConnectionError,
        aio_pika.exceptions.AMQPChannelError,
    )
except (ImportError, AttributeError):
    pass


async def retry_connection(
    func: Callable[..., Any],
    max_retries: int = -1,  # -1 means infinite retries
    initial_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential_base: float = 2.0,
    *args,
    **kwargs
) -> Any:
    """
    Retry a connection function with exponential backoff.
    Continues retrying indefinitely if max_retries is -1.
    
    Args:
        func: Async function to retry (connection function)
        max_retries: Maximum number of retry attempts (-1 for infinite)
        initial_delay: Initial delay in seconds (default: 1.0)
        max_delay: Maximum delay in seconds (default: 60.0)
        exponential_base: Base for exponential backoff (default: 2.0)
        *args: Positional arguments to pass to function
        **kwargs: Keyword arguments to pass to function
        
    Returns:
        Result from function call
        
    Raises:
        Last exception if max_retries is reached (and not -1)
    """
    last_exception = None
    attempt = 0
    
    while True:
        # Check for shutdown before each retry attempt
        try:
            import sys
            # Check both module names (__main__ when run directly, parser_nodes.teltonika.run when imported)
            for module_name in ['__main__', 'parser_nodes.teltonika.run']:
                if module_name in sys.modules:
                    run_module = sys.modules[module_name]
                    if hasattr(run_module, '_shutdown_event') and run_module._shutdown_event.is_set():
                        logger.debug("Shutdown detected in retry loop, stopping connection attempts")
                        raise asyncio.CancelledError("Shutdown requested")
        except (ImportError, AttributeError, KeyError):
            pass
        
        try:
            return await func(*args, **kwargs)
        except asyncio.CancelledError:
            # Don't retry on cancellation (shutdown)
            logger.debug("Connection retry cancelled (shutdown requested)")
            raise
        except CONNECTION_ERRORS as e:
            last_exception = e
            attempt += 1
            
            # Check if we should stop retrying
            if max_retries != -1 and attempt > max_retries:
                logger.error(f"Connection failed after {max_retries} attempts. Last error: {e}")
                raise last_exception
            
            # Calculate delay with exponential backoff
            delay = min(initial_delay * (exponential_base ** (attempt - 1)), max_delay)
            
            # Format error message more gracefully
            error_msg = str(e)
            # Shorten common error messages
            if "Name or service not known" in error_msg or isinstance(e, socket.gaierror):
                error_msg = "Service not available (DNS/host resolution failed)"
            elif "Connection refused" in error_msg:
                error_msg = "Connection refused (service not ready)"
            elif "timeout" in error_msg.lower():
                error_msg = "Connection timeout"
            
            # Only log at INFO level for first few attempts, WARNING for later attempts
            log_level = logger.info if attempt <= 3 else logger.warning
            log_level(
                f"Connection attempt {attempt} failed: {error_msg}. "
                f"Retrying in {delay:.2f}s... "
                f"(max_retries={'infinite' if max_retries == -1 else max_retries})"
            )
            # Sleep with small increments to check for cancellation
            slept = 0.0
            while slept < delay:
                await asyncio.sleep(min(0.1, delay - slept))
                slept += 0.1
                # Check for cancellation during sleep
                current_task = asyncio.current_task()
                if current_task and current_task.cancelled():
                    raise asyncio.CancelledError()
                # Also check if we're in a shutdown state (for cases where task isn't cancelled yet)
                # Try to import shutdown event if available (circular import safe)
                try:
                    import sys
                    # Check both module names (__main__ when run directly, parser_nodes.teltonika.run when imported)
                    for module_name in ['__main__', 'parser_nodes.teltonika.run']:
                        if module_name in sys.modules:
                            run_module = sys.modules[module_name]
                            if hasattr(run_module, '_shutdown_event') and run_module._shutdown_event.is_set():
                                raise asyncio.CancelledError("Shutdown requested")
                except (ImportError, AttributeError, KeyError):
                    pass  # Module not loaded or event not available, continue normally
        except Exception as e:
            # Non-connection error, don't retry
            logger.error(f"Non-connection error (not retrying): {e}")
            raise


async def ensure_connection(
    connect_func: Callable[[], Any],
    check_func: Optional[Callable[[], bool]] = None,
    reconnect_interval: float = 5.0,
    max_retries: int = -1
) -> Any:
    """
    Ensure a connection is established and maintain it with automatic reconnection.
    Runs connection retry in background and returns connection object.
    
    Args:
        connect_func: Async function that establishes connection
        check_func: Optional function to check if connection is still alive
        reconnect_interval: Interval to check connection health (seconds)
        max_retries: Maximum retries per connection attempt (-1 for infinite)
        
    Returns:
        Connection object from connect_func
    """
    # Initial connection with retry
    connection = await retry_connection(
        connect_func,
        max_retries=max_retries,
        initial_delay=1.0,
        max_delay=30.0
    )
    
    # Start background reconnection task if check function provided
    if check_func:
        asyncio.create_task(_maintain_connection(
            connect_func, check_func, reconnect_interval, max_retries
        ))
    
    return connection


async def _maintain_connection(
    connect_func: Callable[[], Any],
    check_func: Callable[[], bool],
    reconnect_interval: float,
    max_retries: int
):
    """Background task to maintain connection health and reconnect if needed"""
    while True:
        try:
            await asyncio.sleep(reconnect_interval)
            
            if not check_func():
                logger.warning("Connection lost, attempting to reconnect...")
                try:
                    await retry_connection(
                        connect_func,
                        max_retries=max_retries,
                        initial_delay=1.0,
                        max_delay=30.0
                    )
                    logger.info("✓ Connection reestablished")
                except Exception as e:
                    logger.error(f"Reconnection failed: {e}. Will retry...")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in connection maintenance: {e}", exc_info=True)
