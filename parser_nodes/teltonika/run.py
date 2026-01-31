"""
Parser Service Entry Point
Runs a parser service that receives device packets, parses them, and publishes to RabbitMQ
"""
import asyncio
import logging
import signal
import sys
import os
from typing import Optional

from config import Config, ServerParams
from teltonika_listener.tcp_listener import start_tcp_server, close_tcp_server
from teltonika_parser.async_rabbitmq_packet_parser import RabbitMQPacketParser
from teltonika_infrastructure.rabbitmq_producer import get_rabbitmq_producer, close_rabbitmq_producer
from teltonika_parser.parser_load_monitor import get_load_monitor
from teltonika_infrastructure.async_ip_table import AsyncGlobalIPTable
from logging_config import setup_logging_from_config

# Configure logging from config.json
setup_logging_from_config()

logger = logging.getLogger(__name__)

# Suppress asyncio error callbacks during shutdown (Windows ProactorEventLoop issues)
_shutting_down = False

def suppress_asyncio_errors(loop, context):
    """Suppress noisy asyncio errors during shutdown (Windows ProactorEventLoop)"""
    global _shutting_down
    if _shutting_down:
        # Suppress connection errors during shutdown
        exception = context.get('exception')
        if exception:
            error_type = type(exception).__name__
            if error_type in ('ConnectionAbortedError', 'ConnectionResetError', 'AssertionError'):
                # These are expected during shutdown on Windows
                return
    # Log other errors normally
    loop.default_exception_handler(context)

# Global components
_parser: Optional[RabbitMQPacketParser] = None
_rabbitmq_producer = None
_load_monitor = None
_shutdown_event = asyncio.Event()
_rabbitmq_connect_task = None  # Store connection task for cancellation

# Command infrastructure components (for graceful shutdown)
_gprs_poller = None
_gprs_sender = None
_command_tasks = []  # Store command-related tasks for cleanup

# Connection tracking (matches original implementation)
_connection_count = 0
_max_concurrent_connections = ServerParams.get_int('tcp_server.max_concurrent_connections', 50000)
_total_connections = 0  # Track total connections
_total_rejected = 0  # Track rejected connections
_connection_lock = asyncio.Lock()  # Lock for thread-safe connection counter updates




