#!/usr/bin/env python3
"""
Mock SMS Server - Simulates an SMS API for testing alarm notifications.

This server:
- Accepts SMS API requests (POST /sms/send) - Legacy format
- Accepts Teltonika RUT200 API requests - For testing real modem client code
  * POST /api/login - Get authentication token
  * POST /api/messages/actions/send - Send SMS via Teltonika format
- Logs all SMS messages with details
- Returns configurable responses (success/failure)
- Provides a web UI to view sent messages
- Exposes metrics for monitoring

Environment Variables:
- PORT: Server port (default: 8086)
- LOG_LEVEL: Logging level (default: INFO)
- SIMULATE_FAILURES: Percentage of requests to fail (default: 0)
- FAILURE_RATE_LIMIT: Simulate rate limiting after N messages (default: 0 = disabled)
"""

import os
import json
import logging
import asyncio
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict
from collections import deque

from aiohttp import web
import aiohttp_cors

# Configuration
PORT = int(os.environ.get('PORT', 8086))
LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO').upper()
SIMULATE_FAILURES = float(os.environ.get('SIMULATE_FAILURES', 0)) / 100  # Convert percentage
FAILURE_RATE_LIMIT = int(os.environ.get('FAILURE_RATE_LIMIT', 0))  # 0 = disabled
MAX_HISTORY = int(os.environ.get('MAX_HISTORY', 1000))

# Configure logging
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('MockSMSServer')


@dataclass
class SMSMessage:
    """Represents a sent SMS message."""
    id: str
    to: str
    from_sender: str
    message: str
    received_at: str
    status: str
    api_key: str
    request_headers: Dict[str, str]
    response_code: int
    error_message: Optional[str] = None


class SMSStore:
    """In-memory store for SMS messages."""
    
    def __init__(self, max_size: int = MAX_HISTORY):
        self.messages: deque = deque(maxlen=max_size)
        self.stats = {
            'total_received': 0,
            'total_success': 0,
            'total_failed': 0,
            'total_rate_limited': 0,
            'by_recipient': {},
            'by_sender': {},
        }
        self.rate_limit_counter = 0
    
    def add(self, msg: SMSMessage) -> None:
        """Add a message to the store."""
        self.messages.appendleft(msg)
        self.stats['total_received'] += 1
        
        if msg.status == 'success':
            self.stats['total_success'] += 1
        elif msg.status == 'rate_limited':
            self.stats['total_rate_limited'] += 1
        else:
            self.stats['total_failed'] += 1
        
        # Track by recipient
        if msg.to not in self.stats['by_recipient']:
            self.stats['by_recipient'][msg.to] = 0
        self.stats['by_recipient'][msg.to] += 1
        
        # Track by sender
        if msg.from_sender not in self.stats['by_sender']:
            self.stats['by_sender'][msg.from_sender] = 0
        self.stats['by_sender'][msg.from_sender] += 1
    
    def get_all(self, limit: int = 100) -> List[Dict]:
        """Get all messages as dicts."""
        return [asdict(m) for m in list(self.messages)[:limit]]
    
    def get_by_recipient(self, phone: str, limit: int = 50) -> List[Dict]:
        """Get messages for a specific recipient."""
        return [asdict(m) for m in self.messages if m.to == phone][:limit]
    
    def get_stats(self) -> Dict:
        """Get statistics."""
        return {
            **self.stats,
            'messages_in_store': len(self.messages),
            'max_store_size': self.messages.maxlen,
        }
    
    def clear(self) -> int:
        """Clear all messages. Returns count cleared."""
        count = len(self.messages)
        self.messages.clear()
        self.rate_limit_counter = 0
        return count
    
    def check_rate_limit(self) -> bool:
        """Check if rate limit should be applied."""
        if FAILURE_RATE_LIMIT <= 0:
            return False
        self.rate_limit_counter += 1
        return self.rate_limit_counter > FAILURE_RATE_LIMIT


# Global store
sms_store = SMSStore()

