"""
Input validation and sanitization utilities for Camera Parser
Security-focused input validation to prevent injection attacks and data corruption
"""
import re
import logging
from typing import Optional, Any, Tuple
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


# =============================================================================
# IMEI Validation
# =============================================================================

# IMEI validation: 5-15 digits, numeric only (relaxed for CMS device IDs)
IMEI_PATTERN = re.compile(r'^\d{5,15}$')

# CMS Device ID pattern: alphanumeric (may contain letters)
CMS_DEVICE_ID_PATTERN = re.compile(r'^[a-zA-Z0-9\-\_]+$')


def validate_imei(imei: Any) -> Optional[str]:
    """
    Validate and sanitize IMEI input.
    
    Args:
        imei: IMEI value (string, int, or other)
        
    Returns:
        Validated IMEI string (5-15 digits) or None if invalid
        
    Security:
        - Only allows numeric IMEI (5-15 digits)
        - Prevents injection attacks
        - Handles various input types safely
    """
    if imei is None:
        return None
    
    # Convert to string and strip whitespace
    imei_str = str(imei).strip()
    
    # Remove any non-numeric characters (defensive)
    imei_clean = re.sub(r'[^\d]', '', imei_str)
    
    # Validate length and format (5-15 digits)
    if not IMEI_PATTERN.match(imei_clean):
        logger.debug(f"Invalid IMEI format: {imei} (cleaned: {imei_clean})")
        return None
    
    return imei_clean


def convert_device_id_to_imei(device_id: Any) -> Optional[int]:
    """
    Convert CMS device ID to numeric IMEI.
    
    CMS device IDs may be:
    - Already numeric (use as-is if 5+ digits)
    - Alphanumeric (convert to numeric hash)
    
    Args:
        device_id: CMS device ID
        
    Returns:
        Numeric IMEI (int) or None if invalid
    """
    if device_id is None:
        return None
    
    device_str = str(device_id).strip()
    
    if not device_str:
        return None
    
    # Validate device ID format
    if not CMS_DEVICE_ID_PATTERN.match(device_str):
        logger.warning(f"Invalid device ID format: {device_id}")
        return None
    
    # If already numeric
    if device_str.isdigit():
        # If 5-15 digits, use as-is
        if 5 <= len(device_str) <= 15:
            return int(device_str)
        # If shorter than 5, still use it (CMS may have short IDs)
        if len(device_str) < 5:
            return int(device_str)
        # If longer than 15, take last 15 digits
        return int(device_str[-15:])
    
    # Alphanumeric: convert to numeric using hash
    # Use a consistent hash that fits in 15 digits
    # Prefix with '9' to indicate camera device
    hash_value = abs(hash(device_str)) % (10 ** 14)  # 14 digits
    imei = int(f"9{hash_value:014d}")  # Prefix with 9, pad to 15 digits
    
    logger.debug(f"Converted device ID {device_id} to IMEI {imei}")
    return imei


# =============================================================================
# GPS Coordinate Validation
# =============================================================================

# Valid coordinate ranges
MIN_LATITUDE = -90.0
MAX_LATITUDE = 90.0
MIN_LONGITUDE = -180.0
MAX_LONGITUDE = 180.0

# Coordinates that are clearly invalid (device not positioned)
INVALID_COORDS = [(0.0, 0.0), (0, 0)]


def validate_coordinates(lat: Any, lng: Any) -> Tuple[Optional[float], Optional[float]]:
    """
    Validate GPS coordinates.
    
    Args:
        lat: Latitude value
        lng: Longitude value
        
    Returns:
        Tuple of (validated_lat, validated_lng) or (None, None) if invalid
    """
    try:
        lat_float = float(lat) if lat is not None else None
        lng_float = float(lng) if lng is not None else None
        
        if lat_float is None or lng_float is None:
            return None, None
        
        # Check ranges
        if not (MIN_LATITUDE <= lat_float <= MAX_LATITUDE):
            logger.debug(f"Latitude out of range: {lat_float}")
            return None, None
        
        if not (MIN_LONGITUDE <= lng_float <= MAX_LONGITUDE):
            logger.debug(f"Longitude out of range: {lng_float}")
            return None, None
        
        # Check for invalid (0,0) coordinates
        # NOTE: For cameras, we allow (0,0) as some cameras don't have GPS
        # The device can still be online and sending data
        if (lat_float, lng_float) in INVALID_COORDS:
            logger.debug("Coordinates are (0,0) - camera may not have GPS fix")
            # Return 0,0 instead of None to allow data flow
            return 0.0, 0.0
        
        # Check for obviously invalid small coordinates (device error)
        if abs(lat_float) < 0.001 and abs(lng_float) < 0.001:
            logger.debug(f"Coordinates too close to origin: ({lat_float}, {lng_float})")
            return None, None
        
        return round(lat_float, 6), round(lng_float, 6)
        
    except (ValueError, TypeError) as e:
        logger.debug(f"Invalid coordinate format: lat={lat}, lng={lng}: {e}")
        return None, None


