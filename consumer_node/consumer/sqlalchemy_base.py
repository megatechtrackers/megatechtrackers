"""
SQLAlchemy 2.0 async base and session management for consumer
With automatic reconnection and resilience for PgBouncer/PostgreSQL failures
"""
import asyncio
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy.exc import DBAPIError, OperationalError, InterfaceError
from sqlalchemy import text
from config import Config
import logging
import time
from .circuit_breaker import get_db_write_circuit_breaker, CircuitBreakerOpenError

logger = logging.getLogger(__name__)

# Create declarative base
Base = declarative_base()

# Global engine and session factory
_engine = None
_async_session_maker = None
_initialized = False
_reconnect_lock = asyncio.Lock()
_last_reconnect_attempt = 0
_consecutive_failures = 0
_RECONNECT_COOLDOWN = 5.0  # Minimum seconds between reconnection attempts
_FAILURE_THRESHOLD_FOR_RECONNECT = 3  # Reconnect engine after this many consecutive failures

# Connection error types that indicate we need to reconnect
CONNECTION_ERRORS = (
    ConnectionError,
    ConnectionRefusedError,
    ConnectionResetError,
    BrokenPipeError,
    TimeoutError,
    asyncio.TimeoutError,
    OSError,
)


def is_connection_error(error: Exception) -> bool:
    """Check if an exception indicates a connection problem that requires reconnection"""
    # Direct connection errors
    if isinstance(error, CONNECTION_ERRORS):
        return True
    
    # SQLAlchemy wrapped errors
    if isinstance(error, (DBAPIError, OperationalError, InterfaceError)):
        error_str = str(error).lower()
        connection_keywords = [
            'connection refused',
            'connection reset',
            'connection closed',
            'broken pipe',
            'timeout',
            'connect call failed',
            'server closed the connection',
            'ssl connection has been closed',
            'could not connect',
            'connection timed out',
            'network is unreachable',
            'no route to host',
        ]
        return any(keyword in error_str for keyword in connection_keywords)
    
    return False


async def _create_engine():
    """Create a new SQLAlchemy async engine"""
    db_config = Config.get_database_config()
    host = db_config.get('host', 'localhost')
    port = db_config.get('port', 5432)
    database = db_config.get('name', 'megatechtrackers')
    user = db_config.get('user', 'postgres')
    password = db_config.get('password', '')
    
    # URL encode password if it contains special characters
    from urllib.parse import quote_plus
    encoded_password = quote_plus(password) if password else ''
    
    # SQLAlchemy async URL format: postgresql+asyncpg://
    db_url = f"postgresql+asyncpg://{user}:{encoded_password}@{host}:{port}/{database}"
    
    connection_timeout = 30
    
    engine = create_async_engine(
        db_url,
        echo=False,
        pool_pre_ping=True,  # Verify connections before using
        pool_size=15,
        max_overflow=30,
        pool_recycle=1800,  # Recycle connections after 30 minutes
        pool_timeout=30,  # Wait up to 30s for a connection from pool
        connect_args={
            "command_timeout": connection_timeout,
            "statement_cache_size": 0,  # Required for pgbouncer transaction pooling
            "server_settings": {
                "application_name": "megatechtrackers_consumer",
                "timezone": "UTC"
            }
        }
    )
    
    logger.info(f"SQLAlchemy async engine created: {host}:{port}/{database}")
    return engine


async def init_sqlalchemy(retry: bool = True):
    """
    Initialize SQLAlchemy async engine and session factory.
    With retry=True, will retry indefinitely until connection succeeds.
    
    Args:
        retry: If True, retry connection indefinitely with exponential backoff
    """
    global _engine, _async_session_maker, _initialized
    
    if _initialized:
        return
    
    async def _init():
        global _engine, _async_session_maker, _initialized
        
        _engine = await _create_engine()
        
        # Create async session factory
        _async_session_maker = async_sessionmaker(
            _engine,
            class_=AsyncSession,
            expire_on_commit=False
        )
        
        # Test connection
        async with _engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        
        logger.info("SQLAlchemy async engine initialized and connection verified")
        _initialized = True
    
    if retry:
        from .retry_handler import retry_with_backoff
        await retry_with_backoff(
            _init,
            max_retries=-1,  # Infinite retries
            initial_delay=1.0,
            max_delay=30.0
        )
    else:
        await _init()


