"""
AsyncQueue Implementation for Teltonika Gateway
Uses asyncio.Queue instead of threading.Queue for non-blocking async operations
"""
import asyncio
import logging
from typing import Optional, Any

logger = logging.getLogger(__name__)


class AsyncQueue:
    """
    Async queue with put() and get() semantics
    Replaces BlockingQueue for async operations
    
    Uses asyncio.Queue for non-blocking async operations
    """
    
    def __init__(self, capacity: int = 10000, name: str = "AsyncQueue"):
        """
        Initialize async queue
        
        Args:
            capacity: Maximum queue size (0 = unbounded)
            name: Queue name for logging
        """
        self.name = name
        if capacity <= 0:
            self.queue = asyncio.Queue()  # Unbounded
        else:
            self.queue = asyncio.Queue(maxsize=capacity)
        
        # Statistics
        self.total_put = 0
        self.total_get = 0
        self.total_dropped = 0
        
        logger.info(f"AsyncQueue '{name}' created with capacity={capacity}")
    
    async def put(self, item: Any, timeout: Optional[float] = None) -> bool:
        """
        Insert element into queue, non-blocking async operation
        
        Args:
            item: Item to add
            timeout: Optional timeout in seconds (None = wait forever)
            
        Returns:
            True if added, False if timeout or error
        """
        try:
            if timeout is None:
                await self.queue.put(item)
            else:
                await asyncio.wait_for(self.queue.put(item), timeout=timeout)
            
            self.total_put += 1
            logger.debug(f"Queue '{self.name}': put() successful, size={self.queue.qsize()}")
            return True
            
        except asyncio.TimeoutError:
            self.total_dropped += 1
            logger.warning(f"Queue '{self.name}': put() failed - queue full (timeout={timeout})")
            return False
        except Exception as e:
            logger.error(f"Queue '{self.name}': put() error - {e}")
            return False
    
    async def get(self, timeout: Optional[float] = None) -> Optional[Any]:
        """
        Retrieve and remove head of queue, non-blocking async operation
        
        Args:
            timeout: Optional timeout in seconds (None = wait forever)
            
        Returns:
            Element or None if timeout
        """
        try:
            if timeout is None:
                item = await self.queue.get()
            else:
                item = await asyncio.wait_for(self.queue.get(), timeout=timeout)
            
            self.total_get += 1
            logger.debug(f"Queue '{self.name}': get() successful, size={self.queue.qsize()}")
            return item
            
        except asyncio.TimeoutError:
            return None
        except Exception as e:
            logger.error(f"Queue '{self.name}': get() error - {e}")
            return None
    
    async def poll(self, timeout: float = 0) -> Optional[Any]:
        """
        Retrieve and remove head of queue, waiting up to timeout if necessary
        
        Args:
            timeout: Time to wait in seconds (0 = return immediately)
            
        Returns:
            Element or None if timeout
        """
        try:
            if timeout <= 0:
                try:
                    item = self.queue.get_nowait()
                    self.total_get += 1
                    return item
                except asyncio.QueueEmpty:
                    return None
            else:
                item = await asyncio.wait_for(self.queue.get(), timeout=timeout)
                self.total_get += 1
                return item
                
        except asyncio.TimeoutError:
            return None
        except asyncio.QueueEmpty:
            return None
        except Exception as e:
            logger.error(f"Queue '{self.name}': poll() error - {e}")
            return None
    
    def size(self) -> int:
        """Get current queue size"""
        return self.queue.qsize()
    
    def is_empty(self) -> bool:
        """Check if queue is empty"""
        return self.queue.empty()
    
    def is_full(self) -> bool:
        """Check if queue is full"""
        return self.queue.full()
    
    def remaining_capacity(self) -> int:
        """Get remaining capacity (maxsize - current size)"""
        if self.queue.maxsize == 0:
            return float('inf')
        return self.queue.maxsize - self.queue.qsize()
    
    async def clear(self):
        """Remove all elements from queue"""
        try:
            while not self.queue.empty():
                try:
                    self.queue.get_nowait()
                except asyncio.QueueEmpty:
                    break
            logger.info(f"Queue '{self.name}': cleared")
        except Exception as e:
            logger.error(f"Queue '{self.name}': clear() error - {e}")
    
    def get_stats(self) -> dict:
        """Get queue statistics"""
        return {
            'name': self.name,
            'current_size': self.size(),
            'max_size': self.queue.maxsize if self.queue.maxsize > 0 else 'unbounded',
            'total_put': self.total_put,
            'total_get': self.total_get,
            'total_dropped': self.total_dropped
        }


class AsyncTeltonikaDataQueues:
    """
    Global static async queues for Teltonika devices
    Replaces direct processing with queue-based pipeline
    """
    
    # Teltonika queues
    msgReceived: Optional[AsyncQueue] = None
    msgToParse: Optional[AsyncQueue] = None
    
    @classmethod
    async def initialize(cls):
        """Initialize Teltonika queues (called at startup)"""
        from config import ServerParams
        msg_received_capacity = ServerParams.get_int('async_queues.msg_received_capacity', 10000)
        msg_parse_capacity = ServerParams.get_int('async_queues.msg_parse_capacity', 10000)
        cls.msgReceived = AsyncQueue(capacity=msg_received_capacity, name="msgReceived")
        cls.msgToParse = AsyncQueue(capacity=msg_parse_capacity, name="msgToParse")
        
        logger.info("AsyncTeltonikaDataQueues initialized - Teltonika async queues created")
    
    @classmethod
    def get_initialized_queues(cls):
        """Get queues (initialize if needed) - for synchronous access"""
        if cls.msgReceived is None:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(cls.initialize())
            else:
                loop.run_until_complete(cls.initialize())
        return cls.msgReceived, cls.msgToParse