def validate_altitude(altitude: Any) -> Optional[int]:
    """
    Validate altitude value.
    
    Args:
        altitude: Altitude in meters
        
    Returns:
        Validated altitude or None if invalid
    """
    try:
        alt_int = int(altitude) if altitude is not None else None
        
        if alt_int is None:
            return None
        
        # Valid altitude range: -500m (Dead Sea area) to 9000m (Everest area)
        if not (-500 <= alt_int <= 9000):
            logger.debug(f"Altitude out of range: {alt_int}")
            return 0  # Default to 0 for invalid
        
        return alt_int
        
    except (ValueError, TypeError):
        return 0


# =============================================================================
# Speed Validation
# =============================================================================

# Maximum reasonable speed in km/h
MAX_SPEED_KMH = 300  # Even high-speed trains rarely exceed this


def validate_speed(speed: Any) -> Optional[int]:
    """
    Validate speed value.
    
    Args:
        speed: Speed in km/h
        
    Returns:
        Validated speed or 0 if invalid
    """
    try:
        speed_val = float(speed) if speed is not None else 0
        
        if speed_val < 0:
            logger.debug(f"Negative speed: {speed_val}")
            return 0
        
        if speed_val > MAX_SPEED_KMH:
            logger.debug(f"Speed exceeds maximum ({MAX_SPEED_KMH}): {speed_val}")
            return MAX_SPEED_KMH  # Cap at max
        
        return int(round(speed_val))
        
    except (ValueError, TypeError):
        return 0


def validate_heading(heading: Any) -> int:
    """
    Validate heading/angle value.
    
    Args:
        heading: Heading in degrees (0-360)
        
    Returns:
        Validated heading (0-359)
    """
    try:
        heading_val = int(heading) if heading is not None else 0
        
        # Normalize to 0-359
        heading_val = heading_val % 360
        
        return heading_val
        
    except (ValueError, TypeError):
        return 0


# =============================================================================
# Timestamp Validation
# =============================================================================

# Maximum age of data we'll accept (e.g., 7 days old)
MAX_DATA_AGE_DAYS = 365  # Accept up to 1 year old data for backfill

# Maximum time in future we'll accept (clock skew tolerance)
# Allow 24 hours for timezone misconfigurations and clock skew
MAX_FUTURE_HOURS = 24


