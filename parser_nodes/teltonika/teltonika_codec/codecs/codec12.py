"""
Codec 12 decoder for Teltonika GPRS command responses.

Teltonika Codec 12 is used for GPRS command/response communication.
- Type 0x05: Command (sent TO device)
- Type 0x06: Response (received FROM device)

Packet Structure:
┌──────────┬───────────┬───────┬──────┬──────┬────────────────┬─────────┐
│ Preamble │ Data Size │ Codec │ Qty1 │ Type │ Size + Content │ Qty2    │ CRC │
│ 4 bytes  │ 4 bytes   │ 1byte │ 1byte│ 1byte│ 4bytes + Xbytes│ 1 byte  │ 4 bytes │
└──────────┴───────────┴───────┴──────┴──────┴────────────────┴─────────┴─────────┘
"""
import logging
from typing import Optional

from ..reverse_binary_reader import ReverseBinaryReader
from ..models.codec12_response import Codec12Response

logger = logging.getLogger(__name__)

# Codec 12 constants
CODEC12_ID = 0x0C
RESPONSE_TYPE = 0x06  # Response from device
COMMAND_TYPE = 0x05   # Command to device


class Codec12:
    """
    Decoder for Teltonika Codec 12 (GPRS commands/responses).
    
    This codec handles command responses from devices over GPRS/TCP connections.
    """
    
    def __init__(self, reader: ReverseBinaryReader):
        """
        Initialize Codec 12 decoder.
        
        Args:
            reader: Binary reader positioned after codec ID byte
        """
        self._reader = reader
    
    def decode_response(self) -> Codec12Response:
        """
        Decode a Codec 12 response packet.
        
        The reader should be positioned at the Codec ID byte (position 8).
        
        Returns:
            Codec12Response with decoded data
            
        Raises:
            ValueError: If packet structure is invalid
        """
        # Reader is at position 8 (after preamble + data_size, at codec_id)
        # We need to go back to read preamble and data_size
        self._reader.position = 0
        
        # Read preamble (4 bytes, should be 0x00000000)
        preamble = self._reader.read_int32()
        if preamble != 0:
            raise ValueError(f"Invalid Codec 12 preamble: {preamble:#x}, expected 0x00000000")
        
        # Read data size (4 bytes)
        data_size = self._reader.read_int32()
        
        # Read codec ID (1 byte, should be 0x0C)
        codec_id = self._reader.read_byte()
        if codec_id != CODEC12_ID:
            raise ValueError(f"Invalid codec ID: {codec_id:#x}, expected 0x0C")
        
        # Read response quantity 1 (1 byte)
        response_quantity = self._reader.read_byte()
        
        # Read type (1 byte: 0x05=command, 0x06=response)
        response_type = self._reader.read_byte()
        
        # Read response/command size (4 bytes)
        response_size = self._reader.read_int32()
        
        # Read response/command content (response_size bytes)
        response_bytes = self._reader.read_bytes(response_size)
        
        # Decode ASCII text
        try:
            response_text = response_bytes.decode('ascii')
        except UnicodeDecodeError:
            # Fallback to latin-1 for non-ASCII bytes
            response_text = response_bytes.decode('latin-1')
            logger.warning(f"Codec 12 response contained non-ASCII bytes, decoded as latin-1")
        
        # Read response quantity 2 (1 byte)
        response_quantity_2 = self._reader.read_byte()
        
        # Verify quantities match
        if response_quantity != response_quantity_2:
            logger.warning(
                f"Codec 12 response quantity mismatch: qty1={response_quantity}, qty2={response_quantity_2}"
            )
        
        # Read CRC (4 bytes)
        crc = self._reader.read_int32()
        
        # Log based on type
        type_name = "RESPONSE" if response_type == RESPONSE_TYPE else "COMMAND" if response_type == COMMAND_TYPE else f"UNKNOWN({response_type})"
        logger.debug(
            f"Decoded Codec 12 {type_name}: "
            f"data_size={data_size}, response_size={response_size}, "
            f"text='{response_text[:100]}{'...' if len(response_text) > 100 else ''}'"
        )
        
        return Codec12Response.create(
            preamble=preamble,
            data_size=data_size,
            codec_id=codec_id,
            response_quantity=response_quantity,
            response_type=response_type,
            response_size=response_size,
            response_text=response_text,
            crc=crc
        )
    
    @staticmethod
    def is_codec12_packet(data: bytes) -> bool:
        """
        Check if raw bytes represent a Codec 12 packet.
        
        Args:
            data: Raw bytes to check
            
        Returns:
            True if this appears to be a Codec 12 packet
        """
        if len(data) < 12:  # Minimum: preamble(4) + size(4) + codec(1) + qty(1) + type(1) + size(4) = 15
            return False
        
        # Check preamble (bytes 0-3 should be 0x00000000)
        preamble = int.from_bytes(data[0:4], byteorder='big')
        if preamble != 0:
            return False
        
        # Check codec ID (byte 8 should be 0x0C)
        codec_id = data[8]
        return codec_id == CODEC12_ID
    
    @staticmethod
    def is_response_packet(data: bytes) -> bool:
        """
        Check if raw bytes represent a Codec 12 response (Type=0x06).
        
        Args:
            data: Raw bytes to check
            
        Returns:
            True if this is a Codec 12 response packet
        """
        if not Codec12.is_codec12_packet(data):
            return False
        
        if len(data) < 11:
            return False
        
        # Type is at byte 10 (after preamble(4) + size(4) + codec(1) + qty(1))
        response_type = data[10]
        return response_type == RESPONSE_TYPE
    
    @staticmethod
    def extract_response_text(data: bytes) -> Optional[str]:
        """
        Quick extraction of response text from raw Codec 12 bytes.
        
        Useful for logging without full decode.
        
        Args:
            data: Raw Codec 12 packet bytes
            
        Returns:
            Response text string, or None if extraction fails
        """
        try:
            if not Codec12.is_codec12_packet(data):
                return None
            
            if len(data) < 15:
                return None
            
            # Response size is at bytes 11-14 (4 bytes, big-endian)
            response_size = int.from_bytes(data[11:15], byteorder='big')
            
            if len(data) < 15 + response_size:
                return None
            
            # Response text starts at byte 15
            response_bytes = data[15:15 + response_size]
            
            try:
                return response_bytes.decode('ascii')
            except UnicodeDecodeError:
                return response_bytes.decode('latin-1')
        except Exception:
            return None
