"""
Data Transformer for Camera Parser
Transforms CMS API data to RabbitMQ message format
With input validation and sanitization
"""
import logging
import uuid
import hashlib
from typing import Dict, Any, Optional
from datetime import datetime, timezone


def utc_now_iso() -> str:
    """Get current UTC time in ISO format with Z suffix (not +00:00)."""
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'


def generate_deterministic_id(vendor: str, imei: str, gps_time: str, record_type: str) -> str:
    """
    Generate a deterministic message ID based on content.
    This ensures the same data always gets the same ID for deduplication.
    """
    content = f"{vendor}:{imei}:{gps_time}:{record_type}"
    return hashlib.md5(content.encode()).hexdigest()

import sys
sys.path.insert(0, '..')
from camera_infrastructure.input_validator import (
    convert_device_id_to_imei,
    validate_coordinates,
    validate_altitude,
    validate_speed,
    validate_heading,
    validate_gps_time,
    validate_video_url,
    validate_photo_url,
    sanitize_event_type,
)

logger = logging.getLogger(__name__)


class DataTransformer:
    """Transforms CMS data to RabbitMQ message format with validation"""
    
    VENDOR = "camera"
    VENDOR_VERSION = "1.0"
    
    @staticmethod
    def device_id_to_imei(device_id: str) -> Optional[int]:
        """
        Convert CMS device ID to numeric IMEI.
        Delegates to input_validator for consistent validation.
        """
        return convert_device_id_to_imei(device_id)
    
    @staticmethod
    def _convert_coordinate(value) -> float:
        """Convert CMS coordinate to decimal degrees.
        
        CMS API returns coordinates in two formats:
        - Raw integers (e.g., 113827278) that need division by 1,000,000
        - Already converted decimals (e.g., 113.827278)
        
        Based on fleet-monitor/server/utils.py pattern.
        """
        if value is None:
            return 0.0
        try:
            val = float(value)
            if val > 1000:
                return val / 1000000
            return val
        except (ValueError, TypeError):
            return 0.0
    
    @classmethod
    def transform_device_to_trackdata(cls, device: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Transform device status to trackdata message.
        Only transform if device is online and has valid data.
        """
        if not device.get('online', False):
            logger.debug(f"Device not online: {device.get('deviceId')}")
            return None
        
        device_id = device.get('deviceId')
        imei = cls.device_id_to_imei(device_id)
        
        if not imei:
            logger.warning(f"Could not convert device_id to IMEI: {device_id}")
            return None
        
        # Validate coordinates
        raw_lat = device.get('latitude', device.get('lat'))
        raw_lng = device.get('longitude', device.get('lng'))
        logger.debug(f"Device {device_id}: raw_lat={raw_lat}, raw_lng={raw_lng}")
        
        lat, lng = validate_coordinates(raw_lat, raw_lng)
        
        # Skip only if coordinates are completely invalid (None)
        # (0,0) is allowed for cameras without GPS
        if lat is None or lng is None:
            logger.debug(f"Skipping trackdata with invalid coordinates for device {device_id} (lat={lat}, lng={lng})")
            return None
        
        # Log if coordinates are (0,0) 
        if lat == 0.0 and lng == 0.0:
            logger.debug(f"Device {device_id} has (0,0) coordinates - camera may not have GPS")
        
        now = utc_now_iso()
        
        # Debug: Log raw values before validation
        logger.debug(f"Device {device_id} raw values: altitude={device.get('altitude')}, speed={device.get('speed')}, heading={device.get('heading')}, satellites={device.get('satellites')}, gpsTime={device.get('gpsTime')}")
        
        # Validate other fields
        altitude = validate_altitude(device.get('altitude'))
        speed = validate_speed(device.get('speed'))
        heading = validate_heading(device.get('heading'))
        satellites = min(max(int(device.get('satellites') or 0), 0), 50)
        gps_time = validate_gps_time(device.get('gpsTime')) or now
        
        # Generate deterministic message_id based on imei + gps_time for deduplication
        message_id = generate_deterministic_id(cls.VENDOR, str(imei), gps_time, "trackdata")
        
        return {
            "vendor": cls.VENDOR,
            "vendor_version": cls.VENDOR_VERSION,
            "timestamp": now,
            "imei": str(imei),
            "message_id": message_id,
            "record_type": "trackdata",
            "data": {
                "imei": str(imei),
                "server_time": now,
                "gps_time": gps_time,
                "latitude": lat,
                "longitude": lng,
                "altitude": altitude or 0,
                "angle": heading,
                "satellites": satellites,
                "speed": speed,
                "status": "Normal",
                "vendor": cls.VENDOR
            }
        }
    
    @classmethod
    def transform_gps_track_to_trackdata(cls, track: Dict[str, Any], device_id: str = None) -> Optional[Dict[str, Any]]:
        """
        Transform GPS track point (from queryTrackDetail API) to trackdata message.
        
        This provides richer data than device status including:
        - Actual speed, heading, altitude, satellites
        - Historical GPS time
        
        Args:
            track: GPS track point from get_gps_track
            device_id: Device ID (optional, can be in track data)
        """
        # Get device ID from track or parameter
        dev_id = device_id or track.get('deviceId')
        imei = cls.device_id_to_imei(dev_id)
        
        if not imei:
            logger.warning(f"Could not convert device_id to IMEI: {dev_id}")
            return None
        
        # Get coordinates
        lat = track.get('lat', 0)
        lng = track.get('lng', 0)
        
        # Validate coordinates
        lat, lng = validate_coordinates(lat, lng)
        
        if lat is None or lng is None:
            logger.debug(f"Skipping track point with invalid coordinates for device {dev_id}")
            return None
        
        now = utc_now_iso()
        
        # Get GPS time from track
        gps_time = validate_gps_time(track.get('gpsTime')) or now
        
        # Get other fields with validation
        speed = validate_speed(track.get('speed'))
        heading = validate_heading(track.get('heading'))
        altitude = validate_altitude(track.get('altitude'))
        satellites = min(max(int(track.get('satellites') or 0), 0), 50)
        
        # Generate deterministic message_id based on imei + gps_time for deduplication
        message_id = generate_deterministic_id(cls.VENDOR, str(imei), gps_time, "trackdata-gps")
        
        return {
            "vendor": cls.VENDOR,
            "vendor_version": cls.VENDOR_VERSION,
            "timestamp": now,
            "imei": str(imei),
            "message_id": message_id,
            "record_type": "trackdata",
            "data": {
                "imei": str(imei),
                "server_time": now,
                "gps_time": gps_time,
                "latitude": lat,
                "longitude": lng,
                "altitude": altitude or 0,
                "angle": heading,
                "satellites": satellites,
                "speed": speed,
                "status": "Normal",
                "vendor": cls.VENDOR
            }
        }
    
    @classmethod
    def transform_alarm_to_event(cls, alarm: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Transform safety alarm (violation) to event message.
        With input validation.
        """
        device_id = alarm.get('deviceId')
        imei = cls.device_id_to_imei(device_id)
        
        if not imei:
            logger.warning(f"Could not convert device_id to IMEI: {device_id}")
            return None
        
        now = utc_now_iso()
        
        # Validate coordinates (can be None for events, but prefer valid if available)
        lat, lng = validate_coordinates(alarm.get('latitude'), alarm.get('longitude'))
        
        # Validate GPS time
        gps_time = validate_gps_time(alarm.get('gpsTime')) or now
        
        # Sanitize status/event type
        status = sanitize_event_type(alarm.get('typeName', 'Safety Alert'))
        
        # Validate speed
        speed = validate_speed(alarm.get('speed'))
        
        # Validate media URLs
        photo_url = validate_photo_url(alarm.get('photoUrl'))
        video_url = validate_video_url(alarm.get('videoUrl'))
        
        # Use CMS GUID if available for deduplication, otherwise generate deterministic ID
        cms_guid = alarm.get('guid')
        message_id = f"camera-alarm-{cms_guid}" if cms_guid else generate_deterministic_id(cls.VENDOR, str(imei), gps_time, "alarm")
        
        return {
            "vendor": cls.VENDOR,
            "vendor_version": cls.VENDOR_VERSION,
            "timestamp": now,
            "imei": str(imei),
            "message_id": message_id,
            "record_type": "event",
            "data": {
                "imei": str(imei),
                "server_time": now,
                "gps_time": gps_time,
                "latitude": lat if lat is not None else 0,
                "longitude": lng if lng is not None else 0,
                "altitude": 0,
                "angle": 0,
                "satellites": 0,
                "speed": speed,
                "status": status,
                "photo_url": photo_url,
                "video_url": video_url,
                "vendor": cls.VENDOR
            }
        }
    
    @classmethod
    def transform_realtime_alarm_to_event(cls, alarm: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Transform real-time alarm (from vehicleAlarm.action) to event message.
        Uses CMS GUID for deterministic message_id to prevent duplicates.
        
        Note: Receives PARSED alarm from _parse_realtime_alarm() with field names:
        deviceId, gpsTime, description, speed, heading, etc.
        """
        device_id = alarm.get('deviceId')
        imei = cls.device_id_to_imei(device_id)
        
        if not imei:
            logger.warning(f"Could not convert device_id to IMEI: {device_id}")
            return None
        
        now = utc_now_iso()
        
        # Get already-parsed coordinates from _parse_realtime_alarm
        lat = alarm.get('latitude', 0)
        lng = alarm.get('longitude', 0)
        
        # Validate coordinates
        lat, lng = validate_coordinates(lat, lng)
        
        # Validate GPS time (already converted to UTC by _parse_realtime_alarm -> _parse_timestamp)
        gps_time = validate_gps_time(alarm.get('gpsTime')) or now
        
        # Get alarm description as status
        status = sanitize_event_type(alarm.get('description') or alarm.get('typeName', 'Safety Alert'))
        
        # Speed already divided by 10 in _parse_realtime_alarm
        speed = validate_speed(alarm.get('speed', 0))
        
        # Photo URL already parsed
        photo_url = validate_photo_url(alarm.get('photoUrl', ''))
        
        # Use CMS GUID for deterministic message_id to prevent duplicates
        cms_guid = alarm.get('guid')
        message_id = f"camera-alarm-{cms_guid}" if cms_guid else generate_deterministic_id(cls.VENDOR, str(imei), gps_time, "realtime-alarm")
        
        return {
            "vendor": cls.VENDOR,
            "vendor_version": cls.VENDOR_VERSION,
            "timestamp": now,
            "imei": str(imei),
            "message_id": message_id,
            "record_type": "event",
            "data": {
                "imei": str(imei),
                "server_time": now,
                "gps_time": gps_time,
                "latitude": lat if lat is not None else 0,
                "longitude": lng if lng is not None else 0,
                "altitude": 0,
                "angle": validate_heading(alarm.get('heading', 0)),
                "satellites": 0,
                "speed": speed,
                "status": status,
                "photo_url": photo_url,
                "video_url": '',  # Real-time alarms don't have video URLs
                "vendor": cls.VENDOR
            },
            "alarm_metadata": {
                "guid": alarm.get('guid'),
                "alarm_type": alarm.get('alarmType'),
                "handled": alarm.get('handled', False)
            }
        }
