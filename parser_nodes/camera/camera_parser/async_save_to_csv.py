"""
Async CSV Saver for Camera Parser (LOGS mode)
Saves trackdata and events to CSV files for standalone testing
"""
import asyncio
import logging
import csv
import os
import io
from typing import List, Dict, Any
from datetime import datetime, timezone

try:
    import aiofiles
    HAS_AIOFILES = True
except ImportError:
    HAS_AIOFILES = False

logger = logging.getLogger(__name__)


class AsyncSaveToCSV:
    """
    Async CSV saver for camera parser data.
    Used in LOGS mode for standalone testing without RabbitMQ.
    """
    
    # CSV columns for trackdata.csv
    CSV_COLUMNS_TRACKDATA = [
        'server_time', 'imei', 'gps_time', 'latitude', 'longitude', 'altitude',
        'angle', 'satellites', 'speed', 'status', 'vendor'
    ]
    
    # CSV columns for events.csv (safety alarms)
    CSV_COLUMNS_EVENTS = [
        'server_time', 'imei', 'gps_time', 'latitude', 'longitude', 'altitude',
        'angle', 'satellites', 'speed', 'status', 'photo_url', 'video_url', 'vendor'
    ]
    
    # CSV columns for alarms.csv (notifications to send)
    CSV_COLUMNS_ALARMS = [
        'server_time', 'imei', 'gps_time', 'latitude', 'longitude', 'altitude',
        'angle', 'satellites', 'speed', 'status', 'photo_url', 'video_url', 'vendor',
        'is_sms', 'is_email', 'is_call', 'priority'
    ]
    
    def __init__(self, logs_dir: str = 'logs'):
        """
        Initialize CSV saver.
        
        Args:
            logs_dir: Directory to save CSV files (created if not exists)
        """
        self.logs_dir = logs_dir
        self._ensure_logs_dir()
    
    def _ensure_logs_dir(self):
        """Ensure logs directory exists"""
        if not os.path.exists(self.logs_dir):
            os.makedirs(self.logs_dir)
            logger.info(f"Created logs directory: {self.logs_dir}")
    
    async def save_trackdata(self, records: List[Dict[str, Any]]):
        """
        Save trackdata records to CSV.
        
        Args:
            records: List of trackdata records
        """
        if not records:
            return
        
        filename = os.path.join(self.logs_dir, "camera_trackdata.csv")
        await self._save_to_csv(filename, records, self.CSV_COLUMNS_TRACKDATA)
        logger.info(f"✓ Saved {len(records)} trackdata records to {filename}")
    
    async def save_events(self, records: List[Dict[str, Any]]):
        """
        Save event/alarm records to CSV.
        
        Args:
            records: List of event records
        """
        if not records:
            return
        
        filename = os.path.join(self.logs_dir, "camera_events.csv")
        await self._save_to_csv(filename, records, self.CSV_COLUMNS_EVENTS)
        logger.info(f"✓ Saved {len(records)} event records to {filename}")
    
    async def save_alarms(self, records: List[Dict[str, Any]]):
        """
        Save alarm notification records to CSV.
        These are events that need to trigger SMS/email/call.
        
        Args:
            records: List of alarm records with notification flags
        """
        if not records:
            return
        
        filename = os.path.join(self.logs_dir, "camera_alarms.csv")
        await self._save_to_csv(filename, records, self.CSV_COLUMNS_ALARMS)
        logger.info(f"✓ Saved {len(records)} alarm records to {filename}")
    
    async def save(self, message: Dict[str, Any]):
        """
        Save a message to appropriate CSV files following Teltonika pattern:
        - ALL records → trackdata (always)
        - If status != 'Normal' → also events
        - If is_alarm == 1 → also alarms
        
        Args:
            message: Message dict with 'data' fields
        """
        data = message.get('data', message)
        
        # Add metadata from message wrapper
        data['vendor'] = message.get('vendor', 'camera')
        if not data.get('server_time'):
            data['server_time'] = message.get('timestamp', datetime.now(timezone.utc).isoformat() + 'Z')  # UTC consistent
        
        # Determine routing based on status and is_alarm (Teltonika pattern)
        status = data.get('status', 'Normal')
        is_event = status != 'Normal'
        is_alarm = data.get('is_alarm', 0) == 1
        
        # ALL records go to trackdata
        await self.save_trackdata([data])
        
        # If status != 'Normal' → also events
        if is_event:
            await self.save_events([data])
        
        # If is_alarm == 1 → also alarms
        if is_alarm:
            await self.save_alarms([data])
    
    async def _save_to_csv(self, filename: str, records: List[Dict[str, Any]], columns: List[str]):
        """
        Save records to CSV file (async or sync fallback).
        
        Args:
            filename: Output filename
            records: List of records
            columns: CSV column names
        """
        file_exists = os.path.exists(filename)
        
        # Build CSV content in memory
        output = io.StringIO(newline='')
        writer = csv.DictWriter(output, fieldnames=columns, extrasaction='ignore')
        
        if not file_exists:
            writer.writeheader()
        
        for record in records:
            csv_row = self._prepare_row(record, columns)
            writer.writerow(csv_row)
        
        csv_content = output.getvalue()
        
        if not csv_content:
            return
        
        # Write to file
        if HAS_AIOFILES:
            async with aiofiles.open(filename, 'ab') as f:
                await f.write(csv_content.encode('utf-8'))
        else:
            # Sync fallback
            with open(filename, 'ab') as f:
                f.write(csv_content.encode('utf-8'))
    
    def _prepare_row(self, record: Dict[str, Any], columns: List[str]) -> Dict[str, Any]:
        """
        Prepare a record for CSV output.
        
        Args:
            record: Raw record
            columns: Expected columns
            
        Returns:
            Dict with only expected columns
        """
        row = {}
        for col in columns:
            value = record.get(col)
            
            # Handle None values
            if value is None:
                row[col] = ''
            # Format datetime objects
            elif isinstance(value, datetime):
                row[col] = value.isoformat()
            # Keep other values as-is
            else:
                row[col] = value
        
        return row


# Global CSV saver instance
_csv_saver: AsyncSaveToCSV = None


def get_csv_saver() -> AsyncSaveToCSV:
    """Get or create global CSV saver instance"""
    global _csv_saver
    
    if _csv_saver is None:
        _csv_saver = AsyncSaveToCSV()
    
    return _csv_saver
