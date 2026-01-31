"""AVL data collection model."""
from dataclasses import dataclass
from typing import List
from .avl_data import AvlData


@dataclass
class AvlDataCollection:
    """Collection of AVL data."""
    codec_id: int
    data_count: int
    data: List[AvlData]
    
    @staticmethod
    def create(codec_id: int, data_count: int, data: List[AvlData]) -> 'AvlDataCollection':
        """Create AVL data collection."""
        return AvlDataCollection(
            codec_id=codec_id,
            data_count=data_count,
            data=data
        )