async def handle_client_connection(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    """
    Handle client connection - modified to publish to RabbitMQ instead of buffer
    CRITICAL: ACK only after RabbitMQ confirms
    """
    global _parser, _load_monitor, _connection_count, _total_connections, _total_rejected
    
    client_addr = writer.get_extra_info('peername')
    if not client_addr:
        return
    
    device_ip, device_port = client_addr
    connection_id = f"{device_ip}:{device_port}"
    
    # Connection limit checking with thread-safe counter (matches original implementation)
    async with _connection_lock:
        if _connection_count >= _max_concurrent_connections:
            _total_rejected += 1
            logger.warning(f"Max connections reached ({_max_concurrent_connections}), rejecting {connection_id} (Total rejected: {_total_rejected})")
            writer.close()
            try:
                connection_reject_timeout = ServerParams.get_float('tcp_server.connection_reject_timeout', 1.0)
                await asyncio.wait_for(writer.wait_closed(), timeout=connection_reject_timeout)
            except (asyncio.TimeoutError, OSError, ConnectionError) as e:
                logger.debug(f"Error waiting for rejected connection to close: {e}")
            return
        
        _connection_count += 1
        _total_connections += 1
        logger.info(f"Client connected: {connection_id} (Active: {_connection_count}/{_max_concurrent_connections}, Total: {_total_connections})")
    
    try:
        # Enable TCP keepalive to keep connection active (matches original implementation)
        try:
            sock = writer.get_extra_info('socket')
            if sock:
                import socket
                # Enable TCP keepalive
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
                
                # Configure keepalive parameters (platform-specific)
                try:
                    keepalive_idle = ServerParams.get_int('tcp_server.keepalive_idle', 60)
                    keepalive_interval = ServerParams.get_int('tcp_server.keepalive_interval', 10)
                    keepalive_count = ServerParams.get_int('tcp_server.keepalive_count', 3)
                    
                    # Linux-specific options
                    if hasattr(socket, 'TCP_KEEPIDLE'):
                        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, keepalive_idle)
                    if hasattr(socket, 'TCP_KEEPINTVL'):
                        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, keepalive_interval)
                    if hasattr(socket, 'TCP_KEEPCNT'):
                        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPCNT, keepalive_count)
                    
                    logger.debug(f"TCP keepalive enabled for {connection_id}: idle={keepalive_idle}s, interval={keepalive_interval}s, count={keepalive_count}")
                except (AttributeError, OSError) as e:
                    logger.debug(f"Could not set advanced keepalive options for {connection_id}: {e} (keepalive still enabled)")
        except Exception as e:
            logger.debug(f"Could not enable TCP keepalive for {connection_id}: {e}")
        
        _load_monitor.increment_connections()
        # Register device in IP table
        await AsyncGlobalIPTable.setIpTable(writer, device_ip, device_port)
        
        logger.info(f"New connection from {connection_id}")
        
        # Read IMEI (matches original - no timeout, reads directly)
        # Read IMEI length (2 bytes: 0x00, length)
        imei_length_data = await reader.readexactly(2)
        imei_length = imei_length_data[1]
        
        # Validate IMEI length to prevent buffer overflow (security - matches original)
        if imei_length < 1 or imei_length > 20:
            logger.error(f"Invalid IMEI length from {connection_id}: {imei_length} (expected 1-20)")
            return
        
        # Read IMEI
        imei_data = await reader.readexactly(imei_length)
        try:
            imei_string = imei_data[:15].decode('ascii')
            
            # Validate and sanitize IMEI input (security - matches original)
            from teltonika_infrastructure.input_validator import validate_imei
            validated_imei = validate_imei(imei_string)
            if not validated_imei:
                logger.warning(f"Invalid IMEI format from {connection_id}: {imei_string}")
                return
            
            imei = validated_imei
            logger.info(f"IMEI received: [{imei}] from {connection_id}")
        except (ValueError, UnicodeDecodeError) as e:
            logger.error(f"Error reading IMEI from {connection_id}: {e}")
            return
        # Update IP table with IMEI
        await AsyncGlobalIPTable.setIpTable(writer, device_ip, device_port, imei=imei)
        
        # CRITICAL: Send LOGIN acknowledgment (0x01) - Teltonika devices wait for this before sending data
        # Note: This is NOT the data ACK - this just confirms device login/authentication
        try:
            writer.write(b'\x01')
            await writer.drain()
            logger.info(f"✓ LOGIN ACK sent to {connection_id} for IMEI {imei} (device authenticated, waiting for data)")
        except (ConnectionResetError, ConnectionAbortedError, OSError) as e:
            logger.warning(f"Connection lost while sending LOGIN ACK to {connection_id}: {e}")
            return
        
        # Read and process packets (use config timeout, default 30.0 seconds)
        read_timeout = ServerParams.get_int('teltonika_protocol.read_timeout', 30)
        while not _shutdown_event.is_set():
            try:
                # Check if connection is still alive (matches original implementation)
                if writer.is_closing():
                    logger.info(f"Writer is closing for {connection_id}")
                    break
                
                # Read packet
                packet_data = await _parser.read_packet(reader, timeout=float(read_timeout))
                if not packet_data:
                    # No packet data - could be ping, timeout, or disconnection
                    # Check if connection is closing (our side or remote side)
                    if writer.is_closing() or reader.at_eof():
                        logger.info(f"Connection closed for {connection_id}")
                        break  # Exit loop - connection is done
                    # Connection still alive, might have been a ping - update time
                    await AsyncGlobalIPTable.updateWriterTime(writer)
                    continue  # Continue loop to wait for next packet
                
                logger.info(f"Received packet from {connection_id}: {len(packet_data)} bytes")
                
                # Log raw packet bytes if enabled (matches original)
                log_raw_packets = ServerParams.get_bool('tcp_server.log_raw_packets', True)
                if log_raw_packets:
                    max_bytes = ServerParams.get_int('tcp_server.raw_packet_max_bytes', 256)
                    packet_to_log = packet_data[:max_bytes] if len(packet_data) > max_bytes else packet_data
                    hex_dump = ' '.join(f'{b:02X}' for b in packet_to_log)
                    truncated = f" (truncated, showing first {max_bytes} of {len(packet_data)} bytes)" if len(packet_data) > max_bytes else ""
                    logger.info(f"Raw packet from {connection_id} (IMEI: {imei}): {hex_dump}{truncated}")
                
                # Update IP table last communication time (matches original)
                await AsyncGlobalIPTable.updateWriterTime(writer)
                
                # Parse and publish to RabbitMQ
                records, all_published = await _parser.parse_packet_to_rabbitmq(
                    packet_data, imei, device_ip, device_port
                )
                
                if records:
                    logger.info(f"Parsed {len(records)} records from packet for IMEI {imei}")
                
                # CRITICAL: Send DATA ACK only if ALL records published to RabbitMQ successfully
                # This ensures device won't delete data until it's safely in the queue
                if all_published and records:
                    num_records = len(records)
                    await _parser.send_ack(writer, num_records)
                    logger.info(f"✓ DATA ACK sent to device: {num_records} records queued for IMEI {imei}")
                elif records:
                    # Records parsed but RabbitMQ publish failed - DO NOT send ACK
                    # Device will keep data and retry later
                    logger.warning(f"✗ DATA ACK NOT SENT - RabbitMQ unavailable, {len(records)} records NOT queued for IMEI {imei} (device will retry)")
                else:
                    # No records parsed (decode error) - still don't ACK
                    logger.warning(f"✗ DATA ACK NOT SENT - No records parsed from packet for IMEI {imei}")
                
            except asyncio.TimeoutError:
                # Check if connection is still alive - if so, continue waiting
                if writer.is_closing() or reader.at_eof():
                    logger.info(f"Connection closed during timeout for {connection_id}")
                    break
                # Connection still alive, just no data - continue waiting
                logger.debug(f"Read timeout for {connection_id} (connection still alive, continuing)")
                continue
            except asyncio.IncompleteReadError:
                logger.info(f"Incomplete read from {connection_id} - connection may be closing")
                break
            except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, OSError) as e:
                # Normal disconnection scenarios
                logger.info(f"Connection error from {connection_id}: {e}")
                break
            except Exception as e:
                logger.error(f"Error handling connection {connection_id}: {e}", exc_info=True)
                break
        
    except asyncio.CancelledError:
        logger.info(f"Connection cancelled for {connection_id}")
    except asyncio.IncompleteReadError:
        logger.info(f"Connection closed by client: {connection_id}")
    except Exception as e:
        logger.error(f"Error in client connection handler: {e}", exc_info=True)
    finally:
        # Better cleanup with robust error handling (matches original)
        try:
            # Close writer with timeout - handle all edge cases
            if writer:
                try:
                    if not writer.is_closing():
                        writer.close()
                        
                        # Wait for close with timeout
                        connection_cleanup_timeout = ServerParams.get_float('tcp_server.connection_cleanup_timeout', 5.0)
                        try:
                            await asyncio.wait_for(writer.wait_closed(), timeout=connection_cleanup_timeout)
                        except asyncio.TimeoutError:
                            logger.warning(f"Connection cleanup timeout for {connection_id}, forcing abort")
                            try:
                                if hasattr(writer, 'transport') and writer.transport:
                                    writer.transport.abort()
                            except (AttributeError, RuntimeError, OSError) as abort_error:
                                logger.debug(f"Error aborting transport for {connection_id}: {abort_error}")
                except (AttributeError, RuntimeError, OSError) as close_error:
                    logger.debug(f"Writer already closed or invalid for {connection_id}: {close_error}")
        except Exception as e:
            logger.warning(f"Error during connection cleanup for {connection_id}: {e}")
        
        # Remove from IP table
        try:
            await AsyncGlobalIPTable.removeIpTableByIpAndPort(device_ip, device_port)
        except Exception as e:
            logger.warning(f"Error removing from IP table during cleanup: {e}")
        
        # Decrement connection count (thread-safe, matches original implementation)
        async with _connection_lock:
            _connection_count = max(0, _connection_count - 1)
            logger.info(f"Client disconnected: {connection_id} (Remaining: {_connection_count}/{_max_concurrent_connections})")
        
        # Decrement load monitor connection count
        _load_monitor.decrement_connections()
        
        logger.info(f"Connection closed: {connection_id}")


