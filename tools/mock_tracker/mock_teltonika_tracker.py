#!/usr/bin/env python3
"""
Mock Teltonika Tracker - Simulates GPS trackers sending data to parser services.

This tool generates valid Teltonika Codec 8 packets and sends them to parser services
for testing purposes. Useful for:
- Load testing
- Edge case testing
- End-to-end flow verification
- Duplicate packet handling
- Connection drop scenarios

Usage:
    python mock_teltonika_tracker.py --host localhost --port 5027 --trackers 10 --rate 1.0
    
    # Test specific scenarios:
    python mock_teltonika_tracker.py --scenario load_test --trackers 100 --rate 0.1
    python mock_teltonika_tracker.py --scenario duplicate_test --trackers 5
    python mock_teltonika_tracker.py --scenario connection_drop --trackers 5
    
Environment Variables (for Docker):
    TRACKER_HOST: Target host (default: localhost)
    TRACKER_PORT: Target port (default: 5027)
    NUM_TRACKERS: Number of trackers to simulate (default: 10)
    SEND_RATE: Seconds between packets (default: 1.0)
    LOG_LEVEL: Logging level (default: INFO)
    IMEI_PREFIX: IMEI prefix for generated trackers (default: 35000000)
"""

import argparse
import asyncio
import logging
import os
import random
import struct
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional, Tuple
import signal
import sys

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('MockTracker')


# CRC-16 calculation (matches Teltonika protocol)
def calc_crc16(data: bytes, polynom: int = 0xA001) -> int:
    """Calculate CRC-16 for packet validation."""
    crc = 0
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 0x0001:
                crc = (crc >> 1) ^ polynom
            else:
                crc >>= 1
    return crc & 0xFFFF


@dataclass
class GPSData:
    """GPS position data."""
    latitude: float  # Decimal degrees
    longitude: float  # Decimal degrees
    altitude: int     # Meters
    angle: int        # Degrees (0-360)
    speed: int        # km/h
    satellites: int   # Number of satellites


@dataclass
class IOElement:
    """IO Element with property ID and value."""
    property_id: int
    value: int
    size: int  # 1, 2, 4, or 8 bytes


