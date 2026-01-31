"""
Codec 12 Response Handler - Updates command_sent when device responds
Handles GPRS command responses from Teltonika devices
"""
import asyncio
import logging
from datetime import datetime
from typing import Optional
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from teltonika_database.sqlalchemy_base import get_session, init_sqlalchemy
from teltonika_codec.models.codec12_response import Codec12Response

logger = logging.getLogger(__name__)


class Codec12ResponseHandler:
    """
    Handles Codec 12 command responses from Teltonika devices.
    
    When a device sends a Codec 12 response (Type=0x06), this handler:
    1. Finds the matching command in command_sent by IMEI
    2. Updates the status to 'successful'
    3. Stores the response text
    4. Records the response in command_history
    """
    
    _instance: Optional['Codec12ResponseHandler'] = None
    _initialized: bool = False
    
    def __init__(self):
        """Initialize the response handler."""
        self._db_initialized = False
        
        # Statistics
        self.total_responses = 0
        self.total_matched = 0
        self.total_unmatched = 0
        self.total_errors = 0
        
        logger.info("Codec12ResponseHandler initialized")
    
    @classmethod
    def get_instance(cls) -> 'Codec12ResponseHandler':
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = Codec12ResponseHandler()
        return cls._instance
    
    async def _ensure_db_initialized(self):
        """Ensure database connection is initialized."""
        if not self._db_initialized:
            try:
                await init_sqlalchemy()
                self._db_initialized = True
            except Exception as e:
                logger.error(f"Failed to initialize database: {e}")
                raise
    
    async def handle_response(self, imei: str, response: Codec12Response) -> bool:
        """
        Handle a Codec 12 response from a device.
        
        Args:
            imei: Device IMEI that sent the response
            response: Decoded Codec12Response object
            
        Returns:
            True if response was matched and processed, False otherwise
        """
        self.total_responses += 1
        
        try:
            await self._ensure_db_initialized()
            
            # Only handle response packets (Type=0x06)
            if not response.is_response:
                logger.debug(
                    f"Ignoring Codec 12 command packet (Type={response.response_type}) "
                    f"from IMEI={imei}"
                )
                return False
            
            response_text = response.response_text
            
            logger.info(
                f"Processing Codec 12 response from IMEI={imei}: "
                f"'{response_text[:100]}{'...' if len(response_text) > 100 else ''}'"
            )
            
            # Find and update matching command in command_sent
            matched = await self._update_command_sent(imei, response_text)
            
            if matched:
                self.total_matched += 1
                logger.info(
                    f"Codec 12 response matched and updated for IMEI={imei}"
                )
            else:
                self.total_unmatched += 1
                logger.warning(
                    f"No matching command_sent found for IMEI={imei} response"
                )
                # Still record the response in history as 'received'
                await self._record_unmatched_response(imei, response_text)
            
            return matched
        
        except Exception as e:
            self.total_errors += 1
            logger.error(
                f"Error handling Codec 12 response from IMEI={imei}: {e}",
                exc_info=True
            )
            return False
    
    async def _update_command_sent(self, imei: str, response_text: str) -> bool:
        """
        Update command_sent status when response received.
        
        Finds the most recent 'sent' command for this IMEI and updates it.
        
        Args:
            imei: Device IMEI
            response_text: Response text from device
            
        Returns:
            True if a matching command was found and updated
        """
        try:
            async with get_session() as session:
                # Find the most recent 'sent' command for this IMEI
                # GPRS responses come back on the same connection almost immediately,
                # so we match by IMEI and status='sent'
                result = await session.execute(
                    text("""
                    SELECT id, command_text, sim_no, config_id, user_id, created_at, sent_at
                    FROM command_sent
                    WHERE imei = :imei 
                      AND send_method = 'gprs'
                      AND status = 'sent'
                    ORDER BY sent_at DESC
                    LIMIT 1
                    """),
                    {"imei": imei}
                )
                row = result.fetchone()
                
                if not row:
                    return False
                
                command_id = row[0]
                command_text = row[1]
                sim_no = row[2]
                config_id = row[3]
                user_id = row[4]
                created_at = row[5]
                sent_at = row[6]
                
                # Delete from command_sent (completed successfully)
                # No need to update - just delete since we're done with it
                await session.execute(
                    text("DELETE FROM command_sent WHERE id = :id"),
                    {"id": command_id}
                )
                
                # Update command_history (outgoing) status
                await session.execute(
                    text("""
                    UPDATE command_history
                    SET status = 'successful'
                    WHERE imei = :imei 
                      AND direction = 'outgoing'
                      AND command_text = :command_text
                      AND send_method = 'gprs'
                      AND status = 'sent'
                    """),
                    {"imei": imei, "command_text": command_text}
                )
                
                # Insert incoming response into command_history
                await session.execute(
                    text("""
                    INSERT INTO command_history
                    (imei, sim_no, direction, command_text, config_id, status, 
                     send_method, user_id, created_at)
                    VALUES (:imei, :sim_no, 'incoming', :response_text, :config_id,
                            'received', 'gprs', :user_id, NOW())
                    """),
                    {
                        "imei": imei,
                        "sim_no": sim_no,
                        "response_text": response_text,
                        "config_id": config_id,
                        "user_id": user_id
                    }
                )
                
                await session.commit()
                
                logger.debug(
                    f"Updated command_sent id={command_id} to 'successful' "
                    f"for IMEI={imei}"
                )
                
                return True
        
        except SQLAlchemyError as e:
            logger.error(f"Database error updating command_sent: {e}")
            self.total_errors += 1
            return False
    
    async def _record_unmatched_response(self, imei: str, response_text: str):
        """
        Record an unmatched response in command_history.
        
        This handles cases where we receive a response but can't find
        a matching command (e.g., device sent unsolicited response).
        
        Args:
            imei: Device IMEI
            response_text: Response text from device
        """
        try:
            async with get_session() as session:
                # Try to get sim_no from unit table
                result = await session.execute(
                    text("SELECT sim_no FROM unit WHERE imei = :imei LIMIT 1"),
                    {"imei": imei}
                )
                row = result.fetchone()
                sim_no = row[0] if row else None
                
                # Insert into command_history as unmatched incoming
                await session.execute(
                    text("""
                    INSERT INTO command_history
                    (imei, sim_no, direction, command_text, status, send_method, created_at)
                    VALUES (:imei, :sim_no, 'incoming', :response_text, 'received', 
                            'gprs', NOW())
                    """),
                    {
                        "imei": imei,
                        "sim_no": sim_no,
                        "response_text": response_text
                    }
                )
                
                await session.commit()
                
                logger.debug(f"Recorded unmatched GPRS response from IMEI={imei}")
        
        except SQLAlchemyError as e:
            logger.error(f"Database error recording unmatched response: {e}")
            self.total_errors += 1
    
    def get_stats(self) -> dict:
        """Get handler statistics."""
        return {
            'total_responses': self.total_responses,
            'total_matched': self.total_matched,
            'total_unmatched': self.total_unmatched,
            'total_errors': self.total_errors
        }


# Async handler function for use with set_codec12_response_handler
async def handle_codec12_response(imei: str, response: Codec12Response) -> None:
    """
    Async handler function for Codec 12 responses.
    
    This function is registered with the packet parser via set_codec12_response_handler.
    
    Args:
        imei: Device IMEI
        response: Decoded Codec12Response
    """
    handler = Codec12ResponseHandler.get_instance()
    await handler.handle_response(imei, response)


def register_codec12_handler():
    """
    Register the Codec 12 response handler with the packet parser.
    
    Call this during parser service initialization.
    """
    from teltonika_parser.async_packet_parser import set_codec12_response_handler
    set_codec12_response_handler(handle_codec12_response)
    logger.info("Codec 12 response handler registered with packet parser")
