"""
SQLAlchemy 2.0 Core async initialization for Parser Service
Parser service uses database connection for unit_io_mapping, commands, and other tables
"""
import asyncio
import logging

from teltonika_database.sqlalchemy_base import init_sqlalchemy, close_sqlalchemy, Base, get_engine

logger = logging.getLogger(__name__)

_orm_initialized = False


async def init_orm(retry: bool = True):
    """
    Initialize SQLAlchemy async engine and session factory for parser services.
    Uses database configuration for access to unit_io_mapping, commands, and other tables.
    With retry=True, will retry indefinitely until connection succeeds.
    
    Args:
        retry: If True, retry connection indefinitely with exponential backoff
    """
    global _orm_initialized
    if _orm_initialized:
        return
    
    await init_sqlalchemy(retry=retry)
    
    # Create tables if they don't exist
    # Import all models so they're registered with Base.metadata
    try:
        # Import all models to register them with Base.metadata
        # This ensures all tables are created
        from teltonika_database.models import (
            TrackData, Alarm, Event, LastStatus, UnitIOMapping,
            # Command system models (from Operations Service integration)
            DeviceConfig, Unit, UnitConfig,
            CommandOutbox, CommandSent, CommandInbox, CommandHistory
        )
        
        engine = get_engine()
        # Create all tables registered with Base.metadata
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all, checkfirst=True)
        
        logger.info("Parser database tables verified/created via ORM")
    except (ConnectionError, OSError, TimeoutError, asyncio.TimeoutError) as e:
        # Connection errors are expected during startup - don't log full traceback
        # These will be retried by the retry handler
        import socket
        if isinstance(e, (socket.gaierror, socket.herror)):
            logger.debug(f"Database connection not available yet (DNS/host resolution): {e}. Will retry.")
        else:
            logger.debug(f"Database connection not available yet: {e}. Will retry.")
        raise  # Re-raise so retry handler can catch it
    except Exception as e:
        # Check if this is an asyncpg connection error (pgbouncer cannot connect, etc.)
        error_str = str(e).lower()
        is_connection_error = (
            "pgbouncer cannot connect" in error_str or
            "connection" in error_str or
            "cannot connect" in error_str or
            "connection refused" in error_str or
            "connection timeout" in error_str
        )
        
        # Check for asyncpg exceptions
        try:
            import asyncpg
            if isinstance(e, (asyncpg.exceptions.ProtocolViolationError,
                            asyncpg.exceptions.ConnectionDoesNotExistError,
                            asyncpg.exceptions.InvalidPasswordError,
                            asyncpg.exceptions.InvalidCatalogNameError)):
                is_connection_error = True
        except (ImportError, AttributeError):
            pass
        
        if is_connection_error:
            # Connection errors are expected - don't log full traceback
            logger.debug(f"Database connection not available yet: {e}. Will retry.")
            raise  # Re-raise so retry handler can catch it
        else:
            # Actual table creation errors (schema issues, permissions, etc.) - log with traceback
            logger.error(f"Failed to create tables via ORM: {e}", exc_info=True)
            raise  # Re-raise to ensure we know if table creation fails
    
    _orm_initialized = True
    logger.info("Parser SQLAlchemy ORM initialized")


async def close_orm():
    """Close SQLAlchemy engine"""
    global _orm_initialized
    if _orm_initialized:
        await close_sqlalchemy()
        _orm_initialized = False
        logger.info("Parser SQLAlchemy ORM connections closed")