class TeltonikaPacketBuilder:
    """Builds valid Teltonika Codec 8 packets."""
    
    CODEC_8 = 0x08
    EPOCH = datetime(1970, 1, 1)
    
    @classmethod
    def build_imei_packet(cls, imei: str) -> bytes:
        """Build IMEI authentication packet.
        
        Format: [length (2 bytes)][IMEI (15 bytes ASCII)]
        """
        imei_bytes = imei.encode('ascii')[:15].ljust(15, b'0')
        # Length is in second byte (first byte is 0x00)
        return bytes([0x00, len(imei_bytes)]) + imei_bytes
    
    @classmethod
    def build_data_packet(
        cls,
        gps: GPSData,
        timestamp: Optional[datetime] = None,
        io_elements: Optional[List[IOElement]] = None,
        priority: int = 0,
        event_io_id: int = None
    ) -> bytes:
        """Build a Codec 8 data packet.
        
        Packet structure:
        - Preamble (4 bytes): 0x00000000
        - Data length (4 bytes)
        - Codec ID (1 byte): 0x08
        - Number of Data (1 byte)
        - AVL Data (variable)
        - Number of Data (1 byte) - same as before
        - CRC (4 bytes)
        
        Args:
            gps: GPS data for the packet
            timestamp: Packet timestamp (defaults to now)
            io_elements: List of IO elements
            priority: Priority level (0=low, 1=high, 2=panic)
            event_io_id: The IO ID that triggered this event. This determines the status
                        field in the parser. Use specific IDs for events:
                        - 1: Ignition
                        - 3: Panic
                        - 155/156: GeoFence
                        - 253: Harsh driving
                        - etc.
        """
        if timestamp is None:
            timestamp = datetime.now(timezone.utc).replace(tzinfo=None)
        
        if io_elements is None:
            io_elements = cls._default_io_elements({})
        
        # Build AVL data
        avl_data = cls._build_avl_data(gps, timestamp, io_elements, priority, event_io_id)
        
        # Build data section: codec_id + count + avl_data + count
        data_count = 1  # One AVL record
        data_section = bytes([cls.CODEC_8, data_count]) + avl_data + bytes([data_count])
        
        # Calculate CRC on data section (without preamble and length)
        crc = calc_crc16(data_section)
        
        # Build full packet
        preamble = b'\x00\x00\x00\x00'
        length = struct.pack('>I', len(data_section))
        crc_bytes = struct.pack('>I', crc)
        
        return preamble + length + data_section + crc_bytes
    
    @classmethod
    def _build_avl_data(
        cls,
        gps: GPSData,
        timestamp: datetime,
        io_elements: List[IOElement],
        priority: int,
        event_io_id: int = None
    ) -> bytes:
        """Build single AVL data record."""
        # Timestamp (8 bytes) - milliseconds since epoch
        ts_ms = int((timestamp - cls.EPOCH).total_seconds() * 1000)
        timestamp_bytes = struct.pack('>Q', ts_ms)
        
        # Priority (1 byte)
        priority_byte = bytes([priority])
        
        # GPS element (15 bytes)
        gps_bytes = cls._build_gps_element(gps)
        
        # IO element (with event_io_id to set correct status)
        io_bytes = cls._build_io_element(io_elements, event_io_id)
        
        return timestamp_bytes + priority_byte + gps_bytes + io_bytes
    
    @classmethod
    def _build_gps_element(cls, gps: GPSData) -> bytes:
        """Build GPS element (15 bytes).
        
        Format:
        - Longitude (4 bytes, signed int, x10^7)
        - Latitude (4 bytes, signed int, x10^7)
        - Altitude (2 bytes, signed)
        - Angle (2 bytes, unsigned)
        - Satellites (1 byte)
        - Speed (2 bytes, unsigned)
        """
        lon = int(gps.longitude * 10000000)
        lat = int(gps.latitude * 10000000)
        
        return struct.pack('>iiHHBH',
            lon, lat, gps.altitude, gps.angle, gps.satellites, gps.speed
        )
    
    @classmethod
    def _build_io_element(cls, io_elements: List[IOElement], event_io_id: int = None) -> bytes:
        """Build IO element section.
        
        Args:
            io_elements: List of IO elements to include in packet
            event_io_id: The IO ID that triggered this event (determines status in parser).
                         If None, uses first IO element's ID.
        """
        # Filter out elements with None values
        valid_elements = [e for e in io_elements if e.value is not None]
        
        # Group by size
        io_1byte = [e for e in valid_elements if e.size == 1]
        io_2byte = [e for e in valid_elements if e.size == 2]
        io_4byte = [e for e in valid_elements if e.size == 4]
        io_8byte = [e for e in valid_elements if e.size == 8]
        
        # Event IO ID - determines which IO triggered this AVL record
        # This is CRITICAL for the parser to set the correct status!
        if event_io_id is not None:
            event_id = event_io_id
        else:
            event_id = valid_elements[0].property_id if valid_elements else 0
        
        # Total IO count
        total_count = len(valid_elements)
        
        result = bytes([event_id, total_count])
        
        # 1-byte IO elements
        result += bytes([len(io_1byte)])
        for e in io_1byte:
            result += bytes([e.property_id, int(e.value) & 0xFF])
        
        # 2-byte IO elements
        result += bytes([len(io_2byte)])
        for e in io_2byte:
            result += bytes([e.property_id]) + struct.pack('>H', int(e.value) & 0xFFFF)
        
        # 4-byte IO elements
        result += bytes([len(io_4byte)])
        for e in io_4byte:
            result += bytes([e.property_id]) + struct.pack('>I', int(e.value) & 0xFFFFFFFF)
        
        # 8-byte IO elements
        result += bytes([len(io_8byte)])
        for e in io_8byte:
            result += bytes([e.property_id]) + struct.pack('>Q', int(e.value))
        
        return result
    
    @classmethod
    def _default_io_elements(cls, tracker_state: dict = None) -> List[IOElement]:
        """Generate IO elements based on tracker state matching real unit_io_mapping.csv.
        
        All 42 Unit IO mappings per tracker are supported:
        - ID 1: Ignition (0=Off, 1=On) - ALARM
        - ID 2: Passenger Seatbelt (0=Open, 1=Close)
        - ID 3: Panic Button (0=Off, 1=On) - ALARM  
        - ID 4: Driver Seatbelt (0=Open, 1=Close)
        - ID 9: Passenger Seat (analog)
        - ID 10,11,19: Ain 2,3,4 (analog)
        - ID 66: Main Battery (mV) - ALARM when low
        - ID 67: Battery Voltage (mV)
        - ID 72-75: Dallas Temperature 1-4
        - ID 86,104,106,108: BLE Humidity 1-4
        - ID 155: GeoFence1 (0=Exit, 1=Enter) - ALARM
        - ID 156: GeoFence2 (0=Exit, 1=Enter) - ALARM
        - ID 248: Immobilizer (0=OFF, 1=ON)
        - ID 252: Battery (0=Present, 1=Unplugged)
        - ID 25-28: BLE Temperature 1-4
        - ID 253: Harsh Event (1=Acceleration, 2=Braking, 3=Cornering)
        - ID 254: Green Driving Value
        - ID 179: Immobilizer1 (0=OFF, 1=ON)
        - ID 180: Immobilizer2 (0=OFF, 1=ON)
        """
        state = tracker_state or {}
        
        elements = []
        
        # ===== 1-BYTE IO ELEMENTS =====
        
        # Ignition (ID 1) - 0=Off, 1=On - ALARM
        elements.append(IOElement(property_id=1, value=state.get('ignition', 1), size=1))
        
        # Passenger Seatbelt (ID 2) - 0=Open, 1=Close
        elements.append(IOElement(property_id=2, value=state.get('passenger_seatbelt', 1), size=1))
        
        # Panic (ID 3) - 0=Off, 1=On - ALARM (only send when pressed)
        if state.get('panic', 0) == 1:
            elements.append(IOElement(property_id=3, value=1, size=1))
        
        # Driver Seatbelt (ID 4) - 0=Open, 1=Close
        elements.append(IOElement(property_id=4, value=state.get('driver_seatbelt', 1), size=1))
        
        # GSM signal strength (ID 21)
        elements.append(IOElement(property_id=21, value=random.randint(3, 5), size=1))
        
        # GNSS status (ID 69)
        elements.append(IOElement(property_id=69, value=3, size=1))
        
        # GeoFence1 (ID 155) - 0=Exit, 1=Enter - ALARM
        if state.get('geofence1') is not None:
            elements.append(IOElement(property_id=155, value=state['geofence1'], size=1))
        
        # GeoFence2 (ID 156) - 0=Exit, 1=Enter - ALARM
        if state.get('geofence2') is not None:
            elements.append(IOElement(property_id=156, value=state['geofence2'], size=1))
        
        # Immobilizer (ID 248) - 0=OFF, 1=ON
        elements.append(IOElement(property_id=248, value=state.get('immobilizer', 0), size=1))
        
        # Battery status (ID 252) - 0=Present, 1=Unplugged
        elements.append(IOElement(property_id=252, value=state.get('battery_unplugged', 0), size=1))
        
        # Harsh driving event (ID 253) - 1=Accel, 2=Brake, 3=Corner
        if state.get('harsh_event', 0) > 0:
            elements.append(IOElement(property_id=253, value=state['harsh_event'], size=1))
        
        # Immobilizer1 (ID 179) - 0=OFF, 1=ON
        elements.append(IOElement(property_id=179, value=state.get('immobilizer1', 0), size=1))
        
        # Immobilizer2 (ID 180) - 0=OFF, 1=ON
        elements.append(IOElement(property_id=180, value=state.get('immobilizer2', 0), size=1))
        
        # ===== 2-BYTE IO ELEMENTS =====
        
        # Main Battery/External voltage (ID 66) - mV - ALARM
        elements.append(IOElement(property_id=66, value=state.get('main_battery', 12500), size=2))
        
        # Battery voltage (ID 67) - mV
        elements.append(IOElement(property_id=67, value=state.get('battery_voltage', 4100), size=2))
        
        # Passenger Seat (ID 9) - analog value
        elements.append(IOElement(property_id=9, value=state.get('passenger_seat', random.randint(0, 1000)), size=2))
        
        # Ain 2,3,4 (IDs 10, 11, 19) - analog inputs
        elements.append(IOElement(property_id=10, value=random.randint(0, 500), size=2))
        elements.append(IOElement(property_id=11, value=random.randint(0, 500), size=2))
        elements.append(IOElement(property_id=19, value=random.randint(0, 500), size=2))
        
        # Dallas Temperature 1-4 (IDs 72-75) - temperature * 10
        base_temp = state.get('temperature', 250)  # 25.0°C default
        elements.append(IOElement(property_id=72, value=base_temp + random.randint(-10, 10), size=2))
        elements.append(IOElement(property_id=73, value=base_temp + random.randint(-10, 10), size=2))
        elements.append(IOElement(property_id=74, value=base_temp + random.randint(-10, 10), size=2))
        elements.append(IOElement(property_id=75, value=base_temp + random.randint(-10, 10), size=2))
        
        # BLE Humidity 1-4 (IDs 86, 104, 106, 108) - humidity * 10
        base_humidity = 500  # 50.0% default
        elements.append(IOElement(property_id=86, value=base_humidity + random.randint(-50, 50), size=2))
        elements.append(IOElement(property_id=104, value=base_humidity + random.randint(-50, 50), size=2))
        elements.append(IOElement(property_id=106, value=base_humidity + random.randint(-50, 50), size=2))
        elements.append(IOElement(property_id=108, value=base_humidity + random.randint(-50, 50), size=2))
        
        # BLE Temperature 1-4 (IDs 25-28) - temperature * 100
        ble_temp = state.get('ble_temperature', 2500)  # 25.00°C default
        elements.append(IOElement(property_id=25, value=ble_temp + random.randint(-100, 100), size=2))
        elements.append(IOElement(property_id=26, value=ble_temp + random.randint(-100, 100), size=2))
        elements.append(IOElement(property_id=27, value=ble_temp + random.randint(-100, 100), size=2))
        elements.append(IOElement(property_id=28, value=ble_temp + random.randint(-100, 100), size=2))
        
        # Green Driving Value (ID 254) - score * 100
        elements.append(IOElement(property_id=254, value=state.get('green_driving', random.randint(70, 100) * 100), size=2))
        
        return elements


