"""CRC-16 calculation for packet validation."""


class CRC:
    """CRC-16 calculator with configurable polynomial."""
    
    DEFAULT = None  # Will be initialized below
    
    def __init__(self, polynom: int):
        """Initialize CRC with polynomial."""
        self._polynom = polynom & 0xFFFF
    
    def calc_crc16(self, buffer: bytes) -> int:
        """Calculate CRC-16 for the entire buffer."""
        return self._calc_crc16(buffer, 0, len(buffer), self._polynom, 0)
    
    @staticmethod
    def _calc_crc16(buffer: bytes, offset: int, buf_len: int, polynom: int, preset: int) -> int:
        """Calculate CRC-16 with specified parameters."""
        preset &= 0xFFFF
        polynom &= 0xFFFF
        
        crc = preset
        for i in range(buf_len):
            data = buffer[(i + offset) % len(buffer)] & 0xFF
            crc ^= data
            for j in range(8):
                if (crc & 0x0001) != 0:
                    crc = (crc >> 1) ^ polynom
                else:
                    crc = crc >> 1
        
        return crc & 0xFFFF


# Initialize default CRC instance
CRC.DEFAULT = CRC(0xA001)

