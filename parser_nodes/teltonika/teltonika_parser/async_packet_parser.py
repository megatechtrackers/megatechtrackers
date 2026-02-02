"""
Async Packet Parser for Teltonika Gateway
Parses Teltonika packets, sends ACK AFTER buffer add (ensures data persistence)
Follows Teltonika protocol exactly
"""
import asyncio
import logging
import struct
import json
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta, timezone
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from teltonika_infrastructure.async_queue import AsyncTeltonikaDataQueues
from teltonika_infrastructure.async_ip_table import AsyncGlobalIPTable
from teltonika_infrastructure.async_synchronized_buffer import async_synchronized_buffer
from teltonika_codec.data_decoder import DataDecoder
from teltonika_codec.reverse_binary_reader import ReverseBinaryReader
from teltonika_codec.models.tcp_data_packet import TcpDataPacket
from teltonika_codec.models.codec12_response import Codec12Response

logger = logging.getLogger(__name__)

# Codec 12 response handler callback (set by GPRS command sender)
# Called when a Codec 12 response is received from a device
_codec12_response_handler = None


def set_codec12_response_handler(handler):
    """
    Set the callback for handling Codec 12 command responses.
    
    The handler should be an async function with signature:
        async def handler(imei: str, response: Codec12Response) -> None
    
    Args:
        handler: Async callback function to handle Codec 12 responses
    """
    global _codec12_response_handler
    _codec12_response_handler = handler
    logger.info("Codec 12 response handler registered")