class MockTracker:
    """Simulates a single Teltonika GPS tracker with realistic events and alarms."""
    
    # Geofence boundaries (Karachi area)
    GEOFENCE1_CENTER = (24.8607, 67.0011)  # Clifton area
    GEOFENCE1_RADIUS = 0.02  # ~2km
    GEOFENCE2_CENTER = (24.9056, 67.0822)  # Gulshan area  
    GEOFENCE2_RADIUS = 0.025  # ~2.5km
    
    def __init__(
        self,
        imei: str,
        host: str,
        port: int,
        base_lat: float = 24.8640,
        base_lon: float = 67.0665,
        send_rate: float = 30.0  # seconds between packets (default 30s)
    ):
        self.imei = imei
        self.host = host
        self.port = port
        self.base_lat = base_lat
        self.base_lon = base_lon
        self.send_rate = send_rate
        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None
        self.connected = False
        self.packets_sent = 0
        self.acks_received = 0
        self._running = False
        
        # Movement simulation
        self.current_lat = base_lat
        self.current_lon = base_lon
        self.speed = 0
        self.angle = 0
        
        # Vehicle/tracker state for realistic events (matches all 42 Unit IO mappings entries)
        self.state = {
            'ignition': 1,           # ID 1: 0=Off, 1=On
            'passenger_seatbelt': 1, # ID 2: 0=Open, 1=Close
            'panic': 0,              # ID 3: 0=Off, 1=Pressed
            'driver_seatbelt': 1,    # ID 4: 0=Open, 1=Close
            'passenger_seat': 500,   # ID 9: analog value
            'main_battery': 12800,   # ID 66: mV (12.8V normal)
            'battery_voltage': 4100, # ID 67: mV (4.1V normal)
            'temperature': 250,      # IDs 72-75: temp * 10 (25.0°C)
            'ble_temperature': 2500, # IDs 25-28: temp * 100 (25.00°C)
            'geofence1': None,       # ID 155: None=not triggered, 0=Exit, 1=Enter
            'geofence2': None,       # ID 156: None=not triggered, 0=Exit, 1=Enter
            'immobilizer': 0,        # ID 248: 0=OFF, 1=ON
            'battery_unplugged': 0,  # ID 252: 0=Present, 1=Unplugged
            'harsh_event': 0,        # ID 253: 0=None, 1=Accel, 2=Brake, 3=Corner
            'green_driving': 8500,   # ID 254: score * 100 (85.00)
            'immobilizer1': 0,       # ID 179: 0=OFF, 1=ON
            'immobilizer2': 0,       # ID 180: 0=OFF, 1=ON
            'in_geofence1': False,   # Track if currently inside geofence
            'in_geofence2': False,
        }
        
        # Event counters for logging
        self.events_generated = {
            'ignition_off': 0, 'ignition_on': 0,
            'panic': 0, 'harsh_acceleration': 0, 'harsh_braking': 0, 'harsh_cornering': 0,
            'geofence1_enter': 0, 'geofence1_exit': 0,
            'geofence2_enter': 0, 'geofence2_exit': 0,
            'low_battery': 0, 'battery_unplugged': 0,
            'seatbelt_warning': 0, 'immobilizer': 0,
            'high_temp': 0, 'overspeed': 0,
        }
        
        # Simulation parameters
        self._packet_counter = 0
        self._driving_mode = random.choice(['normal', 'aggressive'])  # Start driving
        self._next_ignition_toggle = random.randint(4, 8)  # Faster toggle cycles (2-4 min)
    
    async def connect(self) -> bool:
        """Connect to parser and authenticate with IMEI."""
        try:
            self.reader, self.writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port),
                timeout=10.0
            )
            
            # Send IMEI
            imei_packet = TeltonikaPacketBuilder.build_imei_packet(self.imei)
            self.writer.write(imei_packet)
            await self.writer.drain()
            
            # Wait for ACK (0x01)
            ack = await asyncio.wait_for(self.reader.read(1), timeout=5.0)
            if ack == b'\x01':
                self.connected = True
                logger.info(f"[{self.imei}] Connected and authenticated")
                return True
            else:
                logger.warning(f"[{self.imei}] Unexpected ACK: {ack.hex()}")
                return False
                
        except asyncio.TimeoutError:
            logger.error(f"[{self.imei}] Connection timeout")
            return False
        except Exception as e:
            logger.error(f"[{self.imei}] Connection error: {e}")
            return False
    
    async def disconnect(self):
        """Close connection."""
        self._running = False
        if self.writer:
            try:
                self.writer.close()
                await self.writer.wait_closed()
            except Exception:
                pass
        self.connected = False
        logger.info(f"[{self.imei}] Disconnected (sent: {self.packets_sent}, acks: {self.acks_received})")
    
    def _simulate_movement(self):
        """Simulate GPS movement based on driving mode."""
        import math
        
        # Driving mode affects behavior
        if self._driving_mode == 'parked':
            self.speed = 0
            return
        
        # Speed changes based on mode - more aggressive for more events
        if self._driving_mode == 'aggressive':
            speed_delta = random.randint(-15, 30)  # More acceleration
            min_speed = 30  # Keep speed high in aggressive
        else:
            speed_delta = random.randint(-10, 15)
            min_speed = 10  # Keep moving
        
        self.speed = max(min_speed, min(140, self.speed + speed_delta))
        
        # Direction change
        angle_delta = random.randint(-45, 45) if self._driving_mode == 'aggressive' else random.randint(-20, 20)
        self.angle = (self.angle + angle_delta) % 360
        
        # Move based on speed and angle
        if self.speed > 0:
            distance_km = (self.speed / 3600) * self.send_rate
            delta_lat = (distance_km / 111) * math.cos(math.radians(self.angle))
            delta_lon = (distance_km / 111) * math.sin(math.radians(self.angle))
            self.current_lat += delta_lat
            self.current_lon += delta_lon
            
            # Keep within reasonable bounds (Karachi area)
            self.current_lat = max(24.75, min(25.05, self.current_lat))
            self.current_lon = max(66.90, min(67.20, self.current_lon))
    
    def _check_geofences(self) -> int:
        """Check geofence boundaries and generate enter/exit events.
        
        Returns:
            int: IO ID if a geofence event occurred (155 or 156), or None if no event.
        """
        import math
        
        def distance(lat1, lon1, lat2, lon2):
            return math.sqrt((lat1 - lat2)**2 + (lon1 - lon2)**2)
        
        geofence_event_id = None
        
        # Check Geofence 1
        dist1 = distance(self.current_lat, self.current_lon, 
                        self.GEOFENCE1_CENTER[0], self.GEOFENCE1_CENTER[1])
        in_gf1 = dist1 < self.GEOFENCE1_RADIUS
        
        if in_gf1 and not self.state['in_geofence1']:
            self.state['geofence1'] = 1  # Enter
            self.events_generated['geofence1_enter'] += 1
            geofence_event_id = 155  # GeoFence1 IO ID
            logger.info(f"[{self.imei}] 🔔 EVENT: GeoFence1 ENTER")
        elif not in_gf1 and self.state['in_geofence1']:
            self.state['geofence1'] = 0  # Exit
            self.events_generated['geofence1_exit'] += 1
            geofence_event_id = 155  # GeoFence1 IO ID
            logger.info(f"[{self.imei}] 🔔 EVENT: GeoFence1 EXIT")
        else:
            self.state['geofence1'] = None
        self.state['in_geofence1'] = in_gf1
        
        # Check Geofence 2
        dist2 = distance(self.current_lat, self.current_lon,
                        self.GEOFENCE2_CENTER[0], self.GEOFENCE2_CENTER[1])
        in_gf2 = dist2 < self.GEOFENCE2_RADIUS
        
        if in_gf2 and not self.state['in_geofence2']:
            self.state['geofence2'] = 1  # Enter
            self.events_generated['geofence2_enter'] += 1
            geofence_event_id = 156  # GeoFence2 IO ID
            logger.info(f"[{self.imei}] 🔔 EVENT: GeoFence2 ENTER")
        elif not in_gf2 and self.state['in_geofence2']:
            self.state['geofence2'] = 0  # Exit
            self.events_generated['geofence2_exit'] += 1
            geofence_event_id = 156  # GeoFence2 IO ID
            logger.info(f"[{self.imei}] 🔔 EVENT: GeoFence2 EXIT")
        else:
            self.state['geofence2'] = None
        self.state['in_geofence2'] = in_gf2
        
        return geofence_event_id
    
    def _simulate_events(self) -> int:
        """Simulate random events and state changes for realistic alarms.
        
        Returns:
            int: The IO ID that triggered this packet's event (determines status in parser).
                 Higher priority events override lower ones:
                 - Panic (ID 3) - highest priority
                 - Harsh driving (ID 253)
                 - GeoFence (ID 155/156)  
                 - Battery unplugged (ID 252)
                 - Ignition (ID 1) - default
        """
        self._packet_counter += 1
        triggered_event_id = 1  # Default to ignition
        
        # Reset one-time events
        self.state['panic'] = 0
        self.state['harsh_event'] = 0
        
        # === IGNITION EVENTS (every ~4-8 packets for faster cycling ~2-4 min) ===
        ignition_changed = False
        if self._packet_counter >= self._next_ignition_toggle:
            old_ignition = self.state['ignition']
            self.state['ignition'] = 1 - old_ignition  # Toggle
            self._next_ignition_toggle = self._packet_counter + random.randint(4, 8)  # Faster cycling
            ignition_changed = True
            triggered_event_id = 1  # Ignition IO ID
            if self.state['ignition'] == 0:
                self._driving_mode = 'parked'
                self.events_generated['ignition_off'] += 1
                logger.info(f"[{self.imei}] 🔔 ALARM: Ignition OFF")
            else:
                # More likely aggressive mode for more events
                self._driving_mode = random.choice(['normal', 'aggressive', 'aggressive'])
                self.events_generated['ignition_on'] += 1
                logger.info(f"[{self.imei}] 🔔 ALARM: Ignition ON (mode: {self._driving_mode})")
        
        # === PANIC BUTTON (3% chance - more frequent for testing) - HIGHEST PRIORITY ===
        if random.random() < 0.03:
            self.state['panic'] = 1
            self.events_generated['panic'] += 1
            triggered_event_id = 3  # Panic IO ID - overrides everything
            logger.warning(f"[{self.imei}] 🚨 ALARM: PANIC BUTTON PRESSED!")
        
        # === HARSH DRIVING EVENTS (much more likely) ===
        if self.state['ignition'] == 1:  # Only when engine on
            harsh_chance = 0.25 if self._driving_mode == 'aggressive' else 0.08
            if self.speed > 5 and random.random() < harsh_chance:  # Lower speed threshold
                event_type = random.choice([1, 2, 3])  # 1=Accel, 2=Brake, 3=Corner
                self.state['harsh_event'] = event_type
                event_name = {1: 'ACCELERATION', 2: 'BRAKING', 3: 'CORNERING'}[event_type]
                self.events_generated[f'harsh_{event_name.lower()}'] += 1
                if triggered_event_id not in [3]:  # Don't override panic
                    triggered_event_id = 253  # Harsh event IO ID
                logger.info(f"[{self.imei}] 🔔 EVENT: Harsh {event_name} (speed={self.speed})")
        
        # === BATTERY VOLTAGE SIMULATION ===
        # Normal range: 12.0V - 14.4V, drops when engine off
        if self.state['ignition'] == 0:
            # Battery draining faster when parked
            self.state['main_battery'] = max(10500, self.state['main_battery'] - random.randint(50, 150))
        else:
            # Charging when running
            self.state['main_battery'] = min(14400, self.state['main_battery'] + random.randint(20, 100))
        
        # Low battery alarm (below 11.5V) - log every time
        if self.state['main_battery'] < 11500:
            self.events_generated['low_battery'] += 1
            if triggered_event_id not in [3, 253]:  # Don't override panic or harsh
                triggered_event_id = 66  # Main battery IO ID
            logger.warning(f"[{self.imei}] ⚠️ ALARM: Low battery {self.state['main_battery']/1000:.1f}V")
        
        # Internal battery voltage fluctuation
        self.state['battery_voltage'] = random.randint(3800, 4200)
        
        # === BATTERY UNPLUGGED (2% chance - more frequent) ===
        if random.random() < 0.02:
            self.state['battery_unplugged'] = 1
            self.events_generated['battery_unplugged'] += 1
            if triggered_event_id not in [3, 253]:  # Don't override panic or harsh
                triggered_event_id = 252  # Battery unplugged IO ID
            logger.warning(f"[{self.imei}] 🚨 ALARM: Battery UNPLUGGED!")
        else:
            self.state['battery_unplugged'] = 0
        
        # === SEATBELT SIMULATION (more frequent) ===
        seatbelt_event = False
        if self.state['ignition'] == 1:  # Any time engine is on
            if random.random() < 0.08:  # 8% chance
                old_driver = self.state['driver_seatbelt']
                self.state['driver_seatbelt'] = 1 - self.state['driver_seatbelt']
                status = "FASTENED" if self.state['driver_seatbelt'] == 1 else "OPEN"
                self.events_generated['seatbelt_warning'] += 1
                seatbelt_event = True
                if triggered_event_id not in [3, 253, 252]:  # Don't override higher priority
                    triggered_event_id = 4  # Driver seatbelt IO ID
                logger.info(f"[{self.imei}] 🔔 EVENT: Driver Seatbelt {status}")
            if random.random() < 0.05:  # 5% chance
                self.state['passenger_seatbelt'] = 1 - self.state['passenger_seatbelt']
                status = "FASTENED" if self.state['passenger_seatbelt'] == 1 else "OPEN"
                if not seatbelt_event and triggered_event_id not in [3, 253, 252]:
                    triggered_event_id = 2  # Passenger seatbelt IO ID
                logger.info(f"[{self.imei}] 🔔 EVENT: Passenger Seatbelt {status}")
        
        # === IMMOBILIZER SIMULATION (more frequent) ===
        if self.state['ignition'] == 0:
            if random.random() < 0.15:  # 15% chance when parked
                old_immo = self.state['immobilizer']
                self.state['immobilizer'] = 1 - self.state['immobilizer']
                if self.state['immobilizer'] == 1:
                    self.events_generated['immobilizer'] += 1
                    if triggered_event_id not in [3, 253, 252]:
                        triggered_event_id = 248  # Immobilizer IO ID
                    logger.info(f"[{self.imei}] 🔒 EVENT: Immobilizer ACTIVATED")
                else:
                    if triggered_event_id not in [3, 253, 252]:
                        triggered_event_id = 248  # Immobilizer IO ID  
                    logger.info(f"[{self.imei}] 🔓 EVENT: Immobilizer DEACTIVATED")
        elif self.state['ignition'] == 1:
            self.state['immobilizer'] = 0
        
        # === TEMPERATURE SIMULATION (with alarms) ===
        # Slowly fluctuate temperature
        self.state['temperature'] = max(150, min(450, self.state['temperature'] + random.randint(-10, 15)))
        self.state['ble_temperature'] = max(1500, min(4500, self.state['ble_temperature'] + random.randint(-100, 100)))
        
        # High temperature alarm (over 38°C / 380 in 0.1°C units)
        if self.state['temperature'] > 380:
            self.events_generated['high_temp'] += 1
            logger.warning(f"[{self.imei}] 🌡️ ALARM: High temperature {self.state['temperature']/10:.1f}°C")
        
        # === GREEN DRIVING SCORE ===
        # Score affected by harsh events
        if self.state['harsh_event'] > 0:
            self.state['green_driving'] = max(0, self.state['green_driving'] - random.randint(100, 500))
        else:
            self.state['green_driving'] = min(10000, self.state['green_driving'] + random.randint(0, 50))
        
        # === OVERSPEED EVENT (5% chance when speed > 80) ===
        if self.speed > 80 and random.random() < 0.05:
            self.events_generated['overspeed'] += 1
            logger.warning(f"[{self.imei}] 🚗 ALARM: OVERSPEED {self.speed} km/h!")
        
        # Check geofences after movement
        geofence_event_id = self._check_geofences()
        if geofence_event_id and triggered_event_id not in [3, 253]:  # Don't override panic or harsh
            triggered_event_id = geofence_event_id
        
        return triggered_event_id
    
    async def send_packet(self) -> bool:
        """Send a data packet with realistic events and wait for ACK."""
        if not self.connected or not self.writer:
            return False
        
        try:
            # Simulate movement and events
            self._simulate_movement()
            triggered_event_id = self._simulate_events()  # Get the IO ID that triggered this event
            
            # Build GPS data
            gps = GPSData(
                latitude=self.current_lat,
                longitude=self.current_lon,
                altitude=random.randint(0, 50),
                angle=self.angle,
                speed=self.speed,
                satellites=random.randint(8, 15)
            )
            
            # Build IO elements from current state
            io_elements = TeltonikaPacketBuilder._default_io_elements(self.state)
            
            # Build and send packet with the triggered event IO ID
            # This is CRITICAL - the event_io_id determines what status the parser will set!
            packet = TeltonikaPacketBuilder.build_data_packet(
                gps, 
                io_elements=io_elements,
                event_io_id=triggered_event_id
            )
            self.writer.write(packet)
            await self.writer.drain()
            self.packets_sent += 1
            
            # Wait for ACK (4 bytes: number of accepted records)
            ack = await asyncio.wait_for(self.reader.read(4), timeout=30.0)
            if len(ack) == 4:
                accepted = struct.unpack('>I', ack)[0]
                self.acks_received += 1
                logger.debug(f"[{self.imei}] ACK received: {accepted} records accepted")
                return True
            else:
                logger.warning(f"[{self.imei}] Unexpected ACK size: {len(ack)}")
                return False
                
        except asyncio.TimeoutError:
            logger.warning(f"[{self.imei}] ACK timeout")
            return False
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError) as e:
            logger.warning(f"[{self.imei}] Connection lost: {e}")
            self.connected = False
            return False
        except Exception as e:
            logger.error(f"[{self.imei}] Send error: {e}")
            return False
    
    async def run(self, duration: float = 0):
        """Run tracker for specified duration (0 = indefinite)."""
        self._running = True
        start_time = time.time()
        
        while self._running:
            if duration > 0 and (time.time() - start_time) > duration:
                break
            
            if not self.connected:
                if not await self.connect():
                    await asyncio.sleep(5)  # Retry after 5 seconds
                    continue
            
            if not await self.send_packet():
                await asyncio.sleep(1)  # Brief pause on error
                continue
            
            await asyncio.sleep(self.send_rate)
        
        await self.disconnect()
    
    def stop(self):
        """Stop the tracker."""
        self._running = False


