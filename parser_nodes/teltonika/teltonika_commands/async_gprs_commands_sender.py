"""
Async GPRS Commands Sender - Sends GPRS commands to Teltonika devices
GPRS command sender for Teltonika devices (IMEI-based)
"""
import asyncio
import logging
from typing import Any
from datetime import datetime

from teltonika_infrastructure.async_ip_table import AsyncGlobalIPTable
from teltonika_commands.out_command import OutCommand, GPRSCommandsBuffer
from teltonika_commands.command_encoder import CommandEncoder

logger = logging.getLogger(__name__)


class AsyncGPRSCommandsSender:
    """
    Async GPRS command sender - sends GPRS commands to Teltonika devices
    Uses StreamWriter.write() for non-blocking command sending
    """
    
    def __init__(self):
        """Initialize async GPRS commands sender"""
        self.running = False
        logger.info("AsyncGPRSCommandsSender initialized")
    
    async def _send_command(self, imei: str, writer: Any, out_command: OutCommand):
        """
        Encode and send command (async)
        Initialize GPRS command sender
        
        Args:
            imei: Device IMEI
            writer: asyncio.StreamWriter
            out_command: Command to send
        """
        try:
            # Get encoded commands (Teltonika Codec 12)
            encoded_commands = CommandEncoder.getEncodedCommand(out_command)
            
            if len(encoded_commands) <= 1:
                # Single command
                await self._send_single_command(writer, encoded_commands[0], out_command)
            else:
                # Multiple commands - send with delay
                for cmd_bytes in encoded_commands:
                    await self._send_single_command(writer, cmd_bytes, out_command)
                    await asyncio.sleep(1.5)  # 1500ms delay between commands
        
        except Exception as e:
            logger.error(f"Exception in _send_command (async): {e}")
    
    async def _send_single_command(self, writer: Any, command_bytes: bytes, out_command: OutCommand):
        """
        Send single command (async)
        
        Args:
            writer: asyncio.StreamWriter
            command_bytes: Command bytes (Codec 12 packet)
            out_command: OutCommand object
        """
        try:
            logger.debug(f"GPRS Command to Device (async): [{out_command.getImei()}] - {command_bytes.hex().upper()[:50]}")
            
            # Send command (non-blocking async)
            writer.write(command_bytes)
            await writer.drain()
            
            logger.info(f"GPRS Command sent (async) to imei [{out_command.getImei()}]: {command_bytes.hex().upper()[:50]}")
        
        except Exception as e:
            logger.error(f"Error sending GPRS command (async): {e}")
    
    async def _send_commands(self):
        """
        Get command from buffer and send to device (async)
        Initialize GPRS command sender
        """
        try:
            # Remove command from buffer (thread-safe)
            out_command = GPRSCommandsBuffer.getOutCommandBufferInstance().removeCommand()
            
            if not out_command:
                # No commands, sleep briefly
                await asyncio.sleep(0.1)
                return
            
            imei = out_command.getImei()
            
            if not imei:
                logger.warning("Command has no IMEI, cannot send")
                return
            
            # Get StreamWriter for device by IMEI (async)
            writer = await AsyncGlobalIPTable.getWriterByImei(imei)
            
            if not writer:
                # Device offline - log and skip (command will stay in command_sent with 'sent' status)
                logger.info(f"Device offline, skipping GPRS command: imei=[{imei}], command={out_command.getParam()}")
                return
            
            # Send command (async)
            await self._send_command(imei, writer, out_command)
        
        except Exception as e:
            logger.error(f"Exception in _send_commands (async): {e}")
    
    async def send_commands(self):
        """
        Main sending loop - runs as background task
        Send GPRS commands to devices
        """
        logger.info("AsyncGPRSCommandsSender started")
        self.running = True
        
        while self.running:
            try:
                await self._send_commands()
                await asyncio.sleep(0.1)  # Small delay between checks
            
            except asyncio.CancelledError:
                logger.info("AsyncGPRSCommandsSender cancelled")
                break
            except Exception as e:
                logger.error(f"Exception in AsyncGPRSCommandsSender: {e}", exc_info=True)
                await asyncio.sleep(1)
        
        logger.info("AsyncGPRSCommandsSender stopped")
    
    def stop(self):
        """Stop the sender"""
        self.running = False
