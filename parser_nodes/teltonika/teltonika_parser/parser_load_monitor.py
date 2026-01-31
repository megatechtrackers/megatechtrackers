"""
Load Monitor for Parser Service
Tracks and reports parser service load metrics
"""
import asyncio
import logging
import os
import psutil
from datetime import datetime
from typing import Dict, Any, Optional
import aiohttp

from config import Config, ServerParams

logger = logging.getLogger(__name__)


class ParserNodeLoadMonitor:
    """Monitor and report parser service load metrics"""
    
    def __init__(self, node_id: str):
        """Initialize load monitor"""
        self.node_id = node_id
        self.active_connections = 0
        self.total_connections = 0  # Cumulative total connections handled
        self.total_rejected = 0  # Connections rejected due to capacity
        self.messages_processed = 0
        self.total_packets = 0  # Total packets processed
        self.total_records = 0  # Total records extracted from packets
        self.total_errors = 0  # Total processing errors
        self.publish_successes = 0
        self.publish_failures = 0
        self.start_time = datetime.now()
        self._report_task: Optional[asyncio.Task] = None
        
        # Load configuration
        load_config = Config.load().get('load_monitoring', {})
        self.enabled = load_config.get('enabled', True)
        self.report_interval = load_config.get('report_interval_seconds', 10)
        self.api_endpoint = load_config.get('api_endpoint')
        
        # Get vendor from environment or config
        self.vendor = os.environ.get('VENDOR', Config.load().get('parser_node', {}).get('vendor', 'teltonika'))
        
        # Get max connections from config
        self.max_connections = ServerParams.get_int('tcp_server.max_concurrent_connections', 5000)
    
    def increment_connections(self):
        """Increment active connection count"""
        self.active_connections += 1
        self.total_connections += 1  # Track total handled
    
    def decrement_connections(self):
        """Decrement active connection count"""
        if self.active_connections > 0:
            self.active_connections -= 1
    
    def reject_connection(self):
        """Record a rejected connection (at capacity)"""
        self.total_rejected += 1
    
    def increment_messages(self, count: int = 1):
        """Increment processed messages count"""
        self.messages_processed += count
    
    def increment_packets(self, count: int = 1):
        """Increment processed packets count"""
        self.total_packets += count
    
    def increment_records(self, count: int = 1):
        """Increment extracted records count"""
        self.total_records += count
    
    def increment_errors(self, count: int = 1):
        """Increment error count"""
        self.total_errors += count
    
    def record_publish_success(self):
        """Record successful publish"""
        self.publish_successes += 1
    
    def record_publish_failure(self):
        """Record failed publish"""
        self.publish_failures += 1
    
    async def start_reporting(self):
        """Start periodic reporting task"""
        if not self.enabled:
            return
        
        if self._report_task is None or self._report_task.done():
            self._report_task = asyncio.create_task(self._periodic_report())
            logger.info(f"Started load monitoring reporting (interval: {self.report_interval}s)")
    
    async def stop_reporting(self):
        """Stop periodic reporting task"""
        if self._report_task and not self._report_task.done():
            self._report_task.cancel()
            try:
                await self._report_task
            except asyncio.CancelledError:
                pass
    
    async def _periodic_report(self):
        """Periodically report metrics"""
        while True:
            try:
                await asyncio.sleep(self.report_interval)
                await self.report_metrics()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in periodic reporting: {e}", exc_info=True)
    
    async def report_metrics(self) -> Dict[str, Any]:
        """Report metrics to monitoring server"""
        metrics = {
            "node_id": self.node_id,
            "vendor": self.vendor,
            "timestamp": datetime.utcnow().isoformat(),
            "active_connections": self.active_connections,
            "total_connections": self.total_connections,
            "total_rejected": self.total_rejected,
            "max_connections": self.max_connections,
            "connection_utilization": (self.active_connections / self.max_connections * 100) if self.max_connections > 0 else 0,
            "messages_per_second": self._calculate_mps(),
            "total_packets": self.total_packets,
            "total_records": self.total_records,
            "total_errors": self.total_errors,
            "total_messages": self.messages_processed,
            "cpu_usage": psutil.cpu_percent(interval=0.1),
            "memory_usage_mb": psutil.virtual_memory().used / 1024 / 1024,
            "memory_usage_percent": psutil.virtual_memory().percent,
            "publish_success_rate": self._calculate_success_rate(),
            "total_published": self.publish_successes,
            "error_rate": self.publish_failures / max(self.publish_successes + self.publish_failures, 1) * 100
        }
        
        # Send to monitoring API
        if self.api_endpoint:
            try:
                async with aiohttp.ClientSession() as session:
                    try:
                        async with session.post(self.api_endpoint, json=metrics, timeout=aiohttp.ClientTimeout(total=5)) as response:
                            if response.status == 200:
                                logger.debug(f"Load metrics reported: {metrics}")
                            else:
                                logger.warning(f"Load metrics API returned status {response.status}: {await response.text()}")
                    except asyncio.TimeoutError:
                        logger.warning(f"Timeout reporting load metrics to {self.api_endpoint}")
                    except aiohttp.ClientError as e:
                        logger.warning(f"Client error reporting load metrics: {e}")
            except Exception as e:
                logger.warning(f"Failed to report load metrics: {e}", exc_info=True)
        
        return metrics
    
    def _calculate_mps(self) -> float:
        """Calculate messages per second"""
        elapsed = (datetime.now() - self.start_time).total_seconds()
        if elapsed > 0:
            return self.messages_processed / elapsed
        return 0.0
    
    def _calculate_success_rate(self) -> float:
        """Calculate publish success rate"""
        total = self.publish_successes + self.publish_failures
        if total > 0:
            return (self.publish_successes / total) * 100
        return 100.0


# Global monitor instance
_monitor_instance: Optional[ParserNodeLoadMonitor] = None


def get_load_monitor(node_id: str) -> ParserNodeLoadMonitor:
    """Get or create global load monitor instance"""
    global _monitor_instance
    
    if _monitor_instance is None:
        _monitor_instance = ParserNodeLoadMonitor(node_id)
    
    return _monitor_instance
