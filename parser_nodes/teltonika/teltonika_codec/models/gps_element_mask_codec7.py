"""GPS element mask for Codec 7."""
from enum import IntFlag


class GpsElementMaskCodec7(IntFlag):
    """GPS element mask flags for Codec 7."""
    COORDINATES = 1 << 0
    ALTITUDE = 1 << 1
    ANGLE = 1 << 2
    SPEED = 1 << 3
    SATELLITES = 1 << 4
    CELL_ID = 1 << 5
    SIGNAL_QUALITY = 1 << 6
    OPERATOR_CODE = 1 << 7

