"""AVL data model."""
from dataclasses import dataclass
from datetime import datetime
from .gps_element import GpsElement
from .io_element import IoElement


@dataclass
class AvlData:
    """AVL data containing priority, timestamp, GPS and IO elements."""
    priority: str
    date_time: datetime
    gps_element: GpsElement
    io_element: IoElement
    
    @staticmethod
    def create(priority: str, date_time: datetime, gps_element: GpsElement, io_element: IoElement) -> 'AvlData':
        """Create AVL data."""
        return AvlData(
            priority=priority,
            date_time=date_time,
            gps_element=gps_element,
            io_element=io_element
        )

