"""
Server Utility Functions
Shared helpers for coordinate conversion, time formatting, and data parsing
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple


# ============================================================================
# Constants
# ============================================================================

COORDINATE_DIVISOR = 1000000.0
SPEED_DIVISOR = 10.0
FUEL_DIVISOR = 100.0
VOLTAGE_DIVISOR = 10.0

NETWORK_TYPES = {
    0: '3G',
    1: 'WiFi', 
    2: 'Wired',
    3: '4G',
    4: '5G'
}

PLATE_TYPE_MAPPING = {
    '蓝牌': 1,  # Blue plate
    '黄牌': 2,  # Yellow plate
    '白牌': 3,  # White plate
    '黑牌': 4,  # Black plate
    '绿牌': 5,  # Green plate
    'blue': 1,
    'yellow': 2,
    'white': 3,
    'black': 4,
    'green': 5
}

API_ERROR_MESSAGES = {
    1: 'Invalid parameter',
    2: 'Device not found or no permission',
    3: 'Session expired',
    19: 'Device not found, offline, or no permission to access',
    100: 'System error'
}


# ============================================================================
# Coordinate Conversion
# ============================================================================

def convert_coordinate(value: float) -> float:
    """Convert CMS coordinate to decimal degrees.
    
    CMS API returns coordinates in two formats:
    - Raw integers (e.g., 113827278) that need division by 1,000,000
    - Already converted decimals (e.g., 113.827278)
    
    Args:
        value: Raw coordinate value from API
        
    Returns:
        Coordinate in decimal degrees
    """
    if value is None:
        return 0.0
    try:
        val = float(value)
        if val > 1000:
            return val / COORDINATE_DIVISOR
        return val
    except (ValueError, TypeError):
        return 0.0


def parse_coordinates(data: Dict[str, Any]) -> Tuple[float, float]:
    """Parse latitude and longitude from API response.
    
    Tries mlat/mlng first (pre-converted), falls back to lat/lng.
    
    Args:
        data: API response dictionary
        
    Returns:
        Tuple of (latitude, longitude) in decimal degrees
    """
    lat = 0.0
    lng = 0.0
    
    try:
        # First try mlat/mlng which are pre-converted by CMS
        mlat_str = data.get('mlat')
        mlng_str = data.get('mlng')
        
        if mlat_str and mlng_str:
            lat = float(mlat_str)
            lng = float(mlng_str)
        else:
            # Fall back to raw lat/lng and convert
            lat = convert_coordinate(data.get('lat', 0))
            lng = convert_coordinate(data.get('lng', 0))
    except (ValueError, TypeError) as e:
        print(f"[Utils] Coordinate parsing error: {e}")
        
    return lat, lng


def is_valid_coordinate(lat: float, lng: float) -> bool:
    """Check if coordinates are valid (not near 0,0 and within range).
    
    Args:
        lat: Latitude in decimal degrees
        lng: Longitude in decimal degrees
        
    Returns:
        True if coordinates are valid
    """
    if abs(lat) < 0.1 and abs(lng) < 0.1:
        return False
    if abs(lat) > 90 or abs(lng) > 180:
        return False
    return True


# ============================================================================
# Time Conversion
# ============================================================================

def parse_timestamp(value: Any) -> Optional[str]:
    """Parse timestamp to ISO format string.
    
    Handles both numeric timestamps (seconds or milliseconds) and ISO strings.
    
    Args:
        value: Timestamp value (int, float, or string)
        
    Returns:
        ISO format datetime string or None
    """
    if not value:
        return None
        
    try:
        if isinstance(value, (int, float)):
            # Assume milliseconds if value is large
            if value > 1e12:
                value = value / 1000
            return datetime.fromtimestamp(value, tz=timezone.utc).isoformat()
        elif isinstance(value, str):
            # Try parsing as numeric first
            try:
                ts = float(value)
                if ts > 1e12:
                    ts = ts / 1000
                return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
            except ValueError:
                # Already an ISO string
                return value
    except (ValueError, TypeError, OSError):
        return None
    
    return None


def format_datetime(iso_string: str) -> str:
    """Format ISO datetime string for display.
    
    Expects UTC ISO strings from API/DB. Naive strings (no Z or +00:00) are
    treated as UTC per project convention (storage/API use UTC only).
    
    Args:
        iso_string: ISO format datetime string (UTC)
        
    Returns:
        Formatted datetime string YYYY-MM-DD HH:MM:SS
    """
    if not iso_string:
        return '-'
    try:
        dt = datetime.fromisoformat(iso_string.replace('Z', '+00:00'))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.strftime('%Y-%m-%d %H:%M:%S')
    except (ValueError, TypeError):
        return iso_string


def timestamp_to_seconds_in_day(timestamp_ms: int) -> int:
    """Convert millisecond timestamp to seconds since midnight.
    
    Used for video file time parameters.
    
    Args:
        timestamp_ms: Timestamp in milliseconds
        
    Returns:
        Seconds since midnight (0-86399)
    """
    try:
        return int((timestamp_ms % 86400000) / 1000)
    except (ValueError, TypeError):
        return 0


# ============================================================================
# Data Conversion
# ============================================================================

def convert_speed(raw_speed: Any) -> float:
    """Convert raw speed value to km/h.
    
    CMS API returns speed * 10, so we need to divide.
    
    Args:
        raw_speed: Raw speed value from API
        
    Returns:
        Speed in km/h
    """
    try:
        return float(raw_speed or 0) / SPEED_DIVISOR
    except (ValueError, TypeError):
        return 0.0


def convert_fuel(raw_fuel: Any) -> float:
    """Convert raw fuel value to liters.
    
    CMS API returns fuel * 100, so we need to divide.
    
    Args:
        raw_fuel: Raw fuel value from API
        
    Returns:
        Fuel in liters
    """
    try:
        return float(raw_fuel or 0) / FUEL_DIVISOR
    except (ValueError, TypeError):
        return 0.0


def convert_voltage(raw_voltage: Any) -> float:
    """Convert raw voltage value to volts.
    
    Args:
        raw_voltage: Raw voltage value from API
        
    Returns:
        Voltage in volts
    """
    try:
        return float(raw_voltage or 0) / VOLTAGE_DIVISOR
    except (ValueError, TypeError):
        return 0.0


def get_network_type(code: int) -> str:
    """Get network type name from code.
    
    Args:
        code: Network type code (0-4)
        
    Returns:
        Network type name
    """
    return NETWORK_TYPES.get(code, 'Unknown')


def convert_plate_type_to_number(plate_type: Any) -> Optional[int]:
    """Convert plate type string to number.
    
    Common Chinese plate types:
    - 蓝牌=1 (blue)
    - 黄牌=2 (yellow)
    - 白牌=3 (white)
    - 黑牌=4 (black)
    - 绿牌=5 (green)
    
    Args:
        plate_type: Plate type value (int, float, or string)
        
    Returns:
        Numeric plate type or None
    """
    if plate_type is None:
        return None
    
    # If it's already a number, return it
    if isinstance(plate_type, (int, float)):
        return int(plate_type)
    
    # If it's a string, try to convert
    if isinstance(plate_type, str):
        # Try direct conversion first
        try:
            return int(plate_type)
        except (ValueError, TypeError):
            pass
        
        # Check if it's a known string value
        plate_type_stripped = plate_type.strip()
        if plate_type_stripped in PLATE_TYPE_MAPPING:
            return PLATE_TYPE_MAPPING[plate_type_stripped]
    
    return None


def get_api_error_message(code: int) -> str:
    """Get human-readable API error message.
    
    Args:
        code: API result code
        
    Returns:
        Error message string
    """
    return API_ERROR_MESSAGES.get(code, f'API error (code: {code})')


# ============================================================================
# Status Parsing
# ============================================================================

def parse_adas_dsm_capability(ls_value: int) -> Dict[str, bool]:
    """Parse ADAS/DSM/BSD capability from ls (location source) field.
    
    When lg=2: bit5=ADAS, bit6=DSM, bit7=BSD
    
    Args:
        ls_value: Location source field value
        
    Returns:
        Dictionary with hasAdas, hasDsm, hasBsd flags
    """
    return {
        'hasAdas': bool((ls_value >> 5) & 1),
        'hasDsm': bool((ls_value >> 6) & 1),
        'hasBsd': bool((ls_value >> 7) & 1)
    }


def parse_acc_status(s1_value: int) -> bool:
    """Parse ACC (ignition) status from s1 field.
    
    Bit 0 is ACC status.
    
    Args:
        s1_value: Status field 1 value
        
    Returns:
        True if ACC is on
    """
    return (s1_value & 0x01) == 1


# ============================================================================
# URL Helpers
# ============================================================================

def ensure_jsession_in_url(url: str, session_id: str) -> str:
    """Ensure jsession parameter is in URL.
    
    Args:
        url: Original URL
        session_id: Session ID to add
        
    Returns:
        URL with jsession parameter
    """
    if not url:
        return url
        
    if 'jsession=' in url:
        # Replace existing jsession
        import re
        return re.sub(r'jsession=[^&]*', f'jsession={session_id}', url)
    else:
        # Add jsession
        separator = '&' if '?' in url else '?'
        return f"{url}{separator}jsession={session_id}"


