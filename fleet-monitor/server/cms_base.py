"""
CMS API Base - Session management and core API functionality
"""

import os
import requests
from typing import Dict, Any
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))


class CMSApiBase:
    """Base CMS API Client with session management."""
    
    # API Configuration
    DEFAULT_TIMEOUT = 30
    DEFAULT_PAGE_SIZE = 200
    MAX_GPS_PAGES = 5
    
    def __init__(self):
        # All configuration from environment - no hardcoded defaults
        self._server_host = os.getenv('CMS_HOST')
        if not self._server_host:
            raise ValueError("CMS_HOST environment variable is required")
        
        self.username = os.getenv('CMS_USERNAME')
        self.password = os.getenv('CMS_PASSWORD')
        if not self.username or not self.password:
            raise ValueError("CMS_USERNAME and CMS_PASSWORD environment variables are required")
        
        # Port configuration from environment
        # Storage Server (FILELOC=2) - recorded video playback
        self._storage_port = int(os.getenv('CMS_STORAGE_PORT', '6611'))
        # Download Server (FILELOC=4) - video downloads
        self._download_port = int(os.getenv('CMS_DOWNLOAD_PORT', '6609'))
        # Media Server - live streaming & device access (FILELOC=1)
        self._stream_port = int(os.getenv('CMS_STREAM_PORT', '6604'))
        # Web API port
        self._web_port = int(os.getenv('CMS_WEB_PORT', '8080'))
        
        # CMS timezone for timestamp conversion (e.g., '+05:00' for PKT, '+00:00' for UTC)
        # CMS returns timestamps in this timezone, and expects query times in this timezone
        self._cms_timezone = os.getenv('CMS_TIMEZONE', '+00:00')
        print(f"[CMS] Configured timezone: {self._cms_timezone}")
        
        # Construct base URL from host and web port
        self.base_url = f"http://{self._server_host}:{self._web_port}"
        
        self.session_id = None
        self.timeout = self.DEFAULT_TIMEOUT
    
    # =========================================================================
    # Timezone Conversion
    # =========================================================================
    
    def _parse_cms_timezone(self) -> timezone:
        """Parse CMS timezone offset string to timezone object."""
        try:
            tz_str = self._cms_timezone
            sign = 1 if tz_str[0] == '+' else -1
            parts = tz_str[1:].split(':')
            hours = int(parts[0])
            minutes = int(parts[1]) if len(parts) > 1 else 0
            offset = timedelta(hours=sign * hours, minutes=sign * minutes)
            return timezone(offset)
        except Exception:
            return timezone.utc
    
    def _utc_to_cms_local(self, utc_dt: datetime) -> str:
        """Convert UTC datetime to CMS local time string for API queries.
        
        When querying the CMS (video playback, GPS history, alarms), we need
        to send times in the CMS's local timezone.
        
        Args:
            utc_dt: UTC datetime object
            
        Returns:
            Time string in CMS local timezone format "YYYY-MM-DD HH:MM:SS"
        """
        cms_tz = self._parse_cms_timezone()
        local_dt = utc_dt.astimezone(cms_tz)
        return local_dt.strftime('%Y-%m-%d %H:%M:%S')
    
    def _cms_local_to_utc(self, local_str: str) -> datetime:
        """Convert CMS local time string to UTC datetime.
        
        When receiving timestamps from CMS (which are in CMS local time),
        convert them to UTC for storage/display.
        
        Args:
            local_str: Time string in CMS local format "YYYY-MM-DD HH:MM:SS"
            
        Returns:
            UTC datetime object
        """
        try:
            cms_tz = self._parse_cms_timezone()
            # Parse as naive datetime
            dt_naive = datetime.strptime(local_str.strip(), '%Y-%m-%d %H:%M:%S')
            # Attach CMS timezone
            dt_local = dt_naive.replace(tzinfo=cms_tz)
            # Convert to UTC
            return dt_local.astimezone(timezone.utc)
        except Exception:
            return datetime.now(timezone.utc)
    
    # =========================================================================
    # Session Management
    # =========================================================================
    
    def _login(self) -> str:
        """Login to CMS and get session ID."""
        url = f"{self.base_url}/StandardApiAction_login.action"
        response = requests.get(url, params={
            'account': self.username,
            'password': self.password
        }, timeout=self.timeout)
        
        data = response.json()
        if data.get('result') == 0:
            self.session_id = data.get('jsession')
            return self.session_id
        raise Exception(f"Login failed: {data}")
    
    def _ensure_session(self) -> str:
        """Ensure we have a valid session."""
        if not self.session_id:
            return self._login()
        return self.session_id
    
    def _make_request(self, endpoint: str, params: Dict[str, Any], 
                      retry_on_fail: bool = True) -> Dict[str, Any]:
        """Make an API request with automatic session handling.
        
        Args:
            endpoint: API endpoint (e.g., 'StandardApiAction_getDeviceStatus.action')
            params: Request parameters
            retry_on_fail: Whether to retry with fresh session on failure
            
        Returns:
            API response as dictionary
        """
        session = self._ensure_session()
        params['jsession'] = session
        
        url = f"{self.base_url}/{endpoint}"
        response = requests.get(url, params=params, timeout=self.timeout)
        data = response.json()
        
        # Retry with fresh session if failed
        if data.get('result') != 0 and retry_on_fail:
            self.session_id = None
            session = self._ensure_session()
            params['jsession'] = session
            response = requests.get(url, params=params, timeout=self.timeout)
            data = response.json()
        
        return data
