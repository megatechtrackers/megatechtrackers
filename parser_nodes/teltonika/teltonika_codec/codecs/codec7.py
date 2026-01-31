"""Codec 7 decoder implementation (GH protocol)."""
from datetime import datetime, timedelta
from typing import List, Optional
from ..reverse_binary_reader import ReverseBinaryReader
from ..models.avl_data import AvlData
from ..models.avl_data_collection import AvlDataCollection
from ..models.gps_element import GpsElement, INVALID_GPS_SPEED
from ..models.io_element import IoElement
from ..models.io_property import IoProperty
from ..models.gh_avl_data_priority import GhAvlDataPriority
from ..models.global_mask_codec7 import GlobalMaskCodec7
from ..models.gps_element_mask_codec7 import GpsElementMaskCodec7
from ..models.field_encoding import FieldEncoding
from ..bit_converters import EndianBitConverters


GH_EPOCH = datetime(2007, 1, 1, 0, 0, 0, 0)

# Constants
CELL_ID_PROPERTY_ID = 200
SIGNAL_QUALITY_PROPERTY_ID = 201
OPERATOR_CODE_PROPERTY_ID = 202
ALARM_PROPERTY_ID = 204


class GpsElementExt:
    """Extended GPS element with IO properties."""
    def __init__(self, gps: GpsElement, io: IoElement):
        self.gps = gps
        self.io = io


