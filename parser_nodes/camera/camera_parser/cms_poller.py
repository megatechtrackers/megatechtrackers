"""
CMS Poller for Camera Parser
Polls multiple CMS servers for device status and safety alarms
Production-ready with rate limiting, circuit breaker, and robust error handling
"""
import asyncio
import logging
from typing import Dict, Any, List, Optional, Set
from datetime import datetime, timedelta, timezone
from collections import defaultdict
from dataclasses import dataclass, field

import sys
sys.path.insert(0, '..')
from config import Config
from camera_infrastructure.db_client import CMSServer, get_database_client, get_standalone_cms_servers
from camera_infrastructure.rabbitmq_producer import get_rabbitmq_producer
from camera_infrastructure.load_monitor import get_load_monitor
from .cms_api import CMSApiClient
from .data_transformer import DataTransformer
from .async_save_to_csv import get_csv_saver
from camera_infrastructure.alarm_config_loader import get_alarm_config_loader, CameraAlarmConfig, TEMPLATE_IMEI

logger = logging.getLogger(__name__)


@dataclass
class CircuitBreaker:
    """Simple circuit breaker for CMS server health"""
    failure_count: int = 0
    last_failure: Optional[datetime] = None
    state: str = 'closed'  # closed (healthy), open (failing), half_open (testing)
    
    # Config
    failure_threshold: int = 5
    reset_timeout: int = 60  # seconds
    
    def record_failure(self):
        """Record a failure"""
        self.failure_count += 1
        self.last_failure = datetime.now(timezone.utc)  # UTC consistent
        if self.failure_count >= self.failure_threshold:
            self.state = 'open'
            logger.warning(f"Circuit breaker opened after {self.failure_count} failures")
    
    def record_success(self):
        """Record a success"""
        if self.state == 'half_open':
            logger.info("Circuit breaker closed after successful test")
        self.failure_count = 0
        self.last_failure = None
        self.state = 'closed'
    
    def can_execute(self) -> bool:
        """Check if we can execute a request"""
        if self.state == 'closed':
            return True
        
        if self.state == 'open':
            # Check if we should test the circuit
            if self.last_failure and (datetime.now(timezone.utc) - self.last_failure).seconds >= self.reset_timeout:
                self.state = 'half_open'
                logger.info("Circuit breaker entering half-open state for testing")
                return True
            return False
        
        # half_open - allow one request to test
        return True


