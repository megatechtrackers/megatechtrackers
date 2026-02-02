"""
Database-based Unit IO Mapping Loader for Teltonika Gateway
Loads Unit IO mappings from database, cached by Unit IMEI
Implements Phase 1: Database change detection + TTL fallback
Implements Phase 2: LRU cache with size limit + inactive device cleanup
"""
import logging
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, List, Any
from dataclasses import dataclass
from collections import OrderedDict

from teltonika_parser.orm_init import init_orm
from teltonika_database.models import UnitIOMapping as UnitIOMappingModel
from teltonika_database.sqlalchemy_base import get_session
from sqlalchemy import select, func
from config import ServerParams

logger = logging.getLogger(__name__)


@dataclass
class UnitIOMapping:
    """Unit IO Mapping entry (compatible with CSV-based loader)."""
    imei: str
    io_id: int
    io_multiplier: float
    io_type: int  # 2=Digital, 3=Analog
    io_name: str
    value_name: str
    value: Optional[float]  # None for analog/NA
    target: int  # 0=column, 1=status, 2=both, 3=jsonb
    column_name: str
    start_time: str  # HH:MM:SS format
    end_time: str  # HH:MM:SS format
    is_alarm: bool
    is_sms: bool
    is_email: bool
    is_call: bool


@dataclass
class CacheMetadata:
    """Cache metadata for tracking cache state."""
    cached_at: datetime  # When mappings were loaded
    last_access: datetime  # Last time mappings were accessed
    max_updateddate: Optional[datetime]  # MAX(updateddate) from database at load time


