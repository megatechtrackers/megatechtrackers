"""
SQLAlchemy 2.0 Core async initialization for Megatechtrackers Fleet Tracking Consumers
Write access to database for saving tracking data using SQLAlchemy Core
"""
import logging

from sqlalchemy.ext import asyncio

from .sqlalchemy_base import init_sqlalchemy, close_sqlalchemy, Base, get_session
from sqlalchemy import text

logger = logging.getLogger(__name__)

_initialized = False


async def init_orm(retry: bool = True):
    """
    Initialize SQLAlchemy async engine and session factory for consumer services.
    Uses database configuration for write access to trackdata, events, and alarms tables.
    With retry=True, will retry indefinitely until connection succeeds.
    
    Args:
        retry: If True, retry connection indefinitely with exponential backoff
    """
    global _initialized
    if _initialized:
        return
    
    await init_sqlalchemy(retry=retry)
    
    # Create tables if they don't exist
    # Import all models so they're registered with Base.metadata
    try:
        from .sqlalchemy_base import get_engine
        # Import all models to register them with Base.metadata
        # This ensures all tables are created
        from .message_deduplicator import ProcessedMessage
        from .models import (
            TrackData, Alarm, Event, LastStatus, UnitIOMapping
        )
        
        engine = get_engine()
        # Create all tables registered with Base.metadata
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all, checkfirst=True)
        
        logger.info("Database tables verified/created via ORM")
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
        # Actual table creation errors (schema issues, permissions, etc.) - log with traceback
        logger.error(f"Failed to create tables via ORM: {e}", exc_info=True)
        raise  # Re-raise to ensure we know if table creation fails
    
    _initialized = True
    logger.info("SQLAlchemy ORM initialized (write)")


async def close_orm():
    """Close SQLAlchemy engine"""
    global _initialized
    if _initialized:
        await close_sqlalchemy()
        _initialized = False
        logger.info("SQLAlchemy ORM connections closed")
