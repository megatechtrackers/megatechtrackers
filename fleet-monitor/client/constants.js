/**
 * Fleet Monitor - Constants and Configuration
 * Centralized configuration values and magic numbers
 */

// ============================================================================
// API Configuration
// ============================================================================

const API_BASE = '/api';
const API_TIMEOUT = 30000;  // 30 seconds

// ============================================================================
// Polling Configuration
// ============================================================================

const DEVICE_POLL_INTERVAL = 30000;  // 30 seconds
const STATUS_REFRESH_INTERVAL = 5000;  // 5 seconds for live status

// ============================================================================
// Video/Stream Configuration
// ============================================================================

const VIDEO_RETRY_TIMEOUT = 30000;  // 30 seconds for video playback
const STREAM_TIMEOUT = 25000;  // 25 seconds for live streams
const HLS_TIMEOUT = 30000;  // 30 seconds for HLS streams
const DEFAULT_CHANNELS = 4;
const MAX_CHANNELS = 8;

// ============================================================================
// GPS Configuration
// ============================================================================

const MAX_GPS_PAGES = 5;
const GPS_PAGE_SIZE = 500;
const COORDINATE_THRESHOLD = 0.1;  // Minimum valid coordinate value

// ============================================================================
// Date Defaults
// ============================================================================

const DEFAULT_ALARM_DAYS = 1;   // Default days to look back for safety alarms
const DEFAULT_VIDEO_DAYS = 1;   // Default days to look back for videos
const DEFAULT_GPS_DAYS = 1;     // Default days to look back for GPS

// ============================================================================
// Local Storage Keys
// ============================================================================

const STORAGE_KEYS = {
    SELECTED_DEVICE_ID: 'selectedDeviceId',
    SELECTED_TAB: 'selectedTab',
    LIVE_CHANNELS_PREFIX: 'liveChannels_',
    VIDEO_REPLAY_URL: 'video-replay-url',
    HIDE_OFFLINE_DEVICES: 'hideOfflineDevices'
};

// ============================================================================
// Tab Names
// ============================================================================

const TABS = {
    OVERVIEW: 'overview',
    MAP: 'map',
    SAFETY: 'safety',
    VIDEOS: 'videos',
    GPS: 'gps',
    LIVE: 'live'
};

// ============================================================================
// Network Types
// ============================================================================

const NETWORK_TYPES = {
    0: '3G',
    1: 'WiFi',
    2: 'Wired',
    3: '4G',
    4: '5G'
};

// ============================================================================
// Compass Directions
// ============================================================================

const COMPASS_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// ============================================================================
// ADAS Alarm Bits
// ============================================================================

const ADAS_ALARMS = {
    FORWARD_COLLISION: 0x01,
    LANE_DEPARTURE: 0x02,
    VEHICLE_DISTANCE: 0x04,
    PEDESTRIAN_COLLISION: 0x08,
    FREQUENT_LANE_CHANGE: 0x10,
    ROAD_SIGN_OVER_LIMIT: 0x20,
    OBSTACLE: 0x40,
    CURVED_SPEED_WARNING: 0x80
};

// ============================================================================
// DSM Alarm Bits
// ============================================================================

const DSM_ALARMS = {
    FATIGUE_DRIVING: 0x01,
    PHONE_CALL: 0x02,
    SMOKING: 0x04,
    NOT_LOOKING_FORWARD: 0x08,
    SYSTEM_ERROR: 0x10,
    NO_SEAT_BELT: 0x20,
    DRIVER_NOT_IN_SEAT: 0x40,
    HANDS_OFF_WHEEL: 0x80,
    DISTRACTED_DRIVING: 0x100,
    DRIVER_ABNORMAL: 0x200
};

// ============================================================================
// BSD Alarm Bits
// ============================================================================

const BSD_ALARMS = {
    LEFT_BLIND_ZONE: 0x01,
    RIGHT_BLIND_ZONE: 0x02,
    REAR_APPROACHING: 0x04
};

// ============================================================================
// CMS Player Configuration (loaded from server)
// ============================================================================

// Will be populated from server config - no hardcoded defaults
let CMS_PLAYER = null;
let cmsConfigPromise = null;

// Fetch CMS config from server (required)
async function loadCmsConfig() {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();
        if (data.success) {
            CMS_PLAYER = {
                BASE_HOST: data.cmsHost,
                STORAGE_PORT: data.storagePort,   // FILELOC=2 (recorded video)
                DOWNLOAD_PORT: data.downloadPort, // FILELOC=4 (downloads)
                STREAM_PORT: data.streamPort,     // Live streaming & FILELOC=1
                WEB_PORT: data.webPort
            };
            // Store jsession globally for live stream URLs
            if (data.jsession) {
                window.currentJsession = data.jsession;
                console.log('[Config] Session loaded:', data.jsession.substring(0, 8) + '...');
            }
            console.log('[Config] CMS config loaded from server:', CMS_PLAYER);
            return CMS_PLAYER;
        } else {
            throw new Error('Server returned unsuccessful config response');
        }
    } catch (e) {
        console.error('[Config] Failed to load CMS config from server:', e);
        throw e;
    }
}

// Get CMS config, ensuring it's loaded
async function getCmsConfig() {
    if (CMS_PLAYER) {
        return CMS_PLAYER;
    }
    if (!cmsConfigPromise) {
        cmsConfigPromise = loadCmsConfig();
    }
    return cmsConfigPromise;
}

// Start loading config immediately
cmsConfigPromise = loadCmsConfig();

// ============================================================================
// UI Configuration
// ============================================================================

const UI_CONFIG = {
    MAX_TABLE_HEIGHT: '600px',
    VIDEO_PLAYER_HEIGHT: '400px',
    LIVE_GRID_COLUMNS: 2
};

// ============================================================================
// Export for module usage (if needed)
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        API_BASE,
        API_TIMEOUT,
        DEVICE_POLL_INTERVAL,
        STATUS_REFRESH_INTERVAL,
        VIDEO_RETRY_TIMEOUT,
        STREAM_TIMEOUT,
        HLS_TIMEOUT,
        DEFAULT_CHANNELS,
        MAX_CHANNELS,
        MAX_GPS_PAGES,
        GPS_PAGE_SIZE,
        COORDINATE_THRESHOLD,
        DEFAULT_ALARM_DAYS,
        DEFAULT_VIDEO_DAYS,
        DEFAULT_GPS_DAYS,
        STORAGE_KEYS,
        TABS,
        NETWORK_TYPES,
        COMPASS_DIRECTIONS,
        ADAS_ALARMS,
        DSM_ALARMS,
        BSD_ALARMS,
        CMS_PLAYER,
        UI_CONFIG
    };
}