# Token storage for Teltonika API (simple in-memory for mock)
mock_tokens = set()


# === HTTP Handlers ===

async def handle_send_sms(request: web.Request) -> web.Response:
    """
    Handle SMS send request.
    
    Expected POST body:
    {
        "to": "+1234567890",
        "from": "SenderName",
        "message": "Hello world"
    }
    """
    import random
    
    try:
        # Parse request
        body = await request.json()
        
        to = body.get('to', '')
        from_sender = body.get('from', 'Unknown')
        message = body.get('message', '')
        
        # Get authorization header
        auth_header = request.headers.get('Authorization', '')
        api_key = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else auth_header
        
        # Capture headers (for debugging)
        headers_dict = dict(request.headers)
        
        # Validate required fields
        if not to:
            error_msg = "Missing required field: 'to'"
            sms_msg = SMSMessage(
                id=str(uuid.uuid4()),
                to=to,
                from_sender=from_sender,
                message=message,
                received_at=datetime.now(timezone.utc).isoformat() + 'Z',
                status='failed',
                api_key=api_key[:8] + '...' if len(api_key) > 8 else api_key,
                request_headers={'Content-Type': headers_dict.get('Content-Type', '')},
                response_code=400,
                error_message=error_msg
            )
            sms_store.add(sms_msg)
            logger.warning(f"❌ SMS validation failed: {error_msg}")
            return web.json_response({'error': error_msg, 'code': 'VALIDATION_ERROR'}, status=400)
        
        if not message:
            error_msg = "Missing required field: 'message'"
            sms_msg = SMSMessage(
                id=str(uuid.uuid4()),
                to=to,
                from_sender=from_sender,
                message=message,
                received_at=datetime.now(timezone.utc).isoformat() + 'Z',
                status='failed',
                api_key=api_key[:8] + '...' if len(api_key) > 8 else api_key,
                request_headers={'Content-Type': headers_dict.get('Content-Type', '')},
                response_code=400,
                error_message=error_msg
            )
            sms_store.add(sms_msg)
            logger.warning(f"❌ SMS validation failed: {error_msg}")
            return web.json_response({'error': error_msg, 'code': 'VALIDATION_ERROR'}, status=400)
        
        # Check rate limit
        if sms_store.check_rate_limit():
            sms_msg = SMSMessage(
                id=str(uuid.uuid4()),
                to=to,
                from_sender=from_sender,
                message=message,
                received_at=datetime.now(timezone.utc).isoformat() + 'Z',
                status='rate_limited',
                api_key=api_key[:8] + '...' if len(api_key) > 8 else api_key,
                request_headers={'Content-Type': headers_dict.get('Content-Type', '')},
                response_code=429,
                error_message='Rate limit exceeded'
            )
            sms_store.add(sms_msg)
            logger.warning(f"⚠️ SMS rate limited: to={to}")
            return web.json_response({
                'error': 'Rate limit exceeded',
                'code': 'RATE_LIMIT',
                'retry_after': 60
            }, status=429)
        
        # Simulate random failures
        if random.random() < SIMULATE_FAILURES:
            error_msg = 'Simulated provider error'
            sms_msg = SMSMessage(
                id=str(uuid.uuid4()),
                to=to,
                from_sender=from_sender,
                message=message,
                received_at=datetime.now(timezone.utc).isoformat() + 'Z',
                status='failed',
                api_key=api_key[:8] + '...' if len(api_key) > 8 else api_key,
                request_headers={'Content-Type': headers_dict.get('Content-Type', '')},
                response_code=500,
                error_message=error_msg
            )
            sms_store.add(sms_msg)
            logger.error(f"❌ SMS simulated failure: to={to}")
            return web.json_response({'error': error_msg, 'code': 'PROVIDER_ERROR'}, status=500)
        
        # Success!
        message_id = str(uuid.uuid4())
        sms_msg = SMSMessage(
            id=message_id,
            to=to,
            from_sender=from_sender,
            message=message,
            received_at=datetime.now(timezone.utc).isoformat() + 'Z',
            status='success',
            api_key=api_key[:8] + '...' if len(api_key) > 8 else api_key,
            request_headers={'Content-Type': headers_dict.get('Content-Type', '')},
            response_code=200,
        )
        sms_store.add(sms_msg)
        
        # Log the SMS
        logger.info(f"📱 SMS RECEIVED: to={to}, from={from_sender}, length={len(message)}")
        logger.debug(f"   Message: {message[:100]}{'...' if len(message) > 100 else ''}")
        
        return web.json_response({
            'success': True,
            'message_id': message_id,
            'to': to,
            'status': 'queued',
            'segments': (len(message) // 160) + 1
        })
    
    except json.JSONDecodeError:
        logger.error("❌ Invalid JSON in request body")
        return web.json_response({'error': 'Invalid JSON', 'code': 'PARSE_ERROR'}, status=400)
    except Exception as e:
        logger.exception(f"❌ Unexpected error: {e}")
        return web.json_response({'error': str(e), 'code': 'INTERNAL_ERROR'}, status=500)


async def handle_health(request: web.Request) -> web.Response:
    """Health check endpoint."""
    return web.json_response({
        'status': 'healthy',
        'service': 'mock-sms-server',
        'timestamp': datetime.now(timezone.utc).isoformat() + 'Z'
    })


async def handle_teltonika_session_status(request: web.Request) -> web.Response:
    """Teltonika API session status endpoint - used for health checks."""
    # Check if token is provided
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else ''
    
    if not token:
        return web.json_response({'success': False, 'error': 'Unauthorized'}, status=401)
    
    # For mock, any token is valid (we don't validate tokens in mock mode)
    # Return success to indicate session is alive
    return web.json_response({
        'success': True,
        'data': {
            'session': 'active',
            'expires_in': 3600
        }
    })


async def handle_get_messages(request: web.Request) -> web.Response:
    """Get all SMS messages."""
    limit = int(request.query.get('limit', 100))
    messages = sms_store.get_all(limit)
    return web.json_response({
        'count': len(messages),
        'messages': messages
    })


async def handle_get_messages_by_recipient(request: web.Request) -> web.Response:
    """Get SMS messages for a specific recipient."""
    phone = request.match_info.get('phone', '')
    limit = int(request.query.get('limit', 50))
    messages = sms_store.get_by_recipient(phone, limit)
    return web.json_response({
        'recipient': phone,
        'count': len(messages),
        'messages': messages
    })


async def handle_get_stats(request: web.Request) -> web.Response:
    """Get SMS statistics."""
    return web.json_response(sms_store.get_stats())


async def handle_clear_messages(request: web.Request) -> web.Response:
    """Clear all messages."""
    count = sms_store.clear()
    logger.info(f"🗑️ Cleared {count} messages from store")
    return web.json_response({
        'cleared': count,
        'message': f'Cleared {count} messages'
    })


async def handle_alertmanager_webhook(request: web.Request) -> web.Response:
    """
    Handle Alertmanager webhook for system alerts.
    Converts Alertmanager alerts to SMS messages.
    
    Expected POST body (Alertmanager format):
    {
        "status": "firing" | "resolved",
        "alerts": [
            {
                "status": "firing",
                "labels": {"alertname": "...", "severity": "..."},
                "annotations": {"summary": "...", "description": "..."},
                "startsAt": "...",
                "endsAt": "..."
            }
        ]
    }
    """
    try:
        body = await request.json()
        
        status = body.get('status', 'unknown')
        alerts = body.get('alerts', [])
        
        logger.info(f"📟 ALERTMANAGER WEBHOOK: status={status}, alerts={len(alerts)}")
        
        # Process each alert and create SMS
        sms_count = 0
        for alert in alerts:
            alert_status = alert.get('status', 'unknown')
            labels = alert.get('labels', {})
            annotations = alert.get('annotations', {})
            
            alertname = labels.get('alertname', 'Unknown Alert')
            severity = labels.get('severity', 'unknown')
            summary = annotations.get('summary', 'No summary')
            description = annotations.get('description', '')
            
            # Format SMS message
            status_emoji = '🔴' if alert_status == 'firing' else '✅'
            severity_emoji = '🚨' if severity == 'critical' else '⚠️'
            
            message = f"{status_emoji} {severity_emoji} [{alert_status.upper()}] {alertname}\n"
            message += f"Severity: {severity}\n"
            message += f"Summary: {summary}\n"
            if description:
                message += f"Details: {description[:100]}"
            
            # Create SMS record
            message_id = str(uuid.uuid4())
            sms_msg = SMSMessage(
                id=message_id,
                to='+15550000001',  # Default alert recipient
                from_sender='AlertManager',
                message=message,
                received_at=datetime.now(timezone.utc).isoformat() + 'Z',
                status='success',
                api_key='alertmanager-webhook',
                request_headers={'Source': 'AlertManager'},
                response_code=200
            )
            sms_store.add(sms_msg)
            sms_count += 1
            
            logger.info(f"📟 SYSTEM ALERT SMS: {alertname} ({severity}) - {alert_status}")
        
        return web.json_response({
            'success': True,
            'processed': sms_count,
            'status': status
        })
        
    except json.JSONDecodeError:
        logger.error("❌ Invalid JSON in alertmanager webhook")
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        logger.exception(f"❌ Error processing alertmanager webhook: {e}")
        return web.json_response({'error': str(e)}, status=500)


async def handle_web_ui(request: web.Request) -> web.Response:
    """Serve a modern web UI for viewing SMS messages (Monitoring style)."""
    try:
        from dashboard_generator import get_dashboard_html
        html = get_dashboard_html()
        return web.Response(text=html, content_type='text/html')
    except Exception as e:
        logger.warning(f"Failed to load dashboard generator: {e}")
        # Fallback to simple error message
        return web.Response(
            text=f"<html><body><h1>Error loading dashboard</h1><p>{str(e)}</p></body></html>",
            content_type='text/html',
            status=500
        )


# === Teltonika RUT200 API Handlers ===

async def handle_teltonika_login(request: web.Request) -> web.Response:
    """
    Handle Teltonika RUT200 API login.
    
    Expected POST body:
    {
        "username": "admin",
        "password": "password"
    }
    
    Response:
    {
        "success": true,
        "data": {
            "token": "mock-token-12345"
        }
    }
    """
    try:
        body = await request.json()
        username = body.get('username', '')
        password = body.get('password', '')
        
        # Mock accepts any credentials
        if username and password:
            # Generate a mock token
            token = f"mock-token-{uuid.uuid4().hex[:16]}"
            mock_tokens.add(token)
            
            logger.info(f"🔐 Teltonika API Login: username={username}")
            
            return web.json_response({
                'success': True,
                'data': {
                    'token': token
                }
            })
        else:
            logger.warning("❌ Teltonika API login failed: missing credentials")
            return web.json_response({
                'success': False,
                'error': 'Missing username or password'
            }, status=400)
            
    except json.JSONDecodeError:
        logger.error("❌ Invalid JSON in teltonika login request")
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        logger.exception(f"❌ Error in teltonika login: {e}")
        return web.json_response({'error': str(e)}, status=500)


async def handle_teltonika_send_sms(request: web.Request) -> web.Response:
    """
    Handle Teltonika RUT200 API SMS send.
    
    Expected POST body:
    {
        "data": {
            "number": "+1234567890",
            "message": "Hello world",
            "modem": "1-1"
        }
    }
    
    Response:
    {
        "success": true,
        "data": {
            "sms_used": 1
        }
    }
    """
    import random
    
    try:
        # Check authorization
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            logger.warning("❌ Teltonika API: Missing Bearer token")
            return web.json_response({
                'success': False,
                'error': 'Missing or invalid Authorization header'
            }, status=401)
        
        token = auth_header.replace('Bearer ', '')
        
        # For mock, we accept any token (in production, check mock_tokens)
        # if token not in mock_tokens:
        #     return web.json_response({'success': False, 'error': 'Invalid token'}, status=401)
        
        # Parse request
        body = await request.json()
        data = body.get('data', {})
        
        number = data.get('number', '')
        message = data.get('message', '')
        modem = data.get('modem', '1-1')
        
        # Get headers (for debugging)
        headers_dict = dict(request.headers)
        
        # Validate required fields
        if not number:
            error_msg = "Missing required field: 'number'"
            sms_msg = SMSMessage(
                id=str(uuid.uuid4()),
                to=number,
                from_sender=f'Teltonika-{modem}',
                message=message,
                received_at=datetime.now(timezone.utc).isoformat() + 'Z',
                status='failed',
                api_key='teltonika-api',
                request_headers={'API': 'Teltonika'},
                response_code=422,
                error_message=error_msg
            )
            sms_store.add(sms_msg)
            logger.warning(f"❌ Teltonika API validation failed: {error_msg}")
            return web.json_response({
                'success': False,
                'errors': [{
                    'code': 422,
                    'error': error_msg,
                    'source': 'number',
                    'section': 'data'
                }]
            }, status=422)
        
        if not message:
            error_msg = "Missing required field: 'message'"
            sms_msg = SMSMessage(
                id=str(uuid.uuid4()),
                to=number,
                from_sender=f'Teltonika-{modem}',
                message=message,
                received_at=datetime.now(timezone.utc).isoformat() + 'Z',
                status='failed',
                api_key='teltonika-api',
                request_headers={'API': 'Teltonika'},
                response_code=422,
                error_message=error_msg
            )
            sms_store.add(sms_msg)
            logger.warning(f"❌ Teltonika API validation failed: {error_msg}")
            return web.json_response({
                'success': False,
                'errors': [{
                    'code': 422,
                    'error': error_msg,
                    'source': 'message',
                    'section': 'data'
                }]
            }, status=422)
        
        # Check rate limit
        if sms_store.check_rate_limit():
            sms_msg = SMSMessage(
                id=str(uuid.uuid4()),
                to=number,
                from_sender=f'Teltonika-{modem}',
                message=message,
                received_at=datetime.now(timezone.utc).isoformat() + 'Z',
                status='rate_limited',
                api_key='teltonika-api',
                request_headers={'API': 'Teltonika'},
                response_code=429,
                error_message='Rate limit exceeded'
            )
            sms_store.add(sms_msg)
            logger.warning(f"⚠️ Teltonika API rate limited: to={number}")
            return web.json_response({
                'success': False,
                'errors': [{
                    'code': 429,
                    'error': 'Rate limit exceeded',
                    'source': 'modem',
                    'section': 'data'
                }]
            }, status=429)
        
        # Simulate random failures
        if random.random() < SIMULATE_FAILURES:
            error_msg = 'Simulated modem error'
            sms_msg = SMSMessage(
                id=str(uuid.uuid4()),
                to=number,
                from_sender=f'Teltonika-{modem}',
                message=message,
                received_at=datetime.now(timezone.utc).isoformat() + 'Z',
                status='failed',
                api_key='teltonika-api',
                request_headers={'API': 'Teltonika'},
                response_code=500,
                error_message=error_msg
            )
            sms_store.add(sms_msg)
            logger.error(f"❌ Teltonika API simulated failure: to={number}")
            return web.json_response({
                'success': False,
                'errors': [{
                    'code': 500,
                    'error': error_msg,
                    'source': 'modem',
                    'section': 'internal'
                }]
            }, status=500)
        
        # Success!
        message_id = str(uuid.uuid4())
        sms_msg = SMSMessage(
            id=message_id,
            to=number,
            from_sender=f'Teltonika-{modem}',
            message=message,
            received_at=datetime.now(timezone.utc).isoformat() + 'Z',
            status='success',
            api_key='teltonika-api',
            request_headers={'API': 'Teltonika'},
            response_code=200,
        )
        sms_store.add(sms_msg)
        
        # Calculate SMS segments (160 chars for GSM, 70 for Unicode)
        has_unicode = any(ord(c) > 127 for c in message)
        segment_size = 70 if has_unicode else 160
        sms_used = (len(message) + segment_size - 1) // segment_size
        
        # Log the SMS
        logger.info(f"📱 Teltonika API SMS: to={number}, modem={modem}, length={len(message)}, segments={sms_used}")
        logger.debug(f"   Message: {message[:100]}{'...' if len(message) > 100 else ''}")
        
        return web.json_response({
            'success': True,
            'data': {
                'sms_used': sms_used
            }
        })
    
    except json.JSONDecodeError:
        logger.error("❌ Invalid JSON in teltonika send request")
        return web.json_response({'success': False, 'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        logger.exception(f"❌ Unexpected error in teltonika send: {e}")
        return web.json_response({'success': False, 'error': str(e)}, status=500)


def create_app() -> web.Application:
    """Create and configure the aiohttp application."""
    app = web.Application()
    
    # Setup CORS
    cors = aiohttp_cors.setup(app, defaults={
        "*": aiohttp_cors.ResourceOptions(
            allow_credentials=True,
            expose_headers="*",
            allow_headers="*",
            allow_methods="*"
        )
    })
    
    # Add routes
    routes = [
        # SMS API endpoints (Legacy format)
        web.post('/sms/send', handle_send_sms),
        web.post('/api/sms/send', handle_send_sms),  # Alternative path
        
        # Teltonika RUT200 API endpoints (New format for real modem testing)
        web.post('/api/login', handle_teltonika_login),
        web.post('/api/messages/actions/send', handle_teltonika_send_sms),
        web.get('/api/session/status', handle_teltonika_session_status),
        web.get('/session/status', handle_teltonika_session_status),  # Also support without /api prefix
        
        # Alertmanager webhook (for system alerts)
        web.post('/alertmanager/webhook', handle_alertmanager_webhook),
        web.post('/api/alertmanager/webhook', handle_alertmanager_webhook),
        
        # Health check
        web.get('/health', handle_health),
        web.get('/api/health', handle_health),
        
        # Message viewing
        web.get('/api/messages', handle_get_messages),
        web.get('/api/messages/{phone}', handle_get_messages_by_recipient),
        web.delete('/api/messages', handle_clear_messages),
        
        # Stats
        web.get('/api/stats', handle_get_stats),
        
        # Web UI
        web.get('/', handle_web_ui),
    ]
    
    for route in routes:
        cors.add(app.router.add_route(route.method, route.path, route.handler))
    
    return app


async def main():
    """Main entry point."""
    logger.info("=" * 60)
    logger.info("  Mock SMS Server Starting")
    logger.info("=" * 60)
    logger.info(f"  Port: {PORT}")
    logger.info(f"  Simulate Failures: {SIMULATE_FAILURES * 100:.1f}%")
    logger.info(f"  Rate Limit After: {FAILURE_RATE_LIMIT or 'Disabled'} messages")
    logger.info(f"  Max History: {MAX_HISTORY} messages")
    logger.info("=" * 60)
    
    app = create_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', PORT)
    await site.start()
    
    logger.info(f"🚀 Mock SMS Server running on http://0.0.0.0:{PORT}")
    logger.info(f"📊 Web UI: http://localhost:{PORT}/")
    logger.info(f"📱 Legacy SMS API: POST http://localhost:{PORT}/sms/send")
    logger.info(f"📱 Teltonika API: POST http://localhost:{PORT}/api/login + /api/messages/actions/send")
    
    # Keep running
    try:
        while True:
            await asyncio.sleep(3600)
    except asyncio.CancelledError:
        logger.info("Shutting down...")
        await runner.cleanup()


if __name__ == '__main__':
    asyncio.run(main())
