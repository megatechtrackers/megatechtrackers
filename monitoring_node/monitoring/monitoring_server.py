"""
Monitoring HTTP Server for Megatechtrackers Fleet Tracking
Provides REST API endpoints and web dashboard for monitoring
Adapted for microservices architecture
"""
import logging
from typing import Optional
from datetime import datetime, timezone
from aiohttp import web
from aiohttp.web import Response

from monitoring.metrics_collector import MetricsCollector
from monitoring.auth_middleware import auth_middleware
from monitoring.dashboard_generator import get_dashboard_html
from monitoring.prometheus_formatter import format_prometheus_metrics

logger = logging.getLogger(__name__)


class MonitoringServer:
    """HTTP server for monitoring Megatechtrackers Fleet Tracking"""
    
    def __init__(self) -> None:
        """Initialize monitoring server"""
        self.app = web.Application()
        self.runner: Optional[web.AppRunner] = None
        self.site: Optional[web.TCPSite] = None
        self.metrics_collector = MetricsCollector()
        self._setup_routes()
    
    def _setup_routes(self) -> None:
        """Setup HTTP routes with authentication middleware"""
        # Add authentication middleware to all routes
        self.app.middlewares.append(auth_middleware)
        
        # Web dashboard (root)
        self.app.router.add_get('/', self.dashboard_handler)
        self.app.router.add_get('/dashboard', self.dashboard_handler)
        
        # API endpoints
        self.app.router.add_get('/health', self.health_handler)
        self.app.router.add_get('/status', self.status_handler)
        self.app.router.add_get('/metrics', self.metrics_handler)
        
        # Prometheus endpoint (conditional based on config)
        from config import Config
        monitoring_config = Config.load().get('monitoring', {})
        if monitoring_config.get('enable_prometheus', True):
            self.app.router.add_get('/metrics/prometheus', self.prometheus_handler)
        
        # Parser service metrics endpoint (for receiving metrics from parser services)
        self.app.router.add_post('/api/parser-nodes/metrics', self.receive_parser_node_metrics)
        self.app.router.add_get('/api/parser-nodes/status', self.get_parser_nodes_status)
    
    async def dashboard_handler(self, request: web.Request) -> Response:
        """Serve web dashboard HTML"""
        try:
            html_content = get_dashboard_html()
            return Response(text=html_content, content_type='text/html')
        except Exception as e:
            logger.error(f"Error serving dashboard: {e}", exc_info=True)
            return Response(text=f"Error loading dashboard: {e}", status=500)
    
    async def health_handler(self, request: web.Request) -> Response:
        """
        Enhanced health check endpoint with granular checks.
        Supports both liveness and readiness probes.
        Query params: ?type=liveness or ?type=readiness
        """
        try:
            check_type = request.query.get('type', 'readiness').lower()
            
            if check_type == 'liveness':
                # Liveness probe: Is the server running?
                return web.json_response({
                    "status": "alive",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }, status=200)
            
            # Readiness probe: Is the server ready to serve traffic?
            health_details = await self.metrics_collector.get_detailed_health_status()
            overall_status = health_details.get('status', 'unknown')
            
            response_data = {
                "status": overall_status,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "uptime_seconds": round(self.metrics_collector.get_uptime_seconds(), 2),
                "checks": health_details.get('checks', {})
            }
            
            # Return appropriate HTTP status code
            http_status = 200 if overall_status == "healthy" else (503 if overall_status == "unhealthy" else 200)
            
            return web.json_response(response_data, status=http_status)
        except Exception as e:
            logger.error(f"Error in health check: {e}", exc_info=True)
            return web.json_response({
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }, status=503)
    
    async def status_handler(self, request: web.Request) -> Response:
        """Comprehensive status endpoint"""
        try:
            metrics = await self.metrics_collector.get_all_metrics()
            return web.json_response(metrics)
        except Exception as e:
            logger.error(f"Error getting status: {e}", exc_info=True)
            return web.json_response({
                "error": str(e),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }, status=500)
    
    async def metrics_handler(self, request: web.Request) -> Response:
        """Detailed metrics endpoint"""
        try:
            metrics = await self.metrics_collector.get_all_metrics()
            return web.json_response(metrics)
        except Exception as e:
            logger.error(f"Error getting metrics: {e}", exc_info=True)
            return web.json_response({
                "error": str(e),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }, status=500)
    
    async def prometheus_handler(self, request: web.Request) -> Response:
        """Prometheus metrics endpoint"""
        try:
            metrics = await self.metrics_collector.get_all_metrics()
            # Pass per-node metrics for detailed monitoring
            # Use only active parser service metrics for Prometheus
            active_metrics = self.metrics_collector._get_active_parser_node_metrics()
            prometheus_text = format_prometheus_metrics(metrics, active_metrics)
            return Response(text=prometheus_text, content_type='text/plain')
        except Exception as e:
            logger.error(f"Error getting Prometheus metrics: {e}", exc_info=True)
            return Response(text=f"# Error: {e}\n", content_type='text/plain', status=500)
    
    async def receive_parser_node_metrics(self, request: web.Request) -> Response:
        """Receive metrics from parser services"""
        try:
            data = await request.json()
            node_id = data.get("node_id")
            if node_id:
                self.metrics_collector.update_parser_node_metrics(node_id, data)
                logger.debug(f"Received metrics from parser service: {node_id}")
                return web.json_response({"status": "received"})
            return web.json_response({"status": "error", "message": "Missing node_id"}, status=400)
        except Exception as e:
            logger.error(f"Error receiving parser service metrics: {e}", exc_info=True)
            return web.json_response({"status": "error", "message": str(e)}, status=500)
    
    async def get_parser_nodes_status(self, request: web.Request) -> Response:
        """Get status for all parser services"""
        try:
            # Get only active (non-stale) parser services
            active_metrics = self.metrics_collector._get_active_parser_node_metrics()
            nodes = []
            for node_id, metrics in active_metrics.items():
                active = metrics.get("active_connections", 0)
                max_conn = metrics.get("max_connections", 5000)
                utilization = (active / max_conn) * 100 if max_conn > 0 else 0
                
                # Check CPU and memory for status as well
                cpu_usage = metrics.get("cpu_usage", 0)
                memory_percent = metrics.get("memory_usage_percent", 0)
                
                # Determine status based on multiple factors
                if utilization >= 85 or cpu_usage >= 90 or memory_percent >= 90:
                    status = "critical"
                    recommendation = "add_node_immediately"
                elif utilization >= 70 or cpu_usage >= 75 or memory_percent >= 75:
                    status = "warning"
                    recommendation = "consider_adding_node"
                else:
                    status = "healthy"
                    recommendation = "healthy"
                
                nodes.append({
                    "node_id": node_id,
                    "vendor": metrics.get("vendor", "unknown"),
                    "status": status,
                    "load": {
                        "active_connections": active,
                        "total_connections": metrics.get("total_connections", 0),
                        "total_rejected": metrics.get("total_rejected", 0),
                        "max_connections": max_conn,
                        "connection_utilization": round(utilization, 2),
                        "messages_per_second": metrics.get("messages_per_second", 0),
                        "cpu_usage": cpu_usage,
                        "memory_usage_mb": metrics.get("memory_usage_mb", 0),
                        "memory_usage_percent": memory_percent,
                        "publish_success_rate": metrics.get("publish_success_rate", 100),
                        "error_rate": metrics.get("error_rate", 0),
                        "total_packets": metrics.get("total_packets", 0),
                        "total_records": metrics.get("total_records", 0),
                        "total_errors": metrics.get("total_errors", 0)
                    },
                    "capacity": {
                        "connections_remaining": max_conn - active,
                        "estimated_capacity_percent": round(utilization, 2),
                        "recommendation": recommendation
                    },
                    "last_updated": metrics.get("timestamp", datetime.now(timezone.utc).isoformat())
                })
            
            # Calculate summary
            total_nodes = len(nodes)
            healthy = sum(1 for n in nodes if n["status"] == "healthy")
            warning = sum(1 for n in nodes if n["status"] == "warning")
            critical = sum(1 for n in nodes if n["status"] == "critical")
            active_connections = sum(n["load"]["active_connections"] for n in nodes)
            total_handled = sum(n["load"]["total_connections"] for n in nodes)
            total_rejected = sum(n["load"]["total_rejected"] for n in nodes)
            total_capacity = sum(n["load"]["max_connections"] for n in nodes)
            overall_utilization = (active_connections / total_capacity * 100) if total_capacity > 0 else 0
            
            return web.json_response({
                "parser_nodes": nodes,
                "summary": {
                    "total_nodes": total_nodes,
                    "healthy_nodes": healthy,
                    "warning_nodes": warning,
                    "critical_nodes": critical,
                    "active_connections": active_connections,
                    "total_connections": total_handled,
                    "total_rejected": total_rejected,
                    "total_capacity": total_capacity,
                    "overall_utilization": round(overall_utilization, 2)
                }
            })
        except Exception as e:
            logger.error(f"Error getting parser services status: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)
    
    async def start(self, host: str = '0.0.0.0', port: int = 8080):
        """Start the monitoring server"""
        try:
            self.runner = web.AppRunner(self.app)
            await self.runner.setup()
            self.site = web.TCPSite(self.runner, host, port)
            await self.site.start()
            
            logger.info(f"Monitoring server started on http://{host}:{port}/")
            return True
        except Exception as e:
            logger.error(f"Error starting monitoring server: {e}", exc_info=True)
            return False
    
    async def stop(self) -> None:
        """Stop the monitoring server"""
        try:
            if self.site:
                await self.site.stop()
            if self.runner:
                await self.runner.cleanup()
            logger.info("Monitoring server stopped")
        except Exception as e:
            logger.error(f"Error stopping monitoring server: {e}", exc_info=True)
