"""GH AVL data priority enumeration."""
from enum import IntEnum


class GhAvlDataPriority(IntEnum):
    """Priority levels for GH AVL data (Codec 7)."""
    PERIODICAL = 1
    ALARM = 10