class DatabaseUnitIOMappingLoader:
    """
    Load and manage Unit IO mappings from database, cached by IMEI.
    
    Phase 1: Database change detection + TTL fallback
    Phase 2: LRU cache with size limit + inactive device cleanup
    """
    
    def __init__(self):
        """Initialize database Unit IO mapping loader."""
        # LRU cache: OrderedDict maintains insertion order (most recent at end)
        self._mappings_cache: OrderedDict[str, Dict[int, List[UnitIOMapping]]] = OrderedDict()  # imei -> io_id -> list of mappings
        self._cache_metadata: Dict[str, CacheMetadata] = {}  # imei -> cache metadata
        self._orm_initialized = False
        self._cleanup_task: Optional[asyncio.Task] = None
        
        # Load configuration
        self._cache_ttl_minutes = ServerParams.get_int('unit_io_mapping.cache_ttl_minutes', 30)
        self._cache_max_size = ServerParams.get_int('unit_io_mapping.cache_max_size', 10000)
        self._inactive_cleanup_hours = ServerParams.get_int('unit_io_mapping.inactive_cleanup_hours', 24)
        self._check_db_changes = ServerParams.get_bool('unit_io_mapping.check_db_changes', True)
        self._cleanup_interval_minutes = ServerParams.get_int('unit_io_mapping.cleanup_interval_minutes', 60)
        
        logger.info(f"Parser Unit IO Mapping Cache Config: TTL={self._cache_ttl_minutes}min, MaxSize={self._cache_max_size}, "
                   f"InactiveCleanup={self._inactive_cleanup_hours}h, CheckDBChanges={self._check_db_changes}, "
                   f"CleanupInterval={self._cleanup_interval_minutes}min")
    
    async def _ensure_orm_initialized(self):
        """Ensure SQLAlchemy is initialized. Parser service uses read-only connection to unit_io_mapping table. Will retry if database unavailable."""
        if not self._orm_initialized:
            try:
                # Parser service always uses read-only connection (with retry - will keep trying until connected)
                await init_orm(retry=True)  # Retry indefinitely
                logger.debug("Using parser ORM (read-only) for Unit IO mapping loader")
                self._orm_initialized = True
                # Start cleanup task
                self._start_cleanup_task()
            except Exception as e:
                # Check if this is a connection error (pgbouncer cannot connect, etc.)
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
                    logger.debug(f"Database not available for Unit IO mapping loader (connection error): {e}. Will retry on next access.")
                else:
                    # Other errors - log with warning
                    logger.warning(f"Database not available for Unit IO mapping loader: {e}. Will retry on next access.")
                # Don't raise - allow parser to continue running, will retry on next access
                raise
    
    def _start_cleanup_task(self):
        """Start periodic cleanup task for inactive devices."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                if self._cleanup_task is None or self._cleanup_task.done():
                    self._cleanup_task = asyncio.create_task(self._periodic_cleanup())
                    logger.debug("Started Unit IO mapping cache cleanup task")
        except RuntimeError:
            # No event loop running, cleanup task will be started when ORM is initialized
            pass
    
    async def _periodic_cleanup(self):
        """Periodic cleanup task to remove inactive devices."""
        while True:
            try:
                await asyncio.sleep(self._cleanup_interval_minutes * 60)
                await self._cleanup_inactive_devices()
            except asyncio.CancelledError:
                logger.debug("Unit IO mapping cache cleanup task cancelled")
                break
            except Exception as e:
                logger.error(f"Error in Unit IO mapping cache cleanup task: {e}", exc_info=True)
    
    async def _cleanup_inactive_devices(self):
        """Remove mappings for devices inactive longer than configured hours."""
        if self._inactive_cleanup_hours <= 0:
            return
        
        cutoff_time = datetime.now(timezone.utc) - timedelta(hours=self._inactive_cleanup_hours)
        inactive_imeis = [
            imei for imei, metadata in self._cache_metadata.items()
            if metadata.last_access < cutoff_time
        ]
        
        if inactive_imeis:
            for imei in inactive_imeis:
                self._remove_from_cache(imei)
            logger.info(f"Cleaned up {len(inactive_imeis)} inactive device(s) from Unit IO mapping cache")
    
    def _remove_from_cache(self, imei: str):
        """Remove IMEI from cache (used by LRU eviction and cleanup)."""
        if imei in self._mappings_cache:
            del self._mappings_cache[imei]
        if imei in self._cache_metadata:
            del self._cache_metadata[imei]
    
    def _enforce_cache_size_limit(self):
        """Enforce cache size limit using LRU eviction."""
        while len(self._mappings_cache) > self._cache_max_size:
            # Remove least recently used (first item in OrderedDict)
            imei, _ = self._mappings_cache.popitem(last=False)
            if imei in self._cache_metadata:
                del self._cache_metadata[imei]
            logger.debug(f"Evicted IMEI {imei} from Unit IO mapping cache (LRU)")
    
    def _touch_cache_entry(self, imei: str):
        """Update last_access and move to end of OrderedDict (most recently used)."""
        if imei in self._mappings_cache:
            # Move to end (most recently used)
            self._mappings_cache.move_to_end(imei)
            # Update last_access
            if imei in self._cache_metadata:
                self._cache_metadata[imei].last_access = datetime.now(timezone.utc)
    
    async def _check_cache_stale(self, imei: str) -> bool:
        """
        Check if cache entry is stale (needs refresh).
        
        Returns:
            True if cache is stale and needs refresh, False otherwise
        """
        if imei not in self._cache_metadata:
            return True
        
        metadata = self._cache_metadata[imei]
        now = datetime.now(timezone.utc)
        
        # Check TTL fallback
        ttl_cutoff = metadata.cached_at + timedelta(minutes=self._cache_ttl_minutes)
        if now > ttl_cutoff:
            logger.debug(f"Unit IO mapping cache for IMEI {imei} expired (TTL: {self._cache_ttl_minutes}min)")
            return True
        
        # Check database changes (if enabled)
        if self._check_db_changes:
            try:
                await self._ensure_orm_initialized()
                imei_int = int(imei)
                
                # Query MAX(updateddate) for this IMEI using SQLAlchemy
                async with get_session() as session:
                    stmt = select(func.max(UnitIOMappingModel.updateddate)).where(UnitIOMappingModel.imei == imei_int)
                    result = await session.execute(stmt)
                    db_max_updated = result.scalar()
                
                if db_max_updated is None:
                    # No mappings in database, cache is invalid
                    logger.debug(f"No Unit IO mappings in database for IMEI {imei}, cache invalid")
                    return True
                
                # Compare with cached max_updateddate
                if metadata.max_updateddate is None or db_max_updated > metadata.max_updateddate:
                    logger.debug(f"Unit IO mapping cache for IMEI {imei} is stale (database updated: {db_max_updated} > cached: {metadata.max_updateddate})")
                    return True
            except Exception as e:
                logger.warning(f"Error checking database changes for Unit IMEI {imei}: {e}, using TTL fallback")
                # On error, fall back to TTL check (already done above)
        
        return False
    
    async def load_mappings_for_imei(self, imei: str) -> bool:
        """
        Load Unit IO mappings for a specific IMEI from database and cache them.
        Implements Phase 1: Checks if cache is stale before loading.
        Implements Phase 2: Enforces cache size limit (LRU eviction).
        
        Args:
            imei: Unit IMEI string (will be converted to int for database query)
            
        Returns:
            True if mappings were loaded successfully, False otherwise
        """
        try:
            await self._ensure_orm_initialized()
            
            # Convert IMEI to int for database query
            try:
                imei_int = int(imei)
            except (ValueError, TypeError):
                logger.warning(f"Invalid Unit IMEI format for Unit IO mapping query: {imei}")
                return False
            
            # Check if already cached and not stale
            if imei in self._mappings_cache:
                if not await self._check_cache_stale(imei):
                    # Cache is valid, update last_access
                    self._touch_cache_entry(imei)
                    logger.debug(f"Unit IO mappings for Unit IMEI {imei} already cached and fresh")
                    return True
                else:
                    # Cache is stale, remove it and reload
                    logger.debug(f"Unit IO mappings for Unit IMEI {imei} are stale, reloading")
                    self._remove_from_cache(imei)
            
            # Enforce cache size limit (LRU eviction)
            self._enforce_cache_size_limit()
            
            # Query database for Unit IO mappings for this Unit IMEI using SQLAlchemy Core
            table = UnitIOMappingModel.__table__
            async with get_session() as session:
                stmt = select(table).where(table.c.imei == imei_int)
                result = await session.execute(stmt)
                db_mappings_rows = result.fetchall()
                # Convert rows to dict-like objects for compatibility
                db_mappings = [dict(row._mapping) for row in db_mappings_rows]
                
                # Get MAX(updateddate) for cache metadata
                max_updateddate = None
                if db_mappings:
                    # Get max updateddate from the fetched records
                    max_updateddate = max((mapping.get('updateddate') for mapping in db_mappings if mapping.get('updateddate')), default=None)
                
                if not db_mappings:
                    logger.debug(f"No Unit IO mappings found in database for Unit IMEI {imei}")
                    # Cache empty dict to avoid repeated queries
                    self._mappings_cache[imei] = {}
                    self._cache_metadata[imei] = CacheMetadata(
                        cached_at=datetime.now(timezone.utc),
                        last_access=datetime.now(timezone.utc),
                        max_updateddate=max_updateddate
                    )
                    # Move to end (most recently used)
                    self._mappings_cache.move_to_end(imei)
                    return True
                
                # Convert database models to UnitIOMapping dataclass
                mappings_by_io: Dict[int, List[UnitIOMapping]] = {}
                
                for db_mapping in db_mappings:
                    # Convert time fields to string format
                    start_time = db_mapping.get('start_time')
                    end_time = db_mapping.get('end_time')
                    start_time_str = start_time.strftime('%H:%M:%S') if start_time else '00:00:00'
                    end_time_str = end_time.strftime('%H:%M:%S') if end_time else '23:59:59'
                    
                    # Parse column_name with pipe separator (like CSV loader)
                    column_name = db_mapping.get('column_name') or ''
                    column_names = [c.strip() for c in column_name.split('|')]
                    valid_column_names = [c for c in column_names if c and c != 'status' and c != '']
                    
                    # Get mapping fields
                    io_id = db_mapping.get('io_id')
                    target = db_mapping.get('target')
                    
                    # Create mapping for status events if target includes status (1 or 2)
                    if target in [1, 2]:
                        mapping = UnitIOMapping(
                            imei=imei,
                            io_id=io_id,
                            io_multiplier=db_mapping.get('io_multiplier', 1.0),
                            io_type=db_mapping.get('io_type', 0),
                            io_name=db_mapping.get('io_name', ''),
                            value_name=db_mapping.get('value_name') or '',
                            value=db_mapping.get('value'),
                            target=target,
                            column_name="",  # Status events don't need column_name
                            start_time=start_time_str,
                            end_time=end_time_str,
                            is_alarm=bool(db_mapping.get('is_alarm', 0)),
                            is_sms=bool(db_mapping.get('is_sms', 0)),
                            is_email=bool(db_mapping.get('is_email', 0)),
                            is_call=bool(db_mapping.get('is_call', 0))
                        )
                        
                        if io_id not in mappings_by_io:
                            mappings_by_io[io_id] = []
                        mappings_by_io[io_id].append(mapping)
                    
                    # Create mappings for column values (target = 0 or 2, and has valid column names)
                    if target in [0, 2] and valid_column_names:
                        for col_name in valid_column_names:
                            col_name = col_name.strip()
                            if not col_name:
                                continue
                            
                            mapping = UnitIOMapping(
                                imei=imei,
                                io_id=io_id,
                                io_multiplier=db_mapping.get('io_multiplier', 1.0),
                                io_type=db_mapping.get('io_type', 0),
                                io_name=db_mapping.get('io_name', ''),
                                value_name=db_mapping.get('value_name') or '',
                                value=db_mapping.get('value'),
                                target=target,
                                column_name=col_name,
                                start_time=start_time_str,
                                end_time=end_time_str,
                                is_alarm=bool(db_mapping.get('is_alarm', 0)),
                                is_sms=bool(db_mapping.get('is_sms', 0)),
                                is_email=bool(db_mapping.get('is_email', 0)),
                                is_call=bool(db_mapping.get('is_call', 0))
                            )
                            
                            if io_id not in mappings_by_io:
                                mappings_by_io[io_id] = []
                            mappings_by_io[io_id].append(mapping)
                    
                    # Handle JSONB (target = 3)
                    if target == 3 and column_name:
                        mapping = UnitIOMapping(
                            imei=imei,
                            io_id=io_id,
                            io_multiplier=db_mapping.get('io_multiplier', 1.0),
                            io_type=db_mapping.get('io_type', 0),
                            io_name=db_mapping.get('io_name', ''),
                            value_name=db_mapping.get('value_name') or '',
                            value=db_mapping.get('value'),
                            target=target,
                            column_name=column_name,
                            start_time=start_time_str,
                            end_time=end_time_str,
                            is_alarm=bool(db_mapping.get('is_alarm', 0)),
                            is_sms=bool(db_mapping.get('is_sms', 0)),
                            is_email=bool(db_mapping.get('is_email', 0)),
                            is_call=bool(db_mapping.get('is_call', 0))
                        )
                        
                        if io_id not in mappings_by_io:
                            mappings_by_io[io_id] = []
                        mappings_by_io[io_id].append(mapping)
                
                # Cache the mappings AFTER all mappings are processed
                self._mappings_cache[imei] = mappings_by_io
                self._cache_metadata[imei] = CacheMetadata(
                    cached_at=datetime.now(timezone.utc),
                    last_access=datetime.now(timezone.utc),
                    max_updateddate=max_updateddate
                )
                # Move to end (most recently used)
                self._mappings_cache.move_to_end(imei)
                
                total_mappings = sum(len(v) for v in mappings_by_io.values())
                logger.info(f"Loaded {total_mappings} Unit IO mappings from database for Unit IMEI {imei}")
                return True
                
        except Exception as e:
            # Check if this is a connection error (pgbouncer cannot connect, etc.)
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
                logger.debug(f"Error loading Unit IO mappings from database for Unit IMEI {imei} (connection error): {e}")
            else:
                # Other errors (query issues, etc.) - log with traceback
                logger.error(f"Error loading Unit IO mappings from database for Unit IMEI {imei}: {e}", exc_info=True)
            return False

    def get_mappings_for_io(self, io_id: int, imei: Optional[str] = None) -> List[UnitIOMapping]:
        """
        Get all mappings for a given Unit IO ID, optionally filtered by Unit IMEI.
        Updates last_access timestamp (LRU).
        
        Args:
            io_id: Unit IO ID to get mappings for
            imei: Optional Unit IMEI to filter by (must be in cache)
            
        Returns:
            List of UnitIOMapping objects
        """
        if not imei:
            # If no Unit IMEI provided, return empty list (database loader requires Unit IMEI)
            return []
        
        # Check if Unit IMEI is cached
        if imei not in self._mappings_cache:
            logger.warning(f"Unit IO mappings for Unit IMEI {imei} not loaded. Call load_mappings_for_imei() first.")
            return []
        
        # Update last_access (LRU)
        self._touch_cache_entry(imei)
        
        mappings_by_io = self._mappings_cache.get(imei, {})
        return mappings_by_io.get(io_id, [])
    
    def has_mappings_for_imei(self, imei: str) -> bool:
        """
        Check if Unit IMEI has any Unit IO mappings loaded.
        
        Args:
            imei: Unit IMEI string to check
            
        Returns:
            True if Unit IMEI has mappings, False if no mappings found or not loaded
        """
        if imei not in self._mappings_cache:
            return False
        
        mappings_by_io = self._mappings_cache.get(imei, {})
        # Check if there are any mappings (not empty dict)
        return len(mappings_by_io) > 0 and any(len(mappings) > 0 for mappings in mappings_by_io.values())
    
    def clear_cache(self, imei: Optional[str] = None):
        """
        Clear cached mappings.
        
        Args:
            imei: Optional Unit IMEI to clear. If None, clears all cached mappings.
        """
        if imei:
            self._remove_from_cache(imei)
            logger.debug(f"Cleared Unit IO mapping cache for Unit IMEI {imei}")
        else:
            self._mappings_cache.clear()
            self._cache_metadata.clear()
            logger.debug("Cleared all Unit IO mapping caches")
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics.
        
        Returns:
            Dictionary with cache statistics
        """
        now = datetime.now(timezone.utc)
        active_count = 0
        stale_count = 0
        
        for imei, metadata in self._cache_metadata.items():
            ttl_cutoff = metadata.cached_at + timedelta(minutes=self._cache_ttl_minutes)
            if now > ttl_cutoff:
                stale_count += 1
            else:
                active_count += 1
        
        return {
            'total_cached_imeis': len(self._mappings_cache),
            'active_count': active_count,
            'stale_count': stale_count,
            'cache_max_size': self._cache_max_size,
            'cache_ttl_minutes': self._cache_ttl_minutes,
            'inactive_cleanup_hours': self._inactive_cleanup_hours,
            'check_db_changes': self._check_db_changes
        }


