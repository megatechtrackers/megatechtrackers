"""IO property model."""
from dataclasses import dataclass
from typing import Optional


@dataclass
class IoProperty:
    """IO property with ID and value."""
    id: int
    value: Optional[int] = None
    array_value: Optional[bytes] = None
    
    @staticmethod
    def create(id: int, value: int) -> 'IoProperty':
        """Create an IO property with integer value."""
        return IoProperty(id=id, value=value)
    
    @staticmethod
    def create_array(id: int, value: bytes) -> 'IoProperty':
        """Create an IO property with byte array value."""
        return IoProperty(id=id, array_value=value)