class AsyncPacketParser:
    """
    Async packet parser for Teltonika devices
    Parses packets, adds to buffer, sends ACK AFTER buffer add (ensures data persistence)
    Follows Teltonika protocol exactly
    """
    
    def __init__(self):
        """Initialize async packet parser"""
        self.running = False
        logger.info("AsyncPacketParser initialized")
    
    async def _get_unit_io_mapping_loader(self, imei: str):
        """
        Get Unit IO mapping loader (database or CSV based on mode) and ensure mappings are loaded for IMEI.
        - RABBITMQ mode: Uses database loader (queries unit_io_mapping table)
        - LOGS mode: Uses CSV loader (reads unit_io_mapping.csv file)
        
        Args:
            imei: IMEI string to load mappings for
            
        Returns:
            Unit IO mapping loader instance (DatabaseUnitIOMappingLoader or CSVUnitIOMappingLoader), or None if failed
        """
        try:
            from teltonika_database.unit_io_mapping_loader import get_unit_io_mapping_loader
            
            loader = await get_unit_io_mapping_loader()
            
            # Load mappings for this IMEI if not already loaded
            await loader.load_mappings_for_imei(imei)
            
            return loader
        except Exception as e:
            logger.warning(f"Could not get database Unit IO mapping loader for IMEI {imei}: {e}. Unit IO mapping will be skipped.")
            return None
    
    def _try_decode_tcp_packet(self, packet_bytes: bytes) -> Optional[TcpDataPacket]:
        """
        Try to decode TCP packet from raw bytes (AVL data only).
        
        Decodes Teltonika protocol packet using ReverseBinaryReader and DataDecoder.
        Handles all supported AVL codecs (7, 8, 8E, 16).
        
        Note: For Codec 12 (GPRS commands), use _try_decode_codec12() instead. Unit IO mapping is applied in _format_avl_record_to_dict().
        
        Args:
            packet_bytes: Raw packet bytes from TCP stream
        
        Returns:
            TcpDataPacket object if decoding succeeds, None otherwise
        
        Raises:
            No exceptions raised - all errors are caught and logged
        """
        try:
            import io
            reader = ReverseBinaryReader(io.BytesIO(packet_bytes))
            decoder = DataDecoder(reader)
            return decoder.decode_tcp_data()
        except Exception as e:
            packet_size = len(packet_bytes) if packet_bytes else 0
            logger.error(
                f"Error decoding TCP packet: packet_size={packet_size} bytes, "
                f"error={type(e).__name__}: {e}",
                exc_info=True
            )
            return None
    
    def _try_decode_codec12(self, packet_bytes: bytes) -> Optional[Codec12Response]:
        """
        Try to decode Codec 12 packet from raw bytes (GPRS command responses).
        
        Args:
            packet_bytes: Raw packet bytes from TCP stream
        
        Returns:
            Codec12Response object if decoding succeeds, None otherwise
        """
        try:
            import io
            reader = ReverseBinaryReader(io.BytesIO(packet_bytes))
            decoder = DataDecoder(reader)
            return decoder.decode_codec12()
        except Exception as e:
            packet_size = len(packet_bytes) if packet_bytes else 0
            logger.error(
                f"Error decoding Codec 12 packet: packet_size={packet_size} bytes, "
                f"error={type(e).__name__}: {e}",
                exc_info=True
            )
            return None
    
    def _is_codec12_packet(self, packet_bytes: bytes) -> bool:
        """
        Check if raw bytes represent a Codec 12 packet.
        
        Args:
            packet_bytes: Raw packet bytes
        
        Returns:
            True if this is a Codec 12 packet
        """
        if len(packet_bytes) < 12:
            logger.debug(f"Packet too small for Codec 12 check: {len(packet_bytes)} bytes")
            return False
        
        # Codec ID is at byte 8 (after preamble(4) + data_size(4))
        codec_id = packet_bytes[8]
        is_codec12 = codec_id == 0x0C
        
        # Log for debugging Codec 12 detection issues
        if len(packet_bytes) < 100:  # Only log small packets (likely command responses)
            hex_preview = packet_bytes[:min(20, len(packet_bytes))].hex()
            logger.debug(
                f"Codec check: size={len(packet_bytes)}, byte[8]=0x{codec_id:02X}, "
                f"is_codec12={is_codec12}, hex={hex_preview}"
            )
        
        if is_codec12:
            logger.info(f"Detected Codec 12 packet: codec_id=0x{codec_id:02X}, size={len(packet_bytes)}")
        
        return is_codec12
    
    async def _handle_codec12_response(self, imei: str, response: Codec12Response, 
                                        ip: str, port: int) -> Dict[str, int]:
        """
        Handle a Codec 12 GPRS command response.
        
        This is called when a device sends a response to a GPRS command.
        The response is passed to the registered handler for database updates.
        
        Args:
            imei: Device IMEI
            response: Decoded Codec12Response
            ip: Device IP address
            port: Device port
        
        Returns:
            Statistics dictionary
        """
        global _codec12_response_handler
        
        logger.info(
            f"Received Codec 12 {'RESPONSE' if response.is_response else 'COMMAND'} "
            f"from IMEI={imei}, {ip}:{port}: "
            f"response_text='{response.response_text[:100]}{'...' if len(response.response_text) > 100 else ''}'"
        )
        
        # Call the registered handler if available
        if _codec12_response_handler:
            try:
                await _codec12_response_handler(imei, response)
                logger.debug(f"Codec 12 response handler called for IMEI={imei}")
            except Exception as e:
                logger.error(
                    f"Error in Codec 12 response handler for IMEI={imei}: {e}",
                    exc_info=True
                )
        else:
            logger.warning(
                f"No Codec 12 response handler registered. "
                f"Response from IMEI={imei} will not update command_sent. "
                f"Response text: '{response.response_text[:100]}'"
            )
        
        return {'acks_sent': 0, 'acks_failed': 0, 'records_processed': 0, 'records_failed': 0}
    
    async def _send_ack(self, writer: Any, num_accepted: int):
        """
        Send ACK immediately after parsing
        Teltonika ACK format: 4 bytes big-endian integer (number of accepted AVL elements)
        """
        try:
            if not writer or writer.is_closing():
                logger.warning("Cannot send ACK - writer is closing")
                return
            
            # Teltonika ACK: 4-byte big-endian integer
            response = struct.pack('>I', num_accepted)
            writer.write(response)
            await writer.drain()
            logger.info(f"✓ ACK sent: {num_accepted} elements accepted")
        
        except Exception as e:
            imei = getattr(writer, '_imei', 'unknown') if writer else 'unknown'
            logger.error(
                f"Error sending ACK: imei={imei}, num_accepted={num_accepted}, "
                f"error={type(e).__name__}: {e}",
                exc_info=True
            )
    
    async def _format_avl_record_to_dict(self, record: Any, imei: str, server_time: datetime) -> List[Dict[str, Any]]:
        """
        Format AVL record to dictionary for buffer (following Teltonika protocol).
        Returns list of dictionaries (one per AVL record).
        """
        records = []
        
        # GPS data
        gps = getattr(record, "gps_element", None)
        gps_time = record.date_time if record.date_time else server_time
        
        # Convert raw integer coordinates to decimal degrees
        latitude = float(gps.y) / 10000000.0 if gps and gps.y else 0.0
        longitude = float(gps.x) / 10000000.0 if gps and gps.x else 0.0
        altitude = int(gps.altitude) if gps else 0
        angle = int(gps.angle) if gps else 0
        satellites = int(gps.satellites) if gps else 0
        speed = int(gps.speed) if gps else 0
        
        # Constants for GPS validity calculation
        INVALID_GPS_LATITUDE = 0.0
        INVALID_GPS_LONGITUDE = 0.0
        IS_VALID_FALSE = 0
        IS_VALID_TRUE = 1
        
        # Calculate is_valid: 0 if both lat and lon are zero, else 1
        is_valid = IS_VALID_FALSE if (latitude == INVALID_GPS_LATITUDE and longitude == INVALID_GPS_LONGITUDE) else IS_VALID_TRUE
        
        # Base record structure - initialize all schema columns in database order
        # Column order matches trackdata table: imei, server_time, gps_time, latitude, longitude, ...
        # Columns will be populated dynamically from Unit IO mapping (not hard-coded logic)
        base_record = {
            'imei': imei,
            'server_time': server_time.isoformat(),
            'gps_time': gps_time.isoformat() if gps_time else server_time.isoformat(),
            'latitude': latitude,
            'longitude': longitude,
            'altitude': altitude,
            'angle': angle,
            'satellites': satellites,
            'speed': speed,
            'status': 'Normal',  # Will be updated from event_id mapping below (DEFAULT_STATUS)
            'passenger_seat': '',
            'main_battery': '',
            'battery_voltage': '',
            'fuel': '',
            'dallas_temperature_1': '',
            'dallas_temperature_2': '',
            'dallas_temperature_3': '',
            'dallas_temperature_4': '',
            'ble_humidity_1': '',
            'ble_humidity_2': '',
            'ble_humidity_3': '',
            'ble_humidity_4': '',
            'ble_temperature_1': '',
            'ble_temperature_2': '',
            'ble_temperature_3': '',
            'ble_temperature_4': '',
            'green_driving_value': '',
            'dynamic_io': '{}',
            'is_valid': is_valid
        }
        
        # Complete IO element processing with Unit IO mapping
        io_element = getattr(record, "io_element", None)
        io_data_dict = {}
        dynamic_io = {}
        event_status = 'Normal'  # Default status (following original logic)
        
        if io_element:
            io_data = {}
            
            # Get event_id (the IO that triggered this AVL record)
            event_id = io_element.event_id if io_element else ""
            
            # Get database Unit IO mapping loader and ensure mappings are loaded for this IMEI
            unit_io_mapping_loader = await self._get_unit_io_mapping_loader(imei)
            
            # Determine status from event_id (Teltonika protocol logic)
            # Note: event_id can be 0 (integer), so we check if io_element exists and has properties
            # Since event_id is only set when io_element exists, we just need to check io_element
            status_mapping = None  # Store the mapping that created the status for alarm check
            if io_element and io_element.properties:
                # Find the IO property that matches the event_id
                # event_id can be 0, so we need to handle it as an integer comparison
                for prop in io_element.properties:
                    if prop.id == event_id:
                        raw_value = self._get_io_value(prop)
                        if unit_io_mapping_loader and raw_value is not None:
                            mappings = unit_io_mapping_loader.get_mappings_for_io(event_id, imei)
                            
                            # Find matching mapping for status event
                            for mapping in mappings:
                                if mapping.target in [1, 2] and mapping.io_type == 2:  # Digital
                                    if mapping.value is not None:
                                        # Compare values (handle both int and float)
                                        # For digital IOs, exact match is expected
                                        if int(raw_value) == int(mapping.value):
                                            event_status = f"{mapping.io_name} {mapping.value_name}"
                                            status_mapping = mapping  # Store for alarm check
                                            break
                        break
            
            # Process all IO properties for column values, JSONB, and io_properties string
            if io_element and io_element.properties:
                for prop in io_element.properties:
                    io_id = prop.id
                    raw_value = self._get_io_value(prop)
                    
                    # Store raw IO data for database purposes (not in original, but needed for database)
                    if io_id is not None:
                        io_data[f'io_{io_id}'] = raw_value
                        io_data[f'io_{io_id:02X}'] = raw_value  # Hex format (e.g., io_EF for 239)
                        io_data_dict[f'io_{io_id}'] = raw_value
                    
                    # Get mappings for this IO ID
                    mappings = unit_io_mapping_loader.get_mappings_for_io(io_id, imei) if unit_io_mapping_loader else []
                    
                    for mapping in mappings:
                        # Process column values (target = 0 or 2)
                        if mapping.target in [0, 2] and mapping.column_name:
                            if raw_value is not None:
                                # Apply multiplier if present and non-zero (for analog IOs or IOs with multiplier)
                                # Digital IOs (io_type=2) typically don't have multipliers, but if one is specified, apply it
                                if mapping.io_multiplier and mapping.io_multiplier != 1.0:
                                    calculated_value = raw_value * mapping.io_multiplier
                                else:
                                    calculated_value = raw_value
                                
                                column_name = mapping.column_name
                                
                                # Only process if column exists in base_record (schema column)
                                # This ensures we only populate known schema columns
                                if column_name in base_record:
                                    # Format value based on IO type and multiplier (not hard-coded column names)
                                    formatted_value = self._format_io_value(
                                        calculated_value, 
                                        mapping.io_type, 
                                        mapping.io_multiplier,
                                        raw_value,
                                        mapping.io_name
                                    )
                                    
                                    if formatted_value is not None:
                                        base_record[column_name] = formatted_value
                        
                        # Process JSONB (target = 3)
                        if mapping.target == 3 and mapping.column_name:
                            if raw_value is not None:
                                # Apply multiplier if present and non-zero (for analog IOs or IOs with multiplier)
                                # Digital IOs (io_type=2) typically don't have multipliers, but if one is specified, apply it
                                if mapping.io_multiplier and mapping.io_multiplier != 1.0:
                                    calculated_value = raw_value * mapping.io_multiplier
                                else:
                                    calculated_value = raw_value
                                dynamic_io[mapping.column_name] = calculated_value
            
            if io_data:
                base_record['io_data'] = json.dumps(io_data)
            
            # Store dynamic_io JSON
            # FALLBACK: If no mappings were found for IMEI and dynamic_io is still empty, 
            # put all IOs from io_data into dynamic_io.
            # NOTE: Original code has similar fallback logic in async_save_to_csv.py (lines 242-257).
            # This implementation moves the fallback to the parser for earlier handling in the pipeline.
            if not dynamic_io and io_data and (not unit_io_mapping_loader or not unit_io_mapping_loader.has_mappings_for_imei(imei)):
                # Put all Unit IOs into dynamic_io when no mappings exist for this Unit IMEI
                dynamic_io = {k: v for k, v in io_data.items() if k.startswith('io_')}
                logger.debug(f"No Unit IO mappings found for Unit IMEI {imei}, storing all IOs in dynamic_io: {len(dynamic_io)} IOs")
            
            base_record['dynamic_io'] = json.dumps(dynamic_io) if dynamic_io else '{}'
        
        # Update status from event_id mapping (following original logic)
        base_record['status'] = event_status
        
        # Add alarm fields to base_record if it's an alarm
        # (We create ONE record with all fields, then select columns when saving)
        base_record['is_alarm'] = 0
        if event_status != 'Normal' and status_mapping and status_mapping.is_alarm:
            # Check if GPS time is within the time window (StartTime/EndTime)
            # gps_time from device is UTC
            if self._is_time_in_window(gps_time, status_mapping.start_time, status_mapping.end_time):
                base_record['is_alarm'] = 1
                base_record['is_sms'] = 1 if status_mapping.is_sms else 0
                base_record['is_email'] = 1 if status_mapping.is_email else 0
                base_record['is_call'] = 1 if status_mapping.is_call else 0
        
        # Find nearest location reference and calculate distance
        base_record['reference_id'] = None
        base_record['distance'] = None
        if is_valid == IS_VALID_TRUE and latitude != 0.0 and longitude != 0.0:
            try:
                from teltonika_database.location_reference_loader import find_nearest_location_reference
                nearest_ref = await find_nearest_location_reference(latitude, longitude, max_distance_km=50.0)
                if nearest_ref:
                    base_record['reference_id'] = nearest_ref['reference_id']
                    # Convert distance from meters to kilometers for storage
                    base_record['distance'] = nearest_ref['distance'] / 1000.0
            except Exception as e:
                logger.debug(f"Could not find nearest location reference: lat={latitude}, lon={longitude}, error={e}")
        
        # Return single record with all fields
        # Column selection happens when saving to trackdata/events/alarms
        records.append(base_record)
        return records
    
    def _calculate_decimal_places(self, multiplier: float) -> int:
        """
        Calculate number of decimal places needed based on multiplier.
        Examples:
        - multiplier 1.0 -> 0 decimal places
        - multiplier 0.1 -> 1 decimal place
        - multiplier 0.01 -> 2 decimal places
        - multiplier 0.001 -> 3 decimal places
        """
        if multiplier == 0:
            return 0
        
        # Convert to string to count decimal places
        multiplier_str = f"{multiplier:.10f}".rstrip('0').rstrip('.')
        if '.' in multiplier_str:
            return len(multiplier_str.split('.')[1])
        return 0
    
    def _format_io_value(self, calculated_value: float, io_type: int, io_multiplier: float, 
                         raw_value: float, io_name: str) -> Optional[str]:
        """
        Format IO value based on IO type and multiplier (not hard-coded column names).
        
        Args:
            calculated_value: Value after applying multiplier (if multiplier was applied) or raw value
            io_type: 2=Digital, 3=Analog
            io_multiplier: Multiplier used to calculate the value
            raw_value: Raw value before multiplier (for error code checking)
            io_name: IO name from mapping (for temperature error code detection)
            
        Returns:
            Formatted string value, or empty string if error code detected or value is 0
        """
        if calculated_value == 0:
            return ""
        
        # Digital IOs (io_type=2): format as integer UNLESS multiplier was applied
        # If multiplier was applied (and != 1.0), format with decimals
        if io_type == 2:
            # If multiplier was applied, format with decimals based on multiplier precision
            if io_multiplier and io_multiplier != 1.0:
                decimal_places = self._calculate_decimal_places(io_multiplier)
                return f"{calculated_value:.{decimal_places}f}"
            else:
                return str(int(calculated_value))
        
        # Analog IOs (io_type=3): format based on multiplier precision
        # Check for temperature error codes based on io_name pattern (not column name)
        io_name_lower = io_name.lower()
        if 'temperature' in io_name_lower:
            # Determine sensor type from io_name
            sensor_type = 'dallas' if 'dallas' in io_name_lower else 'ble'
            error_msg = self._check_temperature_error_code(raw_value, sensor_type)
            if error_msg:
                return ""  # Empty for error codes
        
        # Calculate decimal places from multiplier
        # This ensures precision matches the multiplier (e.g., 0.001 -> 3 decimals, 0.1 -> 1 decimal)
        decimal_places = self._calculate_decimal_places(io_multiplier)
        
        # Format with appropriate precision based on multiplier
        if decimal_places == 0:
            return str(int(calculated_value))
        else:
            # Use the calculated precision from multiplier, not hard-coded .1f
            return f"{calculated_value:.{decimal_places}f}"
    
    def _get_io_value(self, prop: Any) -> Optional[float]:
        """Extract numeric value from IO property (Teltonika protocol logic)."""
        try:
            # Try to get value attribute
            if hasattr(prop, 'value') and prop.value is not None:
                try:
                    return float(prop.value)
                except (ValueError, TypeError):
                    # If value is not numeric, try to convert
                    if isinstance(prop.value, (int, float)):
                        return float(prop.value)
                    return None
            
            # Try to get array_value (for multi-byte values)
            if hasattr(prop, 'array_value') and prop.array_value:
                # For array values, interpret as bytes and convert to number
                try:
                    if len(prop.array_value) == 1:
                        return float(prop.array_value[0])
                    elif len(prop.array_value) == 2:
                        # Big-endian 16-bit
                        return float((prop.array_value[0] << 8) | prop.array_value[1])
                    elif len(prop.array_value) == 4:
                        # Big-endian 32-bit
                        return float((prop.array_value[0] << 24) | (prop.array_value[1] << 16) | 
                                     (prop.array_value[2] << 8) | prop.array_value[3])
                    elif len(prop.array_value) == 8:
                        # Big-endian 64-bit
                        return float((prop.array_value[0] << 56) | (prop.array_value[1] << 48) |
                                     (prop.array_value[2] << 40) | (prop.array_value[3] << 32) |
                                     (prop.array_value[4] << 24) | (prop.array_value[5] << 16) |
                                     (prop.array_value[6] << 8) | prop.array_value[7])
                except (ValueError, TypeError, IndexError):
                    return None
            
            return None
        except Exception:
            return None
    
    def _check_temperature_error_code(self, raw_value: float, sensor_type: str) -> Optional[str]:
        """Check if raw temperature value is an error code and return error message (following original logic)."""
        if sensor_type == 'dallas':
            # Dallas Temperature error codes
            if raw_value == 850 or raw_value == 5000:
                return "Sensor not ready"
            elif raw_value == 2000:
                return "Value read error"
            elif raw_value == 3000:
                return "Not connected"
            elif raw_value == 4000:
                return "ID failed"
        elif sensor_type == 'ble':
            # BLE Temperature error codes
            if raw_value == 4000:
                return "Abnormal sensor state"
            elif raw_value == 3000:
                return "Sensor not found"
            elif raw_value == 2000:
                return "Failed sensor data parsing"
        
        return None
    
    def _is_time_in_window(self, gps_datetime: datetime, start_time_str: str, end_time_str: str) -> bool:
        """
        Check if GPS datetime time component is within the start_time and end_time window.
        
        Args:
            gps_datetime: GPS datetime (UTC from device)
            start_time_str: Start time in HH:MM:SS format (e.g., "3:00:00")
            end_time_str: End time in HH:MM:SS format (e.g., "6:00:00")
        
        Returns:
            True if GPS time is within the window, False otherwise
        """
        try:
            # Parse time strings (handle both "HH:MM:SS" and "H:MM:SS" formats)
            def parse_time(time_str: str) -> tuple[int, int, int]:
                parts = time_str.split(':')
                if len(parts) == 3:
                    return int(parts[0]), int(parts[1]), int(parts[2])
                return 0, 0, 0
            
            start_hour, start_min, start_sec = parse_time(start_time_str)
            end_hour, end_min, end_sec = parse_time(end_time_str)
            
            # Get GPS time components (UTC from device)
            gps_hour = gps_datetime.hour
            gps_min = gps_datetime.minute
            gps_sec = gps_datetime.second
            
            # Convert to seconds for easier comparison
            gps_total_sec = gps_hour * 3600 + gps_min * 60 + gps_sec
            start_total_sec = start_hour * 3600 + start_min * 60 + start_sec
            end_total_sec = end_hour * 3600 + end_min * 60 + end_sec
            
            # Handle time window that spans midnight (e.g., 22:00:00 to 6:00:00)
            if start_total_sec > end_total_sec:
                # Window spans midnight
                return gps_total_sec >= start_total_sec or gps_total_sec <= end_total_sec
            else:
                # Normal window within same day
                return start_total_sec <= gps_total_sec <= end_total_sec
        except Exception as e:
            logger.warning(f"Error checking time window: {e}")
            return False
    
    async def _parse_and_process_packet(self, packet_data: Dict[str, Any]) -> Dict[str, int]:
        """
        Parse packet and process data
        CRITICAL: ACK is sent AFTER buffer add (ensures data persistence guarantee)
        Data is guaranteed to be in buffer before ACK
        
        IMPROVEMENTS:
        - ACK sent AFTER buffer add (not before)
        - Structured logging (IMEI, GPS, device, status logs)
        
        Args:
            packet_data: Dictionary with 'data', 'writer', 'ip', 'port', 'imei'
            
        Returns:
            Dictionary with statistics: {'acks_sent': int, 'acks_failed': int, 
                                         'records_processed': int, 'records_failed': int}
        """
        try:
            packet_bytes = packet_data.get('data')
            writer = packet_data.get('writer')
            ip = packet_data.get('ip', 'unknown')
            port = packet_data.get('port', 0)
            imei = packet_data.get('imei')
            
            if not packet_bytes:
                return {'acks_sent': 0, 'acks_failed': 0, 'records_processed': 0, 'records_failed': 0}
            
            # Handle ping packets (0xFF)
            if len(packet_bytes) >= 1 and packet_bytes[0] == 0xFF:
                logger.debug(f"Received PING from {ip}:{port}")
                return {'acks_sent': 0, 'acks_failed': 0, 'records_processed': 0, 'records_failed': 0}
            
            # IMPROVEMENT: Validate packet size before decoding
            if len(packet_bytes) < 8:  # Minimum: preamble (4) + length (4)
                logger.warning(
                    f"Packet too small from {ip}:{port} (IMEI={imei or 'unknown'}): "
                    f"{len(packet_bytes)} bytes (minimum: 8 bytes)"
                )
                # IMPROVEMENT: Log first few bytes for debugging
                if len(packet_bytes) > 0:
                    hex_preview = packet_bytes[:min(16, len(packet_bytes))].hex().upper()
                    logger.debug(f"Packet hex preview: {hex_preview}")
                return {'acks_sent': 0, 'acks_failed': 0, 'records_processed': 0, 'records_failed': 0}
            
            # Check if this is a Codec 12 packet (GPRS command response)
            if self._is_codec12_packet(packet_bytes):
                # Get IMEI from IP table (Codec 12 response comes over existing connection)
                if not imei:
                    imei = await AsyncGlobalIPTable.getImeiByWriter(writer)
                
                codec12_response = self._try_decode_codec12(packet_bytes)
                if codec12_response:
                    return await self._handle_codec12_response(
                        imei or 'unknown', codec12_response, ip, port
                    )
                else:
                    logger.warning(f"Failed to decode Codec 12 packet from {ip}:{port}")
                    return {'acks_sent': 0, 'acks_failed': 0, 'records_processed': 0, 'records_failed': 0}
            
            # Decode Teltonika AVL packet (non-Codec 12)
            packet = self._try_decode_tcp_packet(packet_bytes)
            if packet is None:
                logger.warning(
                    f"Failed to decode packet from {ip}:{port} (IMEI={imei or 'unknown'}, "
                    f"packet size: {len(packet_bytes)} bytes)"
                )
                # IMPROVEMENT: Log first few bytes for debugging
                if len(packet_bytes) > 0:
                    hex_preview = packet_bytes[:min(32, len(packet_bytes))].hex().upper()
                    logger.debug(f"Packet hex preview: {hex_preview}")
                return {'acks_sent': 0, 'acks_failed': 0, 'records_processed': 0, 'records_failed': 0}
            
            # Get IMEI from packet data or IP table
            if not imei:
                imei = await AsyncGlobalIPTable.getImeiByWriter(writer)
            
            if not imei:
                logger.warning(f"Cannot process packet - no IMEI for {ip}:{port}")
                return {'acks_sent': 0, 'acks_failed': 0, 'records_processed': 0, 'records_failed': 0}
            
            # Update IP table last communication time
            await AsyncGlobalIPTable.updateWriterTime(writer)
            
            # Data will be saved to database via consumer service
            
            # Get AVL data
            avl_data = packet.avl_data
            if not avl_data or not avl_data.data:
                logger.warning(
                    f"No AVL data in packet from {ip}:{port} (IMEI={imei or 'unknown'}, "
                    f"codec_id={packet.codec_id if hasattr(packet, 'codec_id') else 'unknown'})"
                )
                return {'acks_sent': 0, 'acks_failed': 0, 'records_processed': 0, 'records_failed': 0}
            
            # Validate AVL data count
            if len(avl_data.data) == 0:
                logger.warning(
                    f"Empty AVL data array in packet from {ip}:{port} (IMEI={imei or 'unknown'})"
                )
                return {'acks_sent': 0, 'acks_failed': 0, 'records_processed': 0, 'records_failed': 0}
            
            num_records = len(avl_data.data)
            codec_id = getattr(packet, 'codec_id', 'unknown') if hasattr(packet, 'codec_id') else 'unknown'
            logger.info(
                f"Processing packet: {num_records} AVL records from IMEI={imei}, "
                f"{ip}:{port}, codec_id={codec_id}, packet_size={len(packet_bytes)} bytes"
            )
            
            # Format records for buffer
            server_time = datetime.now(timezone.utc)
            records = []
            for i, record in enumerate(avl_data.data):
                try:
                    record_dicts = await self._format_avl_record_to_dict(record, imei, server_time)
                    records.extend(record_dicts)
                except Exception as record_error:
                    logger.error(
                        f"Error formatting AVL record {i+1}/{len(avl_data.data)} from {ip}:{port} "
                        f"(IMEI={imei or 'unknown'}): {record_error}",
                        exc_info=True
                    )
                    # Continue processing other records even if one fails
                    continue
            
            # CRITICAL: Add records to buffer FIRST (before ACK)
            # This ensures 100% guarantee that data is persisted before ACK
            # If buffer add fails, device will retry (no data loss)
            buffer_success_count = 0
            for i, record_dict in enumerate(records):
                try:
                    # IMPROVEMENT: Validate record before adding to buffer
                    if not record_dict.get('imei'):
                        logger.warning(f"Record {i+1} missing IMEI, skipping buffer add")
                        continue
                    
                    buffer_success = await async_synchronized_buffer.add_data(record_dict)
                    if buffer_success:
                        buffer_success_count += 1
                        logger.debug(
                            f"Added record {i+1} to buffer: imei={imei}, "
                            f"lat={record_dict.get('latitude')}, lon={record_dict.get('longitude')}"
                        )
                    else:
                        logger.error(
                            f"Buffer add returned False for record {i+1}: imei={imei}, "
                            f"status={record_dict.get('status', 'N/A')}"
                        )
                except Exception as e:
                    logger.error(
                        f"Error adding record {i+1} to buffer (imei={imei}): {e}",
                        exc_info=True
                    )
            
            # Data will be saved to database (trackdata/events/alarms tables) via consumer service
            
            # CRITICAL: Send ACK ONLY AFTER buffer add succeeds
            # This ensures 100% guarantee that data is in buffer before ACK
            # If buffer add fails, device will retry (no data loss)
            stats = {'acks_sent': 0, 'acks_failed': 0, 'records_processed': 0, 'records_failed': 0}
            
            if buffer_success_count == num_records:
                # All records successfully added to buffer - safe to send ACK
                try:
                    await self._send_ack(writer, num_records)
                    stats['acks_sent'] = 1
                    stats['records_processed'] = num_records
                    logger.info(f"✓ ACK sent after successful buffer add: {num_records} records from IMEI={imei}")
                except Exception as ack_error:
                    stats['acks_failed'] = 1
                    logger.error(f"Error sending ACK for IMEI={imei}: {ack_error}", exc_info=True)
            else:
                # Some records failed to add - DON'T send ACK (device will retry)
                stats['acks_failed'] = 1
                stats['records_failed'] = (num_records - buffer_success_count)
                stats['records_processed'] = buffer_success_count
                logger.error(
                    f"✗ NOT sending ACK for IMEI={imei} - "
                    f"only {buffer_success_count}/{num_records} records added to buffer. "
                    f"Device will retry to prevent data loss."
                )
            
            logger.info(f"✓ Processed {num_records} records from IMEI={imei}, {buffer_success_count} added to buffer")
            return stats
        
        except Exception as e:
            imei = packet_data.get('imei', 'unknown')
            ip = packet_data.get('ip', 'unknown')
            port = packet_data.get('port', 0)
            packet_bytes = packet_data.get('data')
            packet_size = len(packet_bytes) if packet_bytes else 0
            logger.error(
                f"Exception in _parse_and_process_packet: imei={imei}, "
                f"ip={ip}:{port}, packet_size={packet_size} bytes, "
                f"error={type(e).__name__}: {e}",
                exc_info=True
            )
            return {'acks_sent': 0, 'acks_failed': 1, 'records_processed': 0, 'records_failed': 0}
    
    async def process_packets(self):
        """
        Main processing loop - runs as background task
        Reads from msgToParse queue, parses packets, sends ACK, adds to buffer
        
        IMPROVEMENTS:
        - Better error recovery
        - Improved logging
        - Connection state validation
        """
        logger.info("AsyncPacketParser started")
        self.running = True
        
        # IMPROVEMENT: Track processing statistics
        packets_processed = 0
        packets_failed = 0
        records_processed = 0
        records_failed = 0
        acks_sent = 0
        acks_failed = 0
        
        while self.running:
            try:
                # Get packet from parse queue (non-blocking with timeout)
                from config import ServerParams
                queue_timeout = ServerParams.get_int('async_queues.queue_poll_timeout', 1)
                packet_data = await AsyncTeltonikaDataQueues.msgToParse.poll(timeout=queue_timeout)
                
                if packet_data is None:
                    continue
                
                # IMPROVEMENT: Validate packet data before processing
                if not packet_data:
                    logger.warning("Received None packet data, skipping")
                    packets_failed += 1
                    continue
                
                if not packet_data.get('data'):
                    ip = packet_data.get('ip', 'unknown')
                    port = packet_data.get('port', 0)
                    imei = packet_data.get('imei', 'unknown')
                    logger.warning(
                        f"Received empty packet data from {ip}:{port} (IMEI={imei}), skipping"
                    )
                    packets_failed += 1
                    continue
                
                # Parse and process packet
                try:
                    stats = await self._parse_and_process_packet(packet_data)
                    packets_processed += 1
                    
                    # Accumulate statistics
                    acks_sent += stats.get('acks_sent', 0)
                    acks_failed += stats.get('acks_failed', 0)
                    records_processed += stats.get('records_processed', 0)
                    records_failed += stats.get('records_failed', 0)
                    
                    # IMPROVEMENT: Log statistics periodically
                    if packets_processed % 1000 == 0 and packets_processed > 0:
                        success_rate = 100.0 * packets_processed / (packets_processed + packets_failed) if (packets_processed + packets_failed) > 0 else 0.0
                        record_success_rate = 100.0 * records_processed / (records_processed + records_failed) if (records_processed + records_failed) > 0 else 0.0
                        ack_success_rate = 100.0 * acks_sent / (acks_sent + acks_failed) if (acks_sent + acks_failed) > 0 else 0.0
                        logger.info(
                            f"Packet parser statistics: packets_processed={packets_processed}, "
                            f"packets_failed={packets_failed}, packet_success_rate={success_rate:.2f}%, "
                            f"records_processed={records_processed}, records_failed={records_failed}, "
                            f"record_success_rate={record_success_rate:.2f}%, "
                            f"acks_sent={acks_sent}, acks_failed={acks_failed}, ack_success_rate={ack_success_rate:.2f}%"
                        )
                
                except Exception as parse_error:
                    packets_failed += 1
                    ip = packet_data.get('ip', 'unknown')
                    port = packet_data.get('port', 0)
                    imei = packet_data.get('imei', 'unknown')
                    logger.error(
                        f"Error processing packet from {ip}:{port} (IMEI={imei}): {parse_error}",
                        exc_info=True
                    )
                    # Continue processing other packets even if one fails
            
            except asyncio.CancelledError:
                logger.info("AsyncPacketParser cancelled")
                break
            except Exception as e:
                packets_failed += 1
                logger.error(
                    f"Exception in AsyncPacketParser main loop: "
                    f"packets_processed={packets_processed}, packets_failed={packets_failed}, "
                    f"error={type(e).__name__}: {e}",
                    exc_info=True
                )
                await asyncio.sleep(0.1)
        
        # IMPROVEMENT: Final statistics summary
        success_rate = 100.0 * packets_processed / (packets_processed + packets_failed) if (packets_processed + packets_failed) > 0 else 0.0
        record_success_rate = 100.0 * records_processed / (records_processed + records_failed) if (records_processed + records_failed) > 0 else 0.0
        ack_success_rate = 100.0 * acks_sent / (acks_sent + acks_failed) if (acks_sent + acks_failed) > 0 else 0.0
        logger.info(
            f"AsyncPacketParser stopped - Final statistics: "
            f"packets_processed={packets_processed}, packets_failed={packets_failed}, "
            f"packet_success_rate={success_rate:.2f}%, "
            f"records_processed={records_processed}, records_failed={records_failed}, "
            f"record_success_rate={record_success_rate:.2f}%, "
            f"acks_sent={acks_sent}, acks_failed={acks_failed}, ack_success_rate={ack_success_rate:.2f}%"
        )
    
    def stop(self):
        """Stop the parser"""
        self.running = False
