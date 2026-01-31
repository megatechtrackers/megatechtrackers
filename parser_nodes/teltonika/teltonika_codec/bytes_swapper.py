"""Byte order swapping utilities for big-endian conversion."""


def swap_int16(value: int) -> int:
    """Swap bytes for int16 (2 bytes)."""
    result = (((value >> 0x08) & 0xFF) << 0x00) | (((value >> 0x00) & 0xFF) << 0x08)
    # Convert unsigned to signed 16-bit
    result = result & 0xFFFF
    if result >= 0x8000:
        result = result - 0x10000
    return result


def swap_uint16(value: int) -> int:
    """Swap bytes for uint16 (2 bytes)."""
    return (((value >> 0x08) & 0xFF) << 0x00) | (((value >> 0x00) & 0xFF) << 0x08)


def swap_int32(value: int) -> int:
    """Swap bytes for int32 (4 bytes)."""
    result = (
        (((value >> 0x18) & 0xFF) << 0x00) |
        (((value >> 0x10) & 0xFF) << 0x08) |
        (((value >> 0x08) & 0xFF) << 0x10) |
        (((value >> 0x00) & 0xFF) << 0x18)
    )
    # Convert unsigned to signed 32-bit
    result = result & 0xFFFFFFFF
    if result >= 0x80000000:
        result = result - 0x100000000
    return result


def swap_uint32(value: int) -> int:
    """Swap bytes for uint32 (4 bytes)."""
    return (
        (((value >> 0x18) & 0xFF) << 0x00) |
        (((value >> 0x10) & 0xFF) << 0x08) |
        (((value >> 0x08) & 0xFF) << 0x10) |
        (((value >> 0x00) & 0xFF) << 0x18)
    )


def swap_int64(value: int) -> int:
    """Swap bytes for int64 (8 bytes)."""
    result = (
        (((value >> 0x38) & 0xFF) << 0x00) |
        (((value >> 0x30) & 0xFF) << 0x08) |
        (((value >> 0x28) & 0xFF) << 0x10) |
        (((value >> 0x20) & 0xFF) << 0x18) |
        (((value >> 0x18) & 0xFF) << 0x20) |
        (((value >> 0x10) & 0xFF) << 0x28) |
        (((value >> 0x08) & 0xFF) << 0x30) |
        (((value >> 0x00) & 0xFF) << 0x38)
    )
    # Convert unsigned to signed 64-bit
    result = result & 0xFFFFFFFFFFFFFFFF
    if result >= 0x8000000000000000:
        result = result - 0x10000000000000000
    return result


def swap_uint64(value: int) -> int:
    """Swap bytes for uint64 (8 bytes)."""
    return (
        (((value >> 0x38) & 0xFF) << 0x00) |
        (((value >> 0x30) & 0xFF) << 0x08) |
        (((value >> 0x28) & 0xFF) << 0x10) |
        (((value >> 0x20) & 0xFF) << 0x18) |
        (((value >> 0x18) & 0xFF) << 0x20) |
        (((value >> 0x10) & 0xFF) << 0x28) |
        (((value >> 0x08) & 0xFF) << 0x30) |
        (((value >> 0x00) & 0xFF) << 0x38)
    )

