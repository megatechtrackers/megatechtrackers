"""
Async GPRS Commands Poller - Polls command_outbox for GPRS commands
Replaces the in-memory buffer approach with database-backed command queue
"""
import asyncio
import logging
from typing import Optional, List
from datetime import datetime, timezone
from sqlalchemy import select, delete, and_, text
from sqlalchemy.exc import SQLAlchemyError

from config import Config, ServerParams
from teltonika_database.sqlalchemy_base import get_session, init_sqlalchemy
from teltonika_commands.out_command import OutCommand, GPRSCommandsBuffer
from teltonika_infrastructure.async_ip_table import AsyncGlobalIPTable

logger = logging.getLogger(__name__)

# Poll interval in seconds
DEFAULT_POLL_INTERVAL = 5
# Maximum commands to fetch per poll
DEFAULT_BATCH_SIZE = 50
# Command timeout in minutes (how long a command stays in outbox before expiring)
DEFAULT_OUTBOX_TIMEOUT_MINUTES = 1


class CommandOutboxModel:
    """
    SQLAlchemy model for command_outbox table.
    Defined here to avoid circular imports with the main models module.
    """
    pass


class AsyncGPRSCommandsPoller:
    """
    Async GPRS commands poller - polls command_outbox for GPRS commands.
    
    This replaces the old approach where commands were added to an in-memory buffer.
    Now commands flow:
    1. Operations Service API -> command_outbox (send_method='gprs')
    2. This poller -> GPRSCommandsBuffer
    3. AsyncGPRSCommandsSender -> Device (Codec 12)
    4. Device response -> command_sent/command_history
    """
    
    def __init__(self, poll_interval: float = None, batch_size: int = None):
        """
        Initialize GPRS commands poller.
        
        Args:
            poll_interval: Seconds between polls (default: 5)
            batch_size: Max commands to fetch per poll (default: 50)
        """
        self.poll_interval = poll_interval or ServerParams.get_float(
            'gprs_commands.poll_interval', DEFAULT_POLL_INTERVAL
        )
        self.batch_size = batch_size or ServerParams.get_int(
            'gprs_commands.batch_size', DEFAULT_BATCH_SIZE
        )
        self.running = False
        self._db_initialized = False
        
        # Statistics
        self.total_polled = 0
        self.total_added_to_buffer = 0
        self.total_errors = 0
        
        logger.info(
            f"AsyncGPRSCommandsPoller initialized: "
            f"poll_interval={self.poll_interval}s, batch_size={self.batch_size}"
        )
    
    async def _ensure_db_initialized(self):
        """Ensure database connection is initialized."""
        if not self._db_initialized:
            try:
                await init_sqlalchemy()
                self._db_initialized = True
            except Exception as e:
                logger.error(f"Failed to initialize database: {e}")
                raise
    
    async def _poll_commands(self) -> List[dict]:
        """
        Poll command_outbox for GPRS commands for devices connected to THIS parser.
        
        Only polls commands for IMEIs that are currently connected to this parser service.
        This ensures each parser only handles commands for its own devices.
        
        Returns:
            List of command dictionaries from the database
        """
        try:
            # Get list of IMEIs connected to THIS parser service
            ip_table = await AsyncGlobalIPTable.get_instance()
            connected_imeis = await ip_table.get_all_imeis()
            
            if not connected_imeis:
                # No devices connected to this parser, skip polling
                return []
            
            async with get_session() as session:
                # Query command_outbox for GPRS commands only for connected devices
                # Order by created_at (FIFO)
                # Use parameterized query with IN clause
                imei_placeholders = ', '.join([f':imei_{i}' for i in range(len(connected_imeis))])
                params = {"limit": self.batch_size}
                for i, imei in enumerate(connected_imeis):
                    params[f'imei_{i}'] = str(imei)
                
                result = await session.execute(
                    text(f"""
                    SELECT id, imei, sim_no, command_text, config_id, user_id, 
                           retry_count, created_at
                    FROM command_outbox 
                    WHERE send_method = 'gprs' AND imei IN ({imei_placeholders})
                    ORDER BY created_at ASC
                    LIMIT :limit
                    """),
                    params
                )
                rows = result.fetchall()
                
                commands = []
                for row in rows:
                    commands.append({
                        'id': row[0],
                        'imei': row[1],
                        'sim_no': row[2],
                        'command_text': row[3],
                        'config_id': row[4],
                        'user_id': row[5],
                        'retry_count': row[6],
                        'created_at': row[7]
                    })
                
                if commands:
                    logger.debug(f"Polled {len(commands)} GPRS commands for {len(connected_imeis)} connected devices")
                
                return commands
        except SQLAlchemyError as e:
            logger.error(f"Database error polling commands: {e}")
            self.total_errors += 1
            return []
    
    async def _move_to_sent(self, command: dict) -> bool:
        """
        Move command from outbox to sent table.
        
        Args:
            command: Command dictionary from outbox
            
        Returns:
            True if successful, False otherwise
        """
        try:
            async with get_session() as session:
                # Insert into command_sent
                await session.execute(
                    text("""
                    INSERT INTO command_sent 
                    (imei, sim_no, command_text, config_id, user_id, send_method, 
                     status, created_at, sent_at)
                    VALUES (:imei, :sim_no, :command_text, :config_id, :user_id, 
                            'gprs', 'sent', :created_at, NOW())
                    """),
                    {
                        'imei': command['imei'],
                        'sim_no': command['sim_no'],
                        'command_text': command['command_text'],
                        'config_id': command['config_id'],
                        'user_id': command['user_id'],
                        'created_at': command['created_at']
                    }
                )
                
                # Insert into command_history (outgoing)
                await session.execute(
                    text("""
                    INSERT INTO command_history 
                    (imei, sim_no, direction, command_text, config_id, status, 
                     send_method, user_id, created_at, sent_at)
                    VALUES (:imei, :sim_no, 'outgoing', :command_text, :config_id, 
                            'sent', 'gprs', :user_id, :created_at, NOW())
                    """),
                    {
                        'imei': command['imei'],
                        'sim_no': command['sim_no'],
                        'command_text': command['command_text'],
                        'config_id': command['config_id'],
                        'user_id': command['user_id'],
                        'created_at': command['created_at']
                    }
                )
                
                # Delete from outbox
                await session.execute(
                    text("DELETE FROM command_outbox WHERE id = :id"),
                    {"id": command['id']}
                )
                
                await session.commit()
                return True
        except SQLAlchemyError as e:
            logger.error(f"Database error moving command to sent: {e}")
            self.total_errors += 1
            return False
    
    def _create_out_command(self, command: dict) -> OutCommand:
        """
        Create OutCommand object from database record.
        
        Args:
            command: Command dictionary from database
            
        Returns:
            OutCommand object ready for sending
        """
        out_cmd = OutCommand()
        out_cmd.setId(command['id'])
        out_cmd.setImei(str(command['imei']))
        out_cmd.setUnitSim(command['sim_no'] or '')
        out_cmd.setParam(command['command_text'])
        out_cmd.setData(command['command_text'])
        out_cmd.setDataType('GPRS')
        out_cmd.setDatetime(command['created_at'] or datetime.now(timezone.utc))
        out_cmd.setRemark(f"config_id={command['config_id']}, user={command['user_id']}")
        return out_cmd
    
    async def _process_commands(self):
        """
        Poll for commands and add them to the GPRS buffer.
        """
        try:
            await self._ensure_db_initialized()
            
            # Poll for commands
            commands = await self._poll_commands()
            
            if not commands:
                return
            
            self.total_polled += len(commands)
            logger.debug(f"Polled {len(commands)} GPRS commands from outbox")
            
            # Process each command
            buffer = GPRSCommandsBuffer.getOutCommandBufferInstance()
            
            for cmd in commands:
                try:
                    # Create OutCommand object
                    out_cmd = self._create_out_command(cmd)
                    
                    # Move to sent table BEFORE adding to buffer
                    # This ensures we don't lose track of the command
                    if await self._move_to_sent(cmd):
                        # Add to GPRS buffer for sending
                        buffer.addCommand(out_cmd)
                        self.total_added_to_buffer += 1
                        
                        logger.info(
                            f"GPRS command queued: imei={cmd['imei']}, "
                            f"command='{cmd['command_text'][:50]}...'"
                        )
                    else:
                        logger.error(
                            f"Failed to move command to sent: imei={cmd['imei']}, "
                            f"id={cmd['id']}"
                        )
                except Exception as e:
                    logger.error(f"Error processing command {cmd['id']}: {e}")
                    self.total_errors += 1
        
        except Exception as e:
            logger.error(f"Error in _process_commands: {e}", exc_info=True)
            self.total_errors += 1
    
    async def poll_commands(self):
        """
        Main polling loop - runs as background task.
        Polls command_outbox for GPRS commands and adds them to the buffer.
        """
        logger.info("AsyncGPRSCommandsPoller started")
        self.running = True
        
        while self.running:
            try:
                await self._process_commands()
                await asyncio.sleep(self.poll_interval)
            
            except asyncio.CancelledError:
                logger.info("AsyncGPRSCommandsPoller cancelled")
                break
            except Exception as e:
                logger.error(f"Exception in AsyncGPRSCommandsPoller: {e}", exc_info=True)
                self.total_errors += 1
                await asyncio.sleep(self.poll_interval)
        
        # Final statistics
        logger.info(
            f"AsyncGPRSCommandsPoller stopped - "
            f"total_polled={self.total_polled}, "
            f"total_added_to_buffer={self.total_added_to_buffer}, "
            f"total_errors={self.total_errors}"
        )
    
    def stop(self):
        """Stop the poller."""
        self.running = False
        logger.info("AsyncGPRSCommandsPoller stop requested")
    
    def get_stats(self) -> dict:
        """Get polling statistics."""
        return {
            'total_polled': self.total_polled,
            'total_added_to_buffer': self.total_added_to_buffer,
            'total_errors': self.total_errors,
            'running': self.running
        }
