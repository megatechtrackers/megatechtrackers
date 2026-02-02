"""
Camera Alarm Config Loader
Loads alarm notification configuration per IMEI and event type.
Supports both CSV (LOGS mode) and Database (RABBITMQ mode).
Implements auto-provisioning: new devices get template config (imei=0) copied automatically.
"""
import asyncio
import csv
import os
import logging
from typing import Dict, List, Optional, Any, Set
from dataclasses import dataclass, asdict
from datetime import time
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)

# Template IMEI (0 = default template for all new devices)
TEMPLATE_IMEI = 0

# Hard-coded defaults (fallback if template imei=0 is missing)
# Event types must match ALARM_TYPE_NAMES in cms_api.py
HARDCODED_DEFAULTS = [
    {"event_type": "Overspeeding",       "is_sms": 1, "is_email": 1, "is_call": 0, "priority": 5},
    {"event_type": "Forward Collision",  "is_sms": 1, "is_email": 1, "is_call": 1, "priority": 5},
    {"event_type": "Backward Collision", "is_sms": 1, "is_email": 1, "is_call": 0, "priority": 5},
    {"event_type": "Fatigue",            "is_sms": 0, "is_email": 1, "is_call": 0, "priority": 2},
    {"event_type": "PhoneCalling",       "is_sms": 1, "is_email": 0, "is_call": 0, "priority": 3},
    {"event_type": "Smoking",            "is_sms": 1, "is_email": 0, "is_call": 0, "priority": 3},
    {"event_type": "Distraction",        "is_sms": 1, "is_email": 0, "is_call": 0, "priority": 3},
    {"event_type": "Eyes Close",         "is_sms": 1, "is_email": 0, "is_call": 0, "priority": 4},
    {"event_type": "Lost Face",          "is_sms": 0, "is_email": 1, "is_call": 0, "priority": 2},
    {"event_type": "SeatBelt",           "is_sms": 1, "is_email": 0, "is_call": 0, "priority": 4},
]


@dataclass
class CameraAlarmConfig:
    """Camera alarm configuration for a specific IMEI and event type"""
    imei: int
    event_type: str
    is_sms: int = 0
    is_email: int = 0
    is_call: int = 0
    priority: int = 5
    start_time: time = time(0, 0, 0)
    end_time: time = time(23, 59, 59)
    enabled: bool = True
    
    @property
    def should_alarm(self) -> bool:
        """Check if this config should trigger an alarm (any notification enabled)"""
        return self.enabled and (self.is_sms or self.is_email or self.is_call)


class AlarmConfigLoader(ABC):
    """Abstract base class for alarm config loaders"""
    
    @abstractmethod
    async def load_config_for_imei(self, imei: int) -> bool:
        """Load alarm configs for a specific IMEI"""
        pass
    
    @abstractmethod
    async def get_config(self, imei: int, event_type: str) -> Optional[CameraAlarmConfig]:
        """Get alarm config for IMEI and event type"""
        pass
    
    @abstractmethod
    async def get_all_configs_for_imei(self, imei: int) -> List[CameraAlarmConfig]:
        """Get all alarm configs for an IMEI"""
        pass
    
    @abstractmethod
    async def ensure_device_provisioned(self, imei: int) -> bool:
        """
        Ensure device has alarm config. If not, copy from template (imei=0).
        Called on device discovery (status poll or alarm received).
        """
        pass
    
    @abstractmethod
    async def has_config_for_imei(self, imei: int) -> bool:
        """Check if IMEI has any alarm configs"""
        pass


