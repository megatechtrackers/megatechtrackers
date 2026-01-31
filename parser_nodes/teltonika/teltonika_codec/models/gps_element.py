"""GPS element model."""
from dataclasses import dataclass


INVALID_GPS_SPEED = 255


@dataclass
class GpsElement:
    """GPS element containing coordinates and related data."""
    x: float  # Longitude
    y: float  # Latitude
    altitude: int
    angle: int
    satellites: int
    speed: int
    
    @staticmethod
    def create(x: float, y: float, altitude: int, speed: int, angle: int, satellites: int) -> 'GpsElement':
        """Create a GPS element."""
        return GpsElement(x=x, y=y, altitude=altitude, speed=speed, angle=angle, satellites=satellites)
    
    @staticmethod
    def is_lat_valid(latitude: float) -> bool:
        """Check if latitude is valid."""
        return -90 <= latitude <= 90
    
    @staticmethod
    def is_lng_valid(longitude: float) -> bool:
        """Check if longitude is valid."""
        return -180 <= longitude <= 180

