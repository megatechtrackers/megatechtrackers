"""Field encoding enumeration."""
from enum import IntEnum


class FieldEncoding(IntEnum):
    """Field encoding types."""
    INT8 = 1
    INT16 = 2
    INT32 = 4
    INT64 = 8
    INT128 = 16

