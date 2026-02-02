"""
Database Client for Camera Parser
Reads CMS server configurations from database
"""
import asyncio
import logging
import os
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from datetime import datetime, timezone
import asyncpg

import sys
sys.path.insert(0, '..')
from config import Config
from .connection_retry import retry_connection, _is_shutdown_requested
from .encryption import decrypt_password

logger = logging.getLogger(__name__)


def _get_config_cms_servers() -> List['CMSServer']:
    """Get CMS server configurations from config.json cms_servers array.
    
    Used in LOGS mode or when no servers are configured in the database.
    
    Expected format:
        "cms_servers": [
            {"name": "main", "host": "...", "username": "...", "password": "...", ...},
            {"name": "backup", "host": "...", "username": "...", "password": "...", ...}
        ]
    """
    config = Config.load()
    cms_config = config.get('cms_servers', [])
    
    if not isinstance(cms_config, list):
        logger.error("cms_servers must be an array in config.json")
        return []
    
    servers = []
    
    for idx, srv in enumerate(cms_config):
        if not srv.get('enabled', True):
            continue  # Skip disabled servers
        
        host = srv.get('host')
        if not host:
            continue
        
        username = srv.get('username')
        password = srv.get('password')
        
        if not username or not password:
            logger.warning(f"CMS server {host} missing username or password, skipping")
            continue
        
        servers.append(CMSServer(
            id=idx,  # Use index as ID for config-based servers
            name=srv.get('name', f"config-{host}"),
            host=host,
            port=int(srv.get('web_port', 8080)),
            stream_port=int(srv.get('stream_port', 6604)),
            storage_port=int(srv.get('storage_port', 6611)),
            download_port=int(srv.get('download_port', 6609)),
            username=username,
            password=password,
            session_id=None,
            session_expires_at=None,
            enabled=True,
            health_status='unknown',
            poll_interval_seconds=srv.get('poll_interval_seconds', 30),
            timezone=srv.get('timezone', '+00:00')  # CMS timezone offset
        ))
    
    return servers


def _get_env_cms_server() -> Optional['CMSServer']:
    """Get CMS server configuration from environment variables.
    
    Used as fallback when no servers are configured in the database or config.
    """
    host = os.getenv('CMS_HOST')
    if not host:
        return None
    
    username = os.getenv('CMS_USERNAME')
    password = os.getenv('CMS_PASSWORD')
    
    if not username or not password:
        logger.warning("CMS_HOST is set but CMS_USERNAME or CMS_PASSWORD is missing")
        return None
    
    return CMSServer(
        id=0,  # Special ID for env-based server
        name=f"env-{host}",
        host=host,
        port=int(os.getenv('CMS_WEB_PORT', '8080')),
        stream_port=int(os.getenv('CMS_STREAM_PORT', '6604')),
        storage_port=int(os.getenv('CMS_STORAGE_PORT', '6611')),
        download_port=int(os.getenv('CMS_DOWNLOAD_PORT', '6609')),
        username=username,
        password=password,
        session_id=None,
        session_expires_at=None,
        enabled=True,
        health_status='unknown',
        poll_interval_seconds=30,
        timezone=os.getenv('CMS_TIMEZONE', '+00:00')  # CMS timezone offset
    )


def get_standalone_cms_servers() -> List['CMSServer']:
    """
    Get CMS servers from config or environment variables (no database).
    Used in LOGS mode for standalone testing.
    
    Priority: config.json cms_servers -> environment variables
    
    Returns: List of CMSServer objects (may be empty)
    """
    # Try config first (supports multiple servers)
    servers = _get_config_cms_servers()
    if servers:
        logger.info(f"Using {len(servers)} CMS server(s) from config: {[s.host for s in servers]}")
        return servers
    
    # Try environment variables (single server fallback)
    server = _get_env_cms_server()
    if server:
        logger.info(f"Using CMS server from environment: {server.host}")
        return [server]
    
    return []


@dataclass
class CMSServer:
    """CMS Server configuration"""
    id: int
    name: str
    host: str
    port: int
    stream_port: int
    storage_port: int
    download_port: int
    username: str
    password: str
    session_id: Optional[str]
    session_expires_at: Optional[datetime]
    enabled: bool
    health_status: str
    poll_interval_seconds: int
    timezone: str = '+00:00'  # CMS server timezone offset (e.g., '+05:00' for PKT)
    
    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}"