async def main():
    """Main entry point for parser service"""
    global _parser, _rabbitmq_producer, _load_monitor
    global _gprs_poller, _gprs_sender, _command_tasks
    global _rabbitmq_connect_task, _shutting_down
    
    try:
        # Load configuration
        config = Config.load()
        parser_config = config.get('parser_node', {})
        # Allow override from environment variable
        node_id = os.environ.get('NODE_ID') or parser_config.get('node_id', 'parser-service-1')
        
        logger.info(f"Starting Parser Service: {node_id}")
        logger.info(f"Vendor: {parser_config.get('vendor', 'teltonika')}")
        logger.info(f"Expected trackers: {parser_config.get('expected_trackers', 0)}")
        
        # Initialize IP table (singleton pattern - used by all components)
        # Use deviceinfo_check_interval as fallback (matches original implementation)
        check_interval = ServerParams.get_int('ip_table.check_interval', 
                                               ServerParams.get_int('system.deviceinfo_check_interval', 300))
        try:
            await AsyncGlobalIPTable.initialize(
                initial_capacity=ServerParams.get_int('system.initial_capacity', 100000),
                check_interval=check_interval
            )
            logger.info("IP table initialized")
        except asyncio.CancelledError:
            logger.info("IP table initialization cancelled due to shutdown")
            raise  # Re-raise to exit main() gracefully
        
        # Check data transfer mode
        data_mode = Config.get_data_transfer_mode().upper()  # Normalize to uppercase for robustness
        
        if data_mode == 'LOGS':
            # LOGS mode: CSV saving, no RabbitMQ needed
            logger.info("LOGS mode enabled - data will be saved to CSV files")
            _rabbitmq_producer = None  # Not needed for CSV mode
        else:
            # RABBITMQ mode: Connect to RabbitMQ (with retry - will keep trying until connected)
            logger.info("Connecting to RabbitMQ (will retry if unavailable)...")
            try:
                # Run connection in a task so it can be cancelled on shutdown
                async def _connect_rabbitmq():
                    return await get_rabbitmq_producer()
                
                _rabbitmq_connect_task = asyncio.create_task(_connect_rabbitmq())
                _rabbitmq_producer = await _rabbitmq_connect_task
                logger.info("✓ RabbitMQ connected")
            except asyncio.CancelledError:
                logger.info("RabbitMQ connection cancelled due to shutdown")
                _rabbitmq_producer = None
            except Exception as e:
                logger.warning(f"RabbitMQ not available at startup: {e}. Parser will continue running and retry connection.")
                # Create producer instance and start connection in background
                # This ensures connection is established even if startup fails
                from teltonika_infrastructure.rabbitmq_producer import RabbitMQProducer
                _rabbitmq_producer = RabbitMQProducer()
                # Start connection in background (non-blocking) - will retry until connected
                async def _background_connect():
                    try:
                        await _rabbitmq_producer.connect(retry=True)
                        logger.info("✓ RabbitMQ connected (background connection succeeded)")
                    except Exception as bg_err:
                        logger.debug(f"Background RabbitMQ connection attempt: {bg_err}")
                        # Connection will retry on first publish if still not connected
                
                # Start background connection task (don't await - let it run in background)
                _rabbitmq_connect_task = asyncio.create_task(_background_connect())
                # Cancel the old connection task if still running
                # Note: We keep the new task running in background
        
        # Initialize load monitor
        _load_monitor = get_load_monitor(node_id)
        try:
            await _load_monitor.start_reporting()
        except asyncio.CancelledError:
            logger.info("Load monitor initialization cancelled due to shutdown")
            raise  # Re-raise to exit main() gracefully
        
        # Initialize parser (supports both RabbitMQ and CSV modes)
        _parser = RabbitMQPacketParser(_rabbitmq_producer, _load_monitor)
        
        # Register Codec12 response handler for GPRS command responses
        # This handles device replies to commands sent via Codec 12
        try:
            from teltonika_commands.codec12_response_handler import handle_codec12_response
            from teltonika_parser.async_packet_parser import set_codec12_response_handler
            set_codec12_response_handler(handle_codec12_response)
            logger.info("✓ Codec12 response handler registered")
        except Exception as e:
            logger.warning(f"Could not register Codec12 response handler: {e}")
        
        # Start command infrastructure (if commands table exists and not in LOGS mode)
        # Commands are only needed when using database (not in LOGS mode)
        if data_mode != 'LOGS':
            try:
                # Initialize ORM to check if commands table exists
                from teltonika_parser.orm_init import init_orm
                from teltonika_database.models import CommandOutbox
                
                # Initialize ORM (with retry - will keep trying until connected)
                logger.info("Initializing database connection for commands (will retry if unavailable)...")
                try:
                    await init_orm(retry=True)
                    logger.info("✓ Database connection initialized for commands")
                except asyncio.CancelledError:
                    logger.info("Database initialization cancelled due to shutdown")
                    raise  # Re-raise to exit main() gracefully
                except Exception as e:
                    logger.warning(f"Database not available at startup: {e}. Command infrastructure will retry connection.")
                
                # Try to verify commands table exists (non-blocking check)
                try:
                    # Quick check if Command model can be accessed (table exists)
                    # This is a lightweight check - actual queries happen in pollers
                    logger.info("Checking for 'commands' table...")
                    # The actual table check will happen when pollers try to query
                    # If table doesn't exist, pollers will log and skip gracefully
                    
                    # Note: SMS commands are handled by separate SMS Gateway Service
                    # Parser only handles GPRS commands via TCP socket
                    
                    # Start GPRS poller
                    from teltonika_commands.async_gprs_commands_poller import AsyncGPRSCommandsPoller
                    _gprs_poller = AsyncGPRSCommandsPoller()
                    gprs_poller_task = asyncio.create_task(_gprs_poller.poll_commands())
                    _command_tasks.append(gprs_poller_task)
                    logger.info("✓ Async GPRS Commands Poller started")
                    
                    # Start GPRS sender
                    from teltonika_commands.async_gprs_commands_sender import AsyncGPRSCommandsSender
                    _gprs_sender = AsyncGPRSCommandsSender()
                    gprs_sender_task = asyncio.create_task(_gprs_sender.send_commands())
                    _command_tasks.append(gprs_sender_task)
                    logger.info("✓ Async GPRS Commands Sender started")
                    
                    logger.info("✓ Command infrastructure started successfully")
                except Exception as e:
                    logger.debug(f"'commands' table check failed or error: {e}, command infrastructure will retry on first poll")
            except Exception as e:
                logger.warning(f"Could not start command infrastructure: {e}. Commands will not be available.")
        else:
            logger.debug("LOGS mode - skipping command infrastructure (no database)")
        
        # Start TCP server (with retry for transient errors)
        # Use parser_node config for listen IP/port
        ip = parser_config.get('listen_ip', '0.0.0.0')
        port = parser_config.get('listen_port', 5027)
        
        logger.info(f"Starting TCP server on {ip}:{port}...")
        
        # Start TCP server in a task so it can be cancelled on shutdown
        async def _start_server_with_retry():
            """Start TCP server with retry logic"""
            from teltonika_infrastructure.connection_retry import retry_connection
            
            async def _start_server():
                # Check for shutdown before starting
                if _shutdown_event.is_set():
                    raise asyncio.CancelledError("Shutdown requested")
                await start_tcp_server(ip, port, handle_client_connection)
            
            # Wrap in retry logic - will retry indefinitely for connection errors
            # But don't retry on CancelledError (shutdown)
            try:
                await retry_connection(
                    _start_server,
                    max_retries=-1,  # Infinite retries
                    initial_delay=2.0,
                    max_delay=30.0
                )
            except asyncio.CancelledError:
                # Shutdown requested, don't retry
                logger.info("TCP server startup cancelled due to shutdown")
                raise
            except ValueError as e:
                # Configuration error (handler not provided) - this shouldn't happen, but log it
                logger.error(f"TCP server configuration error: {e}")
                # Wait for shutdown
                await _shutdown_event.wait()
        
        # Start TCP server task
        tcp_server_task = asyncio.create_task(_start_server_with_retry())
        
        logger.info("✓ Parser service started successfully")
        logger.info("Waiting for connections...")
        
        # Wait for shutdown event - when it's set, close the TCP server
        try:
            await _shutdown_event.wait()
            logger.info("Shutdown requested, stopping TCP server...")
            
            # Set shutdown flag to suppress noisy asyncio errors
            _shutting_down = True
            loop = asyncio.get_event_loop()
            loop.set_exception_handler(suppress_asyncio_errors)
            
            # Close RabbitMQ producer immediately to stop retry loops
            if _rabbitmq_producer:
                try:
                    from teltonika_infrastructure.rabbitmq_producer import close_rabbitmq_producer
                    await close_rabbitmq_producer()
                    logger.debug("RabbitMQ producer closed")
                except Exception as e:
                    logger.debug(f"Error closing RabbitMQ producer: {e}")
            
            # Cancel any running RabbitMQ connection task
            if _rabbitmq_connect_task and not _rabbitmq_connect_task.done():
                logger.debug("Cancelling RabbitMQ connection task...")
                _rabbitmq_connect_task.cancel()
                try:
                    await asyncio.wait_for(_rabbitmq_connect_task, timeout=0.5)
                except (asyncio.CancelledError, asyncio.TimeoutError):
                    pass
            
            # Close TCP server and cancel task to force shutdown
            from teltonika_listener.tcp_listener import close_tcp_server_sync
            close_tcp_server_sync()
            
            # Cancel the server task immediately - don't wait, proceed with shutdown
            if not tcp_server_task.done():
                logger.debug("Cancelling TCP server task...")
                tcp_server_task.cancel()
                # Don't wait - proceed immediately to cleanup in finally block
        except asyncio.CancelledError:
            logger.info("Main loop cancelled")
            _shutting_down = True
            from teltonika_listener.tcp_listener import close_tcp_server_sync
            close_tcp_server_sync()
            if not tcp_server_task.done():
                tcp_server_task.cancel()
                try:
                    await asyncio.wait_for(tcp_server_task, timeout=1.0)
                except (asyncio.CancelledError, asyncio.TimeoutError, Exception):
                    pass
        
    except KeyboardInterrupt:
        logger.info("Received shutdown signal")
    except asyncio.CancelledError:
        # Shutdown requested during initialization or main loop
        logger.info("Shutdown requested, cleaning up...")
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
    finally:
        # Graceful shutdown
        logger.info("Shutting down parser service gracefully...")
        
        # Set shutdown flag to prevent new connections
        _shutting_down = True
        
        # Wait a moment for in-flight operations to complete
        logger.info("Waiting for in-flight operations to complete...")
        await asyncio.sleep(2)  # Allow time for current operations to finish
        
        # Stop command infrastructure components (GPRS only - SMS handled by SMS Gateway Service)
        components_stopped = []
        components_failed = []
        
        if _gprs_sender:
            try:
                if hasattr(_gprs_sender, 'stop'):
                    _gprs_sender.stop()
                    components_stopped.append("GPRS Sender")
            except Exception as e:
                components_failed.append(f"GPRS Sender: {e}")
        
        if _gprs_poller:
            try:
                if hasattr(_gprs_poller, 'stop'):
                    _gprs_poller.stop()
                    components_stopped.append("GPRS Poller")
            except Exception as e:
                components_failed.append(f"GPRS Poller: {e}")
        
        # Cancel all command-related tasks
        if _command_tasks:
            logger.info(f"Cancelling {len(_command_tasks)} command-related tasks...")
            for task in _command_tasks:
                if not task.done():
                    task.cancel()
            
            # Wait for tasks to complete with timeout
            shutdown_timeout = ServerParams.get_float('shutdown.task_completion_timeout', 1.5)
            try:
                await asyncio.wait_for(
                    asyncio.gather(*_command_tasks, return_exceptions=True),
                    timeout=shutdown_timeout
                )
                logger.info(f"All {len(_command_tasks)} command tasks completed")
            except asyncio.TimeoutError:
                logger.warning(f"Some command tasks did not complete within {shutdown_timeout}s timeout")
        
        if components_stopped:
            logger.info(f"Stopped {len(components_stopped)} components: {', '.join(components_stopped)}")
        if components_failed:
            logger.warning(f"Failed to stop {len(components_failed)} components: {', '.join(components_failed)}")
        
        if _load_monitor:
            await _load_monitor.stop_reporting()
        
        # Flush any pending RabbitMQ messages before closing
        if _rabbitmq_producer:
            try:
                logger.info("Flushing pending RabbitMQ messages...")
                # Give producer time to flush any pending messages
                await asyncio.sleep(1)
            except Exception as e:
                logger.debug(f"Error flushing RabbitMQ messages: {e}")
        
        # RabbitMQ producer already closed during shutdown sequence above
        # Only close here if shutdown wasn't triggered via signal (e.g., exception during startup)
        if _rabbitmq_producer:
            try:
                await close_rabbitmq_producer()
                logger.info("RabbitMQ producer closed")
            except Exception as e:
                logger.debug(f"Error closing RabbitMQ producer: {e}")
        
        if _parser:
            await _parser.shutdown()
        
        # Close database connections (if ORM was initialized)
        try:
            from teltonika_parser.orm_init import close_orm
            await close_orm()
            logger.info("Database connections closed")
        except Exception as e:
            logger.debug(f"Error closing database connections: {e}")
        
        await close_tcp_server()
        
        logger.info("Parser service shutdown complete")


def signal_handler(signum, frame):
    """Handle shutdown signals"""
    logger.info(f"Received signal {signum}, initiating shutdown...")
    _shutdown_event.set()


if __name__ == "__main__":
    # Set up signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Run main
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutdown complete")
