"""
CMS API Client for Camera Parser
Adapted from fleet-monitor/server/cms_api.py for async operation
"""
import asyncio
import logging
import re
import time
import aiohttp
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone, timedelta
from urllib.parse import quote, urlparse, parse_qs, unquote

import sys
sys.path.insert(0, '..')
from config import Config
from camera_infrastructure.db_client import CMSServer
from camera_infrastructure.load_monitor import get_load_monitor

logger = logging.getLogger(__name__)


def timestamp_to_seconds_in_day(timestamp_ms: int) -> int:
    """Convert millisecond timestamp to seconds since midnight.
    
    Used for video file time parameters.
    """
    try:
        return int((timestamp_ms % 86400000) / 1000)
    except (ValueError, TypeError):
        return 0


def ensure_jsession_in_url(url: str, session_id: str) -> str:
    """Ensure jsession parameter is in URL."""
    if not url:
        return url
        
    if 'jsession=' in url:
        # Replace existing jsession
        return re.sub(r'jsession=[^&]*', f'jsession={session_id}', url)
    else:
        # Add jsession
        separator = '&' if '?' in url else '?'
        return f"{url}{separator}jsession={session_id}"


def get_filter_alarm_types() -> bool:
    """Get filter_alarm_types setting from config.
    
    Returns:
        True = Only process selected alarm types (production)
        False = Process ALL alarm types (testing)
    """
    return Config.load().get('polling', {}).get('filter_alarm_types', True)

# Alarm type names mapping - ONLY user-requested events
# Maps CMS alarm codes to standardized event names
# Source: fleet-monitor/server/alarm_names.py
ALARM_TYPE_NAMES = {
    # Overspeeding
    11: 'Overspeeding',
    428: 'Overspeeding',
    
    # Forward Collision
    600: 'Forward Collision',
    601: 'Forward Collision',
    512: 'Forward Collision',
    513: 'Forward Collision',
    840: 'Forward Collision',
    841: 'Forward Collision',
    1207: 'Forward Collision',
    
    # Fatigue (includes yawning detection)
    618: 'Fatigue',
    619: 'Fatigue',
    1200: 'Fatigue',
    
    # PhoneCalling
    620: 'PhoneCalling',
    621: 'PhoneCalling',
    525: 'PhoneCalling',
    541: 'PhoneCalling',
    1203: 'PhoneCalling',
    
    # Smoking
    622: 'Smoking',
    623: 'Smoking',
    1202: 'Smoking',
    
    # Distraction
    624: 'Distraction',
    625: 'Distraction',
    702: 'Distraction',
    703: 'Distraction',
    1201: 'Distraction',
    
    # Eyes Close (Long Time No Visual)
    628: 'Eyes Close',
    629: 'Eyes Close',
    1434: 'Eyes Close',
    
    # Lost Face (Driver Not In Seat)
    630: 'Lost Face',
    631: 'Lost Face',
    708: 'Lost Face',
    709: 'Lost Face',
    1435: 'Lost Face',
    
    # SeatBelt
    706: 'SeatBelt',
    707: 'SeatBelt',
    1205: 'SeatBelt',
    
    # Backward Collision (Rear Approach)
    633: 'Backward Collision',
    749: 'Backward Collision',
    1234: 'Backward Collision',
    1235: 'Backward Collision',
}

# Set of allowed alarm types for filtering
ALLOWED_ALARM_TYPES = set(ALARM_TYPE_NAMES.keys())