class Codec7:
    """Codec 7 decoder."""
    
    def __init__(self, reader: ReverseBinaryReader):
        """Initialize Codec 7 decoder."""
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
        priority_and_timestamp = self._reader.read_int32()
        
        # Extract priority (first 2 bits)
        # Match C# behavior exactly: Convert.ToString(priorityAndTimestamp, 2).PadLeft(32, '0')
        # Then Substring(0, 2) and Convert.ToInt16, then cast to enum
        priority_bits = format(priority_and_timestamp, '032b')
        priority_value = int(priority_bits[:2], 2)
        # Cast directly to enum like C# does: (GhAvlDataPriority)Convert.ToInt16(...)
        # In C#, casting an integer to enum works even if value doesn't exist in enum definition
        # The enum variable will hold that integer value for comparison
        # In Python, IntEnum doesn't allow non-defined values, so we handle it specially
        try:
            priority = GhAvlDataPriority(priority_value)
        except ValueError:
            # Value doesn't exist in enum (e.g., 2 when only 1 and 10 are defined)
            # In C#, this would still work - enum variable holds the integer value
            # Create a custom class that behaves like enum for comparison and ToString()
            class _PriorityValue:
                def __init__(self, value):
                    self.value = value
                def __eq__(self, other):
                    if isinstance(other, GhAvlDataPriority):
                        return self.value == other.value
                    return self.value == other
                def __ne__(self, other):
                    return not self.__eq__(other)
                def __str__(self):
                    # Match C# ToString() behavior - returns integer as string if not a defined enum value
                    return str(self.value)
                @property
                def name(self):
                    # For AvlData.create() which uses priority.name
                    return str(self.value)
            priority = _PriorityValue(priority_value)
        
        # Extract timestamp (remaining 30 bits)
        timestamp = priority_and_timestamp & 0x3FFFFFFF
        date_time = GH_EPOCH + timedelta(seconds=timestamp)
        
        event_id = 0
        alarm_property = None
        
        if priority == GhAvlDataPriority.ALARM:
            event_id = ALARM_PROPERTY_ID
            alarm_property = IoProperty.create(ALARM_PROPERTY_ID, 1)
        
        # Global mask Codec7
        mask = GlobalMaskCodec7(self._reader.read_byte())
        
        # Default GPS element (all zeros, matching C# GpsElement.Default)
        gps = GpsElement.create(0, 0, 0, 0, 0, 0)
        gps_io = IoElement.create(0, 0, [])
        
        if GlobalMaskCodec7.GPS_ELEMENT in mask:
            element = self._decode_gps_element()
            gps = element.gps
            gps_io = element.io
        
        io_int8 = self.get_properties(mask, GlobalMaskCodec7.IO_INT8, FieldEncoding.INT8)
        io_int16 = self.get_properties(mask, GlobalMaskCodec7.IO_INT16, FieldEncoding.INT16)
        io_int32 = self.get_properties(mask, GlobalMaskCodec7.IO_INT32, FieldEncoding.INT32)
        
        properties = []
        if alarm_property is not None:
            properties.append(alarm_property)
        
        properties.extend(gps_io.properties)
        if io_int8:
            properties.extend(io_int8)
        if io_int16:
            properties.extend(io_int16)
        if io_int32:
            properties.extend(io_int32)
        
        io_element = IoElement.create(event_id, len(properties), properties)
        
        return AvlData.create(priority.name, date_time, gps, io_element)
    
    def get_properties(self, mask_codec7: GlobalMaskCodec7, flag: GlobalMaskCodec7, encoding: FieldEncoding) -> Optional[List[IoProperty]]:
        """Get properties based on mask flag."""
        if flag in mask_codec7:
            return list(self._decode_io_element(encoding).properties)
        return None
    
    def _decode_io_element(self, encoding: FieldEncoding) -> IoElement:
        """Decode IO element."""
        count = self._reader.read_byte()
        properties = []
        
        for i in range(count):
            properties.append(self._decode_property(encoding))
        
        return IoElement.create(0, len(properties), properties)
    
    def _decode_property(self, encoding: FieldEncoding) -> IoProperty:
        """Decode a single property."""
        property_id = self._reader.read_byte()
        
        if encoding == FieldEncoding.INT8:
            return IoProperty.create(property_id, self._reader.read_sbyte())
        elif encoding == FieldEncoding.INT16:
            return IoProperty.create(property_id, self._reader.read_int16())
        elif encoding == FieldEncoding.INT32:
            return IoProperty.create(property_id, self._reader.read_int32())
        else:
            raise ValueError(f"The field encoding \"{encoding}\" is not supported.")
    
    def _decode_gps_element(self) -> GpsElementExt:
        """Decode GPS element."""
        mask = GpsElementMaskCodec7(self._reader.read_byte())
        
        x = 0.0
        y = 0.0
        
        if GpsElementMaskCodec7.COORDINATES in mask:
            lat_int = self._reader.read_int32()
            lng_int = self._reader.read_int32()
            lat = EndianBitConverters.int32_to_single(lat_int)
            lng = EndianBitConverters.int32_to_single(lng_int)
            
            if not GpsElement.is_lat_valid(lat):
                lat = 0.0
            if not GpsElement.is_lng_valid(lng):
                lng = 0.0
            
            y = lat
            x = lng
        
        altitude = 0
        if GpsElementMaskCodec7.ALTITUDE in mask:
            altitude = self._reader.read_int16()
        
        angle = 0
        if GpsElementMaskCodec7.ANGLE in mask:
            angle_byte = self._reader.read_byte()
            angle = int(round(angle_byte * 360 / 256))
        
        speed = 0
        if GpsElementMaskCodec7.SPEED in mask:
            speed = self._reader.read_byte()
        
        satellites = 3
        if GpsElementMaskCodec7.SATELLITES in mask:
            satellites = self._reader.read_byte()
        
        properties = []
        
        if GpsElementMaskCodec7.CELL_ID in mask:
            cell_id = self._reader.read_int32()
            properties.append(IoProperty.create(CELL_ID_PROPERTY_ID, cell_id))
        
        if GpsElementMaskCodec7.SIGNAL_QUALITY in mask:
            signal_quality = self._reader.read_byte()
            properties.append(IoProperty.create(SIGNAL_QUALITY_PROPERTY_ID, signal_quality))
        
        if GpsElementMaskCodec7.OPERATOR_CODE in mask:
            code = self._reader.read_int32()
            properties.append(IoProperty.create(OPERATOR_CODE_PROPERTY_ID, code))
        
        # Set N/A position if coordinates are not available
        if x == 0 and y == 0:
            speed = INVALID_GPS_SPEED
            satellites = 0
        
        gps = GpsElement.create(x, y, altitude, speed, angle, satellites)
        io = IoElement.create(0, len(properties), properties)
        
        return GpsElementExt(gps=gps, io=io)

