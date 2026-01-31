"""
OutCommand - Command data structure and buffer for Teltonika GPRS commands
Uses IMEI instead of unit_id (Teltonika-specific)
Note: SMS commands are handled by separate SMS Gateway Service
"""
import threading
import logging
from typing import Optional
from datetime import datetime
from collections import deque

logger = logging.getLogger(__name__)


class OutCommand:
    """
    Command object for Teltonika device commands
    Uses IMEI instead of unit_id, but includes SMS-specific fields for compatibility
    """
    
    def __init__(self):
        self.id: int = 0
        self.imei: str = ""  # Teltonika uses IMEI
        self.unit_sim: str = ""  # For SMS commands
        self.data: str = ""
        self.param: str = ""
        self.data_type: str = "GPRS"  # GPRS or SMS
        self.datetime: datetime = datetime.now()
        self.remark: str = ""
        self.send_by_sim_no: str = ""  # For SMS commands
        self.devicetype: str = "Teltonika"
        self.cmd_from_old_db: bool = False
        self.status: Optional[str] = None
    
    # Getter/Setter methods
    def getId(self) -> int:
        return self.id
    
    def setId(self, id: int):
        self.id = id
    
    def getImei(self) -> str:
        return self.imei
    
    def setImei(self, imei: str):
        self.imei = imei
    
    def getUnitSim(self) -> str:
        return self.unit_sim
    
    def setUnitSim(self, unit_sim: str):
        self.unit_sim = unit_sim
    
    def getData(self) -> str:
        return self.data
    
    def setData(self, data: str):
        self.data = data
    
    def getParam(self) -> str:
        return self.param
    
    def setParam(self, param: str):
        self.param = param
    
    def getDataType(self) -> str:
        return self.data_type
    
    def setDataType(self, data_type: str):
        self.data_type = data_type
    
    def getDatetime(self) -> datetime:
        return self.datetime
    
    def setDatetime(self, dt: datetime):
        self.datetime = dt
    
    def getRemark(self) -> str:
        return self.remark
    
    def setRemark(self, remark: str):
        self.remark = remark
    
    def getSendBySimNo(self) -> str:
        return self.send_by_sim_no
    
    def setSendBySimNo(self, sim_no: str):
        self.send_by_sim_no = sim_no
    
    def getDevicetype(self) -> str:
        return self.devicetype
    
    def setDevicetype(self, devicetype: str):
        self.devicetype = devicetype
    
    def isCmdFromOldDB(self) -> bool:
        return self.cmd_from_old_db
    
    def setCmdFromOldDB(self, is_from_old_db: bool):
        self.cmd_from_old_db = is_from_old_db
    
    def getStatus(self) -> Optional[str]:
        return self.status
    
    def setStatus(self, status: str):
        self.status = status


class GPRSCommandsBuffer:
    """
    Thread-safe buffer for GPRS commands
    Uses threading.Lock for thread-safety
    """
    
    _instance: Optional['GPRSCommandsBuffer'] = None
    _lock = threading.Lock()
    
    def __init__(self):
        self.commands: deque = deque()
        self._buffer_lock = threading.RLock()
        self.total_added = 0
        self.total_removed = 0
        logger.info("GPRSCommandsBuffer initialized")
    
    @classmethod
    def getOutCommandBufferInstance(cls) -> 'GPRSCommandsBuffer':
        """Get singleton instance"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = GPRSCommandsBuffer()
        return cls._instance
    
    def addCommand(self, command: OutCommand):
        """Add command to buffer"""
        with self._buffer_lock:
            self.commands.append(command)
            self.total_added += 1
            logger.debug(f"Added GPRS command to buffer: imei={command.getImei()}, total={len(self.commands)}")
    
    def removeCommand(self) -> Optional[OutCommand]:
        """Remove and return next command"""
        with self._buffer_lock:
            if len(self.commands) > 0:
                command = self.commands.popleft()
                self.total_removed += 1
                logger.debug(f"Removed GPRS command from buffer: imei={command.getImei()}, remaining={len(self.commands)}")
                return command
            return None
    
    def size(self) -> int:
        """Get buffer size"""
        with self._buffer_lock:
            return len(self.commands)
    
    def is_empty(self) -> bool:
        """Check if buffer is empty"""
        return self.size() == 0


# Note: SMSCommandsBuffer removed - SMS commands handled by SMS Gateway Service
