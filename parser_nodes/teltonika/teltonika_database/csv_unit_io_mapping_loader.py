"""
CSV-based Unit IO Mapping Loader for Teltonika Gateway (Logs mode)
Loads Unit IO mappings from CSV file, cached by IMEI (mimics database loader behavior)
"""
import os
import csv
import logging
from typing import Optional, Dict, List
from dataclasses import dataclass

from teltonika_database.unit_io_mapping_loader import UnitIOMapping

logger = logging.getLogger(__name__)


class CSVUnitIOMappingLoader:
    """Load and manage Unit IO mappings from CSV file, cached by Unit IMEI (for Logs mode)."""
    
    def __init__(self, mapping_file: str):
        """
        Initialize CSV Unit IO mapping loader.
        
        Args:
            mapping_file: Path to CSV file (relative to teltonika_database directory or absolute)
        """
        self.mapping_file = mapping_file
        self._all_mappings: Dict[str, Dict[int, List[UnitIOMapping]]] = {}  # imei -> io_id -> list of mappings
        self._mappings_cache: Dict[str, Dict[int, List[UnitIOMapping]]] = {}  # imei -> io_id -> list of mappings (cached)
        self._file_loaded = False
    
    def _load_all_mappings_from_csv(self):
        """Load all mappings from CSV file (called once)."""
        if self._file_loaded:
            return
        
        try:
            # Try to find the CSV file
            mapping_path = None
            
            # First, try as absolute path
            if os.path.isabs(self.mapping_file):
                mapping_path = self.mapping_file
            else:
                # Try relative to teltonika_database directory (same directory as this file)
                # Use absolute path to avoid path resolution issues
                db_dir = os.path.dirname(os.path.abspath(__file__))
                mapping_path = os.path.join(db_dir, self.mapping_file)
                
                # If not found, try current working directory
                if not os.path.exists(mapping_path):
                    mapping_path = os.path.join(os.getcwd(), self.mapping_file)
                    # If still not found, use the filename as-is (last fallback)
                    if not os.path.exists(mapping_path):
                        mapping_path = self.mapping_file
            
            if not os.path.exists(mapping_path):
                logger.warning(f"Unit IO mapping CSV file not found: {mapping_path}")
                self._file_loaded = True
                return
            
            logger.info(f"Loading Unit IO mappings from CSV: {mapping_path}")
            
            with open(mapping_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    try:
                        # Parse IMEI (handle scientific notation)
                        imei_str = row['imei'].strip()
                        if 'E+' in imei_str or 'e+' in imei_str:
                            imei = str(int(float(imei_str)))
                        else:
                            imei = imei_str
                        
                        io_id = int(row['io_id'])
                        io_multiplier = float(row['io_multiplier'])
                        io_type = int(row['io_type'])
                        io_name = row['io_name'].strip()
                        value_name = row['value_name'].strip()
                        
                        # Parse value (NA or empty string means None)
                        value_str = row['value'].strip()
                        if value_str == 'NA' or value_str == '':
                            value = None
                        else:
                            try:
                                value = float(value_str)
                            except ValueError:
                                logger.warning(f"Invalid value '{value_str}' for io_id {io_id}, imei {imei}, setting to None")
                                value = None
                        
                        target = int(row['target'])
                        column_name = row['column_name'].strip()
                        
                        # Parse alarm fields (matching database column names: lowercase with underscores)
                        start_time = row.get('start_time', '00:00:00').strip()
                        end_time = row.get('end_time', '23:59:59').strip()
                        is_alarm = int(row.get('is_alarm', '0')) == 1
                        is_sms = int(row.get('is_sms', '0')) == 1
                        is_email = int(row.get('is_email', '0')) == 1
                        is_call = int(row.get('is_call', '0')) == 1
                        
                        # Handle column_name with pipe (|) separator (split into multiple columns)
                        column_names = [c.strip() for c in column_name.split('|')]
                        valid_column_names = [c for c in column_names if c and c != 'status' and c != '']
                        
                        # Initialize IMEI dict if needed
                        if imei not in self._all_mappings:
                            self._all_mappings[imei] = {}
                        
                        # Create mapping for status events if target includes status (1 or 2)
                        if target in [1, 2]:
                            mapping = UnitIOMapping(
                                imei=imei,
                                io_id=io_id,
                                io_multiplier=io_multiplier,
                                io_type=io_type,
                                io_name=io_name,
                                value_name=value_name,
                                value=value,
                                target=target,
                                column_name="",  # Status events don't need column_name
                                start_time=start_time,
                                end_time=end_time,
                                is_alarm=is_alarm,
                                is_sms=is_sms,
                                is_email=is_email,
                                is_call=is_call
                            )
                            
                            if io_id not in self._all_mappings[imei]:
                                self._all_mappings[imei][io_id] = []
                            self._all_mappings[imei][io_id].append(mapping)
                        
                        # Create mappings for column values (target = 0 or 2, and has valid column names)
                        if target in [0, 2] and valid_column_names:
                            for col_name in valid_column_names:
                                col_name = col_name.strip()
                                if not col_name:
                                    continue
                                
                                mapping = UnitIOMapping(
                                    imei=imei,
                                    io_id=io_id,
                                    io_multiplier=io_multiplier,
                                    io_type=io_type,
                                    io_name=io_name,
                                    value_name=value_name,
                                    value=value,
                                    target=target,
                                    column_name=col_name,
                                    start_time=start_time,
                                    end_time=end_time,
                                    is_alarm=is_alarm,
                                    is_sms=is_sms,
                                    is_email=is_email,
                                    is_call=is_call
                                )
                                
                                if io_id not in self._all_mappings[imei]:
                                    self._all_mappings[imei][io_id] = []
                                self._all_mappings[imei][io_id].append(mapping)
                        
                        # Handle JSONB (target = 3)
                        if target == 3 and column_name:
                            mapping = UnitIOMapping(
                                imei=imei,
                                io_id=io_id,
                                io_multiplier=io_multiplier,
                                io_type=io_type,
                                io_name=io_name,
                                value_name=value_name,
                                value=value,
                                target=target,
                                column_name=column_name,
                                start_time=start_time,
                                end_time=end_time,
                                is_alarm=is_alarm,
                                is_sms=is_sms,
                                is_email=is_email,
                                is_call=is_call
                            )
                            
                            if io_id not in self._all_mappings[imei]:
                                self._all_mappings[imei][io_id] = []
                            self._all_mappings[imei][io_id].append(mapping)
                            
                    except (ValueError, KeyError) as e:
                        logger.warning(f"Error parsing mapping row: {row}, error: {e}")
                        continue
            
            total_mappings = sum(sum(len(v) for v in mappings.values()) for mappings in self._all_mappings.values())
            logger.info(f"Loaded {total_mappings} Unit IO mappings from CSV (for {len(self._all_mappings)} IMEIs)")
            self._file_loaded = True
            
        except Exception as e:
            logger.error(f"Failed to load Unit IO mappings from CSV: {e}", exc_info=True)
            self._file_loaded = True
    
    async def load_mappings_for_imei(self, imei: str) -> bool:
        """
        Load Unit IO mappings for a specific IMEI from CSV and cache them.
        Mimics database loader interface.
        
        Args:
            imei: IMEI string
            
        Returns:
            True if mappings were loaded successfully, False otherwise
        """
        try:
            # Load CSV file if not already loaded
            self._load_all_mappings_from_csv()
            
            # Check if already cached
            if imei in self._mappings_cache:
                logger.debug(f"Unit IO mappings for IMEI {imei} already cached (CSV)")
                return True
            
            # Get mappings for this IMEI from loaded data
            if imei in self._all_mappings:
                self._mappings_cache[imei] = self._all_mappings[imei].copy()
                total_mappings = sum(len(v) for v in self._mappings_cache[imei].values())
                logger.info(f"Loaded {total_mappings} Unit IO mappings from CSV for IMEI {imei}")
                return True
            else:
                logger.debug(f"No Unit IO mappings found in CSV for IMEI {imei}")
                # Cache empty dict to avoid repeated lookups
                self._mappings_cache[imei] = {}
                return True
            
        except Exception as e:
            logger.error(f"Error loading Unit IO mappings from CSV for IMEI {imei}: {e}", exc_info=True)
            return False
    
    def get_mappings_for_io(self, io_id: int, imei: Optional[str] = None) -> List[UnitIOMapping]:
        """
        Get all mappings for a given Unit IO ID, optionally filtered by Unit IMEI.
        Mimics database loader interface.
        
        Args:
            io_id: Unit IO ID to get mappings for
            imei: Optional IMEI to filter by (must be in cache)
            
        Returns:
            List of UnitIOMapping objects
        """
        if not imei:
            # If no Unit IMEI provided, return empty list (CSV loader requires Unit IMEI)
            return []
        
        # Check if Unit IMEI is cached
        if imei not in self._mappings_cache:
            logger.warning(f"Unit IO mappings for Unit IMEI {imei} not loaded. Call load_mappings_for_imei() first.")
            return []
        
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
        # Check if there are any Unit IO mappings (not empty dict)
        return len(mappings_by_io) > 0 and any(len(mappings) > 0 for mappings in mappings_by_io.values())
    
    def clear_cache(self, imei: Optional[str] = None):
        """
        Clear cached mappings.
        
        Args:
            imei: Optional Unit IMEI to clear. If None, clears all cached mappings.
        """
        if imei:
            if imei in self._mappings_cache:
                del self._mappings_cache[imei]
                logger.debug(f"Cleared Unit IO mapping cache for Unit IMEI {imei} (CSV)")
        else:
            self._mappings_cache.clear()
            logger.debug("Cleared all Unit IO mapping caches (CSV)")
