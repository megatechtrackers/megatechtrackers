"""Codec 16 decoder implementation."""
from datetime import datetime, timedelta
from typing import List
from ..reverse_binary_reader import ReverseBinaryReader
from ..models.avl_data import AvlData
from ..models.avl_data_collection import AvlDataCollection
from ..models.gps_element import GpsElement
from ..models.io_element import IoElement
from ..models.io_property import IoProperty
from ..models.avl_data_priority import AvlDataPriority


AVL_EPOCH = datetime(1970, 1, 1, 0, 0, 0, 0)


class Codec16:
    """Codec 16 decoder."""
    
    def __init__(self, reader: ReverseBinaryReader):
        """Initialize Codec 16 decoder."""
        if reader is None:
            raise ValueError("reader cannot be None")
        self._reader = reader
    
    def decode_avl_data_collection(self) -> AvlDataCollection:
        """Decode AVL data packet."""
        codec_id = self._reader.read_byte()
        data_count = self._reader.read_byte()
        data = []
        
        for i in range(data_count):
            avl_data = self._decode_avl_data()
            data.append(avl_data)
        
        return AvlDataCollection.create(codec_id, data_count, data)
    
    def _decode_avl_data(self) -> AvlData:
        """Decode single AVL data."""
        timestamp = self._reader.read_int64()
        date_time = AVL_EPOCH + timedelta(milliseconds=timestamp)
        priority = AvlDataPriority(self._reader.read_byte())
        
        # GPS element decoding
        gps_element = self._decode_gps_element()
        
        # IO Element decoding
        event_id = self._reader.read_int16()
        origin_type = self._reader.read_byte()
        properties_count = self._reader.read_byte()
        io_properties = self._decode_io_properties()
        
        io_element = IoElement.create(event_id, properties_count, io_properties, origin_type)
        
        return AvlData.create(priority.name, date_time, gps_element, io_element)
    
    def _decode_gps_element(self) -> GpsElement:
        """Decode GPS element."""
        longitude = self._reader.read_int32()
        latitude = self._reader.read_int32()
        altitude = self._reader.read_int16()
        angle = self._reader.read_int16()
        satellites = self._reader.read_byte()
        speed = self._reader.read_int16()
        
        return GpsElement.create(longitude, latitude, altitude, speed, angle, satellites)
    
    def _decode_io_properties(self) -> List[IoProperty]:
        """Decode IO properties."""
        result = []
        
        # total number of I/O properties which length is 1 byte
        io_count_int8 = self._reader.read_byte()
        for i in range(io_count_int8):
            property_id = self._reader.read_int16()
            value = self._reader.read_sbyte()
            result.append(IoProperty.create(property_id, value))
        
        # total number of I/O properties which length is 2 bytes
        io_count_int16 = self._reader.read_byte()
        for i in range(io_count_int16):
            property_id = self._reader.read_int16()
            value = self._reader.read_int16()
            result.append(IoProperty.create(property_id, value))
        
        # total number of I/O properties which length is 4 bytes
        io_count_int32 = self._reader.read_byte()
        for i in range(io_count_int32):
            property_id = self._reader.read_int16()
            value = self._reader.read_int32()
            result.append(IoProperty.create(property_id, value))
        
        # total number of I/O properties which length is 8 bytes
        io_count_int64 = self._reader.read_byte()
        for i in range(io_count_int64):
            property_id = self._reader.read_int16()
            value = self._reader.read_int64()
            result.append(IoProperty.create(property_id, value))
        
        return result