class MockTrackerFleet:
    """Manages multiple mock trackers for load testing."""
    
    def __init__(
        self,
        host: str,
        port: int,
        num_trackers: int = 10,
        send_rate: float = 30.0,  # Default 30 seconds between packets
        imei_prefix: str = "35000000",
        reconnect_on_failure: bool = True
    ):
        self.host = host
        self.port = port
        self.num_trackers = num_trackers
        self.send_rate = send_rate
        self.imei_prefix = imei_prefix
        self.reconnect_on_failure = reconnect_on_failure
        self.trackers: List[MockTracker] = []
        self._running = False
        self._start_time = None
    
    def _generate_imeis(self) -> List[str]:
        """Generate unique IMEIs for trackers."""
        imeis = []
        for i in range(self.num_trackers):
            # Generate IMEI: prefix + 7 digits (total 15 digits)
            suffix = str(i + 1).zfill(15 - len(self.imei_prefix))
            imeis.append(self.imei_prefix + suffix)
        return imeis
    
    async def run(self, duration: float = 0):
        """Run all trackers concurrently."""
        self._running = True
        self._start_time = time.time()
        imeis = self._generate_imeis()
        
        # Create trackers with slightly randomized positions (spread around base)
        for i, imei in enumerate(imeis):
            base_lat = 24.8640 + random.uniform(-0.05, 0.05)
            base_lon = 67.0665 + random.uniform(-0.05, 0.05)
            
            tracker = MockTracker(
                imei=imei,
                host=self.host,
                port=self.port,
                base_lat=base_lat,
                base_lon=base_lon,
                send_rate=self.send_rate + random.uniform(-0.2, 0.2)  # Slight variation
            )
            self.trackers.append(tracker)
        
        logger.info(f"🚀 Starting {len(self.trackers)} mock trackers to {self.host}:{self.port}")
        logger.info(f"   Send rate: ~{self.send_rate}s per tracker, IMEI prefix: {self.imei_prefix}")
        
        # Staggered startup - connect in batches to avoid overwhelming the system
        batch_size = int(os.environ.get('BATCH_SIZE', '500'))  # Trackers per batch
        batch_delay = float(os.environ.get('BATCH_DELAY', '2.0'))  # Seconds between batches
        
        logger.info(f"   Staggered startup: {batch_size} trackers every {batch_delay}s")
        
        all_tasks = []
        for i in range(0, len(self.trackers), batch_size):
            batch = self.trackers[i:i + batch_size]
            batch_num = (i // batch_size) + 1
            total_batches = (len(self.trackers) + batch_size - 1) // batch_size
            logger.info(f"📦 Starting batch {batch_num}/{total_batches} ({len(batch)} trackers)")
            
            # Start this batch
            for tracker in batch:
                all_tasks.append(asyncio.create_task(tracker.run(duration)))
            
            # Wait before next batch (except for last batch)
            if i + batch_size < len(self.trackers):
                await asyncio.sleep(batch_delay)
        
        # Wait for all trackers to complete
        await asyncio.gather(*all_tasks, return_exceptions=True)
    
    def stop(self):
        """Stop all trackers."""
        self._running = False
        for tracker in self.trackers:
            tracker.stop()
    
    def get_stats(self) -> dict:
        """Get aggregated statistics including events."""
        total_sent = sum(t.packets_sent for t in self.trackers)
        total_acks = sum(t.acks_received for t in self.trackers)
        connected = sum(1 for t in self.trackers if t.connected)
        uptime = time.time() - self._start_time if self._start_time else 0
        
        # Aggregate event counts
        events = {}
        for tracker in self.trackers:
            for event_name, count in tracker.events_generated.items():
                events[event_name] = events.get(event_name, 0) + count
        
        return {
            'total_trackers': len(self.trackers),
            'connected': connected,
            'total_packets_sent': total_sent,
            'total_acks_received': total_acks,
            'ack_rate': (total_acks / total_sent * 100) if total_sent > 0 else 0,
            'uptime_seconds': int(uptime),
            'packets_per_minute': (total_sent / uptime * 60) if uptime > 0 else 0,
            'events': events
        }


async def run_load_test(args):
    """Run load test scenario."""
    fleet = MockTrackerFleet(
        host=args.host,
        port=args.port,
        num_trackers=args.trackers,
        send_rate=args.rate,
        imei_prefix=args.imei_prefix
    )
    
    # Handle shutdown gracefully
    loop = asyncio.get_event_loop()
    shutdown_event = asyncio.Event()
    
    def shutdown():
        logger.info("Shutdown signal received...")
        fleet.stop()
        shutdown_event.set()
    
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, shutdown)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            pass
    
    # Start stats reporter if in continuous mode
    stats_task = None
    if args.stats_interval > 0:
        async def report_stats():
            while not shutdown_event.is_set():
                await asyncio.sleep(args.stats_interval)
                stats = fleet.get_stats()
                events = stats.get('events', {})
                
                # Format event summary
                event_summary = []
                if events.get('ignition_off', 0) + events.get('ignition_on', 0) > 0:
                    event_summary.append(f"ign={events.get('ignition_on', 0)}/{events.get('ignition_off', 0)}")
                if events.get('panic', 0) > 0:
                    event_summary.append(f"panic={events.get('panic', 0)}")
                harsh_total = events.get('harsh_accel', 0) + events.get('harsh_brake', 0) + events.get('harsh_corner', 0)
                if harsh_total > 0:
                    event_summary.append(f"harsh={harsh_total}")
                gf_total = (events.get('geofence1_enter', 0) + events.get('geofence1_exit', 0) +
                           events.get('geofence2_enter', 0) + events.get('geofence2_exit', 0))
                if gf_total > 0:
                    event_summary.append(f"geofence={gf_total}")
                if events.get('low_battery', 0) > 0:
                    event_summary.append(f"low_bat={events.get('low_battery', 0)}")
                
                events_str = ", ".join(event_summary) if event_summary else "none yet"
                
                logger.info(f"📊 STATS: trackers={stats['connected']}/{stats['total_trackers']}, "
                           f"sent={stats['total_packets_sent']}, acks={stats['total_acks_received']}, "
                           f"rate={stats['ack_rate']:.0f}%, ppm={stats['packets_per_minute']:.1f}")
                logger.info(f"   🔔 EVENTS: {events_str}")
        stats_task = asyncio.create_task(report_stats())
    
    try:
        await fleet.run(duration=args.duration)
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
        fleet.stop()
    except Exception as e:
        logger.error(f"Error in load test: {e}")
        fleet.stop()
    finally:
        if stats_task:
            stats_task.cancel()
            try:
                await stats_task
            except asyncio.CancelledError:
                pass
        stats = fleet.get_stats()
        logger.info(f"🏁 FINAL STATS: {stats}")


