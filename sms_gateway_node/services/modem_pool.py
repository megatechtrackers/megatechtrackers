"""
Modem Pool Service
Manages RUT200 modem selection and quota tracking
Uses shared alarms_sms_modems table

Supports hybrid modem selection:
1. Device-specific routing (unit.modem_id)
2. Service-level pools (allowed_services)
3. Fallback to any available modem
"""
import asyncio
import logging
import time
from contextlib import asynccontextmanager
from typing import Optional, Dict, List, Literal
from datetime import datetime, date, timezone
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.exc import DBAPIError, OperationalError, InterfaceError
from sqlalchemy import text

from ..config import Config
from ..clients.rut200_client import RUT200Client, ModemConfig
from ..utils.encryption import decrypt, is_encrypted

logger = logging.getLogger(__name__)

# Service types that can use modems
SmsServiceType = Literal['alarms', 'commands', 'otp', 'marketing']

# Connection error types
CONNECTION_ERRORS = (
    ConnectionError, ConnectionRefusedError, ConnectionResetError,
    BrokenPipeError, TimeoutError, asyncio.TimeoutError, OSError,
)


def is_connection_error(error: Exception) -> bool:
    """Check if an exception indicates a connection problem"""
    if isinstance(error, CONNECTION_ERRORS):
        return True
    if isinstance(error, (DBAPIError, OperationalError, InterfaceError)):
        error_str = str(error).lower()
        keywords = ['connection refused', 'connection reset', 'timeout', 'connect call failed']
        return any(kw in error_str for kw in keywords)
    return False


