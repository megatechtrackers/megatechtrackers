"""
Async IPTable - Device and StreamWriter management for Teltonika devices
Uses IMEI as device identifier (Teltonika-specific)
"""
import asyncio
import logging
import time
from typing import Dict, Optional, Tuple, Any
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class AsyncDeviceInfo:
    """Information about a connected Teltonika device in async architecture"""
    writer: Any  # asyncio.StreamReader
    ip_address: str
    port: int
    imei: Optional[str] = None
    last_update_time: float = 0
    connection_time: float = 0
    
    def __post_init__(self):
        if self.connection_time == 0:
            self.connection_time = time.time()
        if self.last_update_time == 0:
            self.last_update_time = time.time()


class AsyncIPTables:
    """
    Async IP Table for managing Teltonika device connections and StreamWriter channels
    Uses asyncio.Lock instead of threading.Lock
    Stores asyncio.StreamWriter instead of socket.socket
    """
    
    def __init__(self, initial_capacity: int = 1000, check_interval: int = 300):
        """
        Initialize async IP table
        
        Args:
            initial_capacity: Initial capacity for device storage
            check_interval: Interval for checking stale connections (seconds)
        """
        self.initial_capacity = initial_capacity
        self.check_interval = check_interval
        
        # Maps for different lookups (using IMEI for Teltonika)
        self._writer_to_device: Dict[Any, AsyncDeviceInfo] = {}
        self._imei_to_device: Dict[str, AsyncDeviceInfo] = {}
        self._ip_port_to_device: Dict[Tuple[str, int], AsyncDeviceInfo] = {}
        
        # Async lock
        self._lock = asyncio.Lock()
        
        # Statistics
        self.total_connections = 0
        self.total_disconnections = 0
        self.current_connections = 0
        
        logger.info(f"AsyncIPTables initialized: capacity={initial_capacity}, check_interval={check_interval}s")
    
    async def setIpTable(self, writer: Any, ip_address: str, port: int, 
                        imei: Optional[str] = None):
        """
        Register or update device in IP table
        
        Args:
            writer: asyncio.StreamWriter object
            ip_address: Client IP address
            port: Client port
            imei: Optional IMEI (set after IMEI packet)
        """
        async with self._lock:
            key = (ip_address, port)
            
            if writer in self._writer_to_device:
                # Update existing device
                device = self._writer_to_device[writer]
                device.last_update_time = time.time()
                if imei:
                    device.imei = imei
                    self._imei_to_device[imei] = device
                logger.debug(f"Updated device in AsyncIPTable: {ip_address}:{port}, imei={imei}")
            else:
                # Register new device
                device = AsyncDeviceInfo(
                    writer=writer,
                    ip_address=ip_address,
                    port=port,
                    imei=imei,
                    last_update_time=time.time(),
                    connection_time=time.time()
                )
                
                self._writer_to_device[writer] = device
                self._ip_port_to_device[key] = device
                
                if imei:
                    self._imei_to_device[imei] = device
                
                self.total_connections += 1
                self.current_connections += 1
                
                logger.info(f"Registered new device in AsyncIPTable: {ip_address}:{port}, imei={imei}, total={self.current_connections}")
    
    async def getWriterByImei(self, imei: str) -> Optional[Any]:
        """
        Get StreamWriter by IMEI
        
        Args:
            imei: Device IMEI
            
        Returns:
            StreamWriter if found, None otherwise
        """
        async with self._lock:
            device = self._imei_to_device.get(str(imei))
            if device:
                return device.writer
            return None
    
    async def getDeviceByImei(self, imei: str) -> Optional[AsyncDeviceInfo]:
        """Get complete device info by IMEI"""
        async with self._lock:
            return self._imei_to_device.get(str(imei))
    
    async def updateWriterTime(self, writer: Any):
        """Update last communication time for StreamWriter"""
        async with self._lock:
            device = self._writer_to_device.get(writer)
            if device:
                device.last_update_time = time.time()
    
    async def removeIpTableByIpAndPort(self, ip_address: str, port: int):
        """Remove device by IP and port"""
        async with self._lock:
            key = (ip_address, port)
            device = self._ip_port_to_device.get(key)
            
            if device:
                # Remove from all maps
                if device.writer in self._writer_to_device:
                    del self._writer_to_device[device.writer]
                
                if device.imei and device.imei in self._imei_to_device:
                    del self._imei_to_device[device.imei]
                
                if key in self._ip_port_to_device:
                    del self._ip_port_to_device[key]
                
                self.total_disconnections += 1
                self.current_connections -= 1
                
                logger.info(f"Removed device from AsyncIPTable: {ip_address}:{port}, imei={device.imei}, remaining={self.current_connections}")
    
    async def removeByImei(self, imei: str):
        """Remove device by IMEI"""
        async with self._lock:
            device = self._imei_to_device.get(str(imei))
            if device:
                await self.removeIpTableByIpAndPort(device.ip_address, device.port)
    
    async def getImeiByWriter(self, writer: Any) -> Optional[str]:
        """Get IMEI by StreamWriter"""
        async with self._lock:
            device = self._writer_to_device.get(writer)
            if device:
                return device.imei
            return None
    
    async def cleanup_stale_devices(self, max_idle_time: int = 600):
        """
        Remove devices that haven't communicated recently
        
        Args:
            max_idle_time: Maximum idle time in seconds
        """
        current_time = time.time()
        stale_devices = []
        
        async with self._lock:
            for device in self._writer_to_device.values():
                if current_time - device.last_update_time > max_idle_time:
                    stale_devices.append((device.ip_address, device.port))
        
        # Remove stale devices
        for ip_address, port in stale_devices:
            await self.removeIpTableByIpAndPort(ip_address, port)
            logger.info(f"Removed stale device: {ip_address}:{port}")
    
    async def get_stats(self) -> Dict[str, Any]:
        """Get IP table statistics"""
        async with self._lock:
            return {
                'current_connections': self.current_connections,
                'total_connections': self.total_connections,
                'total_disconnections': self.total_disconnections,
                'devices_with_imei': len(self._imei_to_device),
                'capacity': self.initial_capacity,
                'check_interval': self.check_interval
            }
    
    async def get_all_imeis(self) -> list:
        """Get list of all registered IMEIs"""
        async with self._lock:
            return list(self._imei_to_device.keys())
    
    async def get_all_writers(self) -> list:
        """Get list of all active StreamWriters"""
        async with self._lock:
            return list(self._writer_to_device.keys())
    
    async def close_all_connections(self):
        """Force close all active connections immediately"""
        async with self._lock:
            writers_to_close = list(self._writer_to_device.keys())
            logger.info(f"Force closing {len(writers_to_close)} active connections...")
        
        # Close all writers outside the lock to avoid deadlock
        closed_count = 0
        for writer in writers_to_close:
            try:
                if not writer.is_closing():
                    writer.close()
                    try:
                        await writer.wait_closed()
                    except Exception:
                        pass  # Ignore errors during forced close
                    closed_count += 1
            except Exception as e:
                logger.debug(f"Error closing writer: {e}")
        
        logger.info(f"Force closed {closed_count} connections")
    
    def get_device_count(self) -> int:
        """Get current number of connected devices"""
        return self.current_connections


