"""Data decoder for TCP packets."""
import io
from typing import Union
from .reverse_binary_reader import ReverseBinaryReader
from .crc import CRC
from .models.tcp_data_packet import TcpDataPacket
from .models.codec12_response import Codec12Response
from .codecs.codec7 import Codec7
from .codecs.codec8 import Codec8
from .codecs.codec8e import Codec8E
from .codecs.codec16 import Codec16
from .codecs.codec12 import Codec12

# Codec ID constants
CODEC12_ID = 0x0C


class DataDecoder:
    """Decoder for Teltonika TCP data packets."""
    
    def __init__(self, reader: ReverseBinaryReader):
        """Initialize decoder with a binary reader."""
        if reader is None:
            raise ValueError("reader cannot be None")
        self._reader = reader
    
    def get_codec_id(self) -> int:
        """
        Peek at the codec ID without advancing the reader position.
        
        Returns:
            Codec ID byte
        """
        # Codec ID is at position 8 (after preamble(4) + data_size(4))
        original_position = self._reader.position
        self._reader.position = 8
        codec_id = self._reader.read_byte()
        self._reader.position = original_position
        return codec_id
    
    def is_codec12(self) -> bool:
        """
        Check if the packet is Codec 12 (GPRS command/response).
        
        Returns:
            True if packet uses Codec 12
        """
        return self.get_codec_id() == CODEC12_ID
    
    def decode_codec12(self) -> Codec12Response:
        """
        Decode a Codec 12 GPRS command/response packet.
        
        Returns:
            Codec12Response with decoded data
            
        Raises:
            ValueError: If CRC doesn't match or packet is invalid
        """
        # Read header info
        self._reader.position = 0
        preamble = self._reader.read_int32()
        length = self._reader.read_int32()
        
        # Read data for CRC validation
        self._reader.position = 8
        data = self._reader.read_bytes(length)
        crc = self._reader.read_int32()
        
        if preamble != 0:
            raise ValueError("Unable to decode Codec 12. Missing package prefix.")
        
        if crc != CRC.DEFAULT.calc_crc16(data):
            raise ValueError("Codec 12 CRC does not match the expected.")
        
        # Reset and decode using Codec12 decoder
        self._reader.position = 0
        return Codec12(self._reader).decode_response()
    
    def decode_tcp_data(self) -> TcpDataPacket:
        """
        Decode AVL TCP data packet.
        
        Note: For Codec 12 packets, use decode_codec12() instead.
        This method is for AVL data codecs (7, 8, 16, 0x8E).
        
        Returns:
            TcpDataPacket with AVL data
            
        Raises:
            ValueError: If codec is unsupported or CRC doesn't match
        """
        preamble = self._reader.read_int32()
        length = self._reader.read_int32()
        codec_id = self._reader.read_byte()
        
        # Save position and read data for CRC
        self._reader.position = 8
        data = self._reader.read_bytes(length)
        crc = self._reader.read_int32()
        
        # Reset position for decoding
        self._reader.position = 8
        
        if preamble != 0:
            raise ValueError("Unable to decode. Missing package prefix.")
        
        if crc != CRC.DEFAULT.calc_crc16(data):
            raise ValueError("CRC does not match the expected.")
        
        avl_data_collection = None
        
        if codec_id == 7:
            avl_data_collection = Codec7(self._reader).decode_avl_data_collection()
        elif codec_id == 8:
            avl_data_collection = Codec8(self._reader).decode_avl_data_collection()
        elif codec_id == 16:
            avl_data_collection = Codec16(self._reader).decode_avl_data_collection()
        elif codec_id == 0x8E:
            avl_data_collection = Codec8E(self._reader).decode_avl_data_collection()
        elif codec_id == CODEC12_ID:
            raise ValueError(
                f"Codec 12 detected. Use decode_codec12() method instead of decode_tcp_data() "
                f"for GPRS command/response packets."
            )
        else:
            raise ValueError(f"Unsupported codec ID: {codec_id}")
        
        return TcpDataPacket.create(preamble, length, crc, codec_id, avl_data_collection)
    
    def decode(self) -> Union[TcpDataPacket, Codec12Response]:
        """
        Universal decode method that handles both AVL data and Codec 12 packets.
        
        Automatically detects the codec type and calls the appropriate decoder.
        
        Returns:
            TcpDataPacket for AVL data codecs (7, 8, 16, 0x8E)
            Codec12Response for Codec 12 (GPRS commands/responses)
            
        Raises:
            ValueError: If codec is unsupported or CRC doesn't match
        """
        if self.is_codec12():
            return self.decode_codec12()
        else:
            return self.decode_tcp_data()

