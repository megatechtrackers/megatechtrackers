"""
HTTP Health Check Server for Camera Parser
Provides /health and /metrics endpoints for Docker health checks and monitoring
"""
import asyncio
import logging
import json
from datetime import datetime, timezone
from typing import Optional, Callable, Dict, Any
from aiohttp import web

logger = logging.getLogger(__name__)


class HealthCheckServer:
    """
    HTTP server for health checks and metrics.
    
    Endpoints:
    - GET /health - Health check (returns 200 if healthy, 503 if unhealthy)
    - GET /health/live - Liveness probe (always 200 if server is running)
    - GET /health/ready - Readiness probe (200 if ready to serve, 503 if not)
    - GET /metrics - JSON metrics
    """
    
    def __init__(self, 
                 host: str = "0.0.0.0",
                 port: int = 8080,
                 metrics_callback: Optional[Callable[[], Dict[str, Any]]] = None,
                 health_callback: Optional[Callable[[], Dict[str, Any]]] = None):
        """
        Initialize health check server.
        
        Args:
            host: Host to bind to
            port: Port to listen on
            metrics_callback: Async function to get current metrics
            health_callback: Async function to get current health status
        """
        self.host = host
        self.port = port
        self._metrics_callback = metrics_callback
        self._health_callback = health_callback
        
        self._app: Optional[web.Application] = None
        self._runner: Optional[web.AppRunner] = None
        self._site: Optional[web.TCPSite] = None
        self._running = False
        
        # Health state
        self._is_ready = False
        self._start_time = datetime.now(timezone.utc)  # UTC consistent
    
    def set_ready(self, ready: bool = True):
        """Set readiness state"""
        self._is_ready = ready
    
    async def start(self):
        """Start the HTTP server"""
        if self._running:
            return
        
        self._app = web.Application()
        self._app.router.add_get('/health', self._handle_health)
        self._app.router.add_get('/health/live', self._handle_liveness)
        self._app.router.add_get('/health/ready', self._handle_readiness)
        self._app.router.add_get('/metrics', self._handle_metrics)
        self._app.router.add_get('/', self._handle_root)
        
        self._runner = web.AppRunner(self._app)
        await self._runner.setup()
        
        try:
            self._site = web.TCPSite(self._runner, self.host, self.port)
            await self._site.start()
            self._running = True
            logger.info(f"Health check server started on http://{self.host}:{self.port}")
        except Exception as e:
            logger.error(f"Failed to start health check server: {e}")
            await self._runner.cleanup()
            raise
    
    async def stop(self):
        """Stop the HTTP server"""
        if not self._running:
            return
        
        self._running = False
        
        if self._site:
            await self._site.stop()
        
        if self._runner:
            await self._runner.cleanup()
        
        logger.info("Health check server stopped")
    
    async def _handle_root(self, request: web.Request) -> web.Response:
        """Handle root endpoint - service info"""
        return web.json_response({
            "service": "camera-parser",
            "status": "running",
            "uptime_seconds": (datetime.now(timezone.utc) - self._start_time).total_seconds(),  # UTC consistent
            "endpoints": ["/health", "/health/live", "/health/ready", "/metrics"]
        })
    
    async def _handle_health(self, request: web.Request) -> web.Response:
        """
        Handle health check endpoint.
        Returns 200 if healthy, 503 if unhealthy.
        """
        health_data = await self._get_health_status()
        
        status = 200 if health_data.get('healthy', False) else 503
        
        return web.json_response(health_data, status=status)
    
    async def _handle_liveness(self, request: web.Request) -> web.Response:
        """
        Handle liveness probe.
        Always returns 200 if the server is running.
        """
        return web.json_response({
            "status": "alive",
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z"
        })
    
    async def _handle_readiness(self, request: web.Request) -> web.Response:
        """
        Handle readiness probe.
        Returns 200 if ready to serve traffic, 503 if not.
        """
        if not self._is_ready:
            return web.json_response({
                "status": "not_ready",
                "message": "Service is starting up"
            }, status=503)
        
        health_data = await self._get_health_status()
        
        # Consider ready if we have at least one healthy CMS server
        is_ready = health_data.get('cms_servers_healthy', 0) > 0
        
        if is_ready:
            return web.json_response({
                "status": "ready",
                "cms_servers_healthy": health_data.get('cms_servers_healthy', 0)
            })
        else:
            return web.json_response({
                "status": "not_ready",
                "message": "No healthy CMS servers",
                "cms_servers_healthy": 0,
                "cms_servers_unhealthy": health_data.get('cms_servers_unhealthy', 0)
            }, status=503)
    
    async def _handle_metrics(self, request: web.Request) -> web.Response:
        """Handle metrics endpoint - returns full metrics JSON"""
        if self._metrics_callback:
            try:
                metrics = await self._metrics_callback()
                return web.json_response(metrics)
            except Exception as e:
                logger.error(f"Error getting metrics: {e}")
                return web.json_response({"error": str(e)}, status=500)
        
        return web.json_response({
            "error": "Metrics not available",
            "uptime_seconds": (datetime.now(timezone.utc) - self._start_time).total_seconds()  # UTC consistent
        })
    
    async def _get_health_status(self) -> Dict[str, Any]:
        """Get current health status"""
        base_health = {
            "service": "camera-parser",
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            "uptime_seconds": (datetime.now(timezone.utc) - self._start_time).total_seconds(),  # UTC consistent
        }
        
        if self._health_callback:
            try:
                health_data = await self._health_callback()
                
                # Determine overall health
                cms_healthy = health_data.get('cms_servers_healthy', 0)
                cms_unhealthy = health_data.get('cms_servers_unhealthy', 0)
                errors = health_data.get('total_errors', 0)
                
                # Healthy if at least one CMS server is healthy and error rate is low
                total = cms_healthy + cms_unhealthy
                is_healthy = (cms_healthy > 0) if total > 0 else True
                
                base_health.update(health_data)
                base_health['healthy'] = is_healthy
                base_health['unhealthy_reason'] = None if is_healthy else "No healthy CMS servers"
                
            except Exception as e:
                logger.error(f"Error getting health status: {e}")
                base_health['healthy'] = False
                base_health['unhealthy_reason'] = f"Error getting health: {e}"
        else:
            base_health['healthy'] = True
            base_health['unhealthy_reason'] = None
        
        return base_health


# Global server instance
_health_server: Optional[HealthCheckServer] = None


async def start_health_server(
    port: int = 8080,
    metrics_callback: Optional[Callable] = None,
    health_callback: Optional[Callable] = None
) -> HealthCheckServer:
    """Start the global health check server"""
    global _health_server
    
    if _health_server is None:
        _health_server = HealthCheckServer(
            port=port,
            metrics_callback=metrics_callback,
            health_callback=health_callback
        )
    
    await _health_server.start()
    return _health_server


async def stop_health_server():
    """Stop the global health check server"""
    global _health_server
    
    if _health_server:
        await _health_server.stop()
        _health_server = None


def get_health_server() -> Optional[HealthCheckServer]:
    """Get the global health check server instance"""
    return _health_server
