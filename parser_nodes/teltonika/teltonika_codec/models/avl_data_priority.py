"""AVL data priority enumeration."""
from enum import IntEnum


class AvlDataPriority(IntEnum):
    """Priority levels for AVL data."""
    LOW = 0
    HIGH = 1
    PANIC = 2
    SECURITY = 3