# Global singleton instances
_global_db_loader: Optional[DatabaseUnitIOMappingLoader] = None
_global_csv_loader: Optional[Any] = None


async def get_unit_io_mapping_loader():
    """
    Get the appropriate Unit IO mapping loader based on data transfer mode.
    Returns database loader for RABBITMQ mode, CSV loader for LOGS mode.
    """
    global _global_db_loader, _global_csv_loader
    
    try:
        from config import Config
        data_mode = Config.get_data_transfer_mode().upper()  # Normalize to uppercase for robustness
        
        if data_mode == 'LOGS':
            # Use CSV loader for LOGS mode
            if _global_csv_loader is None:
                from teltonika_database.csv_unit_io_mapping_loader import CSVUnitIOMappingLoader
                import os
                # Try to find unit_io_mapping.csv in teltonika_database directory (same directory as this file)
                # Use absolute path to avoid path resolution issues
                db_dir = os.path.dirname(os.path.abspath(__file__))
                csv_path = os.path.join(db_dir, 'unit_io_mapping.csv')
                if not os.path.exists(csv_path):
                    # Fallback: try current working directory
                    csv_path = os.path.join(os.getcwd(), 'unit_io_mapping.csv')
                    if not os.path.exists(csv_path):
                        # Last fallback: just the filename (will be resolved by CSV loader)
                        csv_path = 'unit_io_mapping.csv'
                        logger.warning(f"unit_io_mapping.csv not found in {db_dir} or {os.getcwd()}, using fallback: {csv_path}")
                else:
                    logger.info(f"Found unit_io_mapping.csv at: {csv_path}")
                _global_csv_loader = CSVUnitIOMappingLoader(csv_path)
                logger.info("Using CSV Unit IO mapping loader (LOGS mode)")
            return _global_csv_loader
        else:
            # Use database loader for RABBITMQ mode
            if _global_db_loader is None:
                _global_db_loader = DatabaseUnitIOMappingLoader()
                logger.info("Using parser database Unit IO mapping loader (read-only)")
            return _global_db_loader
    except Exception as e:
        logger.error(f"Error determining Unit IO mapping loader: {e}, defaulting to database loader", exc_info=True)
        if _global_db_loader is None:
            _global_db_loader = DatabaseUnitIOMappingLoader()
        return _global_db_loader
