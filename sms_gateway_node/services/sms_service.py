"""
SMS Service - Main service for SMS command processing
Polls command_outbox, sends SMS, handles responses
"""
import asyncio
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, timezone
from sqlalchemy import text

from ..config import Config, ServerParams
from .modem_pool import ModemPool

logger = logging.getLogger(__name__)


class SMSService:
    """
    Main SMS service that handles the complete SMS command lifecycle.
    
    Flow:
    1. Poll command_outbox for SMS commands
    2. Select best modem from pool
    3. Send SMS via modem
    4. Move to command_sent
    5. Poll modem inbox for replies
    6. Match replies to command_sent
    7. Update status and history
    """
    
    def __init__(self):
        """Initialize SMS service."""
        self.modem_pool = ModemPool.get_instance()
        self.running = False
        self.last_cleanup = datetime.now(timezone.utc)
        
        # Load config values
        self.max_retries = ServerParams.get_int('timeouts.max_retries', 3)
        self.outbox_timeout_minutes = ServerParams.get_int('timeouts.outbox_timeout_minutes', 1)
        self.reply_timeout_minutes = ServerParams.get_int('timeouts.reply_timeout_minutes', 2)
        self.cleanup_interval_seconds = ServerParams.get_int('timeouts.cleanup_interval_seconds', 60)
        self.outbox_poll_interval = ServerParams.get_int('polling.outbox_interval_seconds', 5)
        
        # Statistics
        self.commands_processed = 0
        self.commands_sent = 0
        self.commands_failed = 0
        self.commands_timed_out = 0
        self.responses_matched = 0
        self.duplicates_skipped = 0
        
        logger.info("SMSService initialized")
    
    async def _poll_outbox(self) -> List[Dict[str, Any]]:
        """
        Poll command_outbox for SMS commands.
        
        Returns:
            List of command dictionaries
        """
        try:
            async with await self.modem_pool.get_session() as session:
                result = await session.execute(text("""
                    SELECT id, imei, sim_no, command_text, config_id, user_id,
                           retry_count, created_at
                    FROM command_outbox
                    WHERE send_method = 'sms'
                    ORDER BY created_at ASC
                    LIMIT 10
                """))
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
                
                return commands
        
        except Exception as e:
            logger.error(f"Error polling outbox: {e}")
            return []
    
    async def _send_command(self, command: Dict[str, Any]) -> bool:
        """
        Send a single SMS command.
        
        Args:
            command: Command dictionary from outbox
            
        Returns:
            True if sent successfully
        """
        try:
            # Get best modem using hybrid selection:
            # 1. Device-specific modem (from unit.modem_id)
            # 2. Service pool ('commands')
            # 3. Fallback to any modem
            modem_config = await self.modem_pool.select_best_modem(
                service='commands',
                imei=command.get('imei')
            )
            if not modem_config:
                logger.warning(f"No modem available for command {command['id']}")
                return False
            
            # Get client
            client = await self.modem_pool.get_client(modem_config.id)
            if not client:
                logger.error(f"Could not get client for modem {modem_config.id}")
                return False
            
            # Send SMS
            result = await client.send_sms(command['sim_no'], command['command_text'])
            
            if result.success:
                # Update modem quota
                await self.modem_pool.increment_quota(modem_config.id, result.sms_count)
                
                # Move to command_sent (include modem_id and modem_name for tracking)
                await self._move_to_sent(command, modem_config.id, modem_config.name)
                
                self.commands_sent += 1
                logger.info(
                    f"SMS sent: id={command['id']}, imei={command['imei']}, "
                    f"modem={modem_config.name} (id={modem_config.id})"
                )
                return True
            else:
                # Handle retry
                await self._handle_send_failure(command, result.error)
                self.commands_failed += 1
                return False
        
        except Exception as e:
            logger.error(f"Error sending command {command['id']}: {e}")
            self.commands_failed += 1
            return False
    
    async def _move_to_sent(self, command: Dict[str, Any], modem_id: int, modem_name: str):
        """Move command from outbox to sent, including modem tracking info."""
        try:
            async with await self.modem_pool.get_session() as session:
                # Insert into command_sent (with modem_id and modem_name)
                await session.execute(text("""
                    INSERT INTO command_sent
                    (imei, sim_no, command_text, config_id, user_id, send_method,
                     status, modem_id, modem_name, created_at, sent_at)
                    VALUES (:imei, :sim_no, :command_text, :config_id, :user_id,
                            'sms', 'sent', :modem_id, :modem_name, :created_at, NOW())
                """), {
                    'imei': command['imei'],
                    'sim_no': command['sim_no'],
                    'command_text': command['command_text'],
                    'config_id': command['config_id'],
                    'user_id': command['user_id'],
                    'modem_id': modem_id,
                    'modem_name': modem_name,
                    'created_at': command['created_at']
                })
                
                # Insert into history (with modem_id and modem_name)
                await session.execute(text("""
                    INSERT INTO command_history
                    (imei, sim_no, direction, command_text, config_id, status,
                     send_method, user_id, modem_id, modem_name, created_at, sent_at)
                    VALUES (:imei, :sim_no, 'outgoing', :command_text, :config_id,
                            'sent', 'sms', :user_id, :modem_id, :modem_name, :created_at, NOW())
                """), {
                    'imei': command['imei'],
                    'sim_no': command['sim_no'],
                    'command_text': command['command_text'],
                    'config_id': command['config_id'],
                    'user_id': command['user_id'],
                    'modem_id': modem_id,
                    'modem_name': modem_name,
                    'created_at': command['created_at']
                })
                
                # Delete from outbox
                await session.execute(text(
                    "DELETE FROM command_outbox WHERE id = :id"
                ), {"id": command['id']})
                
                await session.commit()
        
        except Exception as e:
            logger.error(f"Error moving to sent: {e}")
    
    async def _handle_send_failure(self, command: Dict[str, Any], error: str):
        """Handle send failure - retry or mark failed."""
        try:
            async with await self.modem_pool.get_session() as session:
                retry_count = command['retry_count'] + 1
                
                if retry_count >= self.max_retries:
                    # Mark as failed
                    await session.execute(text("""
                        INSERT INTO command_sent
                        (imei, sim_no, command_text, config_id, user_id, send_method,
                         status, error_message, created_at, sent_at)
                        VALUES (:imei, :sim_no, :command_text, :config_id, :user_id,
                                'sms', 'failed', :error, :created_at, NOW())
                    """), {
                        'imei': command['imei'],
                        'sim_no': command['sim_no'],
                        'command_text': command['command_text'],
                        'config_id': command['config_id'],
                        'user_id': command['user_id'],
                        'error': error,
                        'created_at': command['created_at']
                    })
                    
                    # Delete from outbox
                    await session.execute(text(
                        "DELETE FROM command_outbox WHERE id = :id"
                    ), {"id": command['id']})
                    
                    logger.warning(f"Command {command['id']} failed after {self.max_retries} retries")
                else:
                    # Increment retry count
                    await session.execute(text("""
                        UPDATE command_outbox
                        SET retry_count = :retry_count
                        WHERE id = :id
                    """), {"id": command['id'], "retry_count": retry_count})
                    
                    logger.info(f"Command {command['id']} retry {retry_count}/{self.max_retries}")
                
                await session.commit()
        
        except Exception as e:
            logger.error(f"Error handling failure: {e}")
    
    async def _poll_inbox_all_modems(self):
        """Poll inbox from all active modems and process responses."""
        try:
            async with await self.modem_pool.get_session() as session:
                # Get all enabled modems
                result = await session.execute(text("""
                    SELECT id FROM alarms_sms_modems
                    WHERE enabled = true AND health_status IN ('healthy', 'unknown')
                """))
                modem_ids = [row[0] for row in result.fetchall()]
            
            for modem_id in modem_ids:
                await self._poll_modem_inbox(modem_id)
        
        except Exception as e:
            logger.error(f"Error polling inboxes: {e}")
    
    async def _poll_modem_inbox(self, modem_id: int):
        """Poll inbox from specific modem."""
        try:
            client = await self.modem_pool.get_client(modem_id)
            if not client:
                return
            
            messages = await client.get_inbox()
            
            for msg in messages:
                # Process message
                matched = await self._process_inbox_message(msg.sender, msg.text)
                
                # Delete from modem inbox
                await client.delete_message(msg.message_id)
                
                if matched:
                    self.responses_matched += 1
        
        except Exception as e:
            logger.error(f"Error polling inbox for modem {modem_id}: {e}")
    
    async def _is_duplicate_sms(self, session, sim_no: str, message: str) -> bool:
        """
        Check if this SMS was already received within the last minute.
        
        Args:
            session: Database session
            sim_no: Sender phone number
            message: Message text
            
        Returns:
            True if duplicate, False otherwise
        """
        try:
            result = await session.execute(text("""
                SELECT 1 FROM command_history
                WHERE sim_no = :sim_no 
                  AND command_text = :message
                  AND direction = 'incoming'
                  AND created_at > NOW() - INTERVAL '1 minute'
                LIMIT 1
            """), {"sim_no": sim_no, "message": message})
            
            return result.fetchone() is not None
        except Exception as e:
            logger.error(f"Error checking duplicate SMS: {e}")
            return False
    
    async def _process_inbox_message(self, sender: str, msg_text: str) -> bool:
        """
        Process incoming SMS and try to match to sent command.
        
        Args:
            sender: Sender phone number
            msg_text: Message text
            
        Returns:
            True if matched to a sent command
        """
        try:
            async with await self.modem_pool.get_session() as session:
                # Check for duplicate (within 1 minute)
                if await self._is_duplicate_sms(session, sender, msg_text):
                    logger.debug(f"Skipping duplicate SMS from {sender}")
                    self.duplicates_skipped += 1
                    return False
                
                # Find unit by SIM to get IMEI
                unit_result = await session.execute(text(
                    "SELECT imei FROM unit WHERE sim_no = :sim_no LIMIT 1"
                ), {"sim_no": sender})
                unit_row = unit_result.fetchone()
                imei = unit_row[0] if unit_row else None
                
                # Insert into command_inbox
                await session.execute(text("""
                    INSERT INTO command_inbox (sim_no, imei, message_text, received_at)
                    VALUES (:sim_no, :imei, :msg_text, NOW())
                """), {"sim_no": sender, "imei": imei, "msg_text": msg_text})
                
                # Try to match to command_sent; naive UTC for TIMESTAMP binding
                timeout_threshold = (datetime.now(timezone.utc) - timedelta(minutes=self.reply_timeout_minutes)).replace(tzinfo=None)
                
                result = await session.execute(text("""
                    SELECT id, imei, command_text, config_id, user_id, sent_at
                    FROM command_sent
                    WHERE sim_no = :sim_no
                      AND send_method = 'sms'
                      AND status = 'sent'
                      AND sent_at > :threshold
                    ORDER BY sent_at DESC
                    LIMIT 1
                """), {"sim_no": sender, "threshold": timeout_threshold})
                row = result.fetchone()
                
                if row:
                    sent_id = row[0]
                    sent_imei = row[1]
                    sent_command = row[2]
                    sent_config_id = row[3]
                    sent_user_id = row[4]
                    sent_at = row[5]
                    
                    # Update command_sent status
                    await session.execute(text("""
                        UPDATE command_sent
                        SET status = 'successful', response_text = :response
                        WHERE id = :id
                    """), {"id": sent_id, "response": msg_text})
                    
                    # Update history to 'successful'
                    await session.execute(text("""
                        UPDATE command_history
                        SET status = 'successful'
                        WHERE sim_no = :sim_no 
                          AND direction = 'outgoing'
                          AND status = 'sent'
                          AND sent_at = :sent_at
                    """), {"sim_no": sender, "sent_at": sent_at})
                    
                    # Record incoming SMS in history
                    await session.execute(text("""
                        INSERT INTO command_history
                        (imei, sim_no, direction, command_text, config_id, status,
                         send_method, user_id, created_at)
                        VALUES (:imei, :sim_no, 'incoming', :msg_text, :config_id,
                                'received', 'sms', :user_id, NOW())
                    """), {
                        "imei": sent_imei or imei,
                        "sim_no": sender,
                        "msg_text": msg_text,
                        "config_id": sent_config_id,
                        "user_id": sent_user_id
                    })
                    
                    # Delete from command_sent (complete!)
                    await session.execute(text(
                        "DELETE FROM command_sent WHERE id = :id"
                    ), {"id": sent_id})
                    
                    await session.commit()
                    
                    logger.info(f"✓ Reply matched! {sender} → 'successful', sent cleaned")
                    return True
                else:
                    # No match - just record the incoming SMS in history
                    await session.execute(text("""
                        INSERT INTO command_history
                        (imei, sim_no, direction, command_text, status, created_at)
                        VALUES (:imei, :sim_no, 'incoming', :msg_text, 'received', NOW())
                    """), {"imei": imei, "sim_no": sender, "msg_text": msg_text})
                    
                    await session.commit()
                    logger.debug(f"Unmatched SMS from {sender}")
                    return False
        
        except Exception as e:
            logger.error(f"Error processing inbox message: {e}")
            return False
    
    async def _timeout_old_outbox_commands(self):
        """
        Mark old outbox commands as 'failed' (modem unavailable).
        Commands stuck in outbox for > outbox_timeout_minutes are marked failed.
        """
        try:
            async with await self.modem_pool.get_session() as session:
                # Find old outbox commands
                result = await session.execute(text(f"""
                    SELECT id, imei, sim_no, command_text, config_id, user_id, 
                           send_method, created_at, retry_count
                    FROM command_outbox
                    WHERE send_method = 'sms'
                      AND created_at < NOW() - INTERVAL '{self.outbox_timeout_minutes} minutes'
                """))
                old_commands = result.fetchall()
                
                for cmd in old_commands:
                    cmd_id, imei, sim_no, command_text, config_id, user_id, send_method, created_at, retry_count = cmd
                    
                    # Add to history as failed
                    await session.execute(text("""
                        INSERT INTO command_history 
                        (imei, sim_no, direction, command_text, config_id, status, 
                         send_method, user_id, created_at, sent_at)
                        VALUES (:imei, :sim_no, 'outgoing', :command_text, :config_id, 
                                'failed', :send_method, :user_id, :created_at, NOW())
                    """), {
                        'imei': imei,
                        'sim_no': sim_no,
                        'command_text': command_text,
                        'config_id': config_id,
                        'send_method': send_method or 'sms',
                        'user_id': user_id,
                        'created_at': created_at
                    })
                    
                    # Delete from outbox
                    await session.execute(text(
                        "DELETE FROM command_outbox WHERE id = :id"
                    ), {"id": cmd_id})
                    
                    self.commands_timed_out += 1
                    logger.warning(
                        f"Outbox timeout: command {cmd_id} to {sim_no} "
                        f"marked as 'failed' (modem unavailable for {self.outbox_timeout_minutes} min)"
                    )
                
                if old_commands:
                    await session.commit()
                    logger.info(f"Timed out {len(old_commands)} stuck outbox commands")
        
        except Exception as e:
            logger.error(f"Error timing out outbox commands: {e}")
    
    async def _timeout_old_sent_commands(self):
        """
        Mark old sent commands as 'no_reply' and clean up.
        Commands in sent with status='sent' for > reply_timeout_minutes are marked no_reply.
        """
        try:
            async with await self.modem_pool.get_session() as session:
                # Find old sent commands without reply
                result = await session.execute(text(f"""
                    SELECT id, imei, sim_no, sent_at
                    FROM command_sent
                    WHERE send_method = 'sms'
                      AND status = 'sent'
                      AND sent_at < NOW() - INTERVAL '{self.reply_timeout_minutes} minutes'
                """))
                old_sent = result.fetchall()
                
                for sent in old_sent:
                    sent_id, imei, sim_no, sent_at = sent
                    
                    # Update history to 'no_reply'
                    await session.execute(text("""
                        UPDATE command_history
                        SET status = 'no_reply'
                        WHERE sim_no = :sim_no 
                          AND direction = 'outgoing'
                          AND status = 'sent'
                          AND sent_at = :sent_at
                    """), {"sim_no": sim_no, "sent_at": sent_at})
                    
                    # Delete from sent
                    await session.execute(text(
                        "DELETE FROM command_sent WHERE id = :id"
                    ), {"id": sent_id})
                    
                    self.commands_timed_out += 1
                    logger.info(
                        f"Sent timeout: command to {sim_no} marked as 'no_reply' "
                        f"(no response after {self.reply_timeout_minutes} min)"
                    )
                
                if old_sent:
                    await session.commit()
                    logger.info(f"Timed out {len(old_sent)} sent commands with no reply")
        
        except Exception as e:
            logger.error(f"Error timing out sent commands: {e}")
    
    async def _maybe_cleanup(self):
        """Run timeout cleanup periodically."""
        now = datetime.now(timezone.utc)
        seconds_since_cleanup = (now - self.last_cleanup).total_seconds()
        
        if seconds_since_cleanup >= self.cleanup_interval_seconds:
            # Timeout stuck outbox commands (modem unavailable)
            await self._timeout_old_outbox_commands()
            # Timeout sent commands with no reply
            await self._timeout_old_sent_commands()
            self.last_cleanup = now
    
    async def _startup_cleanup(self):
        """Clean up any stuck commands from previous crash/shutdown."""
        logger.info("Cleaning up any stuck commands from previous session...")
        await self._timeout_old_outbox_commands()
        await self._timeout_old_sent_commands()
    
    async def run(self):
        """Main service loop."""
        logger.info("=" * 60)
        logger.info("SMS Gateway Service Starting...")
        logger.info("=" * 60)
        logger.info(
            f"Config: MAX_RETRIES={self.max_retries}, "
            f"OUTBOX_TIMEOUT={self.outbox_timeout_minutes}min, "
            f"REPLY_TIMEOUT={self.reply_timeout_minutes}min"
        )
        logger.info("Flow: outbox → sent+history → (reply) → successful")
        logger.info(
            f"Timeouts: outbox>{self.outbox_timeout_minutes}min → failed | "
            f"sent>{self.reply_timeout_minutes}min → no_reply"
        )
        
        self.running = True
        
        # Cleanup any stuck commands from previous crash/shutdown
        await self._startup_cleanup()
        
        inbox_poll_counter = 0
        inbox_poll_interval = 2  # Poll inbox every 2 iterations of outbox
        
        logger.info(f"Polling every {self.outbox_poll_interval} seconds...")
        
        while self.running:
            try:
                # Poll and send commands
                commands = await self._poll_outbox()
                for cmd in commands:
                    self.commands_processed += 1
                    await self._send_command(cmd)
                    # Small delay between sends
                    await asyncio.sleep(0.5)
                
                # Poll inbox less frequently
                inbox_poll_counter += 1
                if inbox_poll_counter >= inbox_poll_interval:
                    await self._poll_inbox_all_modems()
                    inbox_poll_counter = 0
                
                # Run periodic cleanup (timeout old commands)
                await self._maybe_cleanup()
                
                await asyncio.sleep(self.outbox_poll_interval)
            
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in SMS service loop: {e}", exc_info=True)
                await asyncio.sleep(self.outbox_poll_interval)
        
        logger.info(
            f"SMSService stopped - processed={self.commands_processed}, "
            f"sent={self.commands_sent}, failed={self.commands_failed}, "
            f"timed_out={self.commands_timed_out}, "
            f"responses_matched={self.responses_matched}, "
            f"duplicates_skipped={self.duplicates_skipped}"
        )
    
    def stop(self):
        """Stop the service."""
        self.running = False
