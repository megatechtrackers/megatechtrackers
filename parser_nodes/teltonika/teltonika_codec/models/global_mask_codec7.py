"""Global mask for Codec 7."""
from enum import IntFlag


class GlobalMaskCodec7(IntFlag):
    """Global mask flags for Codec 7."""
    GPS_ELEMENT = 1 << 0
    IO_INT8 = 1 << 1
    IO_INT16 = 1 << 2
    IO_INT32 = 1 << 3

