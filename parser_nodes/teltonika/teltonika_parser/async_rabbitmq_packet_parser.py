"""
RabbitMQ-Integrated Packet Parser
Wraps AsyncPacketParser to publish to RabbitMQ or save to CSV based on mode
"""
import asyncio
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime

from teltonika_parser import async_packet_parser
from teltonika_parser.async_packet_parser import AsyncPacketParser
from teltonika_infrastructure.rabbitmq_producer import RabbitMQProducer
from teltonika_parser.parser_load_monitor import ParserNodeLoadMonitor
from config import Config

logger = logging.getLogger(__name__)


class RabbitMQPacketParser:
    """
    Packet parser that supports multiple output modes.
    - LOGS mode: Saves parsed records to CSV files (trackdata.csv, events.csv, alarms.csv)
    - RABBITMQ mode: Publishes parsed records to RabbitMQ
    CRITICAL: ACK only sent after data is saved/published successfully.
    """
    
    def __init__(self, rabbitmq_producer: Optional[RabbitMQProducer], load_monitor: ParserNodeLoadMonitor):
        """
        Initialize packet parser
        
        Args:
            rabbitmq_producer: RabbitMQ producer instance (None for CSV/Logs mode)
            load_monitor: Load monitor instance
        """
        self.parser = AsyncPacketParser()
        self.rabbitmq_producer = rabbitmq_producer
        self.load_monitor = load_monitor
        self.vendor = Config.load().get('parser_node', {}).get('vendor', 'teltonika')
    
    async def parse_packet_to_rabbitmq(
        self,
        packet_data: bytes,
        imei: str,
        device_ip: str,
        device_port: int
    ) -> tuple[List[Dict[str, Any]], bool]:
        """
        Parse packet and save/publish based on data_transfer_mode.
        - LOGS mode: Saves to CSV files
        - RABBITMQ mode: Publishes to RabbitMQ
        
        Args:
            packet_data: Raw packet bytes
            imei: Device IMEI
            device_ip: Device IP address
            device_port: Device port
            
        Returns:
            Tuple of (records, all_published)
            - records: List of parsed records
            - all_published: True if all records saved/published successfully
        """
        try:
            # Check if this is a Codec 12 packet (GPRS command response)
            if self.parser._is_codec12_packet(packet_data):
                logger.info(f"Codec 12 packet detected for IMEI {imei}, handling as command response")
                codec12_response = self.parser._try_decode_codec12(packet_data)
                if codec12_response:
                    # Call the registered handler to update command_sent
                    # Access handler from module to get current value (not import-time copy)
                    handler = async_packet_parser._codec12_response_handler
                    if handler:
                        try:
                            await handler(imei, codec12_response)
                            logger.info(f"Codec 12 response handled for IMEI {imei}: '{codec12_response.response_text[:50]}...'")
                        except Exception as e:
                            logger.error(f"Error in Codec 12 response handler for IMEI {imei}: {e}")
                    else:
                        logger.warning(f"No Codec 12 handler registered, response from IMEI {imei} not processed")
                else:
                    logger.error(f"Failed to decode Codec 12 response for IMEI {imei}")
                # Codec 12 responses don't need ACK or record publishing
                return [], True  # Return success but no records
            
            # Decode regular AVL packet
            tcp_packet = self.parser._try_decode_tcp_packet(packet_data)
            if not tcp_packet:
                logger.warning(f"Failed to decode packet for IMEI {imei}")
                return [], False
            
            # Get AVL data from packet
            avl_data_collection = tcp_packet.avl_data if hasattr(tcp_packet, 'avl_data') else None
            
            if not avl_data_collection or not hasattr(avl_data_collection, 'data') or not avl_data_collection.data:
                logger.warning(f"No AVL data in packet for IMEI {imei}, codec_id={tcp_packet.codec_id if hasattr(tcp_packet, 'codec_id') else 'unknown'}")
                return [], False
            
            # Parse records
            server_time = datetime.now()
            records = []
            
            # Iterate through AVL records in the collection
            for avl_record in avl_data_collection.data:
                formatted_records = await self.parser._format_avl_record_to_dict(
                    avl_record, imei, server_time
                )
                records.extend(formatted_records)
            
            if not records:
                logger.warning(f"No records parsed from packet for IMEI {imei} (AVL data had {len(avl_data_collection.data)} records)")
                return [], False
            
            # Check data transfer mode
            data_mode = Config.get_data_transfer_mode().upper()  # Normalize to uppercase for robustness
            
            if data_mode == 'LOGS':
                # LOGS mode: Save to CSV files
                from teltonika_database.async_save_to_csv import AsyncSaveToCSV
                csv_saver = AsyncSaveToCSV()
                await csv_saver.save(records, "data")
                logger.info(f"✓ Saved {len(records)} records to CSV files (LOGS mode)")
                # In CSV mode, consider all records as "published" (saved)
                all_published = True
                # Update metrics
                self.load_monitor.increment_messages(len(records))
            else:
                # RABBITMQ mode: Publish to RabbitMQ
                if not self.rabbitmq_producer:
                    logger.error("RabbitMQ producer not initialized but mode requires RabbitMQ")
                    return records, False
                
                all_published = True
                parser_node_id = Config.load().get('parser_node', {}).get('node_id', 'unknown')
                
                for record in records:
                    # Determine which queues this record should go to
                    # Logic:
                    # - ALL records -> trackdata_queue
                    # - If status != 'Normal' -> ALSO events_queue
                    # - If is_alarm == 1 -> ALSO alarms_queue
                    # Note: If is_alarm == 1, then status != 'Normal' is always true,
                    #       so alarms go to BOTH events_queue AND alarms_queue
                    is_alarm = record.get('is_alarm', 0) == 1
                    is_event = record.get('status', 'Normal') != 'Normal'
                    
                    # Format message according to plan (standardized format)
                    import uuid
                    base_message = {
                        "vendor": self.vendor,
                        "vendor_version": "1.0",
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                        "imei": imei,
                        "device_ip": device_ip,
                        "device_port": device_port,
                        "data": record,  # All the parsed data
                        "metadata": {
                            "parser_node_id": parser_node_id
                        }
                    }
                    
                    # Publish to trackdata_queue (always)
                    message = {
                        **base_message,
                        "message_id": str(uuid.uuid4()),
                        "record_type": "trackdata"
                    }
                    published = await self.rabbitmq_producer.publish_tracking_record(
                        record=message,
                        vendor=self.vendor,
                        record_type="trackdata",
                        timeout=5.0
                    )
                    if published:
                        self.load_monitor.record_publish_success()
                    else:
                        self.load_monitor.record_publish_failure()
                        all_published = False
                    
                    # Publish to events_queue if status != 'Normal'
                    if is_event:
                        message = {
                            **base_message,
                            "message_id": str(uuid.uuid4()),
                            "record_type": "event"
                        }
                        published = await self.rabbitmq_producer.publish_tracking_record(
                            record=message,
                            vendor=self.vendor,
                            record_type="event",
                            timeout=5.0
                        )
                        if published:
                            self.load_monitor.record_publish_success()
                        else:
                            self.load_monitor.record_publish_failure()
                            all_published = False
                    
                    # Publish to alarms_queue if is_alarm == 1
                    if is_alarm:
                        message = {
                            **base_message,
                            "message_id": str(uuid.uuid4()),
                            "record_type": "alarm"
                        }
                        published = await self.rabbitmq_producer.publish_tracking_record(
                            record=message,
                            vendor=self.vendor,
                            record_type="alarm",
                            timeout=5.0
                        )
                        if published:
                            self.load_monitor.record_publish_success()
                        else:
                            self.load_monitor.record_publish_failure()
                            all_published = False
                
                # Update metrics
                self.load_monitor.increment_messages(len(records))
            
            return records, all_published
            
        except Exception as e:
            logger.error(f"Error parsing/publishing packet: {e}", exc_info=True)
            self.load_monitor.record_publish_failure()
            return [], False
    
    async def read_imei(self, reader: asyncio.StreamReader, timeout: float = 10.0) -> Optional[str]:
        """
        Read IMEI from device connection
        
        Args:
            reader: Stream reader
            timeout: Timeout in seconds
            
        Returns:
            IMEI string or None if failed
        """
        try:
            # Read IMEI length (2 bytes: 0x00, length)
            imei_length_data = await asyncio.wait_for(reader.readexactly(2), timeout=timeout)
            imei_length = imei_length_data[1]
            
            # Validate IMEI length to prevent buffer overflow (security)
            if imei_length < 1 or imei_length > 20:
                logger.error(f"Invalid IMEI length: {imei_length} (expected 1-20)")
                return None
            
            # Read IMEI
            imei_data = await asyncio.wait_for(reader.readexactly(imei_length), timeout=timeout)
            imei = imei_data[:15].decode('ascii')
            
            # Validate IMEI
            from teltonika_infrastructure.input_validator import validate_imei
            validated_imei = validate_imei(imei)
            
            return validated_imei
        except Exception as e:
            logger.error(f"Error reading IMEI: {e}", exc_info=True)
            return None
    
    async def read_packet(self, reader: asyncio.StreamReader, timeout: float = 30.0) -> Optional[bytes]:
        """
        Read packet from device connection
        Teltonika packet format:
        - 4 bytes preamble (0x00000000)
        - 4 bytes length (big-endian)
        - Data (length bytes)
        - 4 bytes CRC
        
        Args:
            reader: Stream reader
            timeout: Timeout in seconds
            
        Returns:
            Complete packet bytes (preamble + length + data + CRC) or None if failed
        """
        import struct
        try:
            # Read first byte with timeout (to detect dead connections and ping packets)
            first_byte = await asyncio.wait_for(reader.readexactly(1), timeout=timeout)
            
            # Check for ping packet (0xFF)
            if first_byte[0] == 0xFF:
                logger.debug("Received PING packet (0xFF)")
                # Note: IP table time update should be handled by caller if writer is available
                return None  # Ping packets don't contain data
            
            logger.debug(f"Read first byte: 0x{first_byte[0]:02X}, reading packet header...")
            
            # Read remaining 7 bytes of header (3 bytes preamble continuation + 4 bytes length)
            header = await reader.readexactly(7)
            
            # Combine first byte with header to get full 8-byte header
            preamble_bytes = first_byte + header[:3]  # 4 bytes preamble
            length_bytes = header[3:7]  # 4 bytes length
            
            # Validate preamble (should be 0x00000000)
            preamble = struct.unpack('>I', preamble_bytes)[0]
            if preamble != 0:
                logger.warning(f"Invalid packet preamble: 0x{preamble:08X}, expected 0x00000000")
                return None
            
            # Get packet length
            packet_length = struct.unpack('>I', length_bytes)[0]
            
            # Validate length to prevent DoS (use config value like original)
            from config import ServerParams
            max_packet_size = ServerParams.get_int('tcp_server.max_packet_size', 10 * 1024 * 1024)  # 10MB default
            if packet_length > max_packet_size:
                logger.error(f"Packet too large: {packet_length} bytes (max: {max_packet_size})")
                return None
            
            # Read packet data + CRC (length bytes data + 4 bytes CRC)
            packet_data = await reader.readexactly(packet_length + 4)
            
            # Combine to form complete packet: preamble (4) + length (4) + data + CRC (4)
            full_packet = preamble_bytes + length_bytes + packet_data
            
            logger.debug(f"Read complete packet: {len(full_packet)} bytes (preamble: 4, length: 4, data: {packet_length}, CRC: 4)")
            
            return full_packet
            
        except asyncio.TimeoutError:
            logger.debug("Packet read timeout")
            return None
        except asyncio.IncompleteReadError:
            # Normal disconnection - device closed connection
            logger.debug("Connection closed by device (incomplete read)")
            return None
        except ConnectionError:
            # Connection was closed/reset
            logger.debug("Connection error (device disconnected)")
            return None
        except Exception as e:
            logger.error(f"Error reading packet: {e}", exc_info=True)
            return None
    
    async def send_ack(self, writer: asyncio.StreamWriter, num_accepted: int):
        """
        Send ACK to device
        
        Args:
            writer: Stream writer
            num_accepted: Number of accepted records
        """
        await self.parser._send_ack(writer, num_accepted)
    
    async def shutdown(self):
        """Shutdown parser"""
        if hasattr(self.parser, 'shutdown'):
            await self.parser.shutdown()