def validate_timestamp(timestamp: Any, allow_none: bool = False) -> Optional[datetime]:
    """
    Validate timestamp value.
    
    Args:
        timestamp: Timestamp (datetime, string, or milliseconds)
        allow_none: Whether to allow None values
        
    Returns:
        Validated datetime or None if invalid (all times in UTC)
    """
    if timestamp is None:
        return None if allow_none else datetime.now(timezone.utc)
    
    # UTC consistent
    now = datetime.now(timezone.utc)
    min_time = now - timedelta(days=MAX_DATA_AGE_DAYS)
    max_time = now + timedelta(hours=MAX_FUTURE_HOURS)
    
    try:
        # Handle datetime object (ensure UTC for comparison and serialization)
        if isinstance(timestamp, datetime):
            dt = timestamp
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        
        # Handle milliseconds (common in CMS API) - convert to UTC
        elif isinstance(timestamp, (int, float)) and timestamp > 1000000000000:
            dt = datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc)
        
        # Handle seconds - convert to UTC
        elif isinstance(timestamp, (int, float)) and timestamp > 1000000000:
            dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
        
        # Handle ISO string (assumed to be UTC)
        elif isinstance(timestamp, str):
            # Normalize: remove Z suffix and timezone offset for parsing
            ts_clean = timestamp.replace('Z', '')
            # Remove timezone offset like +00:00, -05:00
            if '+' in ts_clean:
                ts_clean = ts_clean.split('+')[0]
            elif ts_clean.count('-') > 2:  # Has timezone like -05:00
                # Find last - that's part of timezone (not date separator)
                parts = ts_clean.rsplit('-', 1)
                if ':' in parts[-1]:  # It's a timezone offset
                    ts_clean = parts[0]
            
            # Remove trailing fractional seconds like .0 or .123 for simpler parsing
            if '.' in ts_clean:
                # Handle both .0 and .123456 formats
                base, frac = ts_clean.rsplit('.', 1)
                # Keep only if it's a valid microseconds format, otherwise strip
                if len(frac) <= 6 and frac.isdigit():
                    # Pad to 6 digits for microseconds
                    ts_clean = f"{base}.{frac.ljust(6, '0')}"
                else:
                    ts_clean = base
            
            # Try various formats
            for fmt in ['%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S.%f', '%Y-%m-%dT%H:%M:%S.%f']:
                try:
                    dt = datetime.strptime(ts_clean, fmt)
                    dt = dt.replace(tzinfo=timezone.utc)
                    break
                except ValueError:
                    continue
            else:
                logger.debug(f"Could not parse timestamp string: {timestamp}")
                return datetime.now(timezone.utc) if not allow_none else None
        
        else:
            logger.debug(f"Unknown timestamp type: {type(timestamp)}")
            return datetime.now(timezone.utc) if not allow_none else None
        
        # Validate range
        if dt < min_time:
            logger.debug(f"Timestamp too old: {dt} (min: {min_time})")
            return None if allow_none else min_time
        
        if dt > max_time:
            logger.debug(f"Timestamp in future: {dt} (max: {max_time})")
            return now  # Use current time for future timestamps
        
        return dt
        
    except (ValueError, TypeError, OSError) as e:
        logger.debug(f"Invalid timestamp: {timestamp}: {e}")
        return datetime.now(timezone.utc) if not allow_none else None


def validate_gps_time(gps_time: Any) -> Optional[str]:
    """
    Validate GPS time and return ISO format string with Z suffix.
    
    Args:
        gps_time: GPS timestamp
        
    Returns:
        ISO format string with Z suffix (e.g., 2026-01-01T12:00:00.000Z) or None
    """
    dt = validate_timestamp(gps_time, allow_none=True)
    if dt:
        # Return consistent format: YYYY-MM-DDTHH:MM:SS.sssZ
        return dt.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    return None


# =============================================================================
# Video URL Validation
# =============================================================================

# Valid video URL schemes
VALID_VIDEO_SCHEMES = {'http', 'https'}

# Required URL parameters for CMS video downloads
REQUIRED_VIDEO_PARAMS = ['jsession', 'DevIDNO']


def validate_video_url(url: Any) -> Optional[str]:
    """
    Validate video download URL.
    
    Args:
        url: Video URL string
        
    Returns:
        Validated URL or empty string if invalid
    """
    if not url:
        return ''
    
    url_str = str(url).strip()
    
    if not url_str:
        return ''
    
    try:
        parsed = urlparse(url_str)
        
        # Check scheme
        if parsed.scheme.lower() not in VALID_VIDEO_SCHEMES:
            logger.debug(f"Invalid URL scheme: {parsed.scheme}")
            return ''
        
        # Check host exists
        if not parsed.netloc:
            logger.debug(f"URL missing host: {url_str}")
            return ''
        
        # Check path exists
        if not parsed.path or parsed.path == '/':
            logger.debug(f"URL missing path: {url_str}")
            return ''
        
        # URL looks valid
        return url_str
        
    except Exception as e:
        logger.debug(f"URL parsing error: {url_str}: {e}")
        return ''


def validate_photo_url(url: Any) -> Optional[str]:
    """
    Validate photo URL.
    
    Args:
        url: Photo URL string
        
    Returns:
        Validated URL or empty string if invalid
    """
    # Same validation as video URL
    return validate_video_url(url)