async def run_duplicate_test(args):
    """Test duplicate packet handling."""
    logger.info("Running duplicate packet test")
    
    tracker = MockTracker(
        imei="350000000000001",
        host=args.host,
        port=args.port,
        send_rate=0.5
    )
    
    if not await tracker.connect():
        logger.error("Failed to connect")
        return
    
    # Send same packet multiple times rapidly
    for i in range(10):
        success = await tracker.send_packet()
        logger.info(f"Packet {i+1}: {'ACK' if success else 'FAILED'}")
        await asyncio.sleep(0.1)  # Very fast
    
    await tracker.disconnect()
    logger.info(f"Duplicate test complete: sent={tracker.packets_sent}, acks={tracker.acks_received}")


async def run_connection_drop_test(args):
    """Test connection drop and reconnect."""
    logger.info("Running connection drop test")
    
    tracker = MockTracker(
        imei="350000000000002",
        host=args.host,
        port=args.port,
        send_rate=1.0
    )
    
    for attempt in range(3):
        logger.info(f"Connection attempt {attempt + 1}")
        
        if not await tracker.connect():
            logger.error("Failed to connect")
            continue
        
        # Send a few packets
        for i in range(3):
            await tracker.send_packet()
            await asyncio.sleep(0.5)
        
        # Force disconnect
        logger.info("Simulating connection drop...")
        await tracker.disconnect()
        await asyncio.sleep(2)
    
    logger.info(f"Connection drop test complete: sent={tracker.packets_sent}, acks={tracker.acks_received}")


