"""
RUT200 HTTP Client for Teltonika modems
Based on Teltonika RUT200 API documentation
Handles authentication, SMS sending, and inbox polling
"""
import aiohttp
import asyncio
import logging
import ssl
import hashlib
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


@dataclass
class ModemConfig:
    """Modem configuration from database."""
    id: int
    name: str
    host: str
    username: str
    password: str
    cert_fingerprint: Optional[str] = None
    modem_id: str = "1-1"


@dataclass
class SendSmsResult:
    """Result of SMS send operation."""
    success: bool
    modem_id: int
    modem_name: str
    message_id: Optional[str] = None
    error: Optional[str] = None
    sms_count: int = 1  # Number of SMS parts used (from API response)


@dataclass
class InboxMessage:
    """Message from modem inbox."""
    message_id: str
    sender: str
    text: str
    status: str
    modem_id: str
    received_at: datetime


class RUT200Client:
    """
    HTTP client for Teltonika RUT200 modem.
    
    API Endpoints (from Teltonika docs):
    - POST /api/login - Get auth token
    - GET /api/messages/status - Get ALL inbox messages
    - POST /api/messages/actions/send - Send SMS
    - POST /api/messages/actions/remove_messages - Delete messages
    - GET /api/messages/storage/status - Get storage capacity
    """
    
    def __init__(self, config: ModemConfig):
        """
        Initialize RUT200 client.
        
        Args:
            config: Modem configuration
        """
        self.config = config
        self._token: Optional[str] = None
        self._session: Optional[aiohttp.ClientSession] = None
        
        # Build base URL - normalize and add /api
        self.base_url = config.host.rstrip('/').rstrip('/api')
        if not self.base_url.startswith('http'):
            self.base_url = f"https://{self.base_url}"
        self.api_url = f"{self.base_url}/api"
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create HTTP session."""
        if self._session is None or self._session.closed:
            # Create SSL context - disable verification for self-signed certs
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            
            connector = aiohttp.TCPConnector(ssl=ssl_context)
            self._session = aiohttp.ClientSession(connector=connector)
        
        return self._session
    
    async def _login(self) -> bool:
        """
        Authenticate with the modem and get Bearer token.
        
        POST /api/login
        Request: { "username": "...", "password": "..." }
        Response: { "success": true, "data": { "token": "..." } }
        
        Returns:
            True if login successful
        """
        try:
            session = await self._get_session()
            
            url = f"{self.api_url}/login"
            payload = {
                "username": self.config.username,
                "password": self.config.password
            }
            
            async with session.post(url, json=payload, timeout=10) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    # Token is in data.token (Teltonika API format)
                    self._token = data.get('data', {}).get('token')
                    
                    if self._token:
                        logger.debug(f"Login successful for modem {self.config.name}")
                        return True
                    else:
                        logger.error(f"Login response missing token for {self.config.name}: {data}")
                        return False
                else:
                    text = await response.text()
                    logger.error(f"Login failed for {self.config.name}: {response.status} - {text}")
                    return False
        
        except Exception as e:
            logger.error(f"Login error for {self.config.name}: {type(e).__name__}: {e}")
            logger.debug(f"Login URL was: {url}, username: {self.config.username}")
            return False
    
    async def _ensure_authenticated(self) -> bool:
        """Ensure we have a valid auth token."""
        if self._token is None:
            return await self._login()
        return True
    
    def _get_headers(self) -> Dict[str, str]:
        """Get request headers with auth token."""
        headers = {
            "Content-Type": "application/json"
        }
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        return headers
    
    async def send_sms(self, phone_number: str, message: str) -> SendSmsResult:
        """
        Send SMS via modem.
        
        POST /api/messages/actions/send
        Request: { "data": { "number": "+...", "message": "...", "modem": "1-1" } }
        Response: { "success": true, "data": { "sms_used": 1 } }
        
        Args:
            phone_number: Destination phone number (with country code, e.g., +923001234567)
            message: SMS text content
            
        Returns:
            SendSmsResult with success status
        """
        try:
            if not await self._ensure_authenticated():
                return SendSmsResult(
                    success=False,
                    modem_id=self.config.id,
                    modem_name=self.config.name,
                    error="Authentication failed"
                )
            
            session = await self._get_session()
            
            url = f"{self.api_url}/messages/actions/send"
            payload = {
                "data": {
                    "number": phone_number,
                    "message": message,
                    "modem": self.config.modem_id
                }
            }
            
            async with session.post(url, json=payload, headers=self._get_headers(), timeout=30) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    if data.get('success'):
                        # Get SMS count from API response
                        sms_count = data.get('data', {}).get('sms_used', 1)
                        
                        logger.info(
                            f"SMS sent via {self.config.name}: "
                            f"to={phone_number}, sms_used={sms_count}"
                        )
                        
                        return SendSmsResult(
                            success=True,
                            modem_id=self.config.id,
                            modem_name=self.config.name,
                            sms_count=sms_count
                        )
                    else:
                        # API returned success=false
                        errors = data.get('errors', [])
                        error_msg = errors[0].get('error') if errors else 'Unknown error'
                        logger.error(f"SMS send failed: {error_msg}")
                        return SendSmsResult(
                            success=False,
                            modem_id=self.config.id,
                            modem_name=self.config.name,
                            error=error_msg
                        )
                elif response.status == 401:
                    # Token expired, try to re-login
                    self._token = None
                    if await self._login():
                        return await self.send_sms(phone_number, message)
                    else:
                        return SendSmsResult(
                            success=False,
                            modem_id=self.config.id,
                            modem_name=self.config.name,
                            error="Re-authentication failed"
                        )
                else:
                    text = await response.text()
                    logger.error(f"SMS send failed: {response.status} - {text}")
                    return SendSmsResult(
                        success=False,
                        modem_id=self.config.id,
                        modem_name=self.config.name,
                        error=f"HTTP {response.status}: {text[:100]}"
                    )
        
        except asyncio.TimeoutError:
            logger.error(f"SMS send timeout for {self.config.name}")
            return SendSmsResult(
                success=False,
                modem_id=self.config.id,
                modem_name=self.config.name,
                error="Timeout sending SMS"
            )
        except Exception as e:
            logger.error(f"SMS send error: {e}")
            return SendSmsResult(
                success=False,
                modem_id=self.config.id,
                modem_name=self.config.name,
                error=str(e)
            )
    
    async def get_inbox(self) -> List[InboxMessage]:
        """
        Get ALL messages from modem inbox.
        
        GET /api/messages/status
        Response: { 
            "success": true, 
            "data": [
                { "message": "...", "sender": "+...", "id": "1", 
                  "modem_id": "1-1", "status": "read/unread", "date": "..." }
            ] 
        }
        
        Returns:
            List of all inbox messages
        """
        try:
            if not await self._ensure_authenticated():
                logger.error(f"Cannot get inbox - authentication failed for {self.config.name}")
                return []
            
            session = await self._get_session()
            
            url = f"{self.api_url}/messages/status"
            
            async with session.get(url, headers=self._get_headers(), timeout=10) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    if not data.get('success'):
                        errors = data.get('errors', [])
                        # Empty errors with no data = no messages (not an error)
                        if errors:
                            logger.error(f"Get inbox API error: {errors}")
                        else:
                            logger.debug(f"No messages in inbox for {self.config.name}")
                        return []
                    
                    messages = []
                    for msg in data.get('data', []):
                        try:
                            # Parse date - Teltonika format may vary. Store as UTC (convention: backend UTC 0).
                            date_str = msg.get('date', '')
                            try:
                                dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                                received_at = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
                            except (ValueError, AttributeError):
                                received_at = datetime.now(timezone.utc)
                            
                            messages.append(InboxMessage(
                                message_id=str(msg.get('id', '')),
                                sender=msg.get('sender', ''),
                                text=msg.get('message', ''),
                                status=msg.get('status', 'unread'),
                                modem_id=msg.get('modem_id', self.config.modem_id),
                                received_at=received_at
                            ))
                        except Exception as e:
                            logger.warning(f"Error parsing inbox message: {e}, msg={msg}")
                    
                    if messages:
                        logger.debug(f"Found {len(messages)} message(s) in inbox for {self.config.name}")
                    
                    return messages
                elif response.status == 401:
                    # Token expired
                    self._token = None
                    if await self._login():
                        return await self.get_inbox()
                    return []
                else:
                    logger.error(f"Get inbox failed: {response.status}")
                    return []
        
        except asyncio.TimeoutError:
            logger.error(f"Get inbox timeout for {self.config.name}")
            return []
        except Exception as e:
            logger.error(f"Get inbox error: {e}")
            return []
    
    async def delete_messages(self, message_ids: List[str]) -> bool:
        """
        Delete one or more messages from modem inbox.
        
        POST /api/messages/actions/remove_messages
        Request: { "data": { "modem_id": "1-1", "sms_id": ["1", "2"] } }
        Response: { "success": true, "data": { "response": "..." } }
        
        Args:
            message_ids: List of message IDs to delete
            
        Returns:
            True if successful
        """
        if not message_ids:
            return True  # Nothing to delete
        
        try:
            if not await self._ensure_authenticated():
                return False
            
            session = await self._get_session()
            
            url = f"{self.api_url}/messages/actions/remove_messages"
            payload = {
                "data": {
                    "modem_id": self.config.modem_id,
                    "sms_id": message_ids
                }
            }
            
            async with session.post(url, json=payload, headers=self._get_headers(), timeout=10) as response:
                if response.status == 200:
                    data = await response.json()
                    success = data.get('success', False)
                    if success:
                        logger.debug(f"Deleted {len(message_ids)} message(s) from {self.config.name}")
                    else:
                        logger.warning(f"Failed to delete messages: {data.get('errors', [])}")
                    return success
                elif response.status == 401:
                    self._token = None
                    if await self._login():
                        return await self.delete_messages(message_ids)
                    return False
                else:
                    logger.warning(f"Failed to delete messages: {response.status}")
                    return False
        
        except Exception as e:
            logger.error(f"Delete messages error: {e}")
            return False
    
    async def delete_message(self, message_id: str) -> bool:
        """
        Delete a single message from modem inbox.
        Convenience wrapper around delete_messages.
        
        Args:
            message_id: Message ID to delete
            
        Returns:
            True if successful
        """
        return await self.delete_messages([message_id])
    
    async def health_check(self) -> bool:
        """
        Check if modem is healthy and responsive.
        Uses session/status endpoint (same as Alarm Service) - lighter than storage status.
        
        GET /api/session/status
        Response: { "success": true, ... }
        
        Returns:
            True if modem is healthy
        """
        try:
            # If we have a valid token, verify session is still alive
            if self._token:
                try:
                    session = await self._get_session()
                    url = f"{self.api_url}/session/status"
                    
                    async with session.get(url, headers=self._get_headers(), timeout=5) as response:
                        if response.status == 200:
                            data = await response.json()
                            if data.get('success'):
                                logger.debug(f"Session alive for {self.config.name}")
                                return True
                        
                        # Session expired on server side
                        if response.status == 401:
                            logger.debug(f"Session expired (401) for {self.config.name}")
                            self._token = None
                
                except asyncio.TimeoutError:
                    logger.debug(f"Session check timeout for {self.config.name}")
                    return False
                except Exception as e:
                    # Connection issues
                    if 'ECONNREFUSED' in str(e) or 'ETIMEDOUT' in str(e):
                        logger.warning(f"Connection failed for {self.config.name}: {e}")
                        return False
                    # Clear token on other errors
                    self._token = None
            
            # No valid token or session expired, try to login
            logger.debug(f"Attempting login for health check: {self.config.name}")
            return await self._login()
        
        except Exception as e:
            logger.error(f"Health check failed for {self.config.name}: {e}")
            return False
    
    async def get_storage_status(self) -> Optional[Dict[str, Any]]:
        """
        Get SMS storage status (capacity info).
        
        GET /api/messages/storage/status
        Response: { 
            "success": true, 
            "data": [{ 
                "used": "5", "total": "50", "storage_id": "SM",
                "sim_inserted": "1", "modem_id": "1-1", "modem_type": "Internal"
            }] 
        }
        
        Returns:
            Storage status dict or None if error
        """
        try:
            if not await self._ensure_authenticated():
                return None
            
            session = await self._get_session()
            
            url = f"{self.api_url}/messages/storage/status"
            
            async with session.get(url, headers=self._get_headers(), timeout=10) as response:
                if response.status == 200:
                    data = await response.json()
                    if data.get('success'):
                        return data
                    return None
                return None
        
        except Exception as e:
            logger.error(f"Get storage status error: {e}")
            return None
    
    async def close(self):
        """Close the HTTP session."""
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None