class DatabaseClient:
    """Database client for reading CMS server configurations"""
    
    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None
        self._connected = False
        self._shutting_down = False
        self._connection_lock = asyncio.Lock()
        self._query_count = 0
        self._error_count = 0
        
    async def connect(self, retry: bool = True):
        """Connect to the database"""
        if self._shutting_down:
            raise asyncio.CancelledError("Shutdown in progress")
        
        async def _connect():
            if self._shutting_down or _is_shutdown_requested():
                raise asyncio.CancelledError("Shutdown requested")
            
            config = Config.load()['database']
            dsn = f"postgresql://{config['username']}:{config['password']}@{config['host']}:{config['port']}/{config['database']}"
            
            logger.info(f"Connecting to database at {config['host']}:{config['port']}...")

            async def _init_connection(conn):
                """Set session timezone to UTC (convention: backend UTC 0)."""
                await conn.execute("SET timezone TO 'UTC'")

            self.pool = await asyncpg.create_pool(
                dsn,
                min_size=1,
                max_size=5,
                command_timeout=30,
                max_inactive_connection_lifetime=300,
                init=_init_connection,
            )
            self._connected = True
            logger.info("✓ Connected to database")
        
        if retry:
            await retry_connection(
                _connect,
                max_retries=-1,
                initial_delay=1.0,
                max_delay=30.0,
                operation_name="Database connection"
            )
        else:
            await _connect()
    
    async def disconnect(self):
        """Disconnect from the database"""
        self._shutting_down = True
        async with self._connection_lock:
            if self.pool:
                try:
                    await asyncio.wait_for(self.pool.close(), timeout=5.0)
                except Exception as e:
                    logger.debug(f"Error closing pool: {e}")
                self.pool = None
            self._connected = False
            logger.debug("Disconnected from database")
    
    def is_ready(self) -> bool:
        """Check if database client is ready"""
        if self._shutting_down:
            return False
        return self.pool is not None and self._connected
    
    async def _ensure_connection(self) -> bool:
        """Ensure database connection is ready"""
        if self.is_ready():
            return True
        
        if self._shutting_down:
            return False
        
        async with self._connection_lock:
            if self.is_ready():
                return True
            
            try:
                await asyncio.wait_for(self.connect(retry=False), timeout=10.0)
                return True
            except Exception as e:
                logger.error(f"Failed to reconnect to database: {e}")
                return False
    
    async def get_enabled_cms_servers(self) -> List[CMSServer]:
        """Get all enabled CMS servers"""
        if not await self._ensure_connection():
            return []
        
        try:
            async with self.pool.acquire() as conn:
                rows = await conn.fetch("""
                    SELECT id, name, host, port, stream_port, storage_port, download_port,
                           username, password_encrypted as password, session_id, session_expires_at,
                           enabled, health_status, poll_interval_seconds,
                           COALESCE(timezone, '+00:00') as timezone
                    FROM cms_servers
                    WHERE enabled = TRUE
                    ORDER BY id
                """)
                
                servers = []
                for row in rows:
                    # Decrypt password if encrypted
                    password = row['password']
                    if password:
                        password = decrypt_password(password)
                    
                    servers.append(CMSServer(
                        id=row['id'],
                        name=row['name'],
                        host=row['host'],
                        port=row['port'],
                        stream_port=row['stream_port'],
                        storage_port=row['storage_port'],
                        download_port=row['download_port'],
                        username=row['username'],
                        password=password,
                        session_id=row['session_id'],
                        session_expires_at=row['session_expires_at'],
                        enabled=row['enabled'],
                        health_status=row['health_status'],
                        poll_interval_seconds=row['poll_interval_seconds'],
                        timezone=row['timezone']
                    ))
                
                self._query_count += 1
                
                # If no servers in database, try environment variables
                if not servers:
                    env_server = _get_env_cms_server()
                    if env_server:
                        logger.info(f"No CMS servers in database, using env config: {env_server.host}")
                        return [env_server]
                    logger.warning("No CMS servers configured in database or environment")
                    return []
                
                logger.debug(f"Loaded {len(servers)} enabled CMS servers")
                return servers
        except Exception as e:
            self._error_count += 1
            logger.error(f"Failed to get CMS servers: {e}")
            self._connected = False  # Mark for reconnect
            
            # Fallback to env vars on database error
            env_server = _get_env_cms_server()
            if env_server:
                logger.info(f"Database error, falling back to env config: {env_server.host}")
                return [env_server]
            return []
    
    async def update_cms_session(self, server_id: int, session_id: str, expires_at: datetime = None):
        """Update CMS server session ID. Binds naive UTC for TIMESTAMP WITHOUT TIME ZONE."""
        # Skip database update for env-based servers (id=0)
        if server_id == 0:
            logger.debug("Skipping session update for env-based server")
            return
        
        if not await self._ensure_connection():
            return
        
        # Naive UTC for asyncpg TIMESTAMP WITHOUT TIME ZONE
        expires_at_naive = None
        if expires_at is not None:
            if expires_at.tzinfo is None:
                expires_at_naive = expires_at
            else:
                expires_at_naive = expires_at.astimezone(timezone.utc).replace(tzinfo=None)
        try:
            async with self.pool.acquire() as conn:
                await conn.execute("""
                    UPDATE cms_servers
                    SET session_id = $1, session_expires_at = $2, updated_at = NOW()
                    WHERE id = $3
                """, session_id, expires_at_naive, server_id)
            self._query_count += 1
        except Exception as e:
            self._error_count += 1
            logger.error(f"Failed to update CMS session: {e}")
    
    async def update_cms_health(self, server_id: int, health_status: str, device_count: int = None):
        """Update CMS server health status"""
        # Skip database update for env-based servers (id=0)
        if server_id == 0:
            logger.debug(f"Skipping health update for env-based server: {health_status}")
            return
        
        if not await self._ensure_connection():
            return
        
        try:
            async with self.pool.acquire() as conn:
                if device_count is not None:
                    await conn.execute("""
                        UPDATE cms_servers
                        SET health_status = $1, device_count = $2, last_health_check = NOW(), updated_at = NOW()
                        WHERE id = $3
                    """, health_status, device_count, server_id)
                else:
                    await conn.execute("""
                        UPDATE cms_servers
                        SET health_status = $1, last_health_check = NOW(), updated_at = NOW()
                        WHERE id = $2
                    """, health_status, server_id)
            self._query_count += 1
        except Exception as e:
            self._error_count += 1
            logger.error(f"Failed to update CMS health: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get database client statistics"""
        return {
            "connected": self._connected,
            "query_count": self._query_count,
            "error_count": self._error_count
        }


# Global database client instance
_db_client_instance: Optional[DatabaseClient] = None


async def get_database_client() -> DatabaseClient:
    """Get or create global database client instance."""
    global _db_client_instance
    
    if _db_client_instance is None:
        _db_client_instance = DatabaseClient()
        await _db_client_instance.connect()
    
    return _db_client_instance


async def close_database_client():
    """Close global database client instance"""
    global _db_client_instance
    
    if _db_client_instance:
        await _db_client_instance.disconnect()
        _db_client_instance = None
