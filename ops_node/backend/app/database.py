"""Database configuration and session management with resilience"""
import asyncio
import logging
import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy.exc import DBAPIError, OperationalError, InterfaceError
from sqlalchemy import text

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Global state for resilient connection management
_engine = None
_async_session = None
_initialized = False
_reconnect_lock = asyncio.Lock()
_last_reconnect_attempt = 0
_consecutive_failures = 0
_RECONNECT_COOLDOWN = 5.0
_FAILURE_THRESHOLD = 3

# Connection error types
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
    """Check if an exception indicates a connection problem"""
    if isinstance(error, CONNECTION_ERRORS):
        return True
    
    if isinstance(error, (DBAPIError, OperationalError, InterfaceError)):
        error_str = str(error).lower()
        keywords = [
            'connection refused', 'connection reset', 'connection closed',
            'broken pipe', 'timeout', 'connect call failed',
            'server closed the connection', 'could not connect',
        ]
        return any(kw in error_str for kw in keywords)
    
    return False


def _create_engine():
    """Create a new SQLAlchemy async engine"""
    return create_async_engine(
        settings.database_url,
        echo=settings.debug,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
        pool_recycle=1800,  # Recycle connections after 30 minutes
        pool_timeout=30,
        connect_args={
            "server_settings": {"timezone": "UTC"},
            "command_timeout": 60,
        }
    )


def init_engine():
    """Initialize the database engine and session factory"""
    global _engine, _async_session, _initialized
    
    _engine = _create_engine()
    _async_session = async_sessionmaker(
        _engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False
    )
    _initialized = True
    logger.info("Database engine initialized")


# Initialize on module load
init_engine()

# Legacy aliases for compatibility
engine = _engine
async_session = _async_session

# Base class for models
Base = declarative_base()


def record_failure():
    """Record a database failure"""
    global _consecutive_failures
    _consecutive_failures += 1
    
    if _consecutive_failures >= _FAILURE_THRESHOLD:
        logger.warning(f"Consecutive DB failures ({_consecutive_failures}), scheduling reconnection")
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


async def reconnect_engine():
    """Reconnect the database engine"""
    global _engine, _async_session, _last_reconnect_attempt, _consecutive_failures
    
    async with _reconnect_lock:
        now = time.time()
        if now - _last_reconnect_attempt < _RECONNECT_COOLDOWN:
            return
        
        _last_reconnect_attempt = now
        logger.warning("Reconnecting database engine...")
        
        try:
            if _engine:
                await _engine.dispose()
            
            _engine = _create_engine()
            _async_session = async_sessionmaker(
                _engine,
                class_=AsyncSession,
                expire_on_commit=False,
                autocommit=False,
                autoflush=False
            )
            
            # Test connection
            async with _engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            
            _consecutive_failures = 0
            logger.info("Database engine reconnected successfully")
        except Exception as e:
            logger.error(f"Failed to reconnect database engine: {e}")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency to get database session with retry on connection errors"""
    max_retries = 3
    last_error = None
    
    for attempt in range(max_retries + 1):
        try:
            async with _async_session() as session:
                try:
                    yield session
                    record_success()
                    return
                finally:
                    await session.close()
        except Exception as e:
            last_error = e
            
            if is_connection_error(e):
                record_failure()
                
                if attempt < max_retries:
                    delay = 1.0 * (2 ** attempt)
                    logger.warning(
                        f"Database connection error (attempt {attempt + 1}/{max_retries + 1}): {e}. "
                        f"Retrying in {delay:.1f}s..."
                    )
                    await asyncio.sleep(delay)
                    continue
            
            raise
    
    if last_error:
        raise last_error


@asynccontextmanager
async def get_resilient_session(max_retries: int = 3):
    """Get a resilient database session with automatic retry"""
    last_error = None
    
    for attempt in range(max_retries + 1):
        try:
            async with _async_session() as session:
                yield session
                record_success()
                return
        except Exception as e:
            last_error = e
            
            if is_connection_error(e):
                record_failure()
                
                if attempt < max_retries:
                    delay = 1.0 * (2 ** attempt)
                    logger.warning(f"DB connection error (attempt {attempt + 1}): {e}")
                    await asyncio.sleep(delay)
                    continue
            
            raise
    
    if last_error:
        raise last_error


async def init_db():
    """Initialize database tables"""
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def health_check() -> dict:
    """Check database connection health"""
    start = time.time()
    try:
        async with _engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        latency = (time.time() - start) * 1000
        return {'healthy': True, 'latency_ms': latency, 'error': None}
    except Exception as e:
        latency = (time.time() - start) * 1000
        return {'healthy': False, 'latency_ms': latency, 'error': str(e)}


async def close_db():
    """Close database engine gracefully"""
    global _engine, _async_session, _initialized, _consecutive_failures
    if _engine:
        await _engine.dispose()
        _engine = None
        _async_session = None
        _initialized = False
        _consecutive_failures = 0
        logger.info("Database engine closed")
