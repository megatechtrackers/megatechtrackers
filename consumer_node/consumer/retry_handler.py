"""
Retry handler for transient failures
Implements exponential backoff retry logic for database and network operations
"""
import asyncio
import logging
import socket
from typing import Callable, Any, Optional, TypeVar, Tuple
from functools import wraps

logger = logging.getLogger(__name__)

T = TypeVar('T')

# Transient error patterns (database connection errors, network timeouts, etc.)
# These are expected during startup when services aren't ready yet
TRANSIENT_ERRORS = (
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
    TRANSIENT_ERRORS = TRANSIENT_ERRORS + (
        aio_pika.exceptions.AMQPConnectionError,
        aio_pika.exceptions.AMQPChannelError,
    )
except (ImportError, AttributeError):
    pass


async def retry_with_backoff(
    func: Callable[..., Any],
    max_retries: int = 3,
    initial_delay: float = 1.0,
    max_delay: float = 10.0,
    exponential_base: float = 2.0,
    *args,
    **kwargs
) -> Any:
    """
    Retry a function with exponential backoff on transient failures.
    
    Args:
        func: Async function to retry
        max_retries: Maximum number of retry attempts (default: 3, use -1 for infinite)
        initial_delay: Initial delay in seconds (default: 1.0)
        max_delay: Maximum delay in seconds (default: 10.0)
        exponential_base: Base for exponential backoff (default: 2.0)
        *args: Positional arguments to pass to function
        **kwargs: Keyword arguments to pass to function
        
    Returns:
        Result from function call
        
    Raises:
        Last exception if all retries fail (only if max_retries != -1)
    """
    last_exception = None
    attempt = 0
    
    while True:
        # Check for shutdown before each retry attempt
        try:
            import sys
            # Check both module names (__main__ when run directly, consumer_node.run when imported)
            for module_name in ['__main__', 'consumer_node.run']:
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
            logger.debug("Retry cancelled (shutdown requested)")
            raise
        except TRANSIENT_ERRORS as e:
            last_exception = e
            attempt += 1
            
            # Check if we should stop retrying
            if max_retries != -1 and attempt > max_retries:
                logger.error(f"All {max_retries + 1} attempts failed. Last error: {e}")
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
                # Also check if we're in a shutdown state
                try:
                    import sys
                    for module_name in ['__main__', 'consumer_node.run']:
                        if module_name in sys.modules:
                            run_module = sys.modules[module_name]
                            if hasattr(run_module, '_shutdown_event') and run_module._shutdown_event.is_set():
                                raise asyncio.CancelledError("Shutdown requested")
                except (ImportError, AttributeError, KeyError):
                    pass
        except Exception as e:
            # Non-transient error, don't retry
            logger.error(f"Non-transient error (not retrying): {e}")
            raise


def retry_on_transient_failure(
    max_retries: int = 3,
    initial_delay: float = 1.0,
    max_delay: float = 10.0
):
    """
    Decorator for retrying async functions on transient failures.
    
    Usage:
        @retry_on_transient_failure(max_retries=3)
        async def my_function():
            ...
    """
    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            return await retry_with_backoff(
                func,
                max_retries=max_retries,
                initial_delay=initial_delay,
                max_delay=max_delay,
                *args,
                **kwargs
            )
        return wrapper
    return decorator