async def reconnect_engine():
    """
    Dispose current engine and create a new one.
    Called when connection pool is broken (e.g., PgBouncer restart).
    Uses locking to prevent multiple simultaneous reconnections.
    """
    global _engine, _async_session_maker, _initialized, _last_reconnect_attempt, _consecutive_failures
    
    async with _reconnect_lock:
        # Check cooldown to prevent reconnection storms
        now = time.time()
        if now - _last_reconnect_attempt < _RECONNECT_COOLDOWN:
            logger.debug("Reconnection attempt skipped (cooldown)")
            return
        
        _last_reconnect_attempt = now
        
        logger.warning("Reconnecting database engine due to connection failures...")
        
        try:
            # Dispose old engine (closes all pooled connections)
            if _engine:
                try:
                    await _engine.dispose()
                except Exception as e:
                    logger.debug(f"Error disposing old engine: {e}")
            
            # Create new engine with retry
            from .retry_handler import retry_with_backoff
            
            async def _reconnect():
                global _engine, _async_session_maker
                _engine = await _create_engine()
                _async_session_maker = async_sessionmaker(
                    _engine,
                    class_=AsyncSession,
                    expire_on_commit=False
                )
                # Test connection
                async with _engine.connect() as conn:
                    await conn.execute(text("SELECT 1"))
            
            await retry_with_backoff(
                _reconnect,
                max_retries=-1,  # Infinite retries
                initial_delay=1.0,
                max_delay=30.0
            )
            
            _consecutive_failures = 0
            logger.info("Database engine reconnected successfully")
            
            # Reset circuit breaker after successful reconnection
            try:
                circuit_breaker = get_db_write_circuit_breaker()
                circuit_breaker.reset()
                logger.info("Circuit breaker reset after reconnection")
            except Exception:
                pass
            
        except asyncio.CancelledError:
            logger.info("Reconnection cancelled (shutdown)")
            raise
        except Exception as e:
            logger.error(f"Failed to reconnect database engine: {e}")
            raise


def record_failure():
    """Record a database failure and trigger reconnection if threshold reached"""
    global _consecutive_failures
    _consecutive_failures += 1
    
    if _consecutive_failures >= _FAILURE_THRESHOLD_FOR_RECONNECT:
        logger.warning(f"Consecutive failures ({_consecutive_failures}) reached threshold, scheduling reconnection")
        # Schedule reconnection in background (don't block current operation)
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(reconnect_engine())
        except RuntimeError:
            pass


def record_success():
    """Record a successful database operation"""
    global _consecutive_failures
    _consecutive_failures = 0


def get_session():
    """
    Get async database session context manager.
    
    Returns:
        AsyncSession context manager
        
    Raises:
        RuntimeError: If SQLAlchemy not initialized
    """
    if not _initialized:
        raise RuntimeError("SQLAlchemy not initialized. Call init_sqlalchemy() first.")
    
    return _async_session_maker()


@asynccontextmanager
async def get_resilient_session(max_retries: int = 3, retry_delay: float = 1.0):
    """
    Get async database session with automatic retry on connection errors.
    
    This context manager will:
    1. Retry on transient connection errors
    2. Trigger engine reconnection if needed
    3. Reset circuit breaker after recovery
    
    Args:
        max_retries: Maximum number of retries (default: 3)
        retry_delay: Initial delay between retries in seconds (default: 1.0)
    
    Yields:
        AsyncSession: Database session
        
    Raises:
        Exception: If all retries fail
    """
    if not _initialized:
        raise RuntimeError("SQLAlchemy not initialized. Call init_sqlalchemy() first.")
    
    last_error = None
    
    for attempt in range(max_retries + 1):
        try:
            async with _async_session_maker() as session:
                yield session
                record_success()
                return
        except Exception as e:
            last_error = e
            
            if is_connection_error(e):
                record_failure()
                
                if attempt < max_retries:
                    delay = retry_delay * (2 ** attempt)  # Exponential backoff
                    logger.warning(
                        f"Database connection error (attempt {attempt + 1}/{max_retries + 1}): {e}. "
                        f"Retrying in {delay:.1f}s..."
                    )
                    await asyncio.sleep(delay)
                    continue
                else:
                    logger.error(f"Database connection failed after {max_retries + 1} attempts: {e}")
            else:
                # Non-connection error, don't retry
                raise
    
    if last_error:
        raise last_error


def get_engine():
    """Get async database engine"""
    if not _initialized:
        raise RuntimeError("SQLAlchemy not initialized. Call init_sqlalchemy() first.")
    return _engine


async def close_sqlalchemy():
    """Close SQLAlchemy engine"""
    global _engine, _async_session_maker, _initialized, _consecutive_failures
    if _engine:
        await _engine.dispose()
        _engine = None
        _async_session_maker = None
        _initialized = False
        _consecutive_failures = 0
        logger.info("SQLAlchemy engine closed")


async def health_check() -> dict:
    """
    Check database connection health.
    
    Returns:
        dict with 'healthy' (bool), 'latency_ms' (float), and 'error' (str or None)
    """
    if not _initialized:
        return {'healthy': False, 'latency_ms': 0, 'error': 'Not initialized'}
    
    start = time.time()
    try:
        async with _engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        latency = (time.time() - start) * 1000
        return {'healthy': True, 'latency_ms': latency, 'error': None}
    except Exception as e:
        latency = (time.time() - start) * 1000
        return {'healthy': False, 'latency_ms': latency, 'error': str(e)}
