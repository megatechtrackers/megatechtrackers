"""
Circuit Breaker Pattern Implementation
Provides fault tolerance for database operations
"""
import asyncio
import logging
import time
from enum import Enum
from typing import Callable, Any, Optional
from functools import wraps

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    """Circuit breaker states"""
    CLOSED = "closed"  # Normal operation
    OPEN = "open"  # Failing, reject requests immediately
    HALF_OPEN = "half_open"  # Testing if service recovered


class CircuitBreaker:
    """
    Circuit breaker implementation for async operations.
    
    Opens circuit after N consecutive failures.
    Attempts recovery after timeout.
    """
    
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: float = 60.0,
        expected_exception: type = Exception,
        name: str = "circuit_breaker"
    ):
        """
        Initialize circuit breaker.
        
        Args:
            failure_threshold: Number of consecutive failures before opening circuit
            recovery_timeout: Seconds to wait before attempting recovery (half-open state)
            expected_exception: Exception type that counts as failure
            name: Name for logging
        """
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception
        self.name = name
        
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time: Optional[float] = None
        self.success_count = 0
        self._lock = asyncio.Lock()
        
        # Statistics
        self.total_requests = 0
        self.total_failures = 0
        self.total_rejected = 0
        self.state_changes = []
    
    async def call(self, func: Callable, *args, **kwargs) -> Any:
        """
        Execute function with circuit breaker protection.
        
        Args:
            func: Async function to execute
            *args: Function arguments
            **kwargs: Function keyword arguments
            
        Returns:
            Function result
            
        Raises:
            CircuitBreakerOpenError: If circuit is open
            Original exception: If function fails
        """
        async with self._lock:
            self.total_requests += 1
            
            # Check if we should attempt recovery
            if self.state == CircuitState.OPEN:
                if self._should_attempt_recovery():
                    logger.info(f"[{self.name}] Attempting recovery - moving to HALF_OPEN")
                    self.state = CircuitState.HALF_OPEN
                    self.success_count = 0
                    self.state_changes.append(("OPEN", "HALF_OPEN", time.time()))
                else:
                    self.total_rejected += 1
                    raise CircuitBreakerOpenError(
                        f"Circuit breaker [{self.name}] is OPEN. "
                        f"Last failure: {time.time() - (self.last_failure_time or 0):.1f}s ago. "
                        f"Will retry after {self.recovery_timeout}s"
                    )
        
        # Execute function
        try:
            result = await func(*args, **kwargs)
            
            # Success - reset failure count
            async with self._lock:
                if self.state == CircuitState.HALF_OPEN:
                    self.success_count += 1
                    # If we get a few successes in half-open, close the circuit
                    if self.success_count >= 2:
                        logger.info(f"[{self.name}] Recovery successful - moving to CLOSED")
                        self.state = CircuitState.CLOSED
                        self.failure_count = 0
                        self.success_count = 0
                        self.state_changes.append(("HALF_OPEN", "CLOSED", time.time()))
                elif self.state == CircuitState.CLOSED:
                    # Reset failure count on success
                    self.failure_count = 0
            
            return result
            
        except self.expected_exception as e:
            # Failure - increment failure count
            async with self._lock:
                self.total_failures += 1
                self.last_failure_time = time.time()
                
                if self.state == CircuitState.HALF_OPEN:
                    # Failure in half-open - open circuit again
                    logger.warning(f"[{self.name}] Recovery failed - moving to OPEN")
                    self.state = CircuitState.OPEN
                    self.failure_count = self.failure_threshold
                    self.state_changes.append(("HALF_OPEN", "OPEN", time.time()))
                elif self.state == CircuitState.CLOSED:
                    self.failure_count += 1
                    if self.failure_count >= self.failure_threshold:
                        logger.error(
                            f"[{self.name}] Failure threshold ({self.failure_threshold}) reached - "
                            f"opening circuit. Error: {e}"
                        )
                        self.state = CircuitState.OPEN
                        self.state_changes.append(("CLOSED", "OPEN", time.time()))
            
            # Re-raise original exception
            raise
    
    def _should_attempt_recovery(self) -> bool:
        """Check if enough time has passed to attempt recovery"""
        if self.last_failure_time is None:
            return False
        return (time.time() - self.last_failure_time) >= self.recovery_timeout
    
    def get_stats(self) -> dict:
        """Get circuit breaker statistics"""
        return {
            "name": self.name,
            "state": self.state.value,
            "failure_count": self.failure_count,
            "total_requests": self.total_requests,
            "total_failures": self.total_failures,
            "total_rejected": self.total_rejected,
            "last_failure_time": self.last_failure_time,
            "state_changes": len(self.state_changes)
        }
    
    def reset(self):
        """Manually reset circuit breaker to closed state"""
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time = None
        logger.info(f"[{self.name}] Circuit breaker manually reset")


class CircuitBreakerOpenError(Exception):
    """Raised when circuit breaker is open and rejects request"""
    pass


# Global circuit breakers (one per database operation type)
_db_circuit_breaker: Optional[CircuitBreaker] = None
_db_write_circuit_breaker: Optional[CircuitBreaker] = None


def get_db_circuit_breaker() -> CircuitBreaker:
    """Get or create database circuit breaker (for read operations)"""
    global _db_circuit_breaker
    if _db_circuit_breaker is None:
        _db_circuit_breaker = CircuitBreaker(
            failure_threshold=5,
            recovery_timeout=60.0,
            expected_exception=Exception,
            name="db_read"
        )
    return _db_circuit_breaker


def get_db_write_circuit_breaker() -> CircuitBreaker:
    """Get or create database write circuit breaker"""
    global _db_write_circuit_breaker
    if _db_write_circuit_breaker is None:
        _db_write_circuit_breaker = CircuitBreaker(
            failure_threshold=5,
            recovery_timeout=60.0,
            expected_exception=Exception,
            name="db_write"
        )
    return _db_write_circuit_breaker


def with_circuit_breaker(circuit_breaker: Optional[CircuitBreaker] = None, use_write_breaker: bool = False):
    """
    Decorator to wrap async function with circuit breaker.
    
    Args:
        circuit_breaker: Custom circuit breaker instance (optional)
        use_write_breaker: If True, use write circuit breaker (default: read breaker)
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            breaker = circuit_breaker
            if breaker is None:
                breaker = get_db_write_circuit_breaker() if use_write_breaker else get_db_circuit_breaker()
            return await breaker.call(func, *args, **kwargs)
        return wrapper
    return decorator
