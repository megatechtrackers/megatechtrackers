"""Bit conversion utilities for float/int conversion."""
import struct
import ctypes
from . import bytes_swapper


def byte_array_to_bits(input_bytes: bytes) -> str:
    """Convert byte array to binary string representation."""
    return " ".join(format(b, '08b') for b in input_bytes)


class Int32SingleUnion(ctypes.Union):
    """Union struct to reinterpret int32 bits as float (matches C# Int32SingleUnion)."""
    _fields_ = [
        ("i", ctypes.c_int32),  # Int32 version
        ("f", ctypes.c_float),  # Single (float) version
    ]
    
    @property
    def as_single(self) -> float:
        """Returns the value as a floating point number (matches C# AsSingle property)."""
        return self.f


class EndianBitConverters:
    """Utilities for endian-aware bit conversions."""
    
    @staticmethod
    def to_single(value: bytes, start_index: int) -> float:
        """Convert bytes to float (single precision) with byte swapping.
        
        Matches C#: BytesSwapper.Swap(BitConverter.ToInt32(value, startIndex))
        then Int32SingleUnion(int32FromBytes).AsSingle
        """
        # Read as little-endian (like C# BitConverter.ToInt32), then swap to big-endian
        int32_value = struct.unpack('<i', value[start_index:start_index + 4])[0]
        swapped = bytes_swapper.swap_int32(int32_value)
        # Use union to reinterpret bits (matches C# Int32SingleUnion approach)
        union = Int32SingleUnion()
        union.i = swapped
        return union.as_single
    
    @staticmethod
    def int32_to_single(value: int) -> float:
        """Convert int32 to float (single precision).
        
        Matches C#: new Int32SingleUnion(value).AsSingle
        """
        # Use union to reinterpret bits (matches C# Int32SingleUnion approach)
        union = Int32SingleUnion()
        union.i = value
        return union.as_single

