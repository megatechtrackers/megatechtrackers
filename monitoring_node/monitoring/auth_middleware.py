"""
Authentication middleware for monitoring endpoints
"""
import os
import hmac
import logging
from aiohttp import web

logger = logging.getLogger(__name__)


def constant_time_compare(a: str, b: str) -> bool:
    """
    Constant-time string comparison to prevent timing attacks.
    
    Args:
        a: First string to compare
        b: Second string to compare
        
    Returns:
        True if strings are equal, False otherwise
    """
    if not a or not b:
        return False
    return hmac.compare_digest(a.encode('utf-8'), b.encode('utf-8'))


@web.middleware
async def auth_middleware(request: web.Request, handler):
    """
    Authentication middleware for monitoring endpoints.
    Supports API key authentication via X-API-Key header or MONITORING_API_KEY env var.
    If no API key is set, allows access (backward compatibility).
    
    Note: Prometheus metrics endpoint (/metrics/prometheus) is excluded from authentication
    to allow Prometheus scraping without credentials.
    """
    # Skip authentication for Prometheus metrics endpoint (standard practice)
    if request.path == '/metrics/prometheus':
        return await handler(request)
    
    # Get API key from environment variable
    required_api_key = os.getenv('MONITORING_API_KEY')
    
    # If no API key is configured, allow access (backward compatibility)
    if not required_api_key:
        return await handler(request)
    
    # Check for API key in header
    provided_api_key = request.headers.get('X-API-Key') or request.headers.get('Authorization', '').replace('Bearer ', '')
    
    # Also check query parameter for convenience (less secure, but useful for testing)
    if not provided_api_key:
        provided_api_key = request.query.get('api_key', '')
        if provided_api_key:
            logger.warning(
                f"API key provided via query parameter (less secure) from {request.remote}. "
                "Consider using X-API-Key header instead."
            )
    
    # Use constant-time comparison to prevent timing attacks
    if not constant_time_compare(provided_api_key, required_api_key):
        logger.warning(f"Unauthorized access attempt to {request.path} from {request.remote}")
        return web.json_response({
            'error': 'Unauthorized',
            'message': 'Valid API key required. Set X-API-Key header or MONITORING_API_KEY environment variable.'
        }, status=401)
    
    return await handler(request)
