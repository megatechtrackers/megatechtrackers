"""
Circuit Breaker for Metric Engine (DB / RabbitMQ).
Opens after N consecutive failures; recovery after timeout.
"""
import asyncio
import logging
import time
from enum import Enum
from typing import Callable, Any, Optional

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    """Async circuit breaker. Opens after failure_threshold; recovery after recovery_timeout."""

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: float = 60.0,
        expected_exception: type = Exception,
        name: str = "circuit_breaker",
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception
        self.name = name
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time: Optional[float] = None
        self.success_count = 0
        self._lock = asyncio.Lock()
        self.total_requests = 0
        self.total_failures = 0
        self.total_rejected = 0

    async def call(self, func: Callable, *args, **kwargs) -> Any:
        async with self._lock:
            self.total_requests += 1
            if self.state == CircuitState.OPEN:
                if self._should_attempt_recovery():
                    logger.info("[%s] Attempting recovery -> HALF_OPEN", self.name)
                    self.state = CircuitState.HALF_OPEN
                    self.success_count = 0
                else:
                    self.total_rejected += 1
                    raise CircuitBreakerOpenError(
                        f"Circuit breaker [{self.name}] is OPEN; retry after {self.recovery_timeout:.0f}s"
                    )
        try:
            result = await func(*args, **kwargs)
            async with self._lock:
                if self.state == CircuitState.HALF_OPEN:
                    self.success_count += 1
                    if self.success_count >= 2:
                        logger.info("[%s] Recovery successful -> CLOSED", self.name)
                        self.state = CircuitState.CLOSED
                        self.failure_count = 0
                        self.success_count = 0
                elif self.state == CircuitState.CLOSED:
                    self.failure_count = 0
            return result
        except self.expected_exception as e:
            async with self._lock:
                self.total_failures += 1
                self.last_failure_time = time.time()
                if self.state == CircuitState.HALF_OPEN:
                    self.state = CircuitState.OPEN
                    self.failure_count = self.failure_threshold
                elif self.state == CircuitState.CLOSED:
                    self.failure_count += 1
                    if self.failure_count >= self.failure_threshold:
                        logger.error(
                            "[%s] Threshold %d reached -> OPEN. Error: %s",
                            self.name,
                            self.failure_threshold,
                            e,
                        )
                        self.state = CircuitState.OPEN
            raise

    def _should_attempt_recovery(self) -> bool:
        if self.last_failure_time is None:
            return False
        return (time.time() - self.last_failure_time) >= self.recovery_timeout

    def get_stats(self) -> dict:
        return {
            "name": self.name,
            "state": self.state.value,
            "failure_count": self.failure_count,
            "total_requests": self.total_requests,
            "total_failures": self.total_failures,
            "total_rejected": self.total_rejected,
        }


class CircuitBreakerOpenError(Exception):
    """Raised when circuit is open and request is rejected."""
    pass


# Shared instances for DB and RabbitMQ (plan § 2.9)
db_circuit_breaker = CircuitBreaker(
    failure_threshold=5,
    recovery_timeout=60.0,
    expected_exception=Exception,
    name="db",
)
rabbitmq_circuit_breaker = CircuitBreaker(
    failure_threshold=5,
    recovery_timeout=60.0,
    expected_exception=Exception,
    name="rabbitmq",
)
