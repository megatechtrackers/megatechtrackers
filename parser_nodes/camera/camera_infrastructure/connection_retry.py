"""
Connection Retry Utility with Exponential Backoff
Handles retries for RabbitMQ, database, and HTTP connections
"""
import asyncio
import logging
import socket
from typing import Callable, Any, Tuple

logger = logging.getLogger(__name__)

# Transient connection errors that should trigger retry
CONNECTION_ERRORS: Tuple[type, ...] = (
    ConnectionError,
    ConnectionRefusedError,
    TimeoutError,
    asyncio.TimeoutError,
    OSError,
    socket.gaierror,  # DNS resolution errors
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

# Try to import aiohttp exceptions if available
try:
    import aiohttp
    CONNECTION_ERRORS = CONNECTION_ERRORS + (
        aiohttp.ClientError,
        aiohttp.ServerDisconnectedError,
    )
except (ImportError, AttributeError):
    pass


def _is_shutdown_requested() -> bool:
    """Check if shutdown has been requested"""
    try:
        import sys
        for module_name in ['__main__', 'run']:
            if module_name in sys.modules:
                run_module = sys.modules[module_name]
                if hasattr(run_module, '_shutdown_event'):
                    return run_module._shutdown_event.is_set()
    except (ImportError, AttributeError, KeyError):
        pass
    return False


async def retry_connection(
    func: Callable[..., Any],
    max_retries: int = -1,  # -1 means infinite retries
    initial_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential_base: float = 2.0,
    operation_name: str = "connection",
    *args,
    **kwargs
) -> Any:
    """
    Retry a connection function with exponential backoff.
    Continues retrying indefinitely if max_retries is -1.
    
    Args:
        func: Async function to retry
        max_retries: Maximum number of retry attempts (-1 for infinite)
        initial_delay: Initial delay in seconds
        max_delay: Maximum delay in seconds
        exponential_base: Base for exponential backoff
        operation_name: Name of operation for logging
        
    Returns:
        Result from function call
        
    Raises:
        Last exception if max_retries is reached (and not -1)
        asyncio.CancelledError if shutdown is requested
    """
    last_exception = None
    attempt = 0
    
    while True:
        # Check for shutdown before each retry attempt
        if _is_shutdown_requested():
            logger.debug(f"Shutdown detected in retry loop for {operation_name}")
            raise asyncio.CancelledError("Shutdown requested")
        
        try:
            return await func(*args, **kwargs)
        except asyncio.CancelledError:
            # Don't retry on cancellation (shutdown)
            logger.debug(f"{operation_name} retry cancelled (shutdown requested)")
            raise
        except CONNECTION_ERRORS as e:
            last_exception = e
            attempt += 1
            
            # Check if we should stop retrying
            if max_retries != -1 and attempt > max_retries:
                logger.error(f"{operation_name} failed after {max_retries} attempts. Last error: {e}")
                raise last_exception
            
            # Calculate delay with exponential backoff
            delay = min(initial_delay * (exponential_base ** (attempt - 1)), max_delay)
            
            # Format error message
            error_msg = str(e)
            if "Name or service not known" in error_msg or isinstance(e, socket.gaierror):
                error_msg = "Service not available (DNS/host resolution failed)"
            elif "Connection refused" in error_msg:
                error_msg = "Connection refused (service not ready)"
            elif "timeout" in error_msg.lower():
                error_msg = "Connection timeout"
            
            # Log at appropriate level
            log_level = logger.info if attempt <= 3 else logger.warning
            log_level(
                f"{operation_name} attempt {attempt} failed: {error_msg}. "
                f"Retrying in {delay:.1f}s..."
            )
            
            # Sleep with small increments to check for cancellation/shutdown
            await _interruptible_sleep(delay)
            
        except Exception as e:
            # Non-connection error, don't retry
            logger.error(f"{operation_name} failed with non-connection error (not retrying): {e}")
            raise


async def _interruptible_sleep(duration: float, check_interval: float = 0.5):
    """
    Sleep that can be interrupted by shutdown signal.
    
    Args:
        duration: Total sleep duration in seconds
        check_interval: How often to check for shutdown
    """
    slept = 0.0
    while slept < duration:
        sleep_time = min(check_interval, duration - slept)
        await asyncio.sleep(sleep_time)
        slept += sleep_time
        
        # Check for task cancellation
        current_task = asyncio.current_task()
        if current_task and current_task.cancelled():
            raise asyncio.CancelledError()
        
        # Check for shutdown
        if _is_shutdown_requested():
            raise asyncio.CancelledError("Shutdown requested")
