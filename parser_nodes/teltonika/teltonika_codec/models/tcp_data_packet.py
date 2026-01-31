"""TCP data packet model."""
from dataclasses import dataclass
from .avl_data_collection import AvlDataCollection


@dataclass
class TcpDataPacket:
    """TCP data packet structure."""
    preamble: int
    length: int
    crc: int
    codec_id: int
    avl_data: AvlDataCollection
    
    @staticmethod
    def create(preamble: int, length: int, crc: int, codec_id: int, avl_data_collection: AvlDataCollection) -> 'TcpDataPacket':
        """Create TCP data packet."""
        return TcpDataPacket(
            preamble=preamble,
            length=length,
            crc=crc,
            codec_id=codec_id,
            avl_data=avl_data_collection
        )