def main():
    # Get defaults from environment variables (for Docker)
    env_host = os.environ.get('TRACKER_HOST', 'localhost')
    env_port = int(os.environ.get('TRACKER_PORT', '5027'))
    env_trackers = int(os.environ.get('NUM_TRACKERS', '10'))
    env_rate = float(os.environ.get('SEND_RATE', '30.0'))
    env_log_level = os.environ.get('LOG_LEVEL', 'INFO')
    env_imei_prefix = os.environ.get('IMEI_PREFIX', '35000000')
    env_stats_interval = int(os.environ.get('STATS_INTERVAL', '30'))
    
    parser = argparse.ArgumentParser(
        description='Mock Teltonika Tracker for testing parser services',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Basic test with 10 trackers
    python mock_teltonika_tracker.py --host localhost --port 5027 --trackers 10

    # High load test
    python mock_teltonika_tracker.py --host localhost --port 5027 --trackers 100 --rate 0.5

    # Test through HAProxy load balancer (port 2001)
    python mock_teltonika_tracker.py --host localhost --port 2001 --trackers 50

    # Run specific scenarios
    python mock_teltonika_tracker.py --scenario duplicate_test
    python mock_teltonika_tracker.py --scenario connection_drop
    
Environment Variables (for Docker):
    TRACKER_HOST, TRACKER_PORT, NUM_TRACKERS, SEND_RATE, LOG_LEVEL, IMEI_PREFIX, STATS_INTERVAL
        """
    )
    
    parser.add_argument('--host', default=env_host, help=f'Parser host (default: {env_host})')
    parser.add_argument('--port', type=int, default=env_port, help=f'Parser port (default: {env_port})')
    parser.add_argument('--trackers', type=int, default=env_trackers, help=f'Number of trackers (default: {env_trackers})')
    parser.add_argument('--rate', type=float, default=env_rate, help=f'Seconds between packets (default: {env_rate})')
    parser.add_argument('--duration', type=float, default=0, help='Test duration in seconds (0=indefinite)')
    parser.add_argument('--scenario', choices=['load_test', 'duplicate_test', 'connection_drop'],
                       default='load_test', help='Test scenario to run')
    parser.add_argument('--imei-prefix', default=env_imei_prefix, dest='imei_prefix',
                       help=f'IMEI prefix for generated trackers (default: {env_imei_prefix})')
    parser.add_argument('--stats-interval', type=int, default=env_stats_interval, dest='stats_interval',
                       help=f'Stats reporting interval in seconds, 0 to disable (default: {env_stats_interval})')
    parser.add_argument('--debug', action='store_true', help='Enable debug logging')
    
    args = parser.parse_args()
    
    # Set log level
    log_level = logging.DEBUG if args.debug else getattr(logging, env_log_level.upper(), logging.INFO)
    logging.getLogger().setLevel(log_level)
    
    logger.info("=" * 60)
    logger.info("🛰️  MOCK TELTONIKA TRACKER SERVICE")
    logger.info("=" * 60)
    logger.info(f"Scenario: {args.scenario}")
    logger.info(f"Target: {args.host}:{args.port}")
    logger.info(f"Trackers: {args.trackers}, Rate: {args.rate}s, IMEI prefix: {args.imei_prefix}")
    logger.info(f"Duration: {'indefinite' if args.duration == 0 else f'{args.duration}s'}")
    logger.info("=" * 60)
    
    if args.scenario == 'load_test':
        asyncio.run(run_load_test(args))
    elif args.scenario == 'duplicate_test':
        asyncio.run(run_duplicate_test(args))
    elif args.scenario == 'connection_drop':
        asyncio.run(run_connection_drop_test(args))


if __name__ == '__main__':
    main()
