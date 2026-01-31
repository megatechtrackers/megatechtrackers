"""Codec 12 command response model."""
from dataclasses import dataclass
from typing import Optional


@dataclass
class Codec12Response:
    """
    Codec 12 response structure for GPRS command responses.
    
    Packet Structure:
    - Preamble: 4 bytes (0x00000000)
    - Data Size: 4 bytes
    - Codec ID: 1 byte (0x0C)
    - Response Quantity 1: 1 byte
    - Type: 1 byte (0x06 for response)
    - Response Size: 4 bytes
    - Response: X bytes (ASCII text)
    - Response Quantity 2: 1 byte
    - CRC-16: 4 bytes
    """
    preamble: int
    data_size: int
    codec_id: int
    response_quantity: int
    response_type: int  # 0x06 for response
    response_size: int
    response_text: str  # ASCII decoded response
    crc: int
    
    # Codec 12 constants
    CODEC_ID = 0x0C
    RESPONSE_TYPE = 0x06  # Response type
    COMMAND_TYPE = 0x05   # Command type (for reference)
    
    @property
    def is_response(self) -> bool:
        """Check if this is a response packet (Type=0x06)."""
        return self.response_type == self.RESPONSE_TYPE
    
    @property
    def is_command(self) -> bool:
        """Check if this is a command packet (Type=0x05)."""
        return self.response_type == self.COMMAND_TYPE
    
    @staticmethod
    def create(
        preamble: int,
        data_size: int,
        codec_id: int,
        response_quantity: int,
        response_type: int,
        response_size: int,
        response_text: str,
        crc: int
    ) -> 'Codec12Response':
        """Create a Codec12Response instance."""
        return Codec12Response(
            preamble=preamble,
            data_size=data_size,
            codec_id=codec_id,
            response_quantity=response_quantity,
            response_type=response_type,
            response_size=response_size,
            response_text=response_text,
            crc=crc
        )
    
    def __repr__(self) -> str:
        type_str = "RESPONSE" if self.is_response else "COMMAND" if self.is_command else f"UNKNOWN({self.response_type})"
        return (
            f"Codec12Response("
            f"type={type_str}, "
            f"response_text='{self.response_text[:50]}{'...' if len(self.response_text) > 50 else ''}', "
            f"response_size={self.response_size})"
        )