class ModemPool:
    """
    Manages pool of RUT200 SMS modems with resilient database connections.
    
    Features:
    - Load balancing based on quota remaining
    - Health status tracking
    - Daily usage tracking
    - Automatic database reconnection
    - Shared with Alarm Service
    """
    
    _instance: Optional['ModemPool'] = None
    
    def __init__(self):
        """Initialize modem pool."""
        self._clients: Dict[int, RUT200Client] = {}
        self._engine = None
        self._session_maker = None
        self._initialized = False
        self._reconnect_lock = asyncio.Lock()
        self._consecutive_failures = 0
        self._last_reconnect = 0
        
        logger.info("ModemPool initialized")
    
    @classmethod
    def get_instance(cls) -> 'ModemPool':
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = ModemPool()
        return cls._instance
    
    def _create_engine(self):
        """Create a new database engine"""
        db_config = Config.get_database_config()
        host = db_config.get('host', 'localhost')
        port = db_config.get('port', 5432)
        name = db_config.get('name', 'megatechtrackers')
        user = db_config.get('user', 'postgres')
        password = db_config.get('password', '')
        
        db_url = f"postgresql+asyncpg://{user}:{password}@{host}:{port}/{name}"
        
        return create_async_engine(
            db_url,
            echo=False,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
            pool_recycle=1800,
            pool_timeout=30,
            connect_args={
                "server_settings": {"timezone": "UTC"},
                "command_timeout": 30,
            }
        )
    
    async def _init_db(self):
        """Initialize database connection with retry."""
        if self._engine is not None:
            return
        
        max_retries = 10
        for attempt in range(max_retries):
            try:
                self._engine = self._create_engine()
                self._session_maker = async_sessionmaker(self._engine, expire_on_commit=False)
                
                # Test connection
                async with self._engine.connect() as conn:
                    await conn.execute(text("SELECT 1"))
                
                self._initialized = True
                db_config = Config.get_database_config()
                logger.info(f"Database connection initialized: {db_config['host']}:{db_config['port']}/{db_config['name']}")
                return
            except Exception as e:
                if attempt < max_retries - 1:
                    delay = min(2 ** attempt, 30)
                    logger.warning(f"Database init failed (attempt {attempt + 1}): {e}. Retrying in {delay}s...")
                    await asyncio.sleep(delay)
                else:
                    logger.error(f"Database init failed after {max_retries} attempts: {e}")
                    raise
    
    async def _reconnect_db(self):
        """Reconnect database engine"""
        async with self._reconnect_lock:
            now = time.time()
            if now - self._last_reconnect < 5.0:
                return
            
            self._last_reconnect = now
            logger.warning("Reconnecting database...")
            
            try:
                if self._engine:
                    await self._engine.dispose()
                
                self._engine = self._create_engine()
                self._session_maker = async_sessionmaker(self._engine, expire_on_commit=False)
                
                async with self._engine.connect() as conn:
                    await conn.execute(text("SELECT 1"))
                
                self._consecutive_failures = 0
                logger.info("Database reconnected successfully")
            except Exception as e:
                logger.error(f"Database reconnection failed: {e}")
    
    def _record_failure(self):
        """Record a database failure"""
        self._consecutive_failures += 1
        if self._consecutive_failures >= 3:
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.create_task(self._reconnect_db())
            except RuntimeError:
                pass
    
    def _record_success(self):
        """Record a successful database operation"""
        self._consecutive_failures = 0
    
    async def get_session(self) -> AsyncSession:
        """Get database session."""
        await self._init_db()
        return self._session_maker()
    
    @asynccontextmanager
    async def get_resilient_session(self, max_retries: int = 3):
        """Get database session with automatic retry on connection errors"""
        await self._init_db()
        
        last_error = None
        for attempt in range(max_retries + 1):
            try:
                async with self._session_maker() as session:
                    yield session
                    self._record_success()
                    return
            except Exception as e:
                last_error = e
                if is_connection_error(e):
                    self._record_failure()
                    if attempt < max_retries:
                        delay = 1.0 * (2 ** attempt)
                        logger.warning(f"DB connection error (attempt {attempt + 1}): {e}")
                        await asyncio.sleep(delay)
                        continue
                raise
        
        if last_error:
            raise last_error
    
    async def get_device_modem_id(self, imei: str) -> Optional[int]:
        """
        Get device-specific modem ID from unit table.
        
        Args:
            imei: Device IMEI
            
        Returns:
            Modem ID if set, None otherwise
        """
        try:
            async with await self.get_session() as session:
                result = await session.execute(text("""
                    SELECT modem_id FROM unit WHERE imei = :imei LIMIT 1
                """), {"imei": imei})
                row = result.fetchone()
                
                if row and row[0]:
                    return row[0]
                return None
        except Exception as e:
            logger.warning(f"Failed to get device modem_id for IMEI {imei}: {e}")
            return None

    async def is_modem_available(self, modem_id: int) -> bool:
        """
        Check if a specific modem exists and is available.
        Allows: healthy, unknown, degraded (might still work)
        Blocks: unhealthy, quota_exhausted
        """
        try:
            async with await self.get_session() as session:
                result = await session.execute(text("""
                    SELECT id FROM alarms_sms_modems
                    WHERE id = :id
                      AND enabled = true
                      AND health_status NOT IN ('unhealthy', 'quota_exhausted')
                      AND sms_sent_count < sms_limit
                """), {"id": modem_id})
                return result.fetchone() is not None
        except Exception as e:
            logger.warning(f"Error checking modem availability: {e}")
            return False

    async def select_best_modem(
        self, 
        service: SmsServiceType = 'commands',
        device_modem_id: Optional[int] = None,
        imei: Optional[str] = None
    ) -> Optional[ModemConfig]:
        """
        Select the best available modem for sending SMS using hybrid selection.
        
        Selection priority:
        1. Device has modem_id AND modem exists → Use that modem
        2. Device modem_id not found (invalid) → Use service pool
        3. Device has no modem_id → Use service pool
        4. Service pool exhausted → Fallback to any modem
        
        Args:
            service: Service type ('commands', 'alarms', 'otp', 'marketing')
            device_modem_id: Device-specific modem ID (from unit.modem_id)
            imei: Device IMEI (to lookup modem_id if not provided)
        
        Returns:
            ModemConfig if available, None otherwise
        """
        # If IMEI provided but no device_modem_id, look it up
        if not device_modem_id and imei:
            device_modem_id = await self.get_device_modem_id(imei)
        
        # TIER 1: Try device-specific modem
        if device_modem_id:
            if await self.is_modem_available(device_modem_id):
                config = await self._get_modem_config(device_modem_id)
                if config:
                    logger.info(f"Using device-specific modem {config.name} for IMEI {imei}")
                    return config
            else:
                logger.debug(f"Device modem_id {device_modem_id} not found or unavailable, using service pool")
        
        # TIER 2: Try service-specific pool
        config = await self._select_from_service_pool(service)
        if config:
            logger.debug(f"Using service pool modem {config.name} for {service}")
            return config
        
        # TIER 3: Fallback to any available modem
        logger.warning(f"Service pool ({service}) exhausted, trying fallback")
        config = await self._select_any_modem()
        if config:
            logger.info(f"Using FALLBACK modem {config.name} for {service}")
            return config
        
        logger.error(f"No available modems for {service}")
        return None

    async def _get_modem_config(self, modem_id: int) -> Optional[ModemConfig]:
        """Get modem config by ID."""
        try:
            async with await self.get_session() as session:
                result = await session.execute(text("""
                    SELECT id, name, host, username, password_encrypted, 
                           cert_fingerprint, modem_id
                    FROM alarms_sms_modems
                    WHERE id = :id AND enabled = true
                """), {"id": modem_id})
                row = result.fetchone()
                
                if not row:
                    return None
                
                password = row[4]
                if password and is_encrypted(password):
                    password = decrypt(password)
                
                return ModemConfig(
                    id=row[0],
                    name=row[1],
                    host=row[2],
                    username=row[3],
                    password=password,
                    cert_fingerprint=row[5],
                    modem_id=row[6] or "1-1"
                )
        except Exception as e:
            logger.error(f"Error getting modem config: {e}")
            return None

    async def _select_from_service_pool(self, service: SmsServiceType) -> Optional[ModemConfig]:
        """
        Select best modem from service-specific pool.
        Allows: healthy, unknown, degraded (might still work)
        Blocks: unhealthy, quota_exhausted
        """
        try:
            async with await self.get_session() as session:
                result = await session.execute(text("""
                    SELECT id, name, host, username, password_encrypted, 
                           cert_fingerprint, modem_id, sms_sent_count, sms_limit
                    FROM alarms_sms_modems
                    WHERE enabled = true
                      AND health_status NOT IN ('unhealthy', 'quota_exhausted')
                      AND sms_sent_count < sms_limit
                      AND :service = ANY(COALESCE(allowed_services, ARRAY['alarms', 'commands']))
                    ORDER BY 
                        CASE health_status WHEN 'healthy' THEN 0 WHEN 'unknown' THEN 1 ELSE 2 END,
                        (sms_limit - sms_sent_count) DESC,
                        priority DESC
                    LIMIT 1
                """), {"service": service})
                row = result.fetchone()
                
                if not row:
                    return None
                
                password = row[4]
                if password and is_encrypted(password):
                    password = decrypt(password)
                
                config = ModemConfig(
                    id=row[0],
                    name=row[1],
                    host=row[2],
                    username=row[3],
                    password=password,
                    cert_fingerprint=row[5],
                    modem_id=row[6] or "1-1"
                )
                
                remaining = row[8] - row[7]
                logger.debug(f"Selected modem {config.name} from {service} pool: quota_remaining={remaining}")
                return config
        
        except Exception as e:
            logger.error(f"Error selecting from service pool: {e}")
            return None

    async def _select_any_modem(self) -> Optional[ModemConfig]:
        """
        Select any available modem (fallback).
        Allows: healthy, unknown, degraded (might still work)
        Blocks: unhealthy, quota_exhausted
        """
        try:
            async with await self.get_session() as session:
                result = await session.execute(text("""
                    SELECT id, name, host, username, password_encrypted, 
                           cert_fingerprint, modem_id, sms_sent_count, sms_limit
                    FROM alarms_sms_modems
                    WHERE enabled = true
                      AND health_status NOT IN ('unhealthy', 'quota_exhausted')
                      AND sms_sent_count < sms_limit
                    ORDER BY 
                        CASE health_status WHEN 'healthy' THEN 0 WHEN 'unknown' THEN 1 ELSE 2 END,
                        (sms_limit - sms_sent_count) DESC,
                        priority DESC
                    LIMIT 1
                """))
                row = result.fetchone()
                
                if not row:
                    return None
                
                password = row[4]
                if password and is_encrypted(password):
                    password = decrypt(password)
                
                return ModemConfig(
                    id=row[0],
                    name=row[1],
                    host=row[2],
                    username=row[3],
                    password=password,
                    cert_fingerprint=row[5],
                    modem_id=row[6] or "1-1"
                )
        
        except Exception as e:
            logger.error(f"Error selecting fallback modem: {e}")
            return None
    
    async def get_client(self, modem_id: int) -> Optional[RUT200Client]:
        """
        Get or create RUT200 client for modem.
        
        Args:
            modem_id: Database ID of modem
            
        Returns:
            RUT200Client instance
        """
        if modem_id in self._clients:
            return self._clients[modem_id]
        
        # Load config and create client
        try:
            async with await self.get_session() as session:
                result = await session.execute(text("""
                    SELECT id, name, host, username, password_encrypted,
                           cert_fingerprint, modem_id
                    FROM alarms_sms_modems
                    WHERE id = :id
                """), {"id": modem_id})
                row = result.fetchone()
                
                if not row:
                    return None
                
                # Decrypt password if encrypted
                password = row[4]
                if password and is_encrypted(password):
                    password = decrypt(password)
                
                config = ModemConfig(
                    id=row[0],
                    name=row[1],
                    host=row[2],
                    username=row[3],
                    password=password,
                    cert_fingerprint=row[5],
                    modem_id=row[6] or "1-1"
                )
                
                client = RUT200Client(config)
                self._clients[modem_id] = client
                return client
        
        except Exception as e:
            logger.error(f"Error creating client for modem {modem_id}: {e}")
            return None
    
    async def increment_quota(self, modem_id: int, sms_count: int = 1):
        """
        Increment SMS sent count for modem.
        
        Args:
            modem_id: Database ID of modem
            sms_count: Number of SMS parts sent
        """
        try:
            async with await self.get_session() as session:
                # Update total count
                await session.execute(text("""
                    UPDATE alarms_sms_modems
                    SET sms_sent_count = sms_sent_count + :count,
                        updated_at = NOW()
                    WHERE id = :id
                """), {"id": modem_id, "count": sms_count})
                
                # Update daily usage (UTC midnight for consistency); naive UTC for TIMESTAMP binding
                today_utc = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)
                await session.execute(text("""
                    INSERT INTO alarms_sms_modem_usage (modem_id, date, sms_count)
                    VALUES (:modem_id, :date, :count)
                    ON CONFLICT (modem_id, date)
                    DO UPDATE SET sms_count = alarms_sms_modem_usage.sms_count + :count
                """), {"modem_id": modem_id, "date": today_utc, "count": sms_count})
                
                await session.commit()
                
                logger.debug(f"Incremented quota for modem {modem_id} by {sms_count}")
        
        except Exception as e:
            logger.error(f"Error incrementing quota: {e}")
    
    async def update_health_status(self, modem_id: int, status: str):
        """
        Update modem health status.
        
        Args:
            modem_id: Database ID of modem
            status: Health status (healthy, degraded, unhealthy, unknown, quota_exhausted)
        """
        try:
            async with await self.get_session() as session:
                await session.execute(text("""
                    UPDATE alarms_sms_modems
                    SET health_status = :status,
                        last_health_check = NOW(),
                        updated_at = NOW()
                    WHERE id = :id
                """), {"id": modem_id, "status": status})
                await session.commit()
        
        except Exception as e:
            logger.error(f"Error updating health status: {e}")
    
    async def close(self):
        """Close all connections."""
        for client in self._clients.values():
            await client.close()
        self._clients.clear()
        
        if self._engine:
            await self._engine.dispose()
            self._engine = None
