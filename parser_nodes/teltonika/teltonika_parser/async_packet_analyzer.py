"""
Async Packet Analyzer for Teltonika Gateway
Processes packets from TCP stream using async operations
Teltonika packets are length-prefixed, so they're typically complete when received

IMPROVEMENTS:
- Better partial packet handling
- Improved error recovery
- Better logging
"""
import asyncio
import logging
from typing import Dict, List

from teltonika_infrastructure.async_queue import AsyncTeltonikaDataQueues
from config import ServerParams

logger = logging.getLogger(__name__)


class AsyncPacketAnalyzer:
    """
    Async packet analyzer for Teltonika protocol
    Teltonika packets are length-prefixed, so splitting is typically not needed
    However, this component provides consistency with the architecture pattern
    and allows for future extensibility if needed
    
    Runs as background task, continuously processing packets from queue
    """
    
    def __init__(self):
        """Initialize async packet analyzer"""
        self.running = False
        self._partial_buffers: Dict[str, bytearray] = {}
        logger.info("AsyncPacketAnalyzer initialized")
    
    def split_multiple_packets(self, data: bytes, ip: str = "unknown", port: int = 0) -> List[bytes]:
        """
        Split multiple Teltonika packets from a byte stream.
        
        Teltonika packets are length-prefixed with the format:
        - 4 bytes: Preamble (0x00000000)
        - 4 bytes: Data length (big-endian integer)
        - N bytes: Data (length bytes)
        - 4 bytes: CRC
        
        This method handles partial packets by buffering incomplete data
        until the next read completes the packet.
        
        Args:
            data: Raw byte data from TCP stream
            ip: Source IP address for logging (default: "unknown")
            port: Source port for logging (default: 0)
        
        Returns:
            List of complete packet byte arrays
        
        Example:
            >>> analyzer = AsyncPacketAnalyzer()
            >>> packets = analyzer.split_multiple_packets(b'\\x00\\x00\\x00\\x00...', '192.168.1.1', 2001)
            >>> len(packets)  # Number of complete packets extracted
        """
        """
        Split multiple Teltonika packets from a single TCP message
        Teltonika protocol uses length-prefixed packets, so packets should be complete
        However, we handle partial packets for robustness
        
        IMPROVEMENTS:
        - Better validation of packet sizes
        - Improved partial packet handling
        - Better error recovery
        
        Args:
            data: Raw TCP data
            ip: Client IP address
            port: Client port
            
        Returns:
            List of complete packets
        """
        packets = []
        key = f"{ip}:{port}"
        
        # Prepend any previously saved partial buffer
        if key in self._partial_buffers:
            prefix = self._partial_buffers.pop(key)
            if prefix:
                data = bytes(prefix + data)
                logger.debug(f"Combined partial buffer ({len(prefix)} bytes) with new data ({len(data)-len(prefix)} bytes) for {key}")
        
        i = 0
        max_packet_size = ServerParams.get_int('tcp_server.max_packet_size', 10 * 1024 * 1024)  # 10MB default
        
        while i < len(data):
            # Teltonika TCP protocol format:
            # - First byte: 0xFF (ping) or data start
            # - If 0xFF: skip (ping packet)
            # - Otherwise: 4 bytes preamble (0x00000000), 4 bytes length, then data + 4 bytes CRC
            
            if data[i] == 0xFF:
                # Ping packet - skip
                i += 1
                continue
            
            # Need at least 8 bytes for preamble (4) + length (4)
            if i + 8 > len(data):
                # Incomplete header - save for next read
                self._partial_buffers[key] = bytearray(data[i:])
                logger.debug(f"Incomplete header saved for {key}: {len(data[i:])} bytes")
                break
            
            # Read preamble (4 bytes, should be 0x00000000)
            preamble = int.from_bytes(data[i:i+4], byteorder='big', signed=False)
            if preamble != 0:
                # Invalid preamble - skip byte and try again
                logger.warning(f"Invalid preamble at offset {i} from {key}: 0x{preamble:08X}, skipping byte")
                i += 1
                continue
            
            # Read length (4 bytes, big-endian)
            length = int.from_bytes(data[i+4:i+8], byteorder='big', signed=False)
            
            # IMPROVEMENT: Validate length to prevent DoS
            if length < 0 or length > max_packet_size:
                logger.error(f"Invalid packet length from {key}: {length} bytes (max: {max_packet_size})")
                # Skip this byte and try to recover
                i += 1
                continue
            
            # Calculate total packet size: 4 (preamble) + 4 (length) + length (data) + 4 (CRC)
            total_packet_size = 8 + length + 4
            
            if i + total_packet_size > len(data):
                # Incomplete packet - save for next read
                self._partial_buffers[key] = bytearray(data[i:])
                logger.debug(f"Incomplete packet saved for {key}: need {total_packet_size} bytes, have {len(data[i:])} bytes")
                break
            
            # Extract complete packet
            packet = data[i:i + total_packet_size]
            packets.append(packet)
            logger.debug(f"Extracted packet from {key}: {total_packet_size} bytes (data length: {length})")
            i += total_packet_size
        
        return packets
    
    async def process_packets(self):
        """
        Main processing loop - runs as background task
        Takes packets from msgReceived, splits them if needed, puts into msgToParse
        
        IMPROVEMENTS:
        - Processing statistics tracking
        - Better error recovery
        - Periodic statistics logging
        - Better validation and error messages
        """
        logger.info("AsyncPacketAnalyzer started")
        self.running = True
        
        # IMPROVEMENT: Track processing statistics
        packets_processed = 0
        packets_failed = 0
        total_bytes_processed = 0
        packets_split = 0
        partial_buffers_count = 0
        
        while self.running:
            try:
                # Get packet from received queue (non-blocking with timeout)
                queue_timeout = ServerParams.get_int('async_queues.queue_poll_timeout', 1)
                packet_data = await AsyncTeltonikaDataQueues.msgReceived.poll(timeout=queue_timeout)
                
                if packet_data is None:
                    continue
                
                # Extract data and metadata
                data = packet_data.get('data', b'')
                writer = packet_data.get('writer')
                reader = packet_data.get('reader')
                ip = packet_data.get('ip', 'unknown')
                port = packet_data.get('port', 0)
                imei = packet_data.get('imei')
                
                if not data:
                    packets_failed += 1
                    continue
                
                # IMPROVEMENT: Track total bytes processed
                total_bytes_processed += len(data)
                
                # Split multiple packets (if multiple in one TCP read)
                try:
                    split_packets = self.split_multiple_packets(data, ip, port)
                except Exception as split_error:
                    packets_failed += 1
                    logger.error(f"Error splitting packets from {ip}:{port}: {split_error}", exc_info=True)
                    continue
                
                # IMPROVEMENT: Better logging
                if len(split_packets) > 1:
                    packets_split += len(split_packets) - 1  # Count additional packets from split
                    logger.info(f"Split {len(split_packets)} packets from {len(data)} bytes from {ip}:{port}")
                elif len(split_packets) == 0:
                    # Check if we have a partial buffer (might be incomplete packet)
                    key = f"{ip}:{port}"
                    if key in self._partial_buffers:
                        partial_buffers_count += 1
                        logger.debug(f"No complete packets extracted from {len(data)} bytes from {ip}:{port} (partial buffer: {len(self._partial_buffers[key])} bytes)")
                    else:
                        logger.warning(f"No packets extracted from {len(data)} bytes from {ip}:{port} (might be incomplete or invalid)")
                        packets_failed += 1
                
                # Process each packet separately
                for packet in split_packets:
                    try:
                        # IMPROVEMENT: Extract codec for logging
                        codec_info = "unknown"
                        if len(packet) >= 9:  # At least preamble + length + 1 byte for codec
                            try:
                                # Codec is typically the first byte after preamble and length
                                codec_id = packet[8]
                                codec_info = f"Codec{codec_id}"
                            except (IndexError, TypeError) as e:
                                logger.debug(f"Could not extract codec ID from packet: {e}")
                                pass
                        
                        packet_with_metadata = {
                            'data': packet,
                            'writer': writer,
                            'reader': reader,
                            'ip': ip,
                            'port': port,
                            'imei': imei
                        }
                        # Put in parse queue (non-blocking)
                        await AsyncTeltonikaDataQueues.msgToParse.put(packet_with_metadata)
                        packets_processed += 1
                        logger.debug(f"Analyzer queued packet: {codec_info}, size={len(packet)}, from {ip}:{port}")
                    except Exception as queue_error:
                        packets_failed += 1
                        logger.error(f"Error queuing packet from {ip}:{port}: {queue_error}", exc_info=True)
                
                # IMPROVEMENT: Log statistics periodically
                if packets_processed % 1000 == 0 and packets_processed > 0:
                    success_rate = 100.0 * packets_processed / (packets_processed + packets_failed) if (packets_processed + packets_failed) > 0 else 0.0
                    avg_packet_size = total_bytes_processed / packets_processed if packets_processed > 0 else 0
                    logger.info(
                        f"Packet analyzer statistics: processed={packets_processed}, "
                        f"failed={packets_failed}, success_rate={success_rate:.2f}%, "
                        f"total_bytes={total_bytes_processed}, avg_packet_size={avg_packet_size:.1f}, "
                        f"packets_split={packets_split}, partial_buffers={partial_buffers_count}"
                    )
            
            except asyncio.CancelledError:
                logger.info("AsyncPacketAnalyzer cancelled")
                break
            except Exception as e:
                packets_failed += 1
                logger.error(f"Exception in AsyncPacketAnalyzer: {e}", exc_info=True)
                await asyncio.sleep(0.1)
        
        # IMPROVEMENT: Final statistics summary
        success_rate = 100.0 * packets_processed / (packets_processed + packets_failed) if (packets_processed + packets_failed) > 0 else 0.0
        avg_packet_size = total_bytes_processed / packets_processed if packets_processed > 0 else 0
        logger.info(
            f"AsyncPacketAnalyzer stopped - Final statistics: "
            f"processed={packets_processed}, failed={packets_failed}, "
            f"success_rate={success_rate:.2f}%, total_bytes={total_bytes_processed}, "
            f"avg_packet_size={avg_packet_size:.1f}, packets_split={packets_split}, "
            f"partial_buffers={partial_buffers_count}"
        )
    
    def stop(self):
        """Stop the analyzer"""
        self.running = False
