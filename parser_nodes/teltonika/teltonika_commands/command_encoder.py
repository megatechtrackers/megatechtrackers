"""
CommandEncoder for Teltonika devices
Encodes commands according to Teltonika Codec 12 protocol specification
"""
import logging
import struct
from typing import List

from teltonika_codec.crc import CRC
from teltonika_commands.out_command import OutCommand

logger = logging.getLogger(__name__)

# Codec 12 constants
CODEC12_ID = 0x0C
COMMAND_TYPE = 0x05  # 0x05 for command, 0x06 for response
COMMAND_QUANTITY = 0x01


class CommandEncoder:
    """
    Encodes commands for transmission to Teltonika devices
    Uses Codec 12 protocol as specified in Teltonika documentation
    """
    
    @staticmethod
    def getEncodedCommand(out_command: OutCommand) -> List[bytes]:
        """
        Encode command for Teltonika device transmission using Codec 12
        
        Codec 12 Packet Structure:
        - Preamble (4 bytes: 0x00000000)
        - Data Size (4 bytes: size from Codec ID to Command Quantity 2)
        - Codec ID (1 byte: 0x0C)
        - Command Quantity 1 (1 byte: 0x01)
        - Type (1 byte: 0x05 for command)
        - Command Size (4 bytes: command length)
        - Command (X bytes: ASCII command converted to HEX)
        - Command Quantity 2 (1 byte: 0x01)
        - CRC-16 (4 bytes: CRC-16/IBM, big-endian)
        
        Args:
            out_command: OutCommand object with command data
            
        Returns:
            List of encoded command bytes (Codec 12 packet)
        """
        try:
            # Get command string (typically from param field)
            command_str = out_command.getParam() or out_command.getData()
            
            if not command_str:
                logger.warning("Empty command, cannot encode")
                return []
            
            # TEMPORARY: Strip SMS credentials for GPRS commands (format: "login pass command")
            # GPRS commands via Codec 12 don't need SMS-style authentication
            parts = command_str.split(' ', 2)  # Split into at most 3 parts
            if len(parts) == 3:
                # Assume format is "login password command" - use only the command part
                original_cmd = command_str
                command_str = parts[2]
                logger.info(f"Stripped credentials from command: '{original_cmd}' -> '{command_str}'")
            
            # Convert ASCII command to HEX bytes
            command_bytes = CommandEncoder._ascii_to_hex(command_str)
            
            # Build Codec 12 packet
            packet = CommandEncoder._build_codec12_packet(command_bytes)
            
            logger.debug(f"Encoded Teltonika Codec 12 command: {packet.hex().upper()}")
            return [packet]
        
        except Exception as e:
            imei = getattr(out_command, 'imei', 'unknown') if out_command else 'unknown'
            command_data = out_command.getParam() if out_command else 'N/A'
            logger.error(
                f"Error encoding Teltonika command: imei={imei}, "
                f"command='{command_data[:50]}', error={type(e).__name__}: {e}",
                exc_info=True
            )
            return []
    
    @staticmethod
    def _ascii_to_hex(command_str: str) -> bytes:
        """
        Convert ASCII command string to HEX bytes
        Example: "getinfo" -> b'getinfo' -> 0x676574696E666F
        
        Args:
            command_str: ASCII command string
            
        Returns:
            Command as bytes (HEX representation of ASCII)
        """
        return command_str.encode('ascii')
    
    @staticmethod
    def _build_codec12_packet(command_bytes: bytes) -> bytes:
        """
        Build complete Codec 12 packet structure.
        
        Constructs a Teltonika Codec 12 packet with proper preamble, data size,
        codec ID, command data, and CRC-16 checksum.
        
        Args:
            command_bytes: Command bytes (ASCII converted to HEX)
            
        Returns:
            Complete Codec 12 packet as bytes, ready for transmission
        
        Raises:
            No exceptions - all errors are caught in calling method
        """
        # Build packet data (from Codec ID to Command Quantity 2)
        packet_data = bytearray()
        
        # Codec ID
        packet_data.append(CODEC12_ID)
        
        # Command Quantity 1
        packet_data.append(COMMAND_QUANTITY)
        
        # Type (0x05 for command)
        packet_data.append(COMMAND_TYPE)
        
        # Command Size (4 bytes, big-endian)
        command_size = len(command_bytes)
        packet_data.extend(struct.pack('>I', command_size))
        
        # Command (ASCII converted to HEX)
        packet_data.extend(command_bytes)
        
        # Command Quantity 2
        packet_data.append(COMMAND_QUANTITY)
        
        # Calculate Data Size (size from Codec ID to Command Quantity 2, inclusive)
        data_size = len(packet_data)
        
        # Calculate CRC-16 over packet_data (from Codec ID to Command Quantity 2)
        crc_value = CRC.DEFAULT.calc_crc16(bytes(packet_data))
        
        # Build complete packet
        packet = bytearray()
        
        # Preamble (4 bytes: 0x00000000)
        packet.extend(struct.pack('>I', 0))
        
        # Data Size (4 bytes, big-endian)
        packet.extend(struct.pack('>I', data_size))
        
        # Packet data (Codec ID to Command Quantity 2)
        packet.extend(packet_data)
        
        # CRC-16 (4 bytes: 2 bytes CRC + 2 bytes padding to 0x00, big-endian)
        # Format: 0x0000XXXX (CRC value in last 2 bytes)
        packet.extend(struct.pack('>I', crc_value))
        
        return bytes(packet)

