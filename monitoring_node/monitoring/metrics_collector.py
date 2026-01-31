"""
Metrics Collector for Megatechtrackers Fleet Tracking
Collects system and gateway metrics for monitoring
Adapted for microservices architecture
"""
import logging
import psutil
import time
from typing import Dict, Any, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class MetricsCollector:
    """Collects metrics from system and gateway components"""
    
    def __init__(self):
        """Initialize metrics collector"""
        self.start_time = time.time()
        self._last_system_metrics = None
        self._last_system_metrics_time = 0
        self._metrics_cache_ttl = 1.0  # Cache system metrics for 1 second
        
        # Store parser service metrics (received via API)
        self.parser_node_metrics: Dict[str, Dict[str, Any]] = {}
        # Track last update time for each node to detect stale entries
        self.parser_node_last_update: Dict[str, float] = {}
        # Stale timeout: remove nodes that haven't reported in 45 seconds (4.5x default report interval)
        # This gives buffer for network delays and processing time
        self.parser_node_stale_timeout = 45.0
        
    def get_uptime_seconds(self) -> float:
        """Get server uptime in seconds"""
        return time.time() - self.start_time
    
    def get_system_metrics(self) -> Dict[str, Any]:
        """Get system metrics (CPU, RAM, disk)"""
        try:
            # Cache system metrics to avoid excessive calls
            now = time.time()
            if self._last_system_metrics and (now - self._last_system_metrics_time) < self._metrics_cache_ttl:
                return self._last_system_metrics
            
            cpu_percent = psutil.cpu_percent(interval=0.1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            # Get load average (Unix only)
            try:
                load_avg = list(psutil.getloadavg())
            except AttributeError:
                # Windows doesn't have load average
                load_avg = [0.0, 0.0, 0.0]
            
            metrics = {
                "cpu_percent": round(cpu_percent, 2),
                "memory_percent": round(memory.percent, 2),
                "memory_used_mb": round(memory.used / (1024 * 1024), 2),
                "memory_total_mb": round(memory.total / (1024 * 1024), 2),
                "memory_available_mb": round(memory.available / (1024 * 1024), 2),
                "memory_used_bytes": memory.used,
                "memory_total_bytes": memory.total,
                "disk_usage_percent": round(disk.percent, 2),
                "disk_used_gb": round(disk.used / (1024 * 1024 * 1024), 2),
                "disk_total_gb": round(disk.total / (1024 * 1024 * 1024), 2),
                "load_average": load_avg
            }
            
            self._last_system_metrics = metrics
            self._last_system_metrics_time = now
            return metrics
        except Exception as e:
            logger.error(f"Error collecting system metrics: {e}", exc_info=True)
            return {
                "cpu_percent": 0.0,
                "memory_percent": 0.0,
                "memory_used_mb": 0.0,
                "memory_total_mb": 0.0,
                "memory_available_mb": 0.0,
                "disk_usage_percent": 0.0,
                "disk_used_gb": 0.0,
                "disk_total_gb": 0.0,
                "load_average": [0.0, 0.0, 0.0]
            }
    
    async def get_connection_metrics(self) -> Dict[str, Any]:
        """Get connection metrics from parser services"""
        try:
            # Aggregate connection metrics from all parser services (only active ones)
            active_metrics = self._get_active_parser_node_metrics()
            total_active = 0
            total_handled = 0
            total_rejected = 0
            max_allowed = 0
            
            for node_id, node_metrics in active_metrics.items():
                total_active += node_metrics.get("active_connections", 0)
                # total_connections is cumulative handled connections
                total_handled += node_metrics.get("total_connections", 0)
                total_rejected += node_metrics.get("total_rejected", 0)
                max_allowed += node_metrics.get("max_connections", 5000)
            
            return {
                "active": total_active,
                "total_connected": total_handled,
                "total_rejected": total_rejected,
                "max_allowed": max_allowed,
                "parser_nodes": len(active_metrics)
            }
        except Exception as e:
            logger.error(f"Error collecting connection metrics: {e}", exc_info=True)
            return {
                "active": 0,
                "total_connected": 0,
                "total_rejected": 0,
                "max_allowed": 0,
                "parser_nodes": 0
            }
    
    def get_queue_metrics(self) -> Dict[str, Any]:
        """Get queue metrics - for microservices, queues are in parser services"""
        try:
            active_metrics = self._get_active_parser_node_metrics()
            total_messages = 0
            total_published = 0
            total_mps = 0.0
            
            for node_id, node_metrics in active_metrics.items():
                total_messages += node_metrics.get("total_messages", 0)
                total_published += node_metrics.get("total_published", 0)
                total_mps += node_metrics.get("messages_per_second", 0)
            
            return {
                "total_messages": total_messages,
                "total_published": total_published,
                "messages_per_second": round(total_mps, 2),
                "parser_nodes": len(active_metrics)
            }
        except Exception as e:
            logger.error(f"Error collecting queue metrics: {e}", exc_info=True)
            try:
                active_metrics = self._get_active_parser_node_metrics()
                node_count = len(active_metrics)
            except:
                node_count = 0
            return {
                "total_messages": 0,
                "total_published": 0,
                "messages_per_second": 0,
                "parser_nodes": node_count
            }
    
    async def get_database_metrics(self) -> Dict[str, Any]:
        """Get database connection metrics"""
        # In microservices, database is accessed via Consumer Service
        # For now, return basic status
        return {
            "connected": True,  # Assume connected if monitoring is running
            "mode": "Database",  # Default assumption
            "pool_size": 10,
            "active_connections": 0,
            "health_check": True
        }
    
    async def get_unit_io_mapping_cache_metrics(self) -> Dict[str, Any]:
        """Get Unit IO mapping cache metrics from parser services"""
        return {
            "cached_imeis": 0,
            "cache_hits": 0,
            "cache_misses": 0,
            "cache_size_limit": 10000
        }
    
    def get_processing_metrics(self) -> Dict[str, Any]:
        """Get packet processing metrics from parser services"""
        active_metrics = self._get_active_parser_node_metrics()
        total_packets = 0
        total_records = 0
        total_errors = 0
        total_messages = 0
        total_published = 0
        
        for node_id, node_metrics in active_metrics.items():
            total_packets += node_metrics.get("total_packets", 0)
            total_records += node_metrics.get("total_records", 0)
            total_errors += node_metrics.get("total_errors", 0)
            total_messages += node_metrics.get("total_messages", 0)
            total_published += node_metrics.get("total_published", 0)
        
        success_rate = 100.0
        if total_packets > 0:
            success_rate = ((total_packets - total_errors) / total_packets) * 100
        
        return {
            "packets_analyzed": total_packets,
            "packets_parsed": total_packets,
            "records_saved": total_records,
            "errors": total_errors,
            "total_messages": total_messages,
            "total_published": total_published,
            "success_rate_percent": round(success_rate, 2)
        }
    
    def update_parser_node_metrics(self, node_id: str, metrics: Dict[str, Any]):
        """Update metrics from a parser service"""
        self.parser_node_metrics[node_id] = metrics
        self.parser_node_last_update[node_id] = time.time()
    
    def _cleanup_stale_parser_nodes(self):
        """Remove parser services that haven't reported recently"""
        current_time = time.time()
        stale_nodes = [
            node_id for node_id, last_update in self.parser_node_last_update.items()
            if (current_time - last_update) > self.parser_node_stale_timeout
        ]
        for node_id in stale_nodes:
            logger.info(f"Removing stale parser service: {node_id} (last update: {current_time - self.parser_node_last_update[node_id]:.1f}s ago)")
            del self.parser_node_metrics[node_id]
            del self.parser_node_last_update[node_id]
    
    def _get_active_parser_node_metrics(self) -> Dict[str, Dict[str, Any]]:
        """Get only active (non-stale) parser service metrics"""
        self._cleanup_stale_parser_nodes()
        return self.parser_node_metrics
    
    async def get_all_metrics(self) -> Dict[str, Any]:
        """Get all metrics"""
        return {
            "server": {
                "status": "running",
                "uptime_seconds": round(self.get_uptime_seconds(), 2),
                "start_time": datetime.fromtimestamp(self.start_time, tz=timezone.utc).isoformat()
            },
            "system": self.get_system_metrics(),
            "connections": await self.get_connection_metrics(),
            "queues": self.get_queue_metrics(),
            "processing": self.get_processing_metrics(),
            "database": await self.get_database_metrics(),
            "unit_io_mapping_cache": await self.get_unit_io_mapping_cache_metrics(),
            "parser_nodes": {
                "count": len(self._get_active_parser_node_metrics()),
                "nodes": list(self._get_active_parser_node_metrics().keys())
            },
            "alerts": await self._get_alerts()
        }
    
    async def _get_alerts(self) -> list:
        """Get active alerts based on metrics"""
        alerts = []
        
        try:
            system = self.get_system_metrics()
            connections = await self.get_connection_metrics()
            
            # Check CPU
            cpu_percent = system.get("cpu_percent", 0)
            if cpu_percent > 90:
                alerts.append({
                    "level": "error",
                    "message": f"Critical CPU usage: {cpu_percent:.1f}%",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
            elif cpu_percent > 75:
                alerts.append({
                    "level": "warning",
                    "message": f"High CPU usage: {cpu_percent:.1f}%",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
            
            # Check memory
            memory_percent = system.get("memory_percent", 0)
            if memory_percent > 90:
                alerts.append({
                    "level": "error",
                    "message": f"Critical memory usage: {memory_percent:.1f}%",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
            elif memory_percent > 75:
                alerts.append({
                    "level": "warning",
                    "message": f"High memory usage: {memory_percent:.1f}%",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
            
            # Check disk usage
            disk_percent = system.get("disk_usage_percent", 0)
            if disk_percent > 90:
                alerts.append({
                    "level": "error",
                    "message": f"Critical disk usage: {disk_percent:.1f}%",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
            elif disk_percent > 80:
                alerts.append({
                    "level": "warning",
                    "message": f"High disk usage: {disk_percent:.1f}%",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
            
            # Check connections
            active = connections.get("active", 0)
            max_allowed = connections.get("max_allowed", 0)
            if max_allowed > 0:
                usage_percent = (active / max_allowed) * 100
                if usage_percent > 95:
                    alerts.append({
                        "level": "error",
                        "message": f"Connection limit critical: {active}/{max_allowed} ({usage_percent:.1f}%)",
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    })
                elif usage_percent > 80:
                    alerts.append({
                        "level": "warning",
                        "message": f"Connection limit high: {active}/{max_allowed} ({usage_percent:.1f}%)",
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    })
            
            # Check parser services
            active_metrics = self._get_active_parser_node_metrics()
            if len(active_metrics) == 0:
                alerts.append({
                    "level": "warning",
                    "message": "No parser services reporting metrics",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
        
        except Exception as e:
            logger.error(f"Error generating alerts: {e}", exc_info=True)
            alerts.append({
                "level": "error",
                "message": f"Error generating alerts: {str(e)}",
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        
        return alerts
    
    async def get_health_status(self) -> str:
        """Get overall health status: healthy, degraded, unhealthy"""
        try:
            health_details = await self.get_detailed_health_status()
            return health_details.get('status', 'unknown')
        except Exception as e:
            logger.error(f"Error determining health status: {e}", exc_info=True)
            return "degraded"
    
    async def get_detailed_health_status(self) -> Dict[str, Any]:
        """Get detailed health status with granular checks"""
        try:
            metrics = await self.get_all_metrics()
            checks = {}
            
            # Check system resources
            system = metrics.get("system", {})
            memory_percent = system.get("memory_percent", 0)
            cpu_percent = system.get("cpu_percent", 0)
            disk_percent = system.get("disk_usage_percent", 0)
            
            checks['system'] = {
                "status": "healthy" if memory_percent < 95 and cpu_percent < 95 and disk_percent < 95 else "degraded",
                "memory_percent": memory_percent,
                "cpu_percent": cpu_percent,
                "disk_percent": disk_percent
            }
            
            # Check connections
            connections = metrics.get("connections", {})
            active = connections.get("active", 0)
            max_allowed = connections.get("max_allowed", 50000)
            connection_utilization = (active / max_allowed * 100) if max_allowed > 0 else 0
            
            checks['connections'] = {
                "status": "healthy" if connection_utilization < 90 else "degraded",
                "active": active,
                "max_allowed": max_allowed,
                "utilization_percent": round(connection_utilization, 2)
            }
            
            # Check parser services (ensure we use active nodes)
            active_metrics = self._get_active_parser_node_metrics()
            node_count = len(active_metrics)
            checks['parser_nodes'] = {
                "status": "healthy" if node_count > 0 else "degraded",
                "count": node_count
            }
            
            # Determine overall status
            unhealthy_checks = [k for k, v in checks.items() if v.get("status") == "unhealthy"]
            degraded_checks = [k for k, v in checks.items() if v.get("status") == "degraded"]
            
            if unhealthy_checks:
                overall_status = "unhealthy"
            elif degraded_checks:
                overall_status = "degraded"
            else:
                overall_status = "healthy"
            
            return {
                "status": overall_status,
                "checks": checks,
                "unhealthy_components": unhealthy_checks,
                "degraded_components": degraded_checks
            }
        except Exception as e:
            logger.error(f"Error determining detailed health status: {e}", exc_info=True)
            return {
                "status": "unhealthy",
                "checks": {},
                "error": str(e)
            }
