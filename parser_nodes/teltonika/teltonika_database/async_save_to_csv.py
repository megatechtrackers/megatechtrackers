"""
Async SaveToCSV for Teltonika Gateway
Uses aiofiles for async CSV file operations
Uses Unit IO mapping CSV for proper column mapping and multipliers
"""
import asyncio
import logging
import csv
import os
from typing import List, Dict, Any, Optional
from datetime import datetime
import aiofiles
import io

logger = logging.getLogger(__name__)


class AsyncSaveToCSV:
    """
    Async CSV saver - saves data to CSV files using aiofiles
    Note: Unit IO mapping is applied in async_packet_parser.py, so this just uses pre-processed values
    """
    
    # CSV columns for Teltonika data
    # CSV columns for trackdata.csv
    CSV_COLUMNS = [
        'server_time', 'imei', 'gps_time', 'latitude', 'longitude', 'altitude',
        'angle', 'satellites', 'speed', 'status',
        'passenger_seat', 'main_battery', 'battery_voltage', 'fuel',
        'dallas_temperature_1', 'dallas_temperature_2', 'dallas_temperature_3', 'dallas_temperature_4',
        'ble_humidity_1', 'ble_humidity_2', 'ble_humidity_3', 'ble_humidity_4',
        'ble_temperature_1', 'ble_temperature_2', 'ble_temperature_3', 'ble_temperature_4',
        'green_driving_value', 'dynamic_io', 'is_valid'
    ]
    
    # CSV columns for alarms.csv
    CSV_COLUMNS_ALARMS = [
        'imei', 'server_time', 'gps_time', 'latitude', 'longitude', 'altitude',
        'angle', 'satellites', 'speed', 'status',
        'is_sms', 'is_email', 'is_call', 'is_valid'
    ]
    
    # CSV columns for events.csv
    CSV_COLUMNS_EVENTS = [
        'imei', 'server_time', 'gps_time', 'latitude', 'longitude', 'altitude',
        'angle', 'satellites', 'speed', 'status', 'is_valid'
    ]
    
    def __init__(self):
        """Initialize CSV saver"""
        # No Unit IO mapping needed here - it's applied in async_packet_parser.py
        pass
    
    async def save(self, data_list: List[Dict[str, Any]], table_id: str = "data"):
        """
        Save data to CSV file (async)
        
        Args:
            data_list: List of data rows to save
            table_id: Table identifier (used for filename)
        """
        try:
            # Ensure logs directory exists
            logs_dir = 'logs'
            if not os.path.exists(logs_dir):
                os.makedirs(logs_dir)
            
            # Separate trackdata, events, and alarms
            trackdata_records = []
            event_records = []
            alarm_records = []
            
            for record in data_list:
                # Single record with all fields - select columns when saving
                # - ALL records -> trackdata (with all columns)
                # - If status != 'Normal' -> ALSO events (select event columns only)
                # - If is_alarm = 1 -> ALSO alarms (select alarm columns only)
                # Examples:
                #   - Normal: trackdata only
                #   - Event only: trackdata + events
                #   - Alarm: trackdata + events + alarms
                is_alarm = record.get('is_alarm', 0) == 1
                is_event = record.get('status', 'Normal') != 'Normal'
                
                # ALL records go to trackdata (with all columns)
                trackdata_records.append(record)
                
                # If status != 'Normal' -> ALSO events (select event columns)
                if is_event:
                    event_records.append(record)
                
                # If is_alarm = 1 -> ALSO alarms (select alarm columns)
                if is_alarm:
                    alarm_records.append(record)
            
            # Save trackdata to trackdata.csv
            if trackdata_records:
                trackdata_filename = os.path.join(logs_dir, "trackdata.csv")
                file_exists = os.path.exists(trackdata_filename)
                
                output = io.StringIO(newline='')
                writer = csv.DictWriter(output, fieldnames=self.CSV_COLUMNS, extrasaction='ignore')
                
                if not file_exists:
                    writer.writeheader()
                
                for record in trackdata_records:
                    csv_row = self._convert_to_csv_row(record)
                    writer.writerow(csv_row)
                
                csv_content = output.getvalue()
                if csv_content:
                    async with aiofiles.open(trackdata_filename, 'ab') as f:
                        await f.write(csv_content.encode('utf-8'))
                    logger.info(f"✓ Saved {len(trackdata_records)} records to trackdata.csv")
            
            # Save events to events.csv
            if event_records:
                events_filename = os.path.join(logs_dir, "events.csv")
                file_exists = os.path.exists(events_filename)
                
                output = io.StringIO(newline='')
                writer = csv.DictWriter(output, fieldnames=self.CSV_COLUMNS_EVENTS, extrasaction='ignore')
                
                if not file_exists:
                    writer.writeheader()
                
                for record in event_records:
                    csv_row = self._convert_to_event_csv_row(record)
                    writer.writerow(csv_row)
                
                csv_content = output.getvalue()
                if csv_content:
                    async with aiofiles.open(events_filename, 'ab') as f:
                        await f.write(csv_content.encode('utf-8'))
                    logger.info(f"✓ Saved {len(event_records)} records to events.csv")
            
            # Save alarms to alarms.csv
            if alarm_records:
                alarms_filename = os.path.join(logs_dir, "alarms.csv")
                file_exists = os.path.exists(alarms_filename)
                
                output = io.StringIO(newline='')
                writer = csv.DictWriter(output, fieldnames=self.CSV_COLUMNS_ALARMS, extrasaction='ignore')
                
                if not file_exists:
                    writer.writeheader()
                
                for record in alarm_records:
                    csv_row = self._convert_to_alarm_csv_row(record)
                    writer.writerow(csv_row)
                
                csv_content = output.getvalue()
                if csv_content:
                    async with aiofiles.open(alarms_filename, 'ab') as f:
                        await f.write(csv_content.encode('utf-8'))
                    logger.info(f"✓ Saved {len(alarm_records)} records to alarms.csv")
        
        except Exception as e:
            logger.error(f"Error saving to CSV (async): {e}", exc_info=True)
    
    def _convert_numeric_to_csv_string(self, value: Any) -> str:
        """
        Convert numeric value to CSV string format, handling None and empty values.
        
        Args:
            value: Numeric value (int, float) or string, or None
            
        Returns:
            String representation or empty string if None/empty
        """
        if value is None:
            return ''
        if isinstance(value, str):
            return value.strip() if value.strip() else ''
        # Convert numeric to string
        return str(value)
    
    def _convert_to_csv_row(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert record dictionary to CSV row format
        Parses io_data JSON and maps IO values to CSV columns
        
        Args:
            record: Data record dictionary
            
        Returns:
            CSV row dictionary
        """
        import json
        
        # Extract values with defaults - convert numeric fields to strings for CSV
        csv_row = {
            'server_time': record.get('server_time', datetime.now().isoformat()),
            'imei': record.get('imei', ''),
            'gps_time': record.get('gps_time', ''),
            'latitude': record.get('latitude', 0.0),
            'longitude': record.get('longitude', 0.0),
            'altitude': record.get('altitude', 0),
            'angle': record.get('angle', 0),
            'satellites': record.get('satellites', 0),
            'speed': record.get('speed', 0),
            'status': record.get('status', 'Normal'),
            'passenger_seat': self._convert_numeric_to_csv_string(record.get('passenger_seat')),
            'main_battery': self._convert_numeric_to_csv_string(record.get('main_battery')),
            'battery_voltage': self._convert_numeric_to_csv_string(record.get('battery_voltage')),
            'fuel': self._convert_numeric_to_csv_string(record.get('fuel')),
            'dallas_temperature_1': self._convert_numeric_to_csv_string(record.get('dallas_temperature_1')),
            'dallas_temperature_2': self._convert_numeric_to_csv_string(record.get('dallas_temperature_2')),
            'dallas_temperature_3': self._convert_numeric_to_csv_string(record.get('dallas_temperature_3')),
            'dallas_temperature_4': self._convert_numeric_to_csv_string(record.get('dallas_temperature_4')),
            'ble_humidity_1': self._convert_numeric_to_csv_string(record.get('ble_humidity_1')),
            'ble_humidity_2': self._convert_numeric_to_csv_string(record.get('ble_humidity_2')),
            'ble_humidity_3': self._convert_numeric_to_csv_string(record.get('ble_humidity_3')),
            'ble_humidity_4': self._convert_numeric_to_csv_string(record.get('ble_humidity_4')),
            'ble_temperature_1': self._convert_numeric_to_csv_string(record.get('ble_temperature_1')),
            'ble_temperature_2': self._convert_numeric_to_csv_string(record.get('ble_temperature_2')),
            'ble_temperature_3': self._convert_numeric_to_csv_string(record.get('ble_temperature_3')),
            'ble_temperature_4': self._convert_numeric_to_csv_string(record.get('ble_temperature_4')),
            'green_driving_value': self._convert_numeric_to_csv_string(record.get('green_driving_value')),
            'dynamic_io': record.get('dynamic_io', '{}'),
            'is_valid': record.get('is_valid', 1)
        }
        
        # Unit IO mapping is already applied in async_packet_parser.py when creating records
        # The parser applies multipliers and maps IO values to CSV columns
        # CSV saver just uses the pre-processed values from the record
        
        # Parse dynamic_io if it exists (already processed by parser)
        dynamic_io = record.get('dynamic_io', '{}')
        if isinstance(dynamic_io, str):
            try:
                dynamic_io = json.loads(dynamic_io)
            except (json.JSONDecodeError, TypeError):
                dynamic_io = {}
        elif not isinstance(dynamic_io, dict):
            dynamic_io = {}
        
        # Set dynamic_io JSON (already processed by parser)
        csv_row['dynamic_io'] = json.dumps(dynamic_io) if dynamic_io else '{}'
        
        # Fallback: Only process io_data if parser didn't populate columns
        # (This should not be needed if parser works correctly)
        io_data = record.get('io_data', {})
        if isinstance(io_data, str):
            try:
                io_data = json.loads(io_data)
            except (json.JSONDecodeError, TypeError):
                io_data = {}
        elif not isinstance(io_data, dict):
            io_data = {}
        
        # Only use fallback if columns are empty (parser didn't process them)
        # Fallback: If no mappings exist, put all IOs into dynamic_io
        if io_data and not any(csv_row.get(col) for col in ['main_battery', 'battery_voltage', 'passenger_seat'] if csv_row.get(col)):
            # Store all IO data in dynamic_io as JSON (simple fallback - no column mapping)
            csv_row['dynamic_io'] = json.dumps(io_data)
        
        return csv_row
    
    def _convert_to_event_csv_row(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert record dictionary to event CSV row format
        
        Args:
            record: Data record dictionary
            
        Returns:
            Event CSV row dictionary
        """
        from datetime import datetime
        from dateutil import parser
        
        # Extract values with defaults
        csv_row = {
            'imei': record.get('imei', 'UNKNOWN'),
            'server_time': record.get('server_time', datetime.now().isoformat()),
            'gps_time': record.get('gps_time', datetime.now().isoformat()),
            'latitude': record.get('latitude', 0.0),
            'longitude': record.get('longitude', 0.0),
            'altitude': record.get('altitude', 0),
            'angle': record.get('angle', 0),
            'satellites': record.get('satellites', 0),
            'speed': record.get('speed', 0),
            'status': record.get('status', 'Normal'),
            'is_valid': record.get('is_valid', 1)
        }
        
        return csv_row
    
    def _convert_to_alarm_csv_row(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert record dictionary to alarm CSV row format
        
        Args:
            record: Data record dictionary
            
        Returns:
            Alarm CSV row dictionary
        """
        from datetime import datetime
        from dateutil import parser
        
        # Extract values with defaults
        csv_row = {
            'imei': record.get('imei', 'UNKNOWN'),
            'server_time': record.get('server_time', datetime.now().isoformat()),
            'gps_time': record.get('gps_time', datetime.now().isoformat()),
            'latitude': record.get('latitude', 0.0),
            'longitude': record.get('longitude', 0.0),
            'altitude': record.get('altitude', 0),
            'angle': record.get('angle', 0),
            'satellites': record.get('satellites', 0),
            'speed': record.get('speed', 0),
            'status': record.get('status', 'Normal'),
            'is_sms': record.get('is_sms', 0),
            'is_email': record.get('is_email', 0),
            'is_call': record.get('is_call', 0),
            'is_valid': record.get('is_valid', 1)
        }
        
        return csv_row