class CMSApiClient:
    """
    Async CMS API Client for a single CMS server.
    
    Features:
    - Automatic session management with re-login on expiry
    - Proper connection cleanup
    - Request timeouts
    - Comprehensive error handling
    """
    
    DEFAULT_TIMEOUT = 30
    DEFAULT_PAGE_SIZE = 200
    SESSION_RETRY_LIMIT = 2
    
    def __init__(self, server: CMSServer):
        self.server = server
        self.session_id = server.session_id
        self._session: Optional[aiohttp.ClientSession] = None
        self._session_lock = asyncio.Lock()
        self._login_failures = 0
        self._request_count = 0
        self._error_count = 0
        
        # Port configuration from server
        self._server_host = server.host
        self._web_port = server.port
        self._stream_port = server.stream_port
        self._storage_port = server.storage_port
        self._download_port = server.download_port
    
    def _get_download_port(self) -> int:
        """Get the download server port for video URLs."""
        return self._download_port
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session with proper timeouts"""
        async with self._session_lock:
            if self._session is None or self._session.closed:
                timeout = aiohttp.ClientTimeout(
                    total=self.DEFAULT_TIMEOUT,
                    connect=10,
                    sock_read=30
                )
                connector = aiohttp.TCPConnector(
                    limit=10,  # Max connections per host
                    limit_per_host=5,
                    ttl_dns_cache=300,
                    enable_cleanup_closed=True
                )
                self._session = aiohttp.ClientSession(
                    timeout=timeout,
                    connector=connector
                )
            return self._session
    
    async def close(self):
        """Close the aiohttp session gracefully"""
        async with self._session_lock:
            if self._session and not self._session.closed:
                try:
                    await self._session.close()
                    # Wait a bit for connections to close properly
                    await asyncio.sleep(0.1)
                except Exception as e:
                    logger.debug(f"Error closing session: {e}")
                finally:
                    self._session = None
    
    async def _login(self) -> str:
        """Login to CMS and get session ID"""
        session = await self._get_session()
        url = f"{self.server.base_url}/StandardApiAction_login.action"
        
        params = {
            'account': self.server.username,
            'password': self.server.password
        }
        
        try:
            async with session.get(url, params=params) as response:
                data = await response.json()
                
                if data.get('result') == 0:
                    self.session_id = data.get('jsession')
                    logger.info(f"✓ Logged into CMS server: {self.server.name}")
                    return self.session_id
                else:
                    raise Exception(f"Login failed: result={data.get('result')}")
        except Exception as e:
            logger.error(f"Failed to login to CMS {self.server.name}: {e}")
            raise
    
    async def _ensure_session(self) -> str:
        """Ensure we have a valid session"""
        if not self.session_id:
            return await self._login()
        return self.session_id
    
    async def _make_request(self, endpoint: str, params: Dict[str, Any], 
                           retry_on_fail: bool = True) -> Dict[str, Any]:
        """Make an API request with automatic session handling and latency tracking"""
        session = await self._get_session()
        jsession = await self._ensure_session()
        params['jsession'] = jsession
        
        url = f"{self.server.base_url}/{endpoint}"
        self._request_count += 1
        
        start_time = time.perf_counter()
        
        try:
            async with session.get(url, params=params) as response:
                data = await response.json()
                
                # Retry with fresh session if failed
                if data.get('result') != 0 and retry_on_fail:
                    self.session_id = None
                    jsession = await self._ensure_session()
                    params['jsession'] = jsession
                    async with session.get(url, params=params) as retry_response:
                        data = await retry_response.json()
                
                # Record latency
                latency_ms = (time.perf_counter() - start_time) * 1000
                try:
                    load_monitor = get_load_monitor()
                    load_monitor.record_api_latency(latency_ms, endpoint)
                except Exception:
                    pass
                
                return data
        except Exception as e:
            self._error_count += 1
            
            # Record latency even on error
            latency_ms = (time.perf_counter() - start_time) * 1000
            try:
                load_monitor = get_load_monitor()
                load_monitor.record_api_latency(latency_ms, endpoint)
                load_monitor.record_error("api")
            except Exception:
                pass
            
            logger.error(f"API request failed for {endpoint}: {e}")
            return {'result': -1, 'error': str(e)}
    
    # =========================================================================
    # Device List and Status
    # =========================================================================
    
    async def get_all_devices(self) -> Dict[str, Any]:
        """Get all devices with their current status"""
        data = await self._make_request('StandardApiAction_queryUserVehicle.action', {})
        
        if data.get('result') != 0:
            return {'success': False, 'error': 'Failed to fetch devices', 'devices': []}
        
        devices = []
        device_ids = []
        
        for v in data.get('vehicles', []):
            device_list = v.get('dl', [])
            
            if device_list and len(device_list) > 0:
                for device_info in device_list:
                    device = self._parse_device(v, device_info)
                    devices.append(device)
                    device_ids.append(device['deviceId'])
            else:
                device = self._parse_device(v)
                devices.append(device)
                device_ids.append(device['deviceId'])
        
        # Fetch and apply online status
        if device_ids:
            online_status = await self._get_devices_online_status(device_ids)
            for device in devices:
                device_id = device['deviceId']
                if device_id in online_status:
                    device['online'] = online_status[device_id]
        
        return {'success': True, 'devices': devices, 'total': len(devices)}
    
    def _parse_device(self, vehicle: Dict[str, Any], device_info: Dict[str, Any] = None) -> Dict[str, Any]:
        """Parse device information from vehicle data"""
        plate_number = vehicle.get('nm') or 'Unknown'
        
        if device_info:
            device_id = device_info.get('id') or device_info.get('did') or plate_number
        else:
            device_id = vehicle.get('did') or vehicle.get('id') or plate_number
        
        return {
            'deviceId': device_id,
            'plateNumber': plate_number,
            'online': False,
            'group': vehicle.get('pnm') or 'Ungrouped',
        }
    
    async def _get_devices_online_status(self, device_ids: List[str]) -> Dict[str, bool]:
        """Fetch online status for multiple devices"""
        if not device_ids:
            return {}
        
        session = await self._get_session()
        jsession = await self._ensure_session()
        
        url = f"{self.server.base_url}/StandardApiAction_getDeviceOlStatus.action"
        device_ids_str = ','.join(str(d) for d in device_ids)
        
        try:
            params = {'jsession': jsession, 'devIdno': device_ids_str}
            async with session.get(url, params=params) as response:
                data = await response.json()
                
                if data.get('result') != 0:
                    return {}
                
                online_status = {}
                for item in data.get('onlines', []):
                    did = item.get('did')
                    vid = item.get('vid')
                    is_online = item.get('online') in [1, '1', True]
                    
                    if did:
                        online_status[did] = is_online
                    if vid:
                        online_status[vid] = is_online
                
                return online_status
        except Exception as e:
            logger.error(f"Error fetching online status: {e}")
            return {}
    
    async def get_device_status(self, device_id: str) -> Dict[str, Any]:
        """Get detailed status for a specific device"""
        data = await self._make_request(
            'StandardApiAction_getDeviceStatus.action',
            {'devIdno': device_id, 'toMap': 1}
        )
        
        if data.get('result') != 0:
            return {'success': False, 'error': f"Failed to get status for {device_id}"}
        
        status_list = data.get('status', [])
        if not status_list:
            return {'success': True, 'device': None}
        
        status = status_list[0]
        lat, lng = self._parse_coordinates(status)
        
        # Debug: Log raw status data to see what fields CMS returns
        logger.debug(f"Raw device status for {device_id}: alt={status.get('alt')}, sp={status.get('sp')}, hd={status.get('hd')}, gtsc={status.get('gtsc')}, gt={status.get('gt')}")
        
        # Safely parse numeric values (may be strings from API)
        def safe_int(val, default=0):
            try:
                return int(float(val)) if val else default
            except (ValueError, TypeError):
                return default
        
        return {
            'success': True,
            'device': {
                'deviceId': device_id,
                'online': status.get('ol') == 1,
                'latitude': lat,
                'longitude': lng,
                'altitude': safe_int(status.get('alt')),
                'speed': safe_int(status.get('sp')) // 10,  # Convert to km/h
                'heading': safe_int(status.get('hd')),
                'satellites': safe_int(status.get('gtsc')),
                'gpsTime': self._parse_timestamp(status.get('gt'))
            }
        }
    
    # =========================================================================
    # GPS Track History
    # =========================================================================
    
    def _parse_gps_track_point(self, track: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Parse a single GPS track point from API response.
        
        Based on fleet-monitor/server/cms_api.py
        """
        lat, lng = self._parse_coordinates(track)
        
        # Skip invalid coordinates
        if abs(lat) < 0.1 and abs(lng) < 0.1:
            return None
        
        # Parse speed (CMS returns speed * 10)
        raw_speed = track.get('sp', 0)
        try:
            speed = float(raw_speed or 0) / 10.0
        except (ValueError, TypeError):
            speed = 0.0
        
        gps_time = self._parse_timestamp(track.get('gt'))
        
        return {
            'deviceId': track.get('id') or track.get('devIdno'),
            'lat': lat,
            'lng': lng,
            'speed': speed,
            'heading': int(track.get('hx', 0) or 0),
            'altitude': int(track.get('alt', 0) or 0),
            'satellites': int(track.get('gtsc', 0) or track.get('sn', 0) or 0),
            'gpsTime': gps_time,
            'mileage': int(track.get('lc', 0) or 0),
        }
    
    async def get_gps_track(self, device_id: str, start_time, 
                            end_time, max_pages: int = 50) -> Dict[str, Any]:
        """Get GPS tracking history for a device.
        
        Based on fleet-monitor/server/cms_api.py - queryTrackDetail API
        
        Args:
            device_id: Device ID
            start_time: Start time - either:
                - datetime object in UTC (auto-converted to CMS timezone)
                - string in CMS local format "YYYY-MM-DD HH:MM:SS"
            end_time: End time (same format as start_time)
            max_pages: Maximum pages to fetch (default 50)
            
        Returns:
            Dict with 'success', 'tracks' list, 'totalRecords'
        """
        # Convert datetime objects to CMS local time strings
        if isinstance(start_time, datetime):
            start_time = self._utc_to_cms_local(start_time)
        if isinstance(end_time, datetime):
            end_time = self._utc_to_cms_local(end_time)
        
        all_tracks = []
        current_page = 1
        total_pages = 1
        total_records = 0
        
        logger.debug(f"[GPS Track] Querying device={device_id}, start={start_time}, end={end_time}")
        
        while current_page <= total_pages and current_page <= max_pages:
            try:
                data = await self._make_request(
                    'StandardApiAction_queryTrackDetail.action',
                    {
                        'devIdno': device_id,
                        'begintime': start_time,
                        'endtime': end_time,
                        'toMap': 1,
                        'currentPage': current_page,
                        'pageRecords': 500
                    }
                )
                
                if data.get('result') != 0:
                    if current_page == 1:
                        return {'success': False, 'error': f"API error: result code {data.get('result')}"}
                    break
                
                tracks_raw = data.get('tracks', [])
                total_pages = data.get('totalPages', 1)
                total_records = data.get('totalRecords', 0)
                
                for t in tracks_raw:
                    # Ensure device ID is set
                    t['devIdno'] = device_id
                    parsed = self._parse_gps_track_point(t)
                    if parsed:
                        all_tracks.append(parsed)
                
                current_page += 1
                
            except Exception as e:
                logger.error(f"[GPS Track] Error fetching page {current_page}: {e}")
                break
        
        logger.debug(f"[GPS Track] Found {len(all_tracks)} track points for device {device_id}")
        
        return {
            'success': True,
            'tracks': all_tracks,
            'totalRecords': total_records
        }
    
    # =========================================================================
    # Safety Alarms (Violations)
    # =========================================================================
    
    async def get_safety_alarms(self, start_time, end_time, 
                                 device_ids: List[str] = None) -> Dict[str, Any]:
        """Get safety alarms (violations) for all or specific devices.
        
        Based on fleet-monitor's tested implementation with proper pagination.
        
        Only fetches events we care about:
        - Overspeeding, Distraction, Smoking, PhoneCalling, Fatigue,
        - SeatBelt, Forward Collision, Backward Collision, Lost Face, Eyes Close
        
        Args:
            start_time: Start time - either:
                - datetime object in UTC (auto-converted to CMS timezone)
                - string in CMS local format "YYYY-MM-DD HH:MM:SS"
            end_time: End time (same format as start_time)
            device_ids: Optional list of device IDs to filter
        """
        # Convert datetime objects to CMS local time strings
        if isinstance(start_time, datetime):
            start_time = self._utc_to_cms_local(start_time)
        if isinstance(end_time, datetime):
            end_time = self._utc_to_cms_local(end_time)
        all_alarms = []
        
        # Alarm type groups for querying
        if get_filter_alarm_types():
            # Only query our selected alarm types (more efficient)
            # Codes from fleet-monitor/server/alarm_names.py
            alarm_type_lists = [
                # Overspeeding: 11, 428
                '11,428',
                # Forward Collision: 600, 601, 512, 513, 840, 841, 1207
                '600,601,512,513,840,841,1207',
                # Fatigue (618,619,1200), PhoneCalling (620,621,525,541,1203),
                # Smoking (622,623,1202), Distraction (624,625,702,703,1201)
                '618,619,620,621,622,623,624,625,1200,1201,1202,1203,525,541,702,703',
                # Eyes Close (628,629,1434), Lost Face (630,631,708,709,1435), SeatBelt (706,707,1205)
                '628,629,630,631,706,707,708,709,1205,1434,1435',
                # Backward Collision: 633, 749, 1234, 1235
                '633,749,1234,1235',
            ]
        else:
            # TESTING MODE: Query ALL alarm types (from fleet-monitor's comprehensive list)
            alarm_type_lists = [
                '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30',
                '31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60',
                '61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80',
                '600,601,602,603,604,605,606,607,608,609,610,611,612,613,614,615,616,617',
                '618,619,620,621,622,623,624,625,626,627,628,629,630,631,632,633,634,635,636,637,638,639,640,641,642,643,644,645',
                '700,701,702,703,704,705,706,707,708,709,710,711,712,713,714,715,716,717,718,719,720,721,722,723,724,725,726,727,728,729,730,731,732,733,734,735,736,737,738,739,740,741,742,743,744,745,746',
                '840,841,842,843,844,845,846',
                '1200,1201,1202,1203,1204,1205,1206,1207,1208,1209,1210',
            ]
            logger.info("TESTING MODE: Querying ALL alarm types (get_filter_alarm_types()=False)")
        
        session = await self._get_session()
        jsession = await self._ensure_session()
        
        # If device_ids provided, query per device (more reliable)
        # Otherwise query without device filter (may return less data on some CMS versions)
        devices_to_query = device_ids if device_ids else [None]
        
        for device_id in devices_to_query:
            for alarm_types in alarm_type_lists:
                for media_type in [0, 1]:  # 0=photo, 1=video
                    # Paginate through results (like fleet-monitor)
                    for page in range(1, 10):  # Max 10 pages per query
                        try:
                            url = f"{self.server.base_url}/StandardApiAction_performanceReportPhotoListSafe.action"
                            params = {
                                'jsession': jsession,
                                'begintime': start_time,
                                'endtime': end_time,
                                'alarmType': alarm_types,
                                'mediaType': media_type,
                                'toMap': 1,
                                'currentPage': page,
                                'pageRecords': self.DEFAULT_PAGE_SIZE
                            }
                            
                            # Add device filter if specified (vehiIdno is the API parameter)
                            if device_id:
                                params['vehiIdno'] = device_id
                            
                            async with session.get(url, params=params) as response:
                                data = await response.json()
                                
                                if data.get('result') != 0:
                                    break  # API error, stop pagination
                                
                                infos = data.get('infos', [])
                                if not infos:
                                    break  # No more results, stop pagination
                                
                                for alarm in infos:
                                    parsed = self._parse_alarm(alarm)
                                    if parsed:
                                        all_alarms.append(parsed)
                                
                                # If less than page size, no more pages
                                if len(infos) < self.DEFAULT_PAGE_SIZE:
                                    break
                                    
                        except Exception as e:
                            logger.error(f"Error fetching alarms page {page}: {e}")
                            break  # Stop pagination on error
        
        # Deduplicate by (deviceId, fileTime, alarmType, channel) and MERGE photo+video
        # Same logic as fleet-monitor: combine photo (mediaType=0) and video (mediaType=1) records
        all_by_id = {}  # guid -> alarm
        by_composite = {}  # composite_key -> guid
        
        for alarm in all_alarms:
            alarm_id = alarm.get('guid')
            device_id = alarm.get('deviceId') or 'unknown'
            composite_key = (
                str(device_id),
                str(alarm.get('fileTime') or ''),
                str(alarm.get('alarmType') or ''),
                int(alarm.get('channel') or 0)
            )
            
            # Find existing record by guid or composite key
            existing_key = None
            if alarm_id and alarm_id in all_by_id:
                existing_key = alarm_id
            elif composite_key in by_composite:
                existing_key = by_composite[composite_key]
            
            if existing_key:
                # MERGE: Update existing record with video/photo data
                existing = all_by_id[existing_key]
                # If new alarm has video URL, update existing
                if alarm.get('videoUrl'):
                    existing['videoUrl'] = alarm['videoUrl']
                    logger.debug(f"Merged video URL into alarm {existing_key}")
                # If new alarm has photo URL and existing doesn't, add it
                if alarm.get('photoUrl') and not existing.get('photoUrl'):
                    existing['photoUrl'] = alarm['photoUrl']
                    logger.debug(f"Merged photo URL into alarm {existing_key}")
            else:
                # New alarm - add to both indexes
                if alarm_id:
                    all_by_id[alarm_id] = alarm
                    by_composite[composite_key] = alarm_id
                else:
                    # No guid, use composite key as id
                    fake_id = f"{composite_key}"
                    all_by_id[fake_id] = alarm
                    by_composite[composite_key] = fake_id
        
        unique_alarms = list(all_by_id.values())
        logger.info(f"Fetched {len(unique_alarms)} unique alarms from {len(all_alarms)} total (merged photo+video)")
        return {'success': True, 'alarms': unique_alarms, 'total': len(unique_alarms)}
    
    def _parse_alarm(self, alarm: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Parse a single alarm from API response.
        
        When get_filter_alarm_types()=True, only processes alarms in ALLOWED_ALARM_TYPES:
        - Overspeeding, Distraction, Smoking, PhoneCalling, Fatigue,
        - SeatBelt, Forward Collision, Backward Collision, Lost Face, Eyes Close
        
        When get_filter_alarm_types()=False, processes ALL alarm types (for testing).
        """
        file_time = alarm.get('fileTime')
        if not file_time:
            return None
        
        alarm_type = alarm.get('alarmType', 0)
        
        # Filter: only process allowed alarm types (if filtering enabled)
        if get_filter_alarm_types() and alarm_type not in ALLOWED_ALARM_TYPES:
            return None
        
        type_name = ALARM_TYPE_NAMES.get(alarm_type, f'Alarm Type {alarm_type}')
        
        # Parse coordinates
        lat = self._convert_coordinate(alarm.get('weiDu', 0))
        lng = self._convert_coordinate(alarm.get('jingDu', 0))
        
        # Parse time - use _parse_timestamp for consistent format
        gps_time = self._parse_timestamp(file_time)
        
        # Get photo/video URLs using fleet-monitor tested logic
        media_type = alarm.get('mediaType', 0)
        plate_number = alarm.get('vehiIdno') or ''
        
        # Photo URL - only use fileUrl for photos (mediaType=0)
        if media_type == 0:
            photo_url = alarm.get('fileUrl') or alarm.get('photoUrl') or alarm.get('photo') or ''
        else:
            photo_url = alarm.get('photoUrl') or alarm.get('photo') or ''
        
        if photo_url:
            photo_url = ensure_jsession_in_url(photo_url, self.session_id)
        
        # Video URL - use comprehensive construction logic
        video_url = self._construct_video_url(alarm, plate_number)
        
        return {
            'guid': alarm.get('label'),  # Unique alarm ID for unified deduplication
            'deviceId': alarm.get('devIdno') or alarm.get('vehiIdno'),
            'plateNumber': plate_number,
            'alarmType': alarm_type,
            'typeName': type_name,
            'fileTime': file_time,
            'gpsTime': gps_time,
            'latitude': lat,
            'longitude': lng,
            'speed': int(alarm.get('speed', 0) or 0),
            'photoUrl': photo_url,
            'videoUrl': video_url,
            'channel': alarm.get('channel'),
            'mediaType': media_type,  # 0=photo, 1=video - needed for merge logic
        }
    
    def _construct_video_url(self, alarm: Dict[str, Any], plate_number: str) -> str:
        """Construct video URL from alarm data (ported from fleet-monitor)."""
        media_type = alarm.get('mediaType')
        
        # Only process video URLs for video-type alarms (mediaType=1)
        if media_type != 1:
            return ''
        
        # Check all possible video URL fields
        video_file = alarm.get('videoFile')
        video_url_field = alarm.get('videoUrl')
        video_field = alarm.get('video')
        video_path = alarm.get('videoPath')
        playback_url = alarm.get('playbackUrl')
        file_url = alarm.get('fileUrl')
        
        video_url = video_file or video_url_field or video_field or video_path or playback_url or ''
        
        if not video_url:
            if file_url and ('video' in file_url.lower() or '.mp4' in file_url.lower() or
                           '.avi' in file_url.lower() or 'DownType=5' in file_url):
                video_url = file_url
        
        if not video_url:
            video_url = self._build_video_url_from_alarm(alarm, plate_number)
        
        if not video_url:
            return ''
        
        video_url = self._normalize_video_url(video_url)
        return video_url
    
    def _build_video_url_from_alarm(self, alarm: Dict[str, Any], plate_number: str) -> str:
        """Build video download URL from alarm file path and metadata.
        
        Generates DownType=3 (download) URL format for direct file access.
        Format: http://host:port/3/5?DownType=3&jsession=...&DevIDNO=...&FILELOC=4
                &FLENGTH=0&FOFFSET=0&MTYPE=1&FPATH=...&SAVENAME=...
                &YEAR=YY&MON=M&DAY=D&BEG=secs&END=secs&CHNMASK=0&FILEATTR=2
        """
        file_path = alarm.get('filePath') or alarm.get('fileName') or ''
        dev_idno = alarm.get('devIdno') or ''
        vehi_idno = alarm.get('vehiIdno') or plate_number or ''
        channel = alarm.get('channel')
        file_time = alarm.get('fileTime')
        file_stime = alarm.get('fileSTime')
        file_etime = alarm.get('fileETime')
        svr_id = alarm.get('svrId')
        alarm_id = alarm.get('id') or alarm.get('label')
        
        # Try to extract device ID from alarm ID
        if not dev_idno and alarm_id and len(alarm_id) > 14:
            try:
                potential_dev_id = alarm_id[:-14]
                if potential_dev_id and potential_dev_id.isdigit():
                    dev_idno = potential_dev_id
            except:
                pass
        
        # Use device ID for the URL (DevIDNO parameter)
        device_id = dev_idno or vehi_idno
        if not device_id:
            return ''
        
        file_chn = str(channel) if channel is not None else '0'
        file_beg = '0'
        file_end = '0'
        
        # Extract date components for URL (YEAR, MON, DAY)
        year = '26'  # Default
        month = '1'
        day = '1'
        
        if file_time and file_time > 0:
            try:
                # CMS timestamps are in local timezone, convert to datetime
                cms_tz = self._parse_cms_timezone(self.server.timezone)
                alarm_dt = datetime.fromtimestamp(file_time / 1000, tz=timezone.utc)
                local_dt = alarm_dt.astimezone(cms_tz)
                year = str(local_dt.year % 100)  # 2-digit year
                month = str(local_dt.month)
                day = str(local_dt.day)
            except:
                pass
        
        # Calculate time range from alarm timestamps
        if file_stime and isinstance(file_stime, (int, float)) and file_stime > 0:
            file_beg = str(timestamp_to_seconds_in_day(file_stime))
        if file_etime and isinstance(file_etime, (int, float)) and file_etime > 0:
            file_end = str(timestamp_to_seconds_in_day(file_etime))
        
        # Fallback: use fileTime if we don't have valid start/end
        if (file_beg == '0' or file_end == '0') and file_time and file_time > 0:
            try:
                ts_sec = int(file_time / 1000)
                seconds_in_day = ts_sec % 86400
                file_beg = str(seconds_in_day)
                # Default to 2 minutes of video
                file_end = str(min(86399, seconds_in_day + 120))
            except:
                pass
        
        # Try to extract timestamp from filename
        if file_beg == '0' and file_end == '0' and file_path:
            file_beg, file_end = self._extract_time_from_filename(file_path)
        
        # Last resort: use full day
        if file_beg == '0' and file_end == '0':
            file_end = '86399'
        
        if file_path:
            # Extract filename for SAVENAME parameter
            save_name = file_path.split('/')[-1].split('\\')[-1]
            
            # Always use download port for database storage
            port = self._get_download_port()
            
            # Build DownType=3 (download) URL format
            # Parameters: jsession, DevIDNO, FILELOC, FLENGTH, FOFFSET, MTYPE, FPATH, SAVENAME, YEAR, MON, DAY, BEG, END, CHNMASK, FILEATTR
            return (f"http://{self._server_host}:{port}/3/5?DownType=3"
                   f"&jsession={self.session_id}"
                   f"&DevIDNO={device_id}"
                   f"&FILELOC=4"  # 4 = Download from storage server
                   f"&FLENGTH=0"  # File length (0 = unknown/full file)
                   f"&FOFFSET=0"  # File offset (0 = start from beginning)
                   f"&MTYPE=1"    # Media type: 1 = video
                   f"&FPATH={quote(file_path)}"
                   f"&SAVENAME={quote(save_name)}"
                   f"&YEAR={year}"
                   f"&MON={month}"
                   f"&DAY={day}"
                   f"&BEG={file_beg}"
                   f"&END={file_end}"
                   f"&CHNMASK={file_chn}"  # Channel mask
                   f"&FILEATTR=2")  # File attribute: 2 = video
        elif file_time:
            try:
                # Convert milliseconds to UTC datetime, then to CMS local time for URL
                alarm_dt = datetime.fromtimestamp(file_time / 1000, tz=timezone.utc)
                cms_local_time = self._utc_to_cms_local(alarm_dt)
                player_base = f"http://{self._server_host}:{self._web_port}/808gps/open/player/PlayBackVideo.html"
                return (f"{player_base}?devIdno={device_id}&channel={file_chn}"
                       f"&begintime={cms_local_time}"
                       f"&endtime={cms_local_time}"
                       f"&jsession={self.session_id}&lang=en")
            except:
                pass
        
        return ''
    
    def _extract_time_from_filename(self, file_path: str) -> Tuple[str, str]:
        """Extract time range from filename containing YYMMDDHHMMSS pattern."""
        try:
            filename = file_path.split('/')[-1].split('\\')[-1]
            
            # Find all sequences of 12+ consecutive digits
            all_digits = re.findall(r'\d{12,}', filename)
            for digit_seq in all_digits:
                # Look for YYMMDDHHMMSS pattern
                for i in range(len(digit_seq) - 11):
                    chunk = digit_seq[i:i+12]
                    yy = int(chunk[0:2])
                    mm = int(chunk[2:4])
                    dd = int(chunk[4:6])
                    hh = int(chunk[6:8])
                    mi = int(chunk[8:10])
                    ss = int(chunk[10:12])
                    
                    # Validate as date+time
                    if (20 <= yy <= 30 and 1 <= mm <= 12 and 1 <= dd <= 31 and
                        0 <= hh <= 23 and 0 <= mi <= 59 and 0 <= ss <= 59):
                        seconds_in_day = hh * 3600 + mi * 60 + ss
                        file_beg = str(seconds_in_day)
                        file_end = str(min(86399, seconds_in_day + 120))
                        return file_beg, file_end
        except Exception as e:
            logger.debug(f"Could not extract time from filename: {e}")
        
        return '0', '0'
    
    def _normalize_video_url(self, video_url: str) -> str:
        """Normalize video URL format to DownType=3 (download) format."""
        if not video_url:
            return ''
        
        # Fix invalid BEG=0&END=0
        if 'BEG=0' in video_url and 'END=0' in video_url:
            # Try to extract from FPATH or PLAYFILE
            fpath_match = re.search(r'FPATH=([^&]+)', video_url) or re.search(r'PLAYFILE=([^&]+)', video_url)
            if fpath_match:
                fpath = unquote(fpath_match.group(1))
                filename = fpath.split('/')[-1].split('\\')[-1]
                file_beg, file_end = self._extract_time_from_filename(filename)
                
                if file_beg != '0':
                    video_url = re.sub(r'BEG=0', f'BEG={file_beg}', video_url)
                    video_url = re.sub(r'END=0', f'END={file_end}', video_url)
            
            # Fallback: use full day if couldn't extract time
            if 'END=0' in video_url:
                video_url = re.sub(r'END=0', 'END=86399', video_url)
        
        # Handle HLS/m3u8 URLs - convert to DownType=3 download format
        if video_url.startswith('playback.m3u8') or '/hls/playback.m3u8' in video_url:
            try:
                if '?' in video_url:
                    if video_url.startswith('http'):
                        parsed = urlparse(video_url)
                        params = parse_qs(parsed.query)
                    else:
                        params = parse_qs(video_url.split('?', 1)[1])
                    
                    dev_idno = params.get('DevIDNO', [''])[0]
                    file_chn = params.get('FILECHN', ['0'])[0]
                    file_beg = params.get('FILEBEG', ['0'])[0]
                    file_end = params.get('FILEEND', ['0'])[0]
                    play_file = params.get('PLAYFILE', [''])[0]
                    
                    if not play_file:
                        return ''
                    
                    # Extract filename for SAVENAME
                    save_name = unquote(play_file).split('/')[-1].split('\\')[-1]
                    
                    # Try to extract date from filename or path
                    year, month, day = '26', '1', '1'  # Defaults
                    date_match = re.search(r'(\d{4})-(\d{2})-(\d{2})', play_file)
                    if date_match:
                        year = str(int(date_match.group(1)) % 100)
                        month = str(int(date_match.group(2)))
                        day = str(int(date_match.group(3)))
                    
                    # Build DownType=3 download URL
                    port = self._get_download_port()
                    video_url = (f"http://{self._server_host}:{port}/3/5?DownType=3"
                               f"&jsession={self.session_id}"
                               f"&DevIDNO={dev_idno}"
                               f"&FILELOC=4"
                               f"&FLENGTH=0&FOFFSET=0&MTYPE=1"
                               f"&FPATH={play_file}"
                               f"&SAVENAME={quote(save_name)}"
                               f"&YEAR={year}&MON={month}&DAY={day}"
                               f"&BEG={file_beg}&END={file_end}"
                               f"&CHNMASK={file_chn}&FILEATTR=2")
            except Exception as e:
                logger.debug(f"Error converting playback.m3u8 URL: {e}")
                # Cannot convert to download URL, skip
                return ''
        elif video_url.startswith('/hls/'):
            # HLS streams are not downloadable, skip
            return ''
        
        return ensure_jsession_in_url(video_url, self.session_id)
    
    # =========================================================================
    # Real-time Alarms (vehicleAlarm.action)
    # =========================================================================
    
    async def get_realtime_alarms(self, page: int = 1, page_size: int = 50, 
                                   arm_types: str = None) -> Dict[str, Any]:
        """
        Get real-time alarms using vehicleAlarm.action API.
        
        This API returns currently active/recent alarms in real-time.
        More responsive than the safety alarms API for new events.
        
        Args:
            page: Page number (1-based)
            page_size: Number of results per page
            arm_types: Comma-separated alarm type codes (optional, filters by type)
            
        Returns:
            Dict with alarms list and pagination info
        """
        session = await self._get_session()
        jsession = await self._ensure_session()
        
        url = f"{self.server.base_url}/StandardApiAction_vehicleAlarm.action"
        
        params = {
            'jsession': jsession,
            'currentPage': page,
            'pageRecords': page_size,
            'toMap': 1,
        }
        
        # Add arm type filter if specified
        # Use our allowed alarm types by default
        if arm_types:
            params['armType'] = arm_types
        elif get_filter_alarm_types():
            # Default to only our monitored alarm types
            params['armType'] = ','.join(str(t) for t in ALLOWED_ALARM_TYPES)
        # else: No armType filter = get ALL alarm types (TESTING MODE)
        
        try:
            async with session.get(url, params=params) as response:
                data = await response.json()
                
                # Retry with fresh session if failed
                if data.get('result') != 0:
                    self.session_id = None
                    jsession = await self._ensure_session()
                    params['jsession'] = jsession
                    async with session.get(url, params=params) as retry_response:
                        data = await retry_response.json()
                
                if data.get('result') != 0:
                    return {
                        'success': False, 
                        'error': f"API error: result={data.get('result')}", 
                        'alarms': []
                    }
                
                alarms = []
                for item in data.get('alarms', []):
                    parsed = self._parse_realtime_alarm(item)
                    if parsed:
                        alarms.append(parsed)
                
                return {
                    'success': True,
                    'alarms': alarms,
                    'total': len(alarms),
                    'pagination': {
                        'page': page,
                        'pageSize': page_size,
                        'totalRecords': data.get('totalRecords', len(alarms))
                    }
                }
                
        except Exception as e:
            logger.error(f"Error fetching realtime alarms: {e}")
            return {'success': False, 'error': str(e), 'alarms': []}
    
    def _parse_realtime_alarm(self, alarm: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Parse a real-time alarm from vehicleAlarm.action response.
        
        When get_filter_alarm_types()=False, processes ALL alarm types (for testing).
        """
        alarm_type = alarm.get('type', 0)
        
        # Filter: only process allowed alarm types (if filtering enabled)
        if get_filter_alarm_types() and alarm_type not in ALLOWED_ALARM_TYPES:
            return None
        
        type_name = ALARM_TYPE_NAMES.get(alarm_type, f"Alarm Type {alarm_type}")
        
        # Parse coordinates (CMS returns as integers × 1,000,000)
        lat = self._convert_coordinate(alarm.get('lat', 0))
        lng = self._convert_coordinate(alarm.get('lng', 0))
        
        # Parse GPS time
        gps_time = self._parse_timestamp(alarm.get('gt'))
        
        # Parse photo URLs (semicolon-separated)
        img_str = alarm.get('img', '')
        photo_urls = [u.strip() for u in img_str.split(';') if u.strip()] if img_str else []
        
        # Ensure session in photo URLs
        photo_url = ''
        if photo_urls:
            photo_url = ensure_jsession_in_url(photo_urls[0], self.session_id)
        
        return {
            'guid': alarm.get('guid'),  # Unique ID for deduplication
            'deviceId': alarm.get('DevIDNO'),
            'plateNumber': alarm.get('vid') or alarm.get('nm'),
            'alarmType': alarm_type,
            'typeName': type_name,
            'description': alarm.get('desc', ''),
            'gpsTime': gps_time,
            'latitude': lat,
            'longitude': lng,
            'speed': int((alarm.get('sp', 0) or 0) / 10),  # CMS returns speed × 10
            'heading': int(alarm.get('hx', 0) or 0),
            'photoUrl': photo_url,
            'allPhotoUrls': photo_urls,
            'handled': alarm.get('hd', 0) == 1,  # Whether alarm has been acknowledged
            'serverTime': self._parse_timestamp(alarm.get('st')),
        }
    
    # =========================================================================
    # Utility Methods
    # =========================================================================
    
    def _convert_coordinate(self, value) -> float:
        """Convert CMS coordinate to decimal degrees.
        
        CMS API returns coordinates in two formats:
        - Raw integers (e.g., 113827278) that need division by 1,000,000
        - Already converted decimals (e.g., 113.827278)
        
        Based on fleet-monitor/server/utils.py pattern.
        """
        if value is None:
            return 0.0
        try:
            val = float(value)
            if val > 1000:
                return val / 1000000
            return val
        except (ValueError, TypeError):
            return 0.0
    
    def _parse_coordinates(self, data: Dict[str, Any]) -> tuple:
        """Parse latitude and longitude from API response.
        
        Tries mlat/mlng first (pre-converted by CMS), falls back to lat/lng.
        Based on fleet-monitor/server/utils.py pattern.
        """
        lat = 0.0
        lng = 0.0
        
        try:
            # First try mlat/mlng which are pre-converted by CMS
            mlat_str = data.get('mlat')
            mlng_str = data.get('mlng')
            
            if mlat_str and mlng_str:
                lat = float(mlat_str)
                lng = float(mlng_str)
            else:
                # Fall back to raw lat/lng and convert
                lat = self._convert_coordinate(data.get('lat', 0))
                lng = self._convert_coordinate(data.get('lng', 0))
        except (ValueError, TypeError) as e:
            logger.debug(f"Coordinate parsing error: {e}")
        
        return lat, lng
    
    def _parse_cms_timezone(self, tz_str: str) -> timezone:
        """Parse timezone offset string like '+05:00' or '-05:30' to timezone object."""
        try:
            # Parse +HH:MM or -HH:MM format
            sign = 1 if tz_str[0] == '+' else -1
            parts = tz_str[1:].split(':')
            hours = int(parts[0])
            minutes = int(parts[1]) if len(parts) > 1 else 0
            offset = timedelta(hours=sign * hours, minutes=sign * minutes)
            return timezone(offset)
        except Exception:
            # Default to UTC if parsing fails
            return timezone.utc
    
    def _utc_to_cms_local(self, utc_dt: datetime) -> str:
        """Convert UTC datetime to CMS local time string for API queries.
        
        When querying the CMS (e.g., for video playback, GPS history), we need
        to send times in the CMS's local timezone.
        
        Args:
            utc_dt: UTC datetime object
            
        Returns:
            Time string in CMS local timezone format "YYYY-MM-DD HH:MM:SS"
        """
        cms_tz = self._parse_cms_timezone(self.server.timezone)
        local_dt = utc_dt.astimezone(cms_tz)
        return local_dt.strftime('%Y-%m-%d %H:%M:%S')
    
    def _parse_timestamp(self, value) -> Optional[str]:
        """Parse timestamp to ISO format in UTC.
        
        Normalizes ALL timestamps to consistent ISO format: YYYY-MM-DDTHH:MM:SS+00:00 (UTC)
        This is critical for deduplication which uses (imei, gps_time) as key.
        
        IMPORTANT: CMS timestamps are in the server's local timezone (configured per server).
        This method converts them to UTC for consistent storage.
        
        Handles:
        - Millisecond timestamps (int/float > 1e12) - assumed UTC epoch
        - Second timestamps (int/float) - assumed UTC epoch
        - String timestamps like "2024-01-31 10:30:00.0" - converted from CMS timezone to UTC
        """
        if not value:
            return None
        try:
            # Get CMS server timezone offset (e.g., '+05:00' for PKT)
            cms_tz = self._parse_cms_timezone(self.server.timezone)
            
            if isinstance(value, (int, float)):
                # Unix timestamps are always UTC epoch
                ts = value / 1000 if value > 1e12 else value
                return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
            elif isinstance(value, str):
                # String timestamp from CMS - in CMS's local timezone
                # Parse and convert to UTC
                value_clean = value.strip()
                # Remove trailing .0 milliseconds
                if '.' in value_clean:
                    value_clean = value_clean.split('.')[0]
                # Parse with common formats
                for fmt in ['%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y/%m/%d %H:%M:%S']:
                    try:
                        # Parse as naive datetime, then attach CMS timezone
                        dt_naive = datetime.strptime(value_clean, fmt)
                        dt_local = dt_naive.replace(tzinfo=cms_tz)
                        # Convert to UTC
                        dt_utc = dt_local.astimezone(timezone.utc)
                        return dt_utc.isoformat()
                    except ValueError:
                        continue
                # Fallback: return as-is if can't parse
                return value_clean
            return str(value)
        except Exception:
            return None