# Global async IP table instance
class AsyncGlobalIPTable:
    """Static accessor for global async IP table"""
    
    _instance: Optional[AsyncIPTables] = None
    _lock = asyncio.Lock()
    
    @classmethod
    async def initialize(cls, initial_capacity: int = 1000, check_interval: int = 300):
        """Initialize the global async IP table"""
        async with cls._lock:
            if cls._instance is None:
                cls._instance = AsyncIPTables(initial_capacity, check_interval)
                logger.info("AsyncGlobalIPTable initialized")
    
    @classmethod
    async def get_instance(cls) -> AsyncIPTables:
        """Get the global async IP table instance"""
        if cls._instance is None:
            await cls.initialize()
        return cls._instance
    
    # Static methods that delegate to the instance
    @classmethod
    async def setIpTable(cls, writer: Any, ip_address: str, port: int, imei: Optional[str] = None):
        instance = await cls.get_instance()
        await instance.setIpTable(writer, ip_address, port, imei)
    
    @classmethod
    async def getWriterByImei(cls, imei: str) -> Optional[Any]:
        instance = await cls.get_instance()
        return await instance.getWriterByImei(imei)
    
    @classmethod
    async def updateWriterTime(cls, writer: Any):
        instance = await cls.get_instance()
        await instance.updateWriterTime(writer)
    
    @classmethod
    async def removeIpTableByIpAndPort(cls, ip_address: str, port: int):
        instance = await cls.get_instance()
        await instance.removeIpTableByIpAndPort(ip_address, port)
    
    @classmethod
    async def getImeiByWriter(cls, writer: Any) -> Optional[str]:
        """Get IMEI by StreamWriter"""
        instance = await cls.get_instance()
        return await instance.getImeiByWriter(writer)
    
    @classmethod
    async def getDeviceByImei(cls, imei: str):
        """Get device info by IMEI"""
        instance = await cls.get_instance()
        return await instance.getDeviceByImei(imei)
    
    @classmethod
    async def close_all_connections(cls):
        """Force close all active connections immediately"""
        instance = await cls.get_instance()
        await instance.close_all_connections()