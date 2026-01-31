"""
Async Synchronized Buffer for Teltonika Gateway
Uses asyncio.Event and asyncio.Lock for async operations
"""
import asyncio
import logging
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)


class AsyncSynchronizedBuffer:
    """
    Async-safe buffer with asyncio.Event for wait/notify pattern
    Replaces SynchronizedBuffer for async operations
    
    Uses asyncio.Lock instead of threading.Lock
    Uses asyncio.Event instead of threading.Condition
    """
    
    def __init__(self):
        """Initialize async synchronized buffer"""
        # Data storage: table_id -> list of rows
        self.mapTableIdToDataList: Dict[str, List[Dict[str, Any]]] = {}
        
        # Async lock for synchronization
        self._lock = asyncio.Lock()
        
        # Event for wait/notify pattern
        self._data_event = asyncio.Event()
        
        # Statistics
        self.total_added = 0
        self.total_retrieved = 0
        self.total_batches = 0
        
        logger.info("AsyncSynchronizedBuffer initialized")
    
    async def add_data(self, row: Dict[str, Any]) -> bool:
        """
        Add data row to buffer (async)
        
        Args:
            row: Dictionary with 'imei' key (Teltonika uses IMEI)
            
        Returns:
            True if added successfully
        """
        try:
            # Extract IMEI (Teltonika uses IMEI instead of unit_id)
            imei = row.get('imei')
            
            if not imei or len(str(imei)) == 0:
                logger.warning("Row missing imei, cannot add to buffer")
                return False
            
            # Use table ID "00" (like C# version)
            table_id = "00"
            
            # Acquire lock (async)
            async with self._lock:
                # Get or create list for this table
                if table_id not in self.mapTableIdToDataList:
                    self.mapTableIdToDataList[table_id] = []
                    logger.debug(f"Created new list for table '{table_id}'")
                
                # Add row to list
                self.mapTableIdToDataList[table_id].append(row)
                self.total_added += 1
                
                logger.debug(f"Added data in AsyncDBBuffer, row: imei={imei}, table='{table_id}', count={len(self.mapTableIdToDataList[table_id])}")
                
                # Notify waiting tasks (set event)
                self._data_event.set()
            
            return True
            
        except Exception as e:
            logger.error(f"Exception in add_data (async): {e}", exc_info=True)
            return False
    
    async def get_data(self) -> Dict[str, List[Dict[str, Any]]]:
        """
        Retrieve all buffered data and replace with empty map (async)
        
        Returns:
            Dictionary mapping table_id -> list of rows
        """
        async with self._lock:
            # Copy current data
            data_copy = dict(self.mapTableIdToDataList)
            
            # Count total records
            total_records = sum(len(records) for records in data_copy.values())
            
            if total_records > 0:
                logger.debug(f"Retrieved the data from AsyncDBBuffer. Total records: {total_records}")
                self.total_retrieved += total_records
                self.total_batches += 1
                
                # Replace with new empty map
                self.mapTableIdToDataList = {}
                
                # Clear event (no more data)
                self._data_event.clear()
            
            return data_copy
    
    async def wait_for_data(self, timeout: Optional[float] = None):
        """
        Wait until data is available (async)
        
        Args:
            timeout: Optional timeout in seconds (None = wait forever)
        """
        try:
            if timeout is None:
                await self._data_event.wait()
            else:
                await asyncio.wait_for(self._data_event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            pass  # Timeout is expected
    
    async def get_size(self) -> int:
        """Get total number of buffered records (async)"""
        async with self._lock:
            return sum(len(records) for records in self.mapTableIdToDataList.values())
    
    async def is_empty(self) -> bool:
        """Check if buffer is empty (async)"""
        return await self.get_size() == 0
    
    async def get_stats(self) -> Dict[str, Any]:
        """Get buffer statistics (async)"""
        async with self._lock:
            current_size = sum(len(records) for records in self.mapTableIdToDataList.values())
            table_count = len(self.mapTableIdToDataList)
            
            return {
                'current_size': current_size,
                'table_count': table_count,
                'total_added': self.total_added,
                'total_retrieved': self.total_retrieved,
                'total_batches': self.total_batches
            }


# Global async instance
async_synchronized_buffer = AsyncSynchronizedBuffer()
