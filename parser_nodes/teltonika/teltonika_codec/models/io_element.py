"""IO element model."""
from dataclasses import dataclass
from typing import List, Optional
from .io_property import IoProperty


@dataclass
class IoElement:
    """IO element containing event ID and properties."""
    event_id: int
    properties_count: int
    properties: List['IoProperty']
    origin_type: Optional[int] = None
    
    @staticmethod
    def create(event_id: int, property_count: int, properties: List['IoProperty'], origin_type: Optional[int] = None) -> 'IoElement':
        """Create an IO element."""
        return IoElement(
            event_id=event_id,
            properties_count=property_count,
            properties=properties,
            origin_type=origin_type
        )

