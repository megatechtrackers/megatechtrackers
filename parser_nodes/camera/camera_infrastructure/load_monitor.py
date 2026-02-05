"""
Load Monitor for Camera Parser Service
Tracks and reports parser service load metrics
"""
import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Dict, Any, Optional, TYPE_CHECKING
import aiohttp

if TYPE_CHECKING:
    pass  # Avoid circular import; poller has get_stats() method

logger = logging.getLogger(__name__)

# Try to import psutil for system metrics
try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False
    logger.warning("psutil not installed - system metrics will be unavailable")


class CameraParserLoadMonitor:
    """Monitor and report camera parser service load metrics"""
    
    def __init__(self, node_id: str = "camera-parser"):
        """Initialize load monitor"""
        self.node_id = node_id
        self.vendor = "camera"
        
        # Polling metrics
        self.poll_cycles = 0
        self.devices_polled = 0
        self.alarms_polled = 0
        
        # Publishing metrics
        self.trackdata_published = 0
        self.events_published = 0
        self.publish_successes = 0
        self.publish_failures = 0
        
        # Error metrics
        self.total_errors = 0
        self.api_errors = 0
        self.rabbitmq_errors = 0
        self.db_errors = 0
        
        # CMS server metrics
        self.cms_servers_healthy = 0
        self.cms_servers_unhealthy = 0
        self.circuit_breaker_trips = 0
        
        # Deduplication metrics
        self.dedup_hits = 0
        self.dedup_cache_size = 0
        
        # API Latency metrics (rolling window)
        self._api_latencies: list = []  # List of (timestamp, latency_ms) tuples
        self._api_latency_max_samples = 1000
        self.api_latency_total_ms = 0
        self.api_latency_count = 0
        
        # Data freshness metrics
        self.last_trackdata_time: Optional[datetime] = None
        self.last_event_time: Optional[datetime] = None
        self.last_realtime_alarm_time: Optional[datetime] = None
        
        # Dead letter tracking
        self.dead_letter_count = 0
        
        # Timing
        self.start_time = datetime.now(timezone.utc)  # UTC consistent
        self.last_poll_duration_ms = 0
        
        # Reporting
        self._report_task: Optional[asyncio.Task] = None
        self._running = False
        
        # Configuration (from environment or defaults)
        self.enabled = os.getenv('LOAD_MONITORING_ENABLED', 'true').lower() == 'true'
        self.report_interval = int(os.getenv('LOAD_MONITORING_INTERVAL', '30'))
        self.api_endpoint = os.getenv('LOAD_MONITORING_ENDPOINT')
        self.log_metrics = os.getenv('LOAD_MONITORING_LOG', 'true').lower() == 'true'
        
        # Optional reference to CMS poller to refresh cms_servers_healthy/unhealthy before reporting
        self._poller_ref: Optional[Any] = None
    
    def set_poller(self, poller: Any):
        """Set reference to CMSPoller so get_metrics() can refresh CMS counts from circuit breakers."""
        self._poller_ref = poller
    
    # =========================================================================
    # Metric Recording Methods
    # =========================================================================
    
    def record_poll_cycle(self, devices: int = 0, alarms: int = 0, duration_ms: float = 0):
        """Record a completed poll cycle"""
        self.poll_cycles += 1
        self.devices_polled += devices
        self.alarms_polled += alarms
        self.last_poll_duration_ms = duration_ms
    
    def record_publish_success(self, record_type: str = "trackdata"):
        """Record successful publish"""
        self.publish_successes += 1
        if record_type == "trackdata":
            self.trackdata_published += 1
        elif record_type in ("event", "alarm"):
            self.events_published += 1
    
    def record_publish_failure(self):
        """Record failed publish"""
        self.publish_failures += 1
        self.rabbitmq_errors += 1
    
    def record_error(self, error_type: str = "general"):
        """Record an error"""
        self.total_errors += 1
        if error_type == "api":
            self.api_errors += 1
        elif error_type == "rabbitmq":
            self.rabbitmq_errors += 1
        elif error_type == "db":
            self.db_errors += 1
    
    def record_circuit_breaker_trip(self):
        """Record a circuit breaker trip"""
        self.circuit_breaker_trips += 1
    
    def update_cms_health(self, healthy: int, unhealthy: int):
        """Update CMS server health counts"""
        self.cms_servers_healthy = healthy
        self.cms_servers_unhealthy = unhealthy
    
    def update_dedup_stats(self, hits: int, cache_size: int):
        """Update deduplication stats"""
        self.dedup_hits = hits
        self.dedup_cache_size = cache_size
    
    def record_api_latency(self, latency_ms: float, endpoint: str = ""):
        """
        Record an API call latency.
        
        Args:
            latency_ms: Time taken for the API call in milliseconds
            endpoint: Optional endpoint name for categorization
        """
        now = datetime.now(timezone.utc)  # UTC consistent
        
        # Add to rolling window
        self._api_latencies.append((now, latency_ms, endpoint))
        
        # Update totals
        self.api_latency_total_ms += latency_ms
        self.api_latency_count += 1
        
        # Trim if too large
        if len(self._api_latencies) > self._api_latency_max_samples:
            # Remove oldest entries
            to_remove = len(self._api_latencies) - self._api_latency_max_samples
            removed = self._api_latencies[:to_remove]
            self._api_latencies = self._api_latencies[to_remove:]
            
            # Subtract removed latencies from totals
            for _, lat, _ in removed:
                self.api_latency_total_ms -= lat
                self.api_latency_count -= 1
    
    def get_api_latency_stats(self) -> Dict[str, float]:
        """
        Get API latency statistics.
        
        Returns:
            Dict with avg, p50, p95, p99, min, max latencies in ms
        """
        if not self._api_latencies:
            return {
                "avg_ms": 0.0,
                "p50_ms": 0.0,
                "p95_ms": 0.0,
                "p99_ms": 0.0,
                "min_ms": 0.0,
                "max_ms": 0.0,
                "samples": 0
            }
        
        latencies = sorted([lat for _, lat, _ in self._api_latencies])
        n = len(latencies)
        
        return {
            "avg_ms": round(sum(latencies) / n, 2),
            "p50_ms": round(latencies[n // 2], 2),
            "p95_ms": round(latencies[int(n * 0.95)], 2) if n >= 20 else round(latencies[-1], 2),
            "p99_ms": round(latencies[int(n * 0.99)], 2) if n >= 100 else round(latencies[-1], 2),
            "min_ms": round(min(latencies), 2),
            "max_ms": round(max(latencies), 2),
            "samples": n
        }
    
    def record_data_freshness(self, record_type: str):
        """
        Record when data was last received.
        
        Args:
            record_type: Type of data ("trackdata", "event", "realtime_alarm")
        """
        now = datetime.now(timezone.utc)  # UTC consistent
        
        if record_type == "trackdata":
            self.last_trackdata_time = now
        elif record_type == "event":
            self.last_event_time = now
        elif record_type == "realtime_alarm":
            self.last_realtime_alarm_time = now
    
    def get_data_freshness(self) -> Dict[str, Optional[float]]:
        """
        Get data freshness (age of last data in seconds).
        
        Returns:
            Dict with age of each data type in seconds (None if no data received)
        """
        now = datetime.now(timezone.utc)  # UTC consistent
        
        def age_seconds(last_time: Optional[datetime]) -> Optional[float]:
            if last_time is None:
                return None
            return round((now - last_time).total_seconds(), 1)
        
        return {
            "trackdata_age_seconds": age_seconds(self.last_trackdata_time),
            "event_age_seconds": age_seconds(self.last_event_time),
            "realtime_alarm_age_seconds": age_seconds(self.last_realtime_alarm_time),
            "last_trackdata_time": self.last_trackdata_time.isoformat() if self.last_trackdata_time else None,
            "last_event_time": self.last_event_time.isoformat() if self.last_event_time else None,
            "last_realtime_alarm_time": self.last_realtime_alarm_time.isoformat() if self.last_realtime_alarm_time else None,
        }
    
    def record_dead_letter(self):
        """Record a dead letter (failed publish)"""
        self.dead_letter_count += 1
    
    # =========================================================================
    # Reporting Methods
    # =========================================================================
    
    async def start_reporting(self):
        """Start periodic reporting task"""
        if not self.enabled:
            logger.info("Load monitoring disabled")
            return
        
        self._running = True
        if self._report_task is None or self._report_task.done():
            self._report_task = asyncio.create_task(self._periodic_report())
            logger.info(f"Started load monitoring (interval: {self.report_interval}s)")
    
    async def stop_reporting(self):
        """Stop periodic reporting task"""
        self._running = False
        if self._report_task and not self._report_task.done():
            self._report_task.cancel()
            try:
                await self._report_task
            except asyncio.CancelledError:
                pass
        logger.info("Load monitoring stopped")
    
    async def _periodic_report(self):
        """Periodically report metrics"""
        while self._running:
            try:
                await asyncio.sleep(self.report_interval)
                metrics = await self.get_metrics()
                
                # Log metrics
                if self.log_metrics:
                    self._log_metrics(metrics)
                
                # Send to API endpoint
                if self.api_endpoint:
                    await self._send_metrics(metrics)
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in periodic reporting: {e}")
    
    async def get_metrics(self) -> Dict[str, Any]:
        """Get current metrics in format compatible with monitoring node"""
        # Refresh CMS healthy/unhealthy from poller so dashboards and push show correct active count
        if self._poller_ref and hasattr(self._poller_ref, 'get_stats'):
            try:
                self._poller_ref.get_stats()
            except Exception as e:
                logger.debug(f"Could not refresh CMS stats from poller: {e}")
        
        uptime_seconds = (datetime.now(timezone.utc) - self.start_time).total_seconds()  # UTC consistent
        
        # Calculate rates
        total_published = self.publish_successes + self.publish_failures
        success_rate = (self.publish_successes / total_published * 100) if total_published > 0 else 100.0
        error_rate = (self.publish_failures / total_published * 100) if total_published > 0 else 0.0
        
        devices_per_minute = (self.devices_polled / uptime_seconds * 60) if uptime_seconds > 0 else 0
        events_per_minute = (self.events_published / uptime_seconds * 60) if uptime_seconds > 0 else 0
        
        # Base metrics compatible with monitoring node format
        metrics = {
            # Required fields for monitoring node
            "node_id": self.node_id,
            "vendor": self.vendor,
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            
            # Connection-like metrics (for compatibility with Teltonika format)
            # Camera doesn't have connections, but we report CMS servers as "connections"
            "active_connections": self.cms_servers_healthy,  # Healthy CMS servers
            "total_connections": self.poll_cycles,  # Total poll cycles
            "total_rejected": self.circuit_breaker_trips,  # Circuit breaker trips
            "max_connections": self.cms_servers_healthy + self.cms_servers_unhealthy or 10,  # Total CMS servers
            
            # Publishing metrics (compatible with monitoring node)
            "messages_per_second": round(events_per_minute / 60, 2),
            "total_messages": self.trackdata_published + self.events_published,
            "total_published": self.publish_successes,
            "publish_success_rate": round(success_rate, 2),
            "error_rate": round(error_rate, 2),
            
            # Processing metrics
            "total_packets": self.poll_cycles,
            "total_records": self.devices_polled + self.alarms_polled,
            "total_errors": self.total_errors,
            
            # Camera-specific metrics
            "poll_cycles": self.poll_cycles,
            "devices_polled": self.devices_polled,
            "alarms_polled": self.alarms_polled,
            "devices_per_minute": round(devices_per_minute, 2),
            "events_per_minute": round(events_per_minute, 2),
            "trackdata_published": self.trackdata_published,
            "events_published": self.events_published,
            "cms_servers_healthy": self.cms_servers_healthy,
            "cms_servers_unhealthy": self.cms_servers_unhealthy,
            "circuit_breaker_trips": self.circuit_breaker_trips,
            "dedup_hits": self.dedup_hits,
            "dedup_cache_size": self.dedup_cache_size,
            "api_errors": self.api_errors,
            "rabbitmq_errors": self.rabbitmq_errors,
            "db_errors": self.db_errors,
            "dead_letter_count": self.dead_letter_count,
        }
        
        # Add API latency metrics
        latency_stats = self.get_api_latency_stats()
        metrics["api_latency_avg_ms"] = latency_stats["avg_ms"]
        metrics["api_latency_p50_ms"] = latency_stats["p50_ms"]
        metrics["api_latency_p95_ms"] = latency_stats["p95_ms"]
        metrics["api_latency_p99_ms"] = latency_stats["p99_ms"]
        metrics["api_latency_max_ms"] = latency_stats["max_ms"]
        metrics["api_latency_samples"] = latency_stats["samples"]
        
        # Add data freshness metrics
        freshness = self.get_data_freshness()
        metrics["trackdata_age_seconds"] = freshness["trackdata_age_seconds"]
        metrics["event_age_seconds"] = freshness["event_age_seconds"]
        metrics["realtime_alarm_age_seconds"] = freshness["realtime_alarm_age_seconds"]
        
        # Add system metrics if psutil available
        if HAS_PSUTIL:
            try:
                metrics["cpu_usage"] = psutil.cpu_percent(interval=0.1)
                metrics["memory_usage_percent"] = psutil.virtual_memory().percent
                metrics["memory_usage_mb"] = round(psutil.virtual_memory().used / 1024 / 1024, 1)
                
                # Process-specific metrics
                process = psutil.Process()
                metrics["process_cpu_percent"] = process.cpu_percent()
                metrics["process_memory_mb"] = round(process.memory_info().rss / 1024 / 1024, 1)
                metrics["process_threads"] = process.num_threads()
            except Exception as e:
                logger.debug(f"Error getting system metrics: {e}")
        
        return metrics
    
    def _log_metrics(self, metrics: Dict[str, Any]):
        """Log metrics summary"""
        logger.info(
            f"[Metrics] polls={metrics['poll_cycles']} "
            f"devices={metrics['devices_polled']} "
            f"events={metrics['events_published']} "
            f"success_rate={metrics['publish_success_rate']}% "
            f"errors={metrics['total_errors']} "
            f"cms_healthy={metrics['cms_servers_healthy']}/{metrics['cms_servers_healthy'] + metrics['cms_servers_unhealthy']} "
            f"dedup_hits={metrics['dedup_hits']}"
        )
    
    async def _send_metrics(self, metrics: Dict[str, Any]):
        """Send metrics to monitoring API endpoint"""
        try:
            timeout = aiohttp.ClientTimeout(total=5)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(self.api_endpoint, json=metrics) as response:
                    if response.status == 200:
                        logger.debug(f"Metrics sent to {self.api_endpoint}")
                    else:
                        logger.warning(f"Metrics API returned {response.status}")
        except asyncio.TimeoutError:
            logger.warning(f"Timeout sending metrics to {self.api_endpoint}")
        except Exception as e:
            logger.warning(f"Failed to send metrics: {e}")


# Global monitor instance
_monitor_instance: Optional[CameraParserLoadMonitor] = None


def get_load_monitor(node_id: str = "camera-parser") -> CameraParserLoadMonitor:
    """Get or create global load monitor instance"""
    global _monitor_instance
    
    if _monitor_instance is None:
        _monitor_instance = CameraParserLoadMonitor(node_id)
    
    return _monitor_instance


async def close_load_monitor():
    """Close the load monitor"""
    global _monitor_instance
    
    if _monitor_instance:
        await _monitor_instance.stop_reporting()
        _monitor_instance = None