class CSVAlarmConfigLoader(AlarmConfigLoader):
    """
    CSV-based alarm config loader for LOGS mode.
    Loads camera_alarm_config.csv for standalone testing.
    Supports auto-provisioning from template (imei=0).
    """
    
    CSV_FILE = os.path.join(os.path.dirname(__file__), '..', 'camera_alarm_config.csv')
    
    def __init__(self):
        self._configs: Dict[int, Dict[str, CameraAlarmConfig]] = {}
        self._loaded = False
        self._lock = asyncio.Lock()
        self._provisioned_imeis: Set[int] = set()  # Track provisioned devices
    
    async def _load_csv(self):
        """Load CSV file into memory"""
        if self._loaded:
            return
        
        async with self._lock:
            if self._loaded:
                return
            
            if not os.path.exists(self.CSV_FILE):
                logger.warning(f"Camera alarm config CSV not found: {self.CSV_FILE}")
                logger.info("Creating camera_alarm_config.csv with template...")
                self._create_template_csv()
            
            try:
                with open(self.CSV_FILE, 'r', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    
                    for row in reader:
                        try:
                            config = self._parse_row(row)
                            if config:
                                if config.imei not in self._configs:
                                    self._configs[config.imei] = {}
                                self._configs[config.imei][config.event_type] = config
                        except Exception as e:
                            logger.warning(f"Error parsing CSV row: {e}")
                            continue
                
                total_configs = sum(len(configs) for configs in self._configs.values())
                logger.info(f"Loaded {total_configs} alarm configs for {len(self._configs)} devices from CSV")
                self._loaded = True
                
            except Exception as e:
                logger.error(f"Error loading camera alarm config CSV: {e}")
    
    def _parse_row(self, row: Dict[str, str]) -> Optional[CameraAlarmConfig]:
        """Parse a CSV row into CameraAlarmConfig"""
        try:
            # Parse IMEI (handle scientific notation)
            imei_str = row.get('imei', '').strip()
            if not imei_str:
                return None
            
            # Handle scientific notation (e.g., 3.57544E+14)
            if 'E' in imei_str.upper():
                imei = int(float(imei_str))
            else:
                imei = int(imei_str)
            
            event_type = row.get('event_type', '').strip()
            if not event_type:
                return None
            
            # Parse time fields (format: H:MM:SS or HH:MM:SS)
            start_time = self._parse_time(row.get('start_time', '0:00:00'))
            end_time = self._parse_time(row.get('end_time', '23:59:59'))
            
            # Parse enabled (handle various formats)
            enabled_str = row.get('enabled', '1').strip().lower()
            enabled = enabled_str in ('true', '1', 'yes', 'on')
            
            return CameraAlarmConfig(
                imei=imei,
                event_type=event_type,
                is_sms=int(row.get('is_sms', 0)),
                is_email=int(row.get('is_email', 0)),
                is_call=int(row.get('is_call', 0)),
                priority=int(row.get('priority', 5)),
                start_time=start_time,
                end_time=end_time,
                enabled=enabled
            )
        except Exception as e:
            logger.debug(f"Error parsing row {row}: {e}")
            return None
    
    def _parse_time(self, time_str: str) -> time:
        """Parse time string to time object (format: H:MM:SS)"""
        if not time_str:
            return time(0, 0, 0)
        
        try:
            parts = time_str.strip().split(':')
            hour = int(parts[0]) if len(parts) > 0 else 0
            minute = int(parts[1]) if len(parts) > 1 else 0
            second = int(parts[2]) if len(parts) > 2 else 0
            return time(hour, minute, second)
        except Exception:
            return time(0, 0, 0)
    
    def _format_time(self, t: time) -> str:
        """Format time object to string (format: H:MM:SS)"""
        return f"{t.hour}:{t.minute:02d}:{t.second:02d}"
    
    def _create_template_csv(self):
        """Create CSV file with template (imei=0) rows"""
        try:
            os.makedirs(os.path.dirname(self.CSV_FILE), exist_ok=True)
            with open(self.CSV_FILE, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                # Header
                writer.writerow(['imei', 'event_type', 'is_sms', 'is_email', 'is_call', 'priority', 'start_time', 'end_time', 'enabled'])
                # Template rows (imei=0)
                for default in HARDCODED_DEFAULTS:
                    writer.writerow([
                        TEMPLATE_IMEI,
                        default['event_type'],
                        default['is_sms'],
                        default['is_email'],
                        default['is_call'],
                        default['priority'],
                        '0:00:00',
                        '23:59:59',
                        '1'
                    ])
            logger.info(f"Created camera_alarm_config.csv with template at {self.CSV_FILE}")
        except Exception as e:
            logger.error(f"Error creating template CSV: {e}")
    
    def _get_template_configs(self) -> List[CameraAlarmConfig]:
        """Get template configs (imei=0) or hardcoded defaults"""
        if TEMPLATE_IMEI in self._configs:
            return list(self._configs[TEMPLATE_IMEI].values())
        
        # Fallback to hardcoded defaults
        logger.warning("Template (imei=0) not found in CSV, using hardcoded defaults")
        return [
            CameraAlarmConfig(
                imei=TEMPLATE_IMEI,
                event_type=d['event_type'],
                is_sms=d['is_sms'],
                is_email=d['is_email'],
                is_call=d['is_call'],
                priority=d['priority'],
                start_time=time(0, 0, 0),
                end_time=time(23, 59, 59),
                enabled=True
            )
            for d in HARDCODED_DEFAULTS
        ]
    
    async def _copy_template_to_imei(self, imei: int):
        """Copy template configs (imei=0) to new IMEI and append to CSV"""
        template_configs = self._get_template_configs()
        
        if not template_configs:
            logger.warning(f"No template configs to copy for IMEI {imei}")
            return
        
        # Copy to in-memory cache
        self._configs[imei] = {}
        for template in template_configs:
            config = CameraAlarmConfig(
                imei=imei,
                event_type=template.event_type,
                is_sms=template.is_sms,
                is_email=template.is_email,
                is_call=template.is_call,
                priority=template.priority,
                start_time=template.start_time,
                end_time=template.end_time,
                enabled=template.enabled
            )
            self._configs[imei][config.event_type] = config
        
        # Append to CSV file
        try:
            with open(self.CSV_FILE, 'a', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                for config in self._configs[imei].values():
                    writer.writerow([
                        config.imei,
                        config.event_type,
                        config.is_sms,
                        config.is_email,
                        config.is_call,
                        config.priority,
                        self._format_time(config.start_time),
                        self._format_time(config.end_time),
                        '1' if config.enabled else '0'
                    ])
            logger.info(f"Auto-provisioned {len(template_configs)} alarm configs for new device IMEI {imei}")
        except Exception as e:
            logger.error(f"Error appending to CSV for IMEI {imei}: {e}")
    
    async def ensure_device_provisioned(self, imei: int) -> bool:
        """
        Ensure device has alarm config. If not, copy from template (imei=0).
        Called on device discovery (status poll or alarm received).
        """
        # Skip template IMEI
        if imei == TEMPLATE_IMEI:
            return True
        
        # Already checked this session
        if imei in self._provisioned_imeis:
            return True
        
        await self._load_csv()
        
        # Check if config exists
        if imei in self._configs and self._configs[imei]:
            self._provisioned_imeis.add(imei)
            return True
        
        # Copy template to this IMEI
        async with self._lock:
            # Double-check after acquiring lock
            if imei in self._configs and self._configs[imei]:
                self._provisioned_imeis.add(imei)
                return True
            
            await self._copy_template_to_imei(imei)
            self._provisioned_imeis.add(imei)
            return True
    
    async def has_config_for_imei(self, imei: int) -> bool:
        """Check if IMEI has any alarm configs"""
        await self._load_csv()
        return imei in self._configs and len(self._configs[imei]) > 0
    
    async def load_config_for_imei(self, imei: int) -> bool:
        """Load CSV (if not already loaded) - CSV loads all IMEIs at once"""
        await self._load_csv()
        return imei in self._configs
    
    async def get_config(self, imei: int, event_type: str) -> Optional[CameraAlarmConfig]:
        """Get alarm config for IMEI and event type"""
        await self._load_csv()
        
        imei_configs = self._configs.get(imei, {})
        return imei_configs.get(event_type)
    
    async def get_all_configs_for_imei(self, imei: int) -> List[CameraAlarmConfig]:
        """Get all alarm configs for an IMEI"""
        await self._load_csv()
        
        imei_configs = self._configs.get(imei, {})
        return list(imei_configs.values())
    
    def clear_cache(self, imei: int = None):
        """Clear cached configs (for reloading)"""
        if imei:
            self._configs.pop(imei, None)
            self._provisioned_imeis.discard(imei)
        else:
            self._configs.clear()
            self._provisioned_imeis.clear()
            self._loaded = False


class DatabaseAlarmConfigLoader(AlarmConfigLoader):
    """
    Database-based alarm config loader for RABBITMQ mode.
    Loads from camera_alarm_config table.
    Supports auto-provisioning from template (imei=0).
    """
    
    def __init__(self):
        self._configs: Dict[int, Dict[str, CameraAlarmConfig]] = {}
        self._loaded_imeis: Set[int] = set()
        self._provisioned_imeis: Set[int] = set()  # Track provisioned devices
        self._lock = asyncio.Lock()
    
    async def _get_db_pool(self):
        """Get database connection pool"""
        from .db_client import get_database_client
        db_client = await get_database_client()
        return db_client.pool
    
    async def _get_template_configs(self) -> List[CameraAlarmConfig]:
        """Get template configs (imei=0) from database or hardcoded defaults"""
        try:
            pool = await self._get_db_pool()
            if not pool:
                return self._get_hardcoded_defaults()
            
            async with pool.acquire() as conn:
                rows = await conn.fetch("""
                    SELECT imei, event_type, is_sms, is_email, is_call, 
                           priority, start_time, end_time, enabled
                    FROM camera_alarm_config
                    WHERE imei = $1
                """, TEMPLATE_IMEI)
                
                if rows:
                    return [
                        CameraAlarmConfig(
                            imei=row['imei'],
                            event_type=row['event_type'],
                            is_sms=row['is_sms'] or 0,
                            is_email=row['is_email'] or 0,
                            is_call=row['is_call'] or 0,
                            priority=row['priority'] or 5,
                            start_time=row['start_time'] or time(0, 0, 0),
                            end_time=row['end_time'] or time(23, 59, 59),
                            enabled=row['enabled'] if row['enabled'] is not None else True
                        )
                        for row in rows
                    ]
                
                # Fallback to hardcoded defaults
                logger.warning("Template (imei=0) not found in database, using hardcoded defaults")
                return self._get_hardcoded_defaults()
                
        except Exception as e:
            logger.error(f"Error getting template configs: {e}")
            return self._get_hardcoded_defaults()
    
    def _get_hardcoded_defaults(self) -> List[CameraAlarmConfig]:
        """Get hardcoded default configs"""
        return [
            CameraAlarmConfig(
                imei=TEMPLATE_IMEI,
                event_type=d['event_type'],
                is_sms=d['is_sms'],
                is_email=d['is_email'],
                is_call=d['is_call'],
                priority=d['priority'],
                start_time=time(0, 0, 0),
                end_time=time(23, 59, 59),
                enabled=True
            )
            for d in HARDCODED_DEFAULTS
        ]
    
    async def _copy_template_to_imei(self, imei: int):
        """Copy template configs (imei=0) to new IMEI in database"""
        template_configs = await self._get_template_configs()
        
        if not template_configs:
            logger.warning(f"No template configs to copy for IMEI {imei}")
            return
        
        try:
            pool = await self._get_db_pool()
            if not pool:
                logger.warning("Database pool not available for auto-provisioning")
                return
            
            async with pool.acquire() as conn:
                # Insert configs for new IMEI (copy from template)
                for template in template_configs:
                    await conn.execute("""
                        INSERT INTO camera_alarm_config 
                            (imei, event_type, is_sms, is_email, is_call, priority, start_time, end_time, enabled)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                        ON CONFLICT (imei, event_type) DO NOTHING
                    """, imei, template.event_type, template.is_sms, template.is_email,
                        template.is_call, template.priority, template.start_time, 
                        template.end_time, template.enabled)
                
                logger.info(f"Auto-provisioned {len(template_configs)} alarm configs for new device IMEI {imei}")
                
                # Update in-memory cache
                self._configs[imei] = {}
                for template in template_configs:
                    config = CameraAlarmConfig(
                        imei=imei,
                        event_type=template.event_type,
                        is_sms=template.is_sms,
                        is_email=template.is_email,
                        is_call=template.is_call,
                        priority=template.priority,
                        start_time=template.start_time,
                        end_time=template.end_time,
                        enabled=template.enabled
                    )
                    self._configs[imei][config.event_type] = config
                
        except Exception as e:
            logger.error(f"Error auto-provisioning IMEI {imei}: {e}")
    
    async def ensure_device_provisioned(self, imei: int) -> bool:
        """
        Ensure device has alarm config. If not, copy from template (imei=0).
        Called on device discovery (status poll or alarm received).
        """
        # Skip template IMEI
        if imei == TEMPLATE_IMEI:
            return True
        
        # Already checked this session
        if imei in self._provisioned_imeis:
            return True
        
        async with self._lock:
            # Double-check after acquiring lock
            if imei in self._provisioned_imeis:
                return True
            
            try:
                pool = await self._get_db_pool()
                if not pool:
                    logger.warning("Database pool not available for provisioning check")
                    return False
                
                async with pool.acquire() as conn:
                    # Check if config exists
                    count = await conn.fetchval("""
                        SELECT COUNT(*) FROM camera_alarm_config WHERE imei = $1
                    """, imei)
                    
                    if count and count > 0:
                        self._provisioned_imeis.add(imei)
                        return True
                    
                    # Copy template to this IMEI
                    await self._copy_template_to_imei(imei)
                    self._provisioned_imeis.add(imei)
                    return True
                    
            except Exception as e:
                logger.error(f"Error ensuring device provisioned for IMEI {imei}: {e}")
                return False
    
    async def has_config_for_imei(self, imei: int) -> bool:
        """Check if IMEI has any alarm configs"""
        if imei in self._configs and self._configs[imei]:
            return True
        
        try:
            pool = await self._get_db_pool()
            if not pool:
                return False
            
            async with pool.acquire() as conn:
                count = await conn.fetchval("""
                    SELECT COUNT(*) FROM camera_alarm_config WHERE imei = $1
                """, imei)
                return count and count > 0
                
        except Exception as e:
            logger.error(f"Error checking config for IMEI {imei}: {e}")
            return False
    
    async def load_config_for_imei(self, imei: int) -> bool:
        """Load alarm configs for a specific IMEI from database"""
        if imei in self._loaded_imeis:
            return imei in self._configs
        
        async with self._lock:
            if imei in self._loaded_imeis:
                return imei in self._configs
            
            try:
                pool = await self._get_db_pool()
                if not pool:
                    logger.warning("Database pool not available")
                    return False
                
                async with pool.acquire() as conn:
                    rows = await conn.fetch("""
                        SELECT imei, event_type, is_sms, is_email, is_call, 
                               priority, start_time, end_time, enabled
                        FROM camera_alarm_config
                        WHERE imei = $1 AND enabled = TRUE
                    """, imei)
                    
                    if rows:
                        self._configs[imei] = {}
                        for row in rows:
                            config = CameraAlarmConfig(
                                imei=row['imei'],
                                event_type=row['event_type'],
                                is_sms=row['is_sms'] or 0,
                                is_email=row['is_email'] or 0,
                                is_call=row['is_call'] or 0,
                                priority=row['priority'] or 5,
                                start_time=row['start_time'] or time(0, 0, 0),
                                end_time=row['end_time'] or time(23, 59, 59),
                                enabled=row['enabled']
                            )
                            self._configs[imei][config.event_type] = config
                        
                        logger.debug(f"Loaded {len(rows)} alarm configs for IMEI {imei}")
                    
                    self._loaded_imeis.add(imei)
                    return imei in self._configs
                    
            except Exception as e:
                logger.error(f"Error loading alarm config for IMEI {imei}: {e}")
                return False
    
    async def get_config(self, imei: int, event_type: str) -> Optional[CameraAlarmConfig]:
        """Get alarm config for IMEI and event type"""
        # Load if not already loaded
        await self.load_config_for_imei(imei)
        
        imei_configs = self._configs.get(imei, {})
        return imei_configs.get(event_type)
    
    async def get_all_configs_for_imei(self, imei: int) -> List[CameraAlarmConfig]:
        """Get all alarm configs for an IMEI"""
        await self.load_config_for_imei(imei)
        
        imei_configs = self._configs.get(imei, {})
        return list(imei_configs.values())
    
    def clear_cache(self, imei: int = None):
        """Clear cached configs (for reloading)"""
        if imei:
            self._configs.pop(imei, None)
            self._loaded_imeis.discard(imei)
            self._provisioned_imeis.discard(imei)
        else:
            self._configs.clear()
            self._loaded_imeis.clear()
            self._provisioned_imeis.clear()


# Global loader instance
_alarm_config_loader: Optional[AlarmConfigLoader] = None


async def get_alarm_config_loader() -> AlarmConfigLoader:
    """
    Get the appropriate alarm config loader based on data_transfer_mode.
    - LOGS mode: CSV loader
    - RABBITMQ mode: Database loader
    """
    global _alarm_config_loader
    
    if _alarm_config_loader is None:
        import sys
        sys.path.insert(0, '..')
        from config import Config
        
        data_mode = Config.get_data_transfer_mode()
        
        if data_mode == 'LOGS':
            logger.info("Using CSV alarm config loader (LOGS mode)")
            _alarm_config_loader = CSVAlarmConfigLoader()
        else:
            logger.info("Using Database alarm config loader (RABBITMQ mode)")
            _alarm_config_loader = DatabaseAlarmConfigLoader()
    
    return _alarm_config_loader


def reset_alarm_config_loader():
    """Reset the global loader (for testing)"""
    global _alarm_config_loader
    _alarm_config_loader = None