# =============================================================================
# String Sanitization
# =============================================================================

def sanitize_string(value: Any, max_length: int = 255, allow_empty: bool = True) -> Optional[str]:
    """
    Sanitize string input.
    
    Args:
        value: Input value
        max_length: Maximum allowed length
        allow_empty: Whether to allow empty strings
        
    Returns:
        Sanitized string or None if invalid
    """
    if value is None:
        return '' if allow_empty else None
    
    value_str = str(value).strip()
    
    if not allow_empty and not value_str:
        return None
    
    # Truncate if too long
    if len(value_str) > max_length:
        value_str = value_str[:max_length]
    
    # Remove null bytes and control characters (except newline/tab)
    value_str = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', value_str)
    
    return value_str


def sanitize_event_type(event_type: Any) -> str:
    """
    Sanitize event type name.
    
    Args:
        event_type: Event type string
        
    Returns:
        Sanitized event type
    """
    if not event_type:
        return 'Unknown'
    
    event_str = str(event_type).strip()
    
    # Only allow alphanumeric, spaces, and basic punctuation
    event_str = re.sub(r'[^a-zA-Z0-9\s\-\_]', '', event_str)
    
    return event_str[:100] if event_str else 'Unknown'


# =============================================================================
# Composite Validation
# =============================================================================

def validate_trackdata_record(record: dict) -> dict:
    """
    Validate a complete trackdata record.
    
    Args:
        record: Raw trackdata record
        
    Returns:
        Validated record with corrected/default values
    """
    validated = {}
    
    # IMEI - required
    imei = convert_device_id_to_imei(record.get('imei') or record.get('deviceId'))
    if not imei:
        logger.warning(f"Invalid IMEI in trackdata: {record.get('imei')}")
        return {}  # Invalid record
    validated['imei'] = imei
    
    # Coordinates
    lat, lng = validate_coordinates(record.get('latitude'), record.get('longitude'))
    validated['latitude'] = lat
    validated['longitude'] = lng
    
    # If no valid coordinates, skip the record
    if lat is None or lng is None:
        logger.debug(f"Skipping trackdata with invalid coordinates for IMEI {imei}")
        return {}
    
    # Other fields
    validated['altitude'] = validate_altitude(record.get('altitude'))
    validated['speed'] = validate_speed(record.get('speed'))
    validated['angle'] = validate_heading(record.get('angle') or record.get('heading'))
    validated['satellites'] = min(max(int(record.get('satellites') or 0), 0), 50)
    
    # Timestamps
    validated['gps_time'] = validate_gps_time(record.get('gps_time') or record.get('gpsTime'))
    validated['server_time'] = datetime.now(timezone.utc).isoformat() + 'Z'  # UTC consistent
    
    # Vendor
    validated['vendor'] = 'camera'
    
    return validated


def validate_event_record(record: dict) -> dict:
    """
    Validate a complete event/alarm record.
    
    Args:
        record: Raw event record
        
    Returns:
        Validated record with corrected/default values
    """
    validated = {}
    
    # IMEI - required
    imei = convert_device_id_to_imei(record.get('imei') or record.get('deviceId'))
    if not imei:
        logger.warning(f"Invalid IMEI in event: {record.get('imei')}")
        return {}
    validated['imei'] = imei
    
    # Coordinates (can be None for events)
    lat, lng = validate_coordinates(record.get('latitude'), record.get('longitude'))
    validated['latitude'] = lat
    validated['longitude'] = lng
    
    # Event info
    validated['status'] = sanitize_event_type(record.get('status') or record.get('typeName'))
    validated['speed'] = validate_speed(record.get('speed'))
    
    # Timestamps
    validated['gps_time'] = validate_gps_time(record.get('gps_time') or record.get('gpsTime'))
    validated['server_time'] = datetime.now(timezone.utc).isoformat() + 'Z'  # UTC consistent
    
    # Media URLs
    validated['photo_url'] = validate_photo_url(record.get('photo_url') or record.get('photoUrl'))
    validated['video_url'] = validate_video_url(record.get('video_url') or record.get('videoUrl'))
    
    # Vendor
    validated['vendor'] = 'camera'
    
    return validated
