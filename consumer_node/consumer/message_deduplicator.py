"""
Message Deduplication for RabbitMQ Consumers
Prevents processing duplicate messages using message ID tracking
Hybrid approach: In-memory cache (L1) + PostgreSQL (L2) for persistence
"""
import asyncio
import logging
import socket
from datetime import datetime, timedelta
from typing import Optional, Set
from collections import OrderedDict

from sqlalchemy import select, delete, text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import insert as pg_insert

from .sqlalchemy_base import get_session, Base

logger = logging.getLogger(__name__)


class ProcessedMessage(Base):
    """
    Database table for tracking processed message IDs.
    Provides persistence across restarts and shared state across consumer instances.
    """
    __tablename__ = 'processed_message_ids'
    
    message_id: Mapped[str] = mapped_column(primary_key=True)
    processed_at: Mapped[datetime] = mapped_column(server_default=text('CURRENT_TIMESTAMP'))
    
    def __repr__(self):
        return f"<ProcessedMessage(message_id='{self.message_id}', processed_at='{self.processed_at}')>"


class MessageDeduplicator:
    """
    In-memory message deduplication cache with TTL.
    Tracks processed message IDs to prevent duplicate processing.
    """
    
    def __init__(self, ttl_seconds: int = 3600, max_size: int = 100000, use_database: bool = True):
        """
        Initialize message deduplicator.
        
        Args:
            ttl_seconds: Time-to-live for message IDs (default: 1 hour)
            max_size: Maximum number of message IDs to track in memory (default: 100k)
            use_database: Whether to use PostgreSQL for persistence (default: True)
        """
        self.ttl_seconds = ttl_seconds
        self.max_size = max_size
        self.use_database = use_database
        self._processed: OrderedDict[str, datetime] = OrderedDict()  # L1 cache (in-memory)
        self._lock = asyncio.Lock()
        self._hits = 0
        self._misses = 0
        self._db_hits = 0  # Database cache hits
        self._db_misses = 0  # Database cache misses
        self._cleanup_task: Optional[asyncio.Task] = None
        
    async def check_duplicate(self, message_id: str) -> bool:
        """
        Check if message ID has been processed before (READ-ONLY).
        Does NOT mark message as processed - use mark_processed() after successful DB write.
        Uses hybrid approach: in-memory cache (L1) + database (L2).
        
        Args:
            message_id: Unique message identifier
            
        Returns:
            True if message is duplicate, False otherwise
        """
        async with self._lock:
            # Step 1: Check in-memory cache (L1) - fast path
            if message_id in self._processed:
                self._hits += 1
                logger.debug(f"Duplicate message detected (L1 cache): {message_id}")
                return True
            
            # Step 2: Check database (L2) - persistent storage
            if self.use_database:
                try:
                    async with get_session() as session:
                        # Check if message_id exists in database
                        stmt = select(ProcessedMessage).where(
                            ProcessedMessage.message_id == message_id
                        )
                        result = await session.execute(stmt)
                        existing = result.scalar_one_or_none()
                        
                        if existing:
                            # Found in database - add to L1 cache and return duplicate
                            self._processed[message_id] = datetime.now()
                            self._db_hits += 1
                            self._hits += 1
                            logger.debug(f"Duplicate message detected (L2 database): {message_id}")
                            
                            # Enforce max size
                            if len(self._processed) > self.max_size:
                                self._processed.popitem(last=False)
                            
                            return True
                        else:
                            self._db_misses += 1
                except (ConnectionError, OSError, TimeoutError, asyncio.TimeoutError) as e:
                    # Connection errors are expected - don't log full traceback
                    import socket
                    if isinstance(e, (socket.gaierror, socket.herror)):
                        logger.debug(f"Database check failed (DNS/host resolution): {e}. Falling back to in-memory cache.")
                    else:
                        logger.debug(f"Database check failed (connection error): {e}. Falling back to in-memory cache.")
                    # Continue with in-memory cache only
                except Exception as e:
                    # Other database errors - log with traceback
                    logger.warning(f"Database check failed for message_id {message_id}: {e}. Falling back to in-memory cache.", exc_info=True)
                    # Continue with in-memory cache only
            
            # Not a duplicate (yet) - don't mark as processed until DB write succeeds
            self._misses += 1
            return False
    
    async def is_duplicate(self, message_id: str) -> bool:
        """
        DEPRECATED: Use check_duplicate() instead.
        This method marks message as processed immediately, which is unsafe.
        Kept for backward compatibility.
        """
        return await self.check_duplicate(message_id)
    
    async def _add_to_database(self, message_id: str):
        """Add message_id to database (async background task)"""
        try:
            async with get_session() as session:
                table = ProcessedMessage.__table__
                stmt = pg_insert(table).values(
                    message_id=message_id,
                    processed_at=datetime.now()
                )
                # Use ON CONFLICT DO NOTHING to handle race conditions
                stmt = stmt.on_conflict_do_nothing(index_elements=['message_id'])
                result = await session.execute(stmt)
                await session.commit()
                logger.debug(f"Successfully added message_id {message_id} to database")
        except (ConnectionError, OSError, TimeoutError, asyncio.TimeoutError) as e:
            # Connection errors are expected - don't log full traceback
            if isinstance(e, (socket.gaierror, socket.herror)):
                logger.debug(f"Failed to add message_id {message_id} to database (DNS/host resolution): {e}")
            else:
                logger.debug(f"Failed to add message_id {message_id} to database (connection error): {e}")
            raise  # Re-raise so caller knows it failed
        except Exception as e:
            # Other database errors - log with traceback
            logger.error(f"✗ Failed to add message_id {message_id} to database: {e}", exc_info=True)
            raise  # Re-raise so caller knows it failed
    
    async def mark_processed(self, message_id: str):
        """
        Mark a message as processed AFTER successful database write.
        This should be called only after the handler successfully writes to database.
        
        Args:
            message_id: Unique message identifier
        """
        async with self._lock:
            # Add to in-memory cache
            self._processed[message_id] = datetime.now()
            
            # Enforce max size
            if len(self._processed) > self.max_size:
                self._processed.popitem(last=False)
        
        # Add to database (await to ensure it completes)
        if self.use_database:
            try:
                await self._add_to_database(message_id)
            except (ConnectionError, OSError, TimeoutError, asyncio.TimeoutError) as e:
                # Connection errors are expected - don't log full traceback
                if isinstance(e, (socket.gaierror, socket.herror)):
                    logger.debug(f"Failed to add message_id {message_id} to database (DNS/host resolution): {e}")
                else:
                    logger.debug(f"Failed to add message_id {message_id} to database (connection error): {e}")
                # Remove from cache if database write fails
                async with self._lock:
                    self._processed.pop(message_id, None)
                raise  # Re-raise to indicate failure
            except Exception as e:
                # Other database errors - log with traceback
                logger.error(f"Failed to add message_id {message_id} to database: {e}", exc_info=True)
                # Remove from cache if database write fails
                async with self._lock:
                    self._processed.pop(message_id, None)
                raise  # Re-raise to indicate failure
    
    async def _cleanup_expired(self):
        """Remove expired message IDs from in-memory cache"""
        now = datetime.now()
        expired_keys = [
            msg_id for msg_id, timestamp in self._processed.items()
            if (now - timestamp).total_seconds() > self.ttl_seconds
        ]
        
        for key in expired_keys:
            self._processed.pop(key, None)
        
        if expired_keys:
            logger.debug(f"Cleaned up {len(expired_keys)} expired message IDs from L1 cache")
    
    async def cleanup_database(self):
        """Remove expired message IDs from database"""
        if not self.use_database:
            return
        
        try:
            async with get_session() as session:
                cutoff_time = datetime.now() - timedelta(seconds=self.ttl_seconds)
                stmt = delete(ProcessedMessage).where(
                    ProcessedMessage.processed_at < cutoff_time
                )
                result = await session.execute(stmt)
                await session.commit()
                deleted_count = result.rowcount
                
                if deleted_count > 0:
                    logger.info(f"Cleaned up {deleted_count} expired message IDs from database")
        except Exception as e:
            logger.warning(f"Failed to cleanup database: {e}")
    
    async def start_cleanup_task(self, interval_seconds: int = 300):
        """
        Start background task to periodically cleanup expired entries from database.
        
        Args:
            interval_seconds: Cleanup interval in seconds (default: 5 minutes)
        """
        if not self.use_database:
            return
        
        async def cleanup_loop():
            while True:
                try:
                    await asyncio.sleep(interval_seconds)
                    await self.cleanup_database()
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Error in cleanup task: {e}", exc_info=True)
        
        self._cleanup_task = asyncio.create_task(cleanup_loop())
        logger.info(f"Started database cleanup task (interval: {interval_seconds}s)")
    
    async def stop_cleanup_task(self):
        """Stop the background cleanup task"""
        if self._cleanup_task and not self._cleanup_task.done():
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            logger.info("Stopped database cleanup task")
    
    def get_stats(self) -> dict:
        """Get deduplication statistics"""
        total = self._hits + self._misses
        hit_rate = (self._hits / total * 100) if total > 0 else 0.0
        
        stats = {
            'l1_cache_size': len(self._processed),
            'hits': self._hits,
            'misses': self._misses,
            'hit_rate': round(hit_rate, 2),
            'duplicates_prevented': self._hits,
            'use_database': self.use_database
        }
        
        if self.use_database:
            db_total = self._db_hits + self._db_misses
            db_hit_rate = (self._db_hits / db_total * 100) if db_total > 0 else 0.0
            stats.update({
                'db_hits': self._db_hits,
                'db_misses': self._db_misses,
                'db_hit_rate': round(db_hit_rate, 2)
            })
        
        return stats
    
    async def clear(self, clear_database: bool = False):
        """
        Clear all cached message IDs.
        
        Args:
            clear_database: If True, also clear database table (default: False)
        """
        async with self._lock:
            self._processed.clear()
            self._hits = 0
            self._misses = 0
            self._db_hits = 0
            self._db_misses = 0
            logger.info("Message deduplication L1 cache cleared")
        
        if clear_database and self.use_database:
            try:
                async with get_session() as session:
                    stmt = delete(ProcessedMessage)
                    await session.execute(stmt)
                    await session.commit()
                    logger.info("Message deduplication database table cleared")
            except Exception as e:
                logger.error(f"Failed to clear database: {e}", exc_info=True)


# Global deduplicator instance (shared across all consumers)
_deduplicator: Optional[MessageDeduplicator] = None


def get_deduplicator() -> MessageDeduplicator:
    """Get or create global message deduplicator instance"""
    global _deduplicator
    if _deduplicator is None:
        # TTL: 1 hour (messages older than 1 hour can be reprocessed safely)
        # Max size: 100k message IDs (covers ~1 hour of high-volume traffic)
        _deduplicator = MessageDeduplicator(ttl_seconds=3600, max_size=100000)
    return _deduplicator
