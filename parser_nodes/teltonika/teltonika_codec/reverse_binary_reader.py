"""Binary reader with byte order swapping (big-endian)."""
import struct
import io
from . import bytes_swapper


class ReverseBinaryReader:
    """Binary reader that automatically swaps byte order for multi-byte types."""
    
    def __init__(self, stream: io.BytesIO):
        """Initialize with a bytes stream."""
        self._stream = stream
    
    def read_byte(self) -> int:
        """Read a single byte."""
        return struct.unpack('B', self._stream.read(1))[0]
    
    def read_sbyte(self) -> int:
        """Read a signed byte."""
        return struct.unpack('b', self._stream.read(1))[0]
    
    def read_uint16(self) -> int:
        """Read uint16 and swap bytes."""
        # Read as little-endian (like C# BinaryReader), then swap to big-endian
        value = struct.unpack('<H', self._stream.read(2))[0]
        return bytes_swapper.swap_uint16(value)
    
    def read_int16(self) -> int:
        """Read int16 and swap bytes."""
        # Read as little-endian (like C# BinaryReader), then swap to big-endian
        value = struct.unpack('<h', self._stream.read(2))[0]
        # Swap bytes (treating as unsigned for swap, then convert back)
        unsigned = value & 0xFFFF
        swapped = bytes_swapper.swap_uint16(unsigned)
        # Convert to signed
        if swapped >= 0x8000:
            swapped = swapped - 0x10000
        return swapped
    
    def read_uint32(self) -> int:
        """Read uint32 and swap bytes."""
        # Read as little-endian (like C# BinaryReader), then swap to big-endian
        value = struct.unpack('<I', self._stream.read(4))[0]
        return bytes_swapper.swap_uint32(value)
    
    def read_int32(self) -> int:
        """Read int32 and swap bytes."""
        # Read as little-endian (like C# BinaryReader), then swap to big-endian
        value = struct.unpack('<i', self._stream.read(4))[0]
        # Swap bytes (treating as unsigned for swap, then convert back)
        unsigned = value & 0xFFFFFFFF
        swapped = bytes_swapper.swap_uint32(unsigned)
        # Convert to signed
        if swapped >= 0x80000000:
            swapped = swapped - 0x100000000
        return swapped
    
    def read_uint64(self) -> int:
        """Read uint64 and swap bytes."""
        # Read as little-endian (like C# BinaryReader), then swap to big-endian
        value = struct.unpack('<Q', self._stream.read(8))[0]
        return bytes_swapper.swap_uint64(value)
    
    def read_int64(self) -> int:
        """Read int64 and swap bytes."""
        # Read as little-endian (like C# BinaryReader), then swap to big-endian
        value = struct.unpack('<q', self._stream.read(8))[0]
        # Swap bytes (treating as unsigned for swap)
        # For int64, Python can handle the full range, so we just swap the unsigned representation
        unsigned = value & 0xFFFFFFFFFFFFFFFF
        swapped = bytes_swapper.swap_uint64(unsigned)
        # Convert to signed if needed
        if swapped >= 0x8000000000000000:
            swapped = swapped - 0x10000000000000000
        return swapped
    
    def read_bytes(self, count: int) -> bytes:
        """Read specified number of bytes."""
        return self._stream.read(count)
    
    @property
    def position(self) -> int:
        """Get current stream position."""
        return self._stream.tell()
    
    @position.setter
    def position(self, value: int):
        """Set stream position."""
        self._stream.seek(value)