class CMSPoller:
    """
    Polls multiple CMS servers for camera data.
    
    Features:
    - Parallel polling of multiple CMS servers
    - Rate limiting to prevent API overload
    - Circuit breaker pattern for failing servers
    - Deduplication with TTL
    - Graceful shutdown handling
    - Comprehensive statistics
    - Supports LOGS mode (CSV) and RABBITMQ mode
    """
    
    def __init__(self, load_monitor=None, rabbitmq_producer=None, shutdown_event=None):
        self.cms_clients: Dict[int, CMSApiClient] = {}
        self.running = False
        self._shutdown_event = shutdown_event or asyncio.Event()
        
        # RabbitMQ producer (None in LOGS mode)
        self._rabbitmq_producer = rabbitmq_producer
        
        # Data transfer mode
        self._data_mode = Config.get_data_transfer_mode()
        
        # Load monitor for metrics
        self._load_monitor = load_monitor
        
        # Circuit breakers for each server
        self._circuit_breakers: Dict[int, CircuitBreaker] = defaultdict(CircuitBreaker)
        
        # Semaphore to limit concurrent API requests
        self._api_semaphore: Optional[asyncio.Semaphore] = None
        
        # Unified alarm deduplication cache using GUID as key
        # Both realtime and historical alarms use the same unique GUID
        # Value is (timestamp, has_video) - allows re-publishing when video becomes available
        self._processed_alarm_guids: Dict[str, tuple] = {}  # {guid: (datetime, has_video)}
        self._processed_alarm_guids_max_size = 15000  # Combined size for both sources
        self._processed_alarm_guids_ttl = timedelta(hours=4)  # Longer TTL to catch video updates
        
        # Track processed GPS trackdata to avoid duplicates (for backfill)
        # Key: (imei, gps_time)
        self._processed_trackdata: Dict[tuple, datetime] = {}
        self._processed_trackdata_max_size = 50000  # Larger for 7 days of GPS data
        self._processed_trackdata_ttl = timedelta(hours=8)  # TTL for dedup cache
        
        # Alarm config loader (loaded on first use)
        self._alarm_config_loader = None
        
        # Polling tasks for management
        self._tasks: List[asyncio.Task] = []
        
        # Stats (also reported to load monitor)
        self.stats = {
            'devices_polled': 0,
            'alarms_polled': 0,
            'realtime_alarms_polled': 0,
            'trackdata_published': 0,
            'events_published': 0,
            'errors': 0,
            'circuit_breaker_trips': 0,
            'dedup_hits': 0,
            'backfill_alarms': 0,
            'backfill_trackdata': 0,
            'dead_letter_count': 0,
            'start_time': None,
        }
    
    async def _get_alarm_config(self, imei: int, event_type: str) -> Optional[CameraAlarmConfig]:
        """
        Get alarm config for IMEI and event type.
        Uses CSV in LOGS mode, database in RABBITMQ mode.
        """
        if self._alarm_config_loader is None:
            self._alarm_config_loader = await get_alarm_config_loader()
        
        return await self._alarm_config_loader.get_config(imei, event_type)
    
    async def _ensure_device_provisioned(self, imei: int) -> bool:
        """
        Ensure device has alarm config (auto-provision if new).
        Called on device discovery (status poll or alarm received).
        
        Args:
            imei: Device IMEI (as int)
            
        Returns:
            True if provisioned successfully
        """
        # Skip template IMEI
        if imei == TEMPLATE_IMEI:
            return True
        
        if self._alarm_config_loader is None:
            self._alarm_config_loader = await get_alarm_config_loader()
        
        try:
            return await self._alarm_config_loader.ensure_device_provisioned(imei)
        except Exception as e:
            logger.error(f"Error provisioning device {imei}: {e}")
            return False
    
    async def _enrich_with_alarm_config(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """
        Check if event should trigger an alarm and enrich message with alarm flags.
        
        Following Teltonika pattern:
        - Sets is_alarm=1 if alarm should be triggered
        - Sets is_sms, is_email, is_call, priority from config
        
        Args:
            message: Event message to check and enrich
            
        Returns:
            Enriched message with alarm flags set in data
        """
        try:
            data = message.get('data', {})
            event_type = data.get('status', '')
            imei_str = data.get('imei', '')
            
            # Default: not an alarm
            data['is_alarm'] = 0
            data['is_sms'] = 0
            data['is_email'] = 0
            data['is_call'] = 0
            data['priority'] = 0
            
            # Only process actual events (not Normal status)
            if event_type == 'Normal' or not event_type:
                return message  # Not an event, no alarm
            
            # Convert IMEI to int
            try:
                imei = int(imei_str)
            except (ValueError, TypeError):
                return message  # Invalid IMEI, no alarm
            
            # Auto-provision alarm config for new devices
            await self._ensure_device_provisioned(imei)
            
            # Get alarm config
            config = await self._get_alarm_config(imei, event_type)
            
            if not config or not config.should_alarm:
                return message  # No alarm configured for this event
            
            # Check time window (config start/end are UTC, gps_time is UTC)
            gps_time_str = data.get('gps_time', '')
            if gps_time_str:
                try:
                    if 'T' in gps_time_str:
                        gps_time = datetime.fromisoformat(gps_time_str.replace('Z', '+00:00'))
                        if gps_time.tzinfo is None:
                            gps_time = gps_time.replace(tzinfo=timezone.utc)
                    else:
                        gps_time = datetime.now(timezone.utc)
                    current_time = gps_time.time()
                    
                    # Check if current time is within the configured window
                    if config.start_time <= config.end_time:
                        # Normal window (e.g., 08:00 to 18:00)
                        if not (config.start_time <= current_time <= config.end_time):
                            logger.debug(f"Event {event_type} outside time window for IMEI {imei}")
                            return message  # Outside time window, no alarm
                    else:
                        # Window spans midnight (e.g., 22:00 to 06:00)
                        if not (current_time >= config.start_time or current_time <= config.end_time):
                            logger.debug(f"Event {event_type} outside time window for IMEI {imei}")
                            return message  # Outside time window, no alarm
                except Exception as e:
                    logger.debug(f"Error parsing GPS time for alarm check: {e}")
            
            # Set alarm flags in data (Teltonika pattern)
            data['is_alarm'] = 1
            data['is_sms'] = config.is_sms
            data['is_email'] = config.is_email
            data['is_call'] = config.is_call
            data['priority'] = config.priority
            
            logger.debug(f"Alarm flagged for {event_type} IMEI {imei} (sms={config.is_sms}, email={config.is_email}, call={config.is_call})")
            
            return message
            
        except Exception as e:
            logger.error(f"Error enriching with alarm config: {e}")
            return message  # Return original on error
    
    async def _publish_or_save(self, message: Dict[str, Any], record_type: str) -> bool:
        """
        Publish message to RabbitMQ (RABBITMQ mode) or save to CSV (LOGS mode).
        
        Follows Teltonika pattern:
        - ALL records → trackdata (always)
        - If status != 'Normal' → also events
        - If is_alarm == 1 → also alarms
        
        Args:
            message: Message to publish/save
            record_type: Hint for routing ('trackdata' or 'event'), but actual
                        routing is based on status and is_alarm fields
            
        Returns:
            True if successful, False otherwise
        """
        if self._data_mode == 'LOGS':
            # LOGS mode: Save to CSV (routing handled by CSV saver)
            try:
                csv_saver = get_csv_saver()
                await csv_saver.save(message)
                logger.debug(f"Saved record to CSV for IMEI {message.get('imei', 'unknown')}")
                return True
            except Exception as e:
                logger.error(f"Error saving to CSV: {e}", exc_info=True)
                return False
        else:
            # RABBITMQ mode: Publish to RabbitMQ following Teltonika pattern
            if self._rabbitmq_producer is None:
                try:
                    self._rabbitmq_producer = await get_rabbitmq_producer()
                except Exception as e:
                    logger.error(f"Failed to get RabbitMQ producer: {e}")
                    return False
            
            # Determine routing based on status and is_alarm
            data = message.get('data', {})
            status = data.get('status', 'Normal')
            is_event = status != 'Normal'
            is_alarm = data.get('is_alarm', 0) == 1
            
            all_published = True
            
            # ALL records go to trackdata
            trackdata_message = {**message, "record_type": "trackdata"}
            published = await self._rabbitmq_producer.publish_tracking_record(
                trackdata_message,
                vendor="camera",
                record_type="trackdata"
            )
            if not published:
                all_published = False
            
            # If status != 'Normal' → also events
            if is_event:
                event_message = {**message, "record_type": "event"}
                published = await self._rabbitmq_producer.publish_tracking_record(
                    event_message,
                    vendor="camera",
                    record_type="event"
                )
                if not published:
                    all_published = False
            
            # If is_alarm == 1 → also alarms
            if is_alarm:
                alarm_message = {**message, "record_type": "alarm"}
                published = await self._rabbitmq_producer.publish_tracking_record(
                    alarm_message,
                    vendor="camera",
                    record_type="alarm"
                )
                if not published:
                    all_published = False
            
            return all_published
    
    async def start(self):
        """Start polling all CMS servers"""
        self.running = True
        self._shutdown_event.clear()
        self.stats['start_time'] = datetime.now(timezone.utc)  # UTC consistent
        
        logger.info("Starting CMS poller...")
        logger.info(f"Data transfer mode: {self._data_mode}")
        
        if self._data_mode == 'LOGS':
            logger.info("LOGS mode: Data will be saved to CSV files in logs/ directory")
        
        # Load configuration
        config = Config.load()
        polling_config = config.get('polling', {})
        max_concurrent = polling_config.get('max_concurrent_requests', 10)
        self._api_semaphore = asyncio.Semaphore(max_concurrent)
        
        # Load CMS servers
        servers = []
        
        if self._data_mode == 'LOGS':
            # LOGS mode: Use config or environment (no database required)
            servers = get_standalone_cms_servers()
            if servers:
                logger.info(f"LOGS mode: Using {len(servers)} CMS server(s) from config/env")
            else:
                logger.error("LOGS mode: No CMS server configured in config.json or environment variables")
                logger.error("Set cms_servers array in config.json or CMS_HOST/CMS_USERNAME/CMS_PASSWORD env vars")
                return
        else:
            # RABBITMQ mode: Load from database
            try:
                db_client = await get_database_client()
                servers = await db_client.get_enabled_cms_servers()
            except Exception as e:
                logger.error(f"Failed to load CMS servers from database: {e}")
                # Try fallback to config/env
                servers = get_standalone_cms_servers()
                if servers:
                    logger.warning(f"Using fallback: {len(servers)} CMS server(s) from config/env")
                else:
                    logger.error("No CMS servers available (database failed, no fallback configured)")
                    return
        
        if not servers:
            logger.warning("No enabled CMS servers found")
            # Keep running to check for new servers periodically
            await self._wait_for_shutdown()
            return
        
        logger.info(f"Found {len(servers)} enabled CMS servers")
        
        # Create clients for each server
        for server in servers:
            self.cms_clients[server.id] = CMSApiClient(server)
            self._circuit_breakers[server.id] = CircuitBreaker()
            logger.info(f"  - {server.name} ({server.host}:{server.port})")
        
        # Start polling tasks
        device_interval = polling_config.get('device_status_interval_seconds', 30)
        alarm_interval = polling_config.get('safety_alarms_interval_seconds', 60)
        realtime_interval = polling_config.get('realtime_alarms_interval_seconds', 10)
        cleanup_interval = 300  # 5 minutes
        alarm_backfill_hours = polling_config.get('alarm_backfill_hours', 168)  # 7 days default
        gps_backfill_hours = polling_config.get('gps_backfill_hours', 168)  # 7 days default
        
        # Run backfills on startup
        if alarm_backfill_hours > 0:
            logger.info(f"Running alarm backfill for the last {alarm_backfill_hours} hours ({alarm_backfill_hours/24:.1f} days)...")
            await self._backfill_alarms(alarm_backfill_hours)
        
        if gps_backfill_hours > 0:
            logger.info(f"Running GPS trackdata backfill for the last {gps_backfill_hours} hours ({gps_backfill_hours/24:.1f} days)...")
            await self._backfill_gps_tracks(gps_backfill_hours)
        
        self._tasks = [
            asyncio.create_task(self._poll_devices_loop(device_interval), name="device_poller"),
            asyncio.create_task(self._poll_alarms_loop(alarm_interval), name="alarm_poller"),
            asyncio.create_task(self._poll_realtime_alarms_loop(realtime_interval), name="realtime_alarm_poller"),
            asyncio.create_task(self._cleanup_loop(cleanup_interval), name="cleanup"),
        ]
        
        try:
            # Wait for all tasks or shutdown
            done, pending = await asyncio.wait(
                self._tasks,
                return_when=asyncio.FIRST_EXCEPTION
            )
            
            # Check for exceptions
            for task in done:
                if task.exception() and not isinstance(task.exception(), asyncio.CancelledError):
                    logger.error(f"Task {task.get_name()} failed: {task.exception()}")
                    
        except asyncio.CancelledError:
            logger.info("Polling tasks cancelled")
        finally:
            await self._cleanup()
    
    async def stop(self):
        """Stop polling gracefully"""
        logger.info("Stopping CMS poller...")
        self.running = False
        self._shutdown_event.set()
        
        # Cancel all tasks
        for task in self._tasks:
            if not task.done():
                task.cancel()
        
        # Wait for tasks to finish with timeout
        if self._tasks:
            try:
                await asyncio.wait_for(
                    asyncio.gather(*self._tasks, return_exceptions=True),
                    timeout=5.0
                )
            except asyncio.TimeoutError:
                logger.warning("Task cancellation timed out")
    
    async def _cleanup(self):
        """Cleanup resources"""
        logger.debug("Cleaning up CMS clients...")
        for client in self.cms_clients.values():
            try:
                await asyncio.wait_for(client.close(), timeout=2.0)
            except Exception as e:
                logger.debug(f"Error closing client: {e}")
        self.cms_clients.clear()
        self._circuit_breakers.clear()
        logger.debug("CMS poller cleanup complete")
    
    async def _wait_for_shutdown(self):
        """Wait for shutdown signal"""
        try:
            await self._shutdown_event.wait()
        except asyncio.CancelledError:
            pass
    
    async def _poll_devices_loop(self, interval: int):
        """Poll device status from all CMS servers"""
        logger.info(f"Device polling loop started (interval: {interval}s)")
        
        while self.running and not self._shutdown_event.is_set():
            try:
                await self._poll_all_devices()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"Error in device polling loop: {e}", exc_info=True)
                self.stats['errors'] += 1
            
            # Interruptible wait
            if await self._interruptible_wait(interval):
                break  # Shutdown requested
        
        logger.info("Device polling loop stopped")
    
    async def _poll_alarms_loop(self, interval: int):
        """Poll safety alarms from all CMS servers"""
        logger.info(f"Alarm polling loop started (interval: {interval}s)")
        
        while self.running and not self._shutdown_event.is_set():
            try:
                await self._poll_all_alarms()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"Error in alarm polling loop: {e}", exc_info=True)
                self.stats['errors'] += 1
            
            # Interruptible wait
            if await self._interruptible_wait(interval):
                break  # Shutdown requested
        
        logger.info("Alarm polling loop stopped")
    
    async def _poll_realtime_alarms_loop(self, interval: int):
        """Poll real-time alarms using vehicleAlarm.action API"""
        logger.info(f"Real-time alarm polling loop started (interval: {interval}s)")
        
        while self.running and not self._shutdown_event.is_set():
            try:
                await self._poll_all_realtime_alarms()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"Error in realtime alarm polling loop: {e}", exc_info=True)
                self.stats['errors'] += 1
            
            # Interruptible wait
            if await self._interruptible_wait(interval):
                break  # Shutdown requested
        
        logger.info("Real-time alarm polling loop stopped")
    
    async def _poll_all_realtime_alarms(self):
        """Poll real-time alarms from all CMS servers"""
        if not self.cms_clients:
            return
        
        logger.debug(f"Polling realtime alarms from {len(self.cms_clients)} CMS servers...")
        
        tasks = [
            self._poll_server_realtime_alarms(server_id, client)
            for server_id, client in self.cms_clients.items()
            if self._circuit_breakers[server_id].can_execute()
        ]
        
        if not tasks:
            return
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        total_alarms = sum(r for r in results if isinstance(r, int))
        self.stats['realtime_alarms_polled'] += total_alarms
        
        logger.debug(f"Polled {total_alarms} realtime alarms")
    
    async def _poll_server_realtime_alarms(self, server_id: int, client: CMSApiClient) -> int:
        """Poll realtime alarms from a single CMS server.
        
        Uses unified GUID dedup cache shared with historical alarms.
        """
        async with self._api_semaphore:
            try:
                result = await asyncio.wait_for(
                    client.get_realtime_alarms(page=1, page_size=100),
                    timeout=30.0
                )
                
                if not result.get('success'):
                    logger.debug(f"Failed to get realtime alarms from server {server_id}")
                    return 0
                
                alarms = result.get('alarms', [])
                
                # Publish new alarms (to RabbitMQ or CSV based on mode)
                published = 0
                for alarm in alarms:
                    if self._shutdown_event.is_set():
                        break
                    
                    # Use unified GUID dedup (same cache as historical alarms)
                    guid = alarm.get('guid')
                    if not guid:
                        continue
                    
                    # Realtime alarms typically don't have video URLs yet
                    has_video = bool(alarm.get('photoUrl'))  # Photos might be available
                    
                    # Use unified dedup - if historical alarm already processed this, skip
                    if not self._should_process_alarm(guid, has_video):
                        self.stats['dedup_hits'] += 1
                        continue
                    
                    # Transform to event message
                    message = DataTransformer.transform_realtime_alarm_to_event(alarm)
                    
                    if message:
                        # Enrich with alarm flags (Teltonika pattern)
                        message = await self._enrich_with_alarm_config(message)
                        
                        # _publish_or_save handles routing to trackdata, events, alarms
                        success = await self._publish_or_save(message, "event")
                        
                        if success:
                            published += 1
                            self.stats['events_published'] += 1
                            # Mark in unified cache (no video typically for realtime)
                            self._mark_alarm_processed(guid, has_video)
                            
                            if self._load_monitor:
                                self._load_monitor.record_publish_success("event")
                                self._load_monitor.record_data_freshness("realtime_alarm")
                        else:
                            # Dead letter handling - log failed publishes
                            self._handle_dead_letter(message, "publish_failed")
                            if self._load_monitor:
                                self._load_monitor.record_publish_failure()
                                self._load_monitor.record_dead_letter()
                
                if published > 0:
                    logger.debug(f"Server {client.server.name}: {len(alarms)} realtime alarms, {published} new")
                
                return len(alarms)
                
            except asyncio.TimeoutError:
                logger.debug(f"Timeout polling realtime alarms from server {server_id}")
                return 0
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.debug(f"Error polling realtime alarms from server {server_id}: {e}")
                return 0
    
    async def _backfill_alarms(self, hours: int):
        """
        Backfill alarms on startup to catch up any missed events.
        
        Queries per-device for more reliable results (like fleet-monitor).
        
        Args:
            hours: How many hours back to fetch
        """
        if not self.cms_clients:
            return
        
        logger.info(f"Starting alarm backfill for the last {hours} hours ({hours/24:.1f} days)...")
        
        # UTC datetime objects - get_safety_alarms will auto-convert to CMS timezone
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(hours=hours)
        
        total_backfilled = 0
        total_devices = 0
        
        for server_id, client in self.cms_clients.items():
            if self._shutdown_event.is_set():
                break
            
            try:
                # First, get all devices to query per-device (more reliable)
                devices_result = await asyncio.wait_for(
                    client.get_all_devices(),
                    timeout=60.0
                )
                
                device_ids = []
                if devices_result.get('success'):
                    devices = devices_result.get('devices', [])
                    device_ids = [d.get('deviceId') or d.get('id') for d in devices if d.get('deviceId') or d.get('id')]
                    logger.info(f"Alarm backfill: Found {len(device_ids)} devices from {client.server.name}")
                
                # Query alarms (with device_ids for per-device query if available)
                # Longer timeout for 7-day backfill
                # Pass datetime objects - get_safety_alarms auto-converts to CMS timezone
                result = await asyncio.wait_for(
                    client.get_safety_alarms(start_time, end_time, device_ids if device_ids else None),
                    timeout=300.0  # 5 minute timeout for 7-day backfill
                )
                
                if not result.get('success'):
                    logger.warning(f"Alarm backfill failed for server {server_id}: {result.get('error', 'unknown')}")
                    continue
                
                alarms = result.get('alarms', [])
                
                if not alarms:
                    logger.info(f"No alarms found in backfill from server {client.server.name}")
                    continue
                
                logger.info(f"Processing {len(alarms)} alarms from {client.server.name}...")
                
                published = 0
                video_updates = 0
                for alarm in alarms:
                    if self._shutdown_event.is_set():
                        break
                    
                    # Use GUID for unified deduplication (same as realtime alarms)
                    guid = alarm.get('guid')
                    
                    # Check if alarm has video URL
                    has_video = bool(alarm.get('videoUrl'))
                    
                    # Smart deduplication - allow re-processing if video becomes available
                    if not self._should_process_alarm(guid, has_video):
                        continue
                    
                    # Check if this is a video update (already cached without video)
                    is_video_update = guid and guid in self._processed_alarm_guids and has_video
                    
                    # Transform and publish/save
                    message = DataTransformer.transform_alarm_to_event(alarm)
                    
                    if message:
                        # Enrich with alarm flags (Teltonika pattern)
                        message = await self._enrich_with_alarm_config(message)
                        
                        # _publish_or_save handles routing to trackdata, events, alarms
                        success = await self._publish_or_save(message, "event")
                        
                        if success:
                            published += 1
                            if is_video_update:
                                video_updates += 1
                            self._mark_alarm_processed(guid, has_video)
                
                total_backfilled += published
                if video_updates > 0:
                    logger.info(f"Backfilled {published} alarms ({video_updates} video updates) from {client.server.name}")
                total_devices += len(device_ids)
                logger.info(f"Backfilled {published} alarms from {client.server.name}")
                
            except asyncio.TimeoutError:
                logger.warning(f"Timeout during alarm backfill from server {server_id}")
            except Exception as e:
                logger.error(f"Error during alarm backfill from server {server_id}: {e}")
        
        self.stats['backfill_alarms'] = total_backfilled
        logger.info(f"Alarm backfill complete: {total_backfilled} alarms from {total_devices} devices")
    
    async def _backfill_gps_tracks(self, hours: int):
        """
        Backfill GPS trackdata on startup to catch up any missed data.
        
        Uses queryTrackDetail API which provides richer data than device status:
        - Speed, heading, altitude, satellites
        - Historical track points
        
        Args:
            hours: How many hours back to fetch
        """
        if not self.cms_clients:
            return
        
        logger.info(f"Starting GPS trackdata backfill for the last {hours} hours...")
        
        # UTC datetime objects - get_gps_track auto-converts to CMS timezone
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(hours=hours)
        
        total_backfilled = 0
        total_devices = 0
        
        for server_id, client in self.cms_clients.items():
            if self._shutdown_event.is_set():
                break
            
            try:
                # First, get list of all devices for this server
                devices_result = await asyncio.wait_for(
                    client.get_all_devices(),
                    timeout=60.0
                )
                
                if not devices_result.get('success'):
                    logger.warning(f"Failed to get devices for GPS backfill from server {server_id}")
                    continue
                
                devices = devices_result.get('devices', [])
                if not devices:
                    logger.debug(f"No devices for GPS backfill from server {client.server.name}")
                    continue
                
                logger.info(f"GPS backfill: Processing {len(devices)} devices from {client.server.name}...")
                
                server_backfilled = 0
                
                # Process devices in chunks to avoid overwhelming the API
                chunk_size = 5  # Process 5 devices at a time for GPS history
                for i in range(0, len(devices), chunk_size):
                    if self._shutdown_event.is_set():
                        break
                    
                    chunk = devices[i:i + chunk_size]
                    
                    # Fetch GPS tracks for each device in this chunk
                    # Pass datetime objects - get_gps_track auto-converts to CMS timezone
                    tasks = []
                    for device in chunk:
                        device_id = device.get('deviceId') or device.get('id')
                        if device_id:
                            tasks.append(self._backfill_device_gps(client, device_id, start_time, end_time))
                    
                    if tasks:
                        results = await asyncio.gather(*tasks, return_exceptions=True)
                        for result in results:
                            if isinstance(result, int):
                                server_backfilled += result
                    
                    # Small delay between chunks to be nice to the API
                    if i + chunk_size < len(devices) and not self._shutdown_event.is_set():
                        await asyncio.sleep(0.5)
                
                total_backfilled += server_backfilled
                total_devices += len(devices)
                logger.info(f"GPS backfill from {client.server.name}: {server_backfilled} track points from {len(devices)} devices")
                
            except asyncio.TimeoutError:
                logger.warning(f"Timeout during GPS backfill from server {server_id}")
            except Exception as e:
                logger.error(f"Error during GPS backfill from server {server_id}: {e}")
        
        self.stats['backfill_trackdata'] = total_backfilled
        logger.info(f"GPS trackdata backfill complete: {total_backfilled} track points from {total_devices} devices")
    
    async def _backfill_device_gps(self, client: CMSApiClient, device_id: str, 
                                    start_time: datetime, end_time: datetime) -> int:
        """
        Backfill GPS track for a single device.
        
        Args:
            client: CMS API client
            device_id: Device ID
            start_time: Start time (UTC datetime - auto-converted to CMS timezone)
            end_time: End time (UTC datetime - auto-converted to CMS timezone)
        
        Returns:
            Number of track points published
        """
        published = 0
        
        try:
            # Pass datetime objects - get_gps_track auto-converts to CMS timezone
            result = await asyncio.wait_for(
                client.get_gps_track(device_id, start_time, end_time),
                timeout=60.0
            )
            
            if not result.get('success'):
                return 0
            
            tracks = result.get('tracks', [])
            if not tracks:
                return 0
            
            for track in tracks:
                if self._shutdown_event.is_set():
                    break
                
                # Create dedup key (imei, gps_time)
                imei = DataTransformer.device_id_to_imei(device_id)
                gps_time = track.get('gpsTime')
                
                if not imei or not gps_time:
                    continue
                
                dedup_key = (str(imei), gps_time)
                
                # Skip if already processed
                if dedup_key in self._processed_trackdata:
                    self.stats['dedup_hits'] += 1
                    continue
                
                # Transform to trackdata message
                message = DataTransformer.transform_gps_track_to_trackdata(track, device_id)
                
                if message:
                    success = await self._publish_or_save(message, "trackdata")
                    
                    if success:
                        published += 1
                        self._processed_trackdata[dedup_key] = datetime.now(timezone.utc)  # UTC consistent
                        self.stats['trackdata_published'] += 1
                        
                        if self._load_monitor:
                            self._load_monitor.record_publish_success("trackdata")
            
            # Trim trackdata cache if too large
            if len(self._processed_trackdata) > self._processed_trackdata_max_size:
                self._cleanup_processed_trackdata()
            
        except asyncio.TimeoutError:
            logger.debug(f"Timeout fetching GPS track for device {device_id}")
        except Exception as e:
            logger.debug(f"Error fetching GPS track for device {device_id}: {e}")
        
        return published
    
    def _cleanup_processed_trackdata(self):
        """Remove expired or excess entries from processed trackdata cache"""
        now = datetime.now(timezone.utc)  # UTC consistent
        
        # Remove expired entries
        expired = [
            key for key, timestamp in self._processed_trackdata.items()
            if now - timestamp > self._processed_trackdata_ttl
        ]
        
        for key in expired:
            del self._processed_trackdata[key]
        
        if expired:
            logger.debug(f"Cleaned up {len(expired)} expired trackdata cache entries")
        
        # Also trim if still too large (keep newest half)
        if len(self._processed_trackdata) > self._processed_trackdata_max_size:
            sorted_items = sorted(self._processed_trackdata.items(), key=lambda x: x[1])
            to_remove = len(self._processed_trackdata) - self._processed_trackdata_max_size // 2
            for key, _ in sorted_items[:to_remove]:
                del self._processed_trackdata[key]
            logger.debug(f"Trimmed {to_remove} oldest trackdata cache entries")
    
    def _handle_dead_letter(self, message: Dict[str, Any], reason: str):
        """
        Handle messages that failed to publish (dead letter).
        
        Currently logs the failure. Can be extended to:
        - Write to a dead letter queue
        - Store in a file for retry
        - Send to monitoring
        """
        self.stats['dead_letter_count'] += 1
        
        logger.warning(
            f"Dead letter: {reason} - IMEI: {message.get('imei')}, "
            f"Type: {message.get('record_type')}, "
            f"Status: {message.get('data', {}).get('status')}"
        )
        
        # Record in load monitor
        if self._load_monitor:
            self._load_monitor.record_error("dead_letter")
    
    async def _cleanup_loop(self, interval: int):
        """Periodic cleanup of stale data"""
        while self.running and not self._shutdown_event.is_set():
            if await self._interruptible_wait(interval):
                break
            
            try:
                self._cleanup_processed_alarms()
                self._cleanup_processed_trackdata()
            except Exception as e:
                logger.error(f"Error in cleanup loop: {e}")
    
    async def _interruptible_wait(self, seconds: int) -> bool:
        """
        Wait for specified seconds or until shutdown.
        Returns True if shutdown was requested.
        """
        try:
            await asyncio.wait_for(
                self._shutdown_event.wait(),
                timeout=seconds
            )
            return True  # Shutdown requested
        except asyncio.TimeoutError:
            return False  # Normal timeout
    
    def _should_process_alarm(self, guid: str, has_video: bool) -> bool:
        """
        Check if alarm should be processed based on unified GUID dedup cache.
        
        Uses GUID as the unique key - same for both realtime and historical alarms.
        
        Returns True if:
        - Alarm not in cache (new alarm)
        - Alarm in cache without video, but new one has video (video update)
        
        Returns False if:
        - Alarm already processed with video (true duplicate)
        - Alarm already processed without video, new one also has no video
        """
        if not guid:
            return True  # No GUID, process anyway (edge case)
        
        if guid not in self._processed_alarm_guids:
            return True  # New alarm
        
        cached_timestamp, cached_has_video = self._processed_alarm_guids[guid]
        
        # If cached version has video, skip (already complete)
        if cached_has_video:
            return False
        
        # If cached version has no video but new one does, allow re-processing
        if not cached_has_video and has_video:
            logger.debug(f"Re-processing alarm {guid} - video now available")
            return True
        
        # Both have no video, skip
        return False
    
    def _mark_alarm_processed(self, guid: str, has_video: bool):
        """Mark alarm as processed in unified GUID dedup cache"""
        if guid:
            self._processed_alarm_guids[guid] = (datetime.now(timezone.utc), has_video)  # UTC consistent
    
    def _cleanup_processed_alarms(self):
        """Remove expired entries from processed alarms cache"""
        now = datetime.now(timezone.utc)  # UTC consistent
        expired = [
            guid for guid, (timestamp, _) in self._processed_alarm_guids.items()
            if now - timestamp > self._processed_alarm_guids_ttl
        ]
        
        for guid in expired:
            del self._processed_alarm_guids[guid]
        
        if expired:
            logger.debug(f"Cleaned up {len(expired)} expired alarm cache entries")
        
        # Also trim if too large
        if len(self._processed_alarm_guids) > self._processed_alarm_guids_max_size:
            # Sort by timestamp and remove oldest half
            sorted_items = sorted(self._processed_alarm_guids.items(), key=lambda x: x[1][0])
            to_remove = len(self._processed_alarm_guids) - self._processed_alarm_guids_max_size // 2
            for guid, _ in sorted_items[:to_remove]:
                del self._processed_alarm_guids[guid]
            logger.debug(f"Trimmed {to_remove} oldest alarm cache entries")
    
    async def _fetch_and_publish_device_statuses(
        self, 
        client: CMSApiClient, 
        online_devices: List[Dict[str, Any]]
    ) -> int:
        """
        Fetch device statuses in parallel and publish/save.
        
        Uses chunked parallel processing for optimal performance:
        - Processes devices in chunks (configurable via polling.parallel_chunk_size)
        - Within each chunk, all API calls run concurrently
        - Respects shutdown signal between chunks
        - Supports both RABBITMQ and LOGS modes
        """
        config = Config.load()
        PARALLEL_CHUNK_SIZE = config.get('polling', {}).get('parallel_chunk_size', 20)
        
        published = 0
        total_devices = len(online_devices)
        
        # Process in chunks
        for chunk_start in range(0, total_devices, PARALLEL_CHUNK_SIZE):
            if self._shutdown_event.is_set():
                break
            
            chunk = online_devices[chunk_start:chunk_start + PARALLEL_CHUNK_SIZE]
            
            # Create tasks for all devices in this chunk
            async def fetch_single_device(device: Dict[str, Any]) -> Optional[Dict[str, Any]]:
                """Fetch status for a single device with timeout"""
                try:
                    async with self._api_semaphore:
                        result = await asyncio.wait_for(
                            client.get_device_status(device['deviceId']),
                            timeout=10.0
                        )
                    
                    if result.get('success') and result.get('device'):
                        device_status = result['device']
                        device_status['online'] = True
                        return device_status
                except asyncio.TimeoutError:
                    logger.debug(f"Timeout getting status for {device.get('deviceId')}")
                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    logger.debug(f"Error getting status for {device.get('deviceId')}: {e}")
                return None
            
            # Run all chunk requests in parallel
            tasks = [fetch_single_device(device) for device in chunk]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Process results and publish
            for device_status in results:
                if self._shutdown_event.is_set():
                    break
                
                if isinstance(device_status, Exception):
                    continue
                
                if device_status is None:
                    continue
                
                try:
                    # Transform to message format
                    message = DataTransformer.transform_device_to_trackdata(device_status)
                    
                    if not message:
                        logger.debug(f"Transform returned None for device: {device_status.get('deviceId')}")
                    
                    if message:
                        # Auto-provision alarm config for new devices
                        imei_str = message.get('data', {}).get('imei', '')
                        if imei_str:
                            try:
                                imei = int(imei_str)
                                await self._ensure_device_provisioned(imei)
                            except (ValueError, TypeError):
                                pass
                        
                        success = await self._publish_or_save(message, "trackdata")
                        
                        if success:
                            published += 1
                            self.stats['trackdata_published'] += 1
                            if self._load_monitor:
                                self._load_monitor.record_publish_success("trackdata")
                                self._load_monitor.record_data_freshness("trackdata")
                        else:
                            if self._load_monitor:
                                self._load_monitor.record_publish_failure()
                except Exception as e:
                    logger.debug(f"Error publishing device status: {e}")
        
        return published
    
    async def _poll_all_devices(self):
        """Poll devices from all CMS servers in parallel"""
        if not self.cms_clients:
            return
        
        # Check if trackdata polling is enabled
        config = Config.load()
        if not config.get('polling', {}).get('enable_trackdata_polling', True):
            logger.debug("Trackdata polling disabled, skipping device status fetch")
            return
        
        logger.debug(f"Polling devices from {len(self.cms_clients)} CMS servers...")
        
        # Poll each server in parallel (respecting semaphore)
        tasks = [
            self._poll_server_devices(server_id, client)
            for server_id, client in self.cms_clients.items()
            if self._circuit_breakers[server_id].can_execute()
        ]
        
        if not tasks:
            logger.warning("All CMS servers are in circuit breaker open state")
            return
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Update stats
        total_devices = sum(r for r in results if isinstance(r, int))
        self.stats['devices_polled'] += total_devices
        
        logger.debug(f"Polled {total_devices} devices from {len(tasks)} servers")
    
    async def _poll_server_devices(self, server_id: int, client: CMSApiClient) -> int:
        """Poll devices from a single CMS server with rate limiting"""
        async with self._api_semaphore:
            try:
                result = await asyncio.wait_for(
                    client.get_all_devices(),
                    timeout=30.0
                )
                
                if not result.get('success'):
                    logger.warning(f"Failed to get devices from server {server_id}: {result.get('error')}")
                    self._circuit_breakers[server_id].record_failure()
                    return 0
                
                devices = result.get('devices', [])
                
                # Record success
                self._circuit_breakers[server_id].record_success()
                
                # Update server health (skip in LOGS mode or for config-based servers)
                if self._data_mode != 'LOGS' and server_id != 0:
                    try:
                        db_client = await get_database_client()
                        await db_client.update_cms_health(server_id, 'healthy', len(devices))
                    except Exception as e:
                        logger.debug(f"Failed to update server health: {e}")
                
                # Auto-provision alarm configs for ALL discovered devices (including offline)
                provisioned_count = 0
                for device in devices:
                    device_id = device.get('deviceId') or device.get('id')
                    if device_id:
                        try:
                            imei = int(device_id)
                            if await self._ensure_device_provisioned(imei):
                                provisioned_count += 1
                        except (ValueError, TypeError):
                            pass
                
                if provisioned_count > 0:
                    logger.info(f"Auto-provisioned alarm configs for {provisioned_count} new devices from {client.server.name}")
                
                # Filter online devices for trackdata polling
                online_devices = [d for d in devices if d.get('online', False)]
                
                if not online_devices:
                    logger.debug(f"Server {client.server.name}: {len(devices)} devices, 0 online")
                    return len(devices)
                
                # Process devices in parallel with controlled concurrency
                published = await self._fetch_and_publish_device_statuses(
                    client, online_devices
                )
                
                logger.debug(f"Server {client.server.name}: {len(devices)} devices, {published} published")
                return len(devices)
                
            except asyncio.TimeoutError:
                logger.warning(f"Timeout polling devices from server {server_id}")
                self._circuit_breakers[server_id].record_failure()
                self.stats['errors'] += 1
                return 0
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"Error polling devices from server {server_id}: {e}")
                self._circuit_breakers[server_id].record_failure()
                self.stats['errors'] += 1
                
                # Update server health to unhealthy (skip in LOGS mode or for config-based servers)
                if self._data_mode != 'LOGS' and server_id != 0:
                    try:
                        db_client = await get_database_client()
                        await db_client.update_cms_health(server_id, 'unhealthy')
                    except:
                        pass
                
                return 0
    
    async def _poll_all_alarms(self):
        """Poll safety alarms from all CMS servers in parallel.
        
        Uses a longer lookback window (default 2 hours) to catch videos that 
        were still processing when the alarm was first detected.
        Deduplication prevents re-processing the same alarms.
        """
        if not self.cms_clients:
            return
        
        # Get configurable lookback window (default 2 hours to catch processed videos)
        polling_config = Config.load().get('polling', {})
        alarm_lookback_minutes = polling_config.get('alarm_lookback_minutes', 120)
        
        logger.debug(f"Polling alarms from {len(self.cms_clients)} CMS servers (last {alarm_lookback_minutes} min)...")
        
        # Time range: configurable lookback (default 2 hours)
        # UTC datetime objects - get_safety_alarms auto-converts to CMS timezone
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(minutes=alarm_lookback_minutes)
        
        # Poll each server in parallel (pass datetime objects for auto-conversion)
        tasks = [
            self._poll_server_alarms(server_id, client, start_time, end_time)
            for server_id, client in self.cms_clients.items()
            if self._circuit_breakers[server_id].can_execute()
        ]
        
        if not tasks:
            logger.warning("All CMS servers are in circuit breaker open state")
            return
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Update stats
        total_alarms = sum(r for r in results if isinstance(r, int))
        self.stats['alarms_polled'] += total_alarms
        
        logger.debug(f"Polled {total_alarms} alarms from {len(tasks)} servers")
    
    async def _poll_server_alarms(self, server_id: int, client: CMSApiClient,
                                   start_time: datetime, end_time: datetime) -> int:
        """Poll alarms from a single CMS server with rate limiting.
        
        Args:
            server_id: CMS server ID
            client: CMS API client
            start_time: Start time (UTC datetime - auto-converted to CMS timezone)
            end_time: End time (UTC datetime - auto-converted to CMS timezone)
        """
        async with self._api_semaphore:
            try:
                result = await asyncio.wait_for(
                    client.get_safety_alarms(start_time, end_time),
                    timeout=60.0
                )
                
                if not result.get('success'):
                    logger.warning(f"Failed to get alarms from server {server_id}")
                    self._circuit_breakers[server_id].record_failure()
                    return 0
                
                alarms = result.get('alarms', [])
                
                # Record success
                self._circuit_breakers[server_id].record_success()
                
                # Publish new alarms (to RabbitMQ or CSV based on mode)
                published = 0
                video_updates = 0
                for alarm in alarms:
                    if self._shutdown_event.is_set():
                        break
                    
                    # Use GUID for unified deduplication (same as realtime alarms)
                    guid = alarm.get('guid')
                    
                    # Check if alarm has video URL
                    has_video = bool(alarm.get('videoUrl'))
                    
                    # Smart deduplication - allow re-processing if video becomes available
                    if not self._should_process_alarm(guid, has_video):
                        self.stats['dedup_hits'] += 1
                        continue
                    
                    # Check if this is a video update
                    is_video_update = guid and guid in self._processed_alarm_guids and has_video
                    
                    # Transform to message format
                    message = DataTransformer.transform_alarm_to_event(alarm)
                    
                    if message:
                        # Enrich with alarm flags (Teltonika pattern)
                        message = await self._enrich_with_alarm_config(message)
                        
                        # _publish_or_save handles routing to trackdata, events, alarms
                        success = await self._publish_or_save(message, "event")
                        
                        if success:
                            published += 1
                            if is_video_update:
                                video_updates += 1
                            self.stats['events_published'] += 1
                            if self._load_monitor:
                                self._load_monitor.record_publish_success("event")
                                self._load_monitor.record_data_freshness("event")
                            
                            # Mark as processed with video status
                            self._mark_alarm_processed(guid, has_video)
                        else:
                            if self._load_monitor:
                                self._load_monitor.record_publish_failure()
                
                logger.debug(f"Server {client.server.name}: {len(alarms)} alarms, {published} new")
                return len(alarms)
                
            except asyncio.TimeoutError:
                logger.warning(f"Timeout polling alarms from server {server_id}")
                self._circuit_breakers[server_id].record_failure()
                self.stats['errors'] += 1
                return 0
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"Error polling alarms from server {server_id}: {e}")
                self._circuit_breakers[server_id].record_failure()
                self.stats['errors'] += 1
                return 0
    
    def get_stats(self) -> Dict[str, Any]:
        """Get poller statistics"""
        uptime = None
        if self.stats['start_time']:
            uptime = str(datetime.now(timezone.utc) - self.stats['start_time'])  # UTC consistent
        
        # Circuit breaker states
        cb_states = {
            server_id: cb.state
            for server_id, cb in self._circuit_breakers.items()
        }
        
        # Update load monitor with current stats
        if self._load_monitor:
            healthy = sum(1 for cb in self._circuit_breakers.values() if cb.state == 'closed')
            unhealthy = sum(1 for cb in self._circuit_breakers.values() if cb.state != 'closed')
            self._load_monitor.update_cms_health(healthy, unhealthy)
            self._load_monitor.update_dedup_stats(self.stats['dedup_hits'], len(self._processed_alarm_guids))
        
        return {
            **self.stats,
            'uptime': uptime,
            'servers_count': len(self.cms_clients),
            'processed_alarm_guids_cache_size': len(self._processed_alarm_guids),  # Unified cache
            'circuit_breaker_states': cb_states,
            'running': self.running,
        }
