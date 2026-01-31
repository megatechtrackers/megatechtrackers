"""
SQLAlchemy 2.0 async base and session management for parser
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from config import Config
import logging

logger = logging.getLogger(__name__)

# Create declarative base
Base = declarative_base()

# Global engine and session factory
_engine = None
_async_session_maker = None
_initialized = False


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
        
        # Get database connection timeout from config
        from config import ServerParams
        connection_timeout = ServerParams.get_int('database_connection.connection_timeout', 30)
        
        # Create async engine with connection timeout
        # pool_size=15, max_overflow=30
        # Note: statement_cache_size=0 is required when using pgbouncer with transaction pooling
        _engine = create_async_engine(
            db_url,
            echo=False,  # Set to True for SQL logging
            pool_pre_ping=True,  # Verify connections before using
            pool_size=15,  # Increased from 10 for high-throughput
            max_overflow=20,  # Reduced from 30 for better connection management with 8 nodes
            connect_args={
                "command_timeout": connection_timeout,
                "statement_cache_size": 0,  # Disable prepared statement cache for pgbouncer compatibility
                "server_settings": {
                    "application_name": "teltonika_parser"
                }
            }
        )
        
        # Create async session factory
        _async_session_maker = async_sessionmaker(
            _engine,
            class_=AsyncSession,
            expire_on_commit=False
        )
        
        logger.info(f"SQLAlchemy async engine initialized: {host}:{port}/{database}")
        _initialized = True
    
    if retry:
        from teltonika_infrastructure.connection_retry import retry_connection
        await retry_connection(_init, max_retries=-1, initial_delay=1.0, max_delay=30.0)
    else:
        await _init()


def get_session():
    """Get async database session context manager"""
    if not _initialized:
        raise RuntimeError("SQLAlchemy not initialized. Call init_sqlalchemy() first.")
    return _async_session_maker()


def get_engine():
    """Get async database engine"""
    if not _initialized:
        raise RuntimeError("SQLAlchemy not initialized. Call init_sqlalchemy() first.")
    return _engine


async def close_sqlalchemy():
    """Close SQLAlchemy engine"""
    global _engine, _async_session_maker, _initialized
    if _engine:
        await _engine.dispose()
        _engine = None
        _async_session_maker = None
        _initialized = False
        logger.info("SQLAlchemy engine closed")
