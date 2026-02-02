"""
CMS API Client - Complete interface for CMSV6 MDVR systems

This module combines all CMS API functionality:
- Device management and status (device_api.py)
- Safety alarms ADAS/DSM (alarm_api.py)
- Video playback and streaming
- GPS tracking

Usage:
    from cms_api import CMSApi
    api = CMSApi()
    devices = api.get_all_devices()
"""

import requests
from typing import Dict, Any, Optional
from urllib.parse import quote

from alarm_api import CMSAlarmApi
from utils import (
    parse_coordinates,
    convert_speed,
    convert_fuel,
    convert_voltage,
    parse_timestamp,
    get_network_type,
    parse_acc_status,
    ensure_jsession_in_url,
)


class CMSApi(CMSAlarmApi):
    """Complete CMS API Client for CMSV6 MDVR systems.
    
    Inherits from:
    - CMSAlarmApi (safety alarms)
    - CMSDeviceApi (device management)
    - CMSApiBase (session management)
    """
    
    # =========================================================================
    # Video Management
    # =========================================================================
    
    def get_video_list(self, device_id: str, year: int, month: int, day: int,
                       channel: int = 0) -> Dict[str, Any]:
        """Get video files for a device on a specific date."""
        session = self._ensure_session()
        url = f"{self.base_url}/StandardApiAction_getVideoFileInfo.action"
        
        print(f"[Videos] Querying device={device_id}, date={year}-{month}-{day}, channel={channel}")
        
        response = requests.get(url, params={
            'jsession': session,
            'DevIDNO': device_id,
            'LOC': 2,
            'CHN': channel,
            'YEAR': year,
            'MON': month,
            'DAY': day,
            'RECTYPE': -1,
            'FILEATTR': 2,
            'BEG': 0,
            'END': 86399,
            'ARM1': 0,
            'ARM2': 0,
            'RES': 0,
            'STREAM': -1,
            'STORE': 0
        }, timeout=self.timeout)
        
        data = response.json()
        files = data.get('files', [])
        
        if data.get('result') != 0:
            return {'success': True, 'videos': [], 'message': f"No videos found (result {data.get('result')})"}
        
        videos = []
        if isinstance(files, dict):
            files = list(files.values())
        
        for f in files:
            playback_url = f.get('PlaybackUrlWs') or f.get('PlaybackUrl') or ''
            playback_url = ensure_jsession_in_url(playback_url, session)
            
            download_url = f.get('DownUrl') or f.get('DownTaskUrl') or ''
            download_url = ensure_jsession_in_url(download_url, session)
            
            videos.append({
                'channel': f.get('chn', channel),
                'startTime': f.get('beg'),
                'endTime': f.get('end'),
                'size': f.get('size'),
                'path': f.get('name'),
                'playbackUrl': playback_url,
                'downloadUrl': download_url
            })
        
        return {'success': True, 'videos': videos}
    
    def get_realtime_stream_url(self, device_id: str, channel: int = 0, 
                                 stream_type: int = 1) -> Dict[str, Any]:
        """Get real-time video stream URL.
        
        Args:
            device_id: Device ID
            channel: Channel number (0-based)
            stream_type: 0 for main stream, 1 for sub stream
        """
        session = self._ensure_session()
        
        flv_url = (f"http://{self._server_host}:{self._stream_port}/3/3?AVType=1&jsession={session}"
                  f"&DevIDNO={device_id}&Channel={channel}&Stream={stream_type}")
        
        hls_url = (f"http://{self._server_host}:{self._stream_port}/hls/1_{device_id}_{channel}_{stream_type}.m3u8"
                  f"?jsession={session}")
        
        player_url = (f"{self.base_url}/808gps/open/player/video.html"
                     f"?jsession={session}&devIdno={device_id}&channel={channel}"
                     f"&stream={stream_type}&lang=en")
        
        return {
            'success': True,
            'flvUrl': flv_url,
            'hlsUrl': hls_url,
            'streamUrl': player_url,
            'deviceId': device_id,
            'channel': channel
        }
    
    def get_playback_player_url(self, playback_url: str, plate_num: str = None) -> str:
        """Get CMS playback player page URL for recorded video."""
        import re
        session = self._ensure_session()
        player_url = f"{self.base_url}/808gps/open/player/PlayBackVideo.html"
        encoded_url = quote(playback_url, safe='')
        
        # Extract DevIDNO from URL if plate_num not provided
        if not plate_num:
            match = re.search(r'DevIDNO=([^&]+)', playback_url)
            if match:
                plate_num = match.group(1)
        
        url = f"{player_url}?url={encoded_url}&jsession={session}&lang=en"
        if plate_num:
            url += f"&PlateNum={quote(plate_num, safe='')}"
        return url
    
    # =========================================================================
    # GPS Tracking
    # =========================================================================
    
    def _parse_gps_track_point(self, track: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Parse a single GPS track point from API response."""
        lat, lng = parse_coordinates(track)
        
        if abs(lat) < 0.1 and abs(lng) < 0.1:
            return None
        
        speed = convert_speed(track.get('sp', 0))
        gps_time = parse_timestamp(track.get('gt'))
        fuel = convert_fuel(track.get('yl', 0))
        
        net_type = int(track.get('net', 0) or 0)
        network = get_network_type(net_type)
        
        s1 = int(track.get('s1', 0) or 0)
        acc_on = parse_acc_status(s1)
        
        return {
            'lat': lat,
            'lng': lng,
            'speed': speed,
            'heading': int(track.get('hx', 0) or 0),
            'altitude': int(track.get('alt', 0) or 0),
            'satellites': int(track.get('gtsc', 0) or track.get('sn', 0) or 0),
            'gpsTime': gps_time,
            'mileage': int(track.get('lc', 0) or 0),
            'fuel': fuel,
            'network': network,
            'accOn': acc_on,
            'parkingTime': int(track.get('pk', 0) or 0),
            'temp1': int(track.get('t1', -999) or -999),
            'temp2': int(track.get('t2', -999) or -999),
            'temp3': int(track.get('t3', -999) or -999),
            'temp4': int(track.get('t4', -999) or -999),
            'driverName': track.get('dn') or '',
            'driverNumber': track.get('jn') or '',
            'position': track.get('ps') or '',
            'engineRpm': int(track.get('or', 0) or 0),
            'engineSpeed': int(track.get('os', 0) or 0),
            'batteryVoltage': convert_voltage(track.get('ov', 0)),
        }
    
    def get_gps_track(self, device_id: str, start_time: str, 
                      end_time: str) -> Dict[str, Any]:
        """Get GPS tracking data for a device.
        
        Args:
            device_id: Device ID
            start_time: Start time in format "YYYY-MM-DD HH:MM:SS" (UTC from client)
            end_time: End time in format "YYYY-MM-DD HH:MM:SS" (UTC from client)
        """
        from datetime import datetime, timezone
        
        session = self._ensure_session()
        url = f"{self.base_url}/StandardApiAction_queryTrackDetail.action"
        
        # Convert UTC times to CMS local timezone for query
        try:
            start_dt = datetime.strptime(start_time, '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
            end_dt = datetime.strptime(end_time, '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
            cms_start = self._utc_to_cms_local(start_dt)
            cms_end = self._utc_to_cms_local(end_dt)
            print(f"[GPS] Time conversion: UTC {start_time} -> CMS {cms_start} (tz={self._cms_timezone})")
        except Exception as e:
            print(f"[GPS] Time conversion error: {e}, using as-is")
            cms_start = start_time
            cms_end = end_time
        
        all_tracks = []
        current_page = 1
        total_pages = 1
        total_records = 0
        
        print(f"[GPS] Querying device={device_id}, start={cms_start}, end={cms_end} (CMS local)")
        
        while current_page <= total_pages and current_page <= self.MAX_GPS_PAGES:
            try:
                response = requests.get(url, params={
                    'jsession': session,
                    'devIdno': device_id,
                    'begintime': cms_start,
                    'endtime': cms_end,
                    'toMap': 1,
                    'currentPage': current_page,
                    'pageRecords': 500
                }, timeout=self.timeout)
                
                data = response.json()
                
                if data.get('result') != 0:
                    if current_page == 1:
                        return {'success': False, 'error': f"API error: result code {data.get('result')}"}
                    break
                
                tracks_raw = data.get('tracks', [])
                total_pages = data.get('totalPages', 1)
                total_records = data.get('totalRecords', 0)
                
                for t in tracks_raw:
                    parsed = self._parse_gps_track_point(t)
                    if parsed:
                        all_tracks.append(parsed)
                
                current_page += 1
                
            except Exception as e:
                print(f"[GPS] Error fetching page {current_page}: {e}")
                break
        
        total_distance = 0
        if len(all_tracks) >= 2:
            first_mileage = all_tracks[0].get('mileage', 0)
            last_mileage = all_tracks[-1].get('mileage', 0)
            if last_mileage > first_mileage:
                total_distance = (last_mileage - first_mileage) / 1000.0
        
        print(f"[GPS] Found {len(all_tracks)} track points, total distance: {total_distance:.2f} km")
        
        return {
            'success': True,
            'tracks': all_tracks,
            'totalRecords': total_records,
            'totalDistance': total_distance
        }
