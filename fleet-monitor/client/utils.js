/**
 * Fleet Monitor - Utility Functions
 * Helper functions for formatting, validation, and data processing
 */

// ============================================================================
// Date/Time Formatting
// UTC everywhere: API/storage use UTC. Display uses local. User input (local) → convert to UTC for API.
// ============================================================================

const _pad2 = (n) => String(n).padStart(2, '0');

/**
 * Format date for datetime-local input value (local time - user sees their timezone).
 * datetime-local expects "YYYY-MM-DDTHH:mm" in local time.
 * @param {Date} date - Date object
 * @returns {string} Value for datetime-local input
 */
function toLocalDatetimeLocalValue(date) {
    const d = date || new Date();
    return `${d.getFullYear()}-${_pad2(d.getMonth() + 1)}-${_pad2(d.getDate())}T${_pad2(d.getHours())}:${_pad2(d.getMinutes())}`;
}

/**
 * Format date as UTC string for API (YYYY-MM-DD HH:mm:ss).
 * Use when sending date ranges to backend - API expects UTC.
 * @param {Date} date - Date object (from user input, already correct moment)
 * @param {boolean} isEnd - If true, use 23:59:59 for end of day
 * @returns {string} UTC datetime string for API
 */
function formatDateTimeForApiUTC(date, isEnd = false) {
    const d = date instanceof Date ? date : new Date(date);
    const y = d.getUTCFullYear();
    const m = _pad2(d.getUTCMonth() + 1);
    const day = _pad2(d.getUTCDate());
    const h = _pad2(d.getUTCHours());
    const min = _pad2(d.getUTCMinutes());
    const sec = isEnd ? '59' : '00';
    return `${y}-${m}-${day} ${h}:${min}:${sec}`;
}

const WORKING_TZ_KEY = 'fleet_working_timezone';

function getWorkingTimezone() {
    try { return localStorage.getItem(WORKING_TZ_KEY) || ''; } catch { return ''; }
}

function setWorkingTimezone(tz) {
    try { localStorage.setItem(WORKING_TZ_KEY, tz || ''); } catch (_) {} 
}

/**
 * Format ISO datetime string for display. Uses working timezone if set, else browser local.
 * @param {string} isoString - ISO format datetime string
 * @param {string} [timezone] - Optional override (uses getWorkingTimezone() if not passed)
 * @returns {string} Formatted datetime or '-'
 */
function formatDateTime(isoString, timezone) {
    if (!isoString) return '-';
    try {
        const date = new Date(isoString);
        const tz = timezone !== undefined ? timezone : getWorkingTimezone();
        if (tz) {
            return date.toLocaleString('en-US', { timeZone: tz });
        }
        return date.toLocaleString();
    } catch {
        return isoString;
    }
}

/**
 * Format seconds into HH:MM time string
 * @param {number} seconds - Seconds since midnight
 * @returns {string} Formatted time string
 */
function formatTime(seconds) {
    if (seconds === undefined || seconds === null) return '-';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Check if a date value is valid (not negative, not 0, reasonable range)
 * @param {*} dateValue - Date value to check
 * @returns {boolean} True if valid
 */
function isValidDate(dateValue) {
    if (!dateValue) return false;
    
    const numValue = Number(dateValue);
    if (!isNaN(numValue)) {
        if (numValue <= 0) return false;
        
        // Timestamp in seconds
        if (numValue > 0 && numValue < 100000000000) {
            const date = new Date(numValue * 1000);
            return date.getFullYear() >= 1970 && date.getFullYear() <= 2100;
        }
        // Timestamp in milliseconds
        else if (numValue >= 100000000000) {
            const date = new Date(numValue);
            return date.getFullYear() >= 1970 && date.getFullYear() <= 2100;
        }
    }
    
    // String date format
    if (typeof dateValue === 'string') {
        if (dateValue.match(/^\d{4}[-/]\d{2}[-/]\d{2}/)) {
            return true;
        }
    }
    
    return false;
}

/**
 * Format a date value for display
 * @param {*} dateValue - Date value (timestamp or string)
 * @param {string} [timezone] - Optional (uses getWorkingTimezone() if not passed)
 * @returns {string} Formatted date string
 */
function formatDateValue(dateValue, timezone) {
    if (!dateValue) return '-';
    
    const numValue = Number(dateValue);
    if (!isNaN(numValue) && numValue > 0) {
        let date;
        if (numValue < 100000000000) {
            date = new Date(numValue * 1000);
        } else {
            date = new Date(numValue);
        }
        const tz = timezone !== undefined ? timezone : getWorkingTimezone();
        if (tz) {
            return date.toLocaleDateString('en-US', { timeZone: tz });
        }
        return date.toLocaleDateString();
    }
    
    if (typeof dateValue === 'string' && dateValue.match(/^\d{4}[-/]\d{2}[-/]\d{2}/)) {
        return dateValue;
    }
    
    return dateValue;
}

/**
 * Get date string for N days ago (local calendar date, for user-facing date inputs).
 * @param {number} daysAgo - Number of days in the past
 * @returns {string} YYYY-MM-DD in local timezone
 */
function getDateDaysAgo(daysAgo) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return `${date.getFullYear()}-${_pad2(date.getMonth() + 1)}-${_pad2(date.getDate())}`;
}

/**
 * Get current date as YYYY-MM-DD (local calendar date, for user-facing date inputs).
 * @returns {string} Current date in local timezone
 */
function getCurrentDate() {
    const date = new Date();
    return `${date.getFullYear()}-${_pad2(date.getMonth() + 1)}-${_pad2(date.getDate())}`;
}

/**
 * Get current date as YYYY-MM-DD in UTC (for CMS API - CMS configured for UTC).
 * @returns {string} Current date in UTC
 */
function getCurrentDateUTC() {
    const date = new Date();
    return `${date.getUTCFullYear()}-${_pad2(date.getUTCMonth() + 1)}-${_pad2(date.getUTCDate())}`;
}

// ============================================================================
// Coordinate Validation
// ============================================================================

/**
 * Check if coordinates are valid (not near 0,0 and within valid range)
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {boolean} True if valid
 */
function isValidCoordinate(lat, lng) {
    if (!lat || !lng) return false;
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (isNaN(latNum) || isNaN(lngNum)) return false;
    if (Math.abs(latNum) < COORDINATE_THRESHOLD && Math.abs(lngNum) < COORDINATE_THRESHOLD) return false;
    if (Math.abs(latNum) > 90 || Math.abs(lngNum) > 180) return false;
    return true;
}

/**
 * Format location for display with Google Maps link
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} mapLat - Pre-converted map latitude
 * @param {number} mapLng - Pre-converted map longitude
 * @returns {string} HTML string with link or '-'
 */
function formatLocation(lat, lng, mapLat, mapLng) {
    if (lat && lat > 1000) lat = lat / 1000000;
    if (lng && lng > 1000) lng = lng / 1000000;
    
    if (lat && lng) {
        return `<a href="https://maps.google.com?q=${lat.toFixed(6)},${lng.toFixed(6)}" target="_blank" style="color: var(--accent);">${lat.toFixed(6)}, ${lng.toFixed(6)}</a>`;
    } else if (mapLat && mapLng) {
        return `<a href="https://maps.google.com?q=${mapLat},${mapLng}" target="_blank" style="color: var(--accent);">${mapLat}, ${mapLng}</a>`;
    }
    return '-';
}

// ============================================================================
// Navigation Helpers
// ============================================================================

/**
 * Get compass direction from heading degrees
 * @param {number} heading - Heading in degrees (0-360)
 * @returns {string} Compass direction (N, NE, E, etc.)
 */
function getHeadingDirection(heading) {
    const index = Math.round(heading / 45) % 8;
    return COMPASS_DIRECTIONS[index];
}

// ============================================================================
// ADAS/DSM/BSD Status Decoders
// ============================================================================

/**
 * Decode ADAS alarm status bits
 * @param {number} adas1 - Level 1 alarm bits
 * @param {number} adas2 - Level 2 alarm bits
 * @returns {string} Human-readable alarm status
 */
function decodeAdasStatus(adas1, adas2) {
    if (!adas1 && !adas2) return 'No Active Alarms';
    
    const alarms = [];
    if (adas1 & ADAS_ALARMS.FORWARD_COLLISION) alarms.push('Forward Collision');
    if (adas1 & ADAS_ALARMS.LANE_DEPARTURE) alarms.push('Lane Departure');
    if (adas1 & ADAS_ALARMS.VEHICLE_DISTANCE) alarms.push('Vehicle Distance');
    if (adas1 & ADAS_ALARMS.PEDESTRIAN_COLLISION) alarms.push('Pedestrian Collision');
    if (adas1 & ADAS_ALARMS.FREQUENT_LANE_CHANGE) alarms.push('Frequent Lane Change');
    if (adas1 & ADAS_ALARMS.ROAD_SIGN_OVER_LIMIT) alarms.push('Road Sign Over Limit');
    if (adas1 & ADAS_ALARMS.OBSTACLE) alarms.push('Obstacle');
    if (adas1 & ADAS_ALARMS.CURVED_SPEED_WARNING) alarms.push('Curved Speed Warning');
    
    if (adas2 && adas2 > 0) {
        alarms.push(`Level 2 Alarm (${adas2})`);
    }
    
    return alarms.length > 0 ? alarms.join(', ') : 'No Active Alarms';
}

/**
 * Decode DSM alarm status bits
 * @param {number} dsm1 - Level 1 alarm bits
 * @param {number} dsm2 - Level 2 alarm bits
 * @returns {string} Human-readable alarm status
 */
function decodeDsmStatus(dsm1, dsm2) {
    if (!dsm1 && !dsm2) return 'No Active Alarms';
    
    const alarms = [];
    if (dsm1 & DSM_ALARMS.FATIGUE_DRIVING) alarms.push('Fatigue Driving');
    if (dsm1 & DSM_ALARMS.PHONE_CALL) alarms.push('Phone Call');
    if (dsm1 & DSM_ALARMS.SMOKING) alarms.push('Smoking');
    if (dsm1 & DSM_ALARMS.NOT_LOOKING_FORWARD) alarms.push('Not Looking Forward');
    if (dsm1 & DSM_ALARMS.SYSTEM_ERROR) alarms.push('System Error');
    if (dsm1 & DSM_ALARMS.NO_SEAT_BELT) alarms.push('No Seat Belt');
    if (dsm1 & DSM_ALARMS.DRIVER_NOT_IN_SEAT) alarms.push('Driver Not in Seat');
    if (dsm1 & DSM_ALARMS.HANDS_OFF_WHEEL) alarms.push('Hands Off Wheel');
    if (dsm1 & DSM_ALARMS.DISTRACTED_DRIVING) alarms.push('Distracted Driving');
    if (dsm1 & DSM_ALARMS.DRIVER_ABNORMAL) alarms.push('Driver Abnormal');
    
    if (dsm2 && dsm2 > 0) {
        alarms.push(`Level 2 Alarm (${dsm2})`);
    }
    
    return alarms.length > 0 ? alarms.join(', ') : 'No Active Alarms';
}

/**
 * Decode BSD alarm status bits
 * @param {number} bsd1 - BSD alarm bits
 * @returns {string} Human-readable alarm status
 */
function decodeBsdStatus(bsd1) {
    if (!bsd1) return 'No Active Alarms';
    
    const alarms = [];
    if (bsd1 & BSD_ALARMS.LEFT_BLIND_ZONE) alarms.push('Left Blind Zone');
    if (bsd1 & BSD_ALARMS.RIGHT_BLIND_ZONE) alarms.push('Right Blind Zone');
    if (bsd1 & BSD_ALARMS.REAR_APPROACHING) alarms.push('Rear Approaching');
    
    return alarms.length > 0 ? alarms.join(', ') : 'No Active Alarms';
}

// ============================================================================
// String Escaping
// ============================================================================

/**
 * Escape string for use in onclick handler
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeForOnclick(str) {
    if (!str) return '';
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Escape string for HTML attribute
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeForAttribute(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ============================================================================
// URL Helpers
// ============================================================================

/**
 * Convert WebSocket URL to HTTP URL
 * @param {string} url - URL to convert
 * @returns {string} HTTP URL
 */
function wsToHttp(url) {
    if (!url) return '';
    return url.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
}

/**
 * Build CMS player URL for recorded video
 * Note: CMS PlayBackVideo.html has issues, but this URL is parsed by playVideoIframe
 * to extract the raw video URL for the working proxy player
 * @param {string} videoUrl - Direct video URL
 * @returns {string} Player page URL
 */
function buildPlayerUrl(videoUrl) {
    if (!videoUrl) return '';
    if (!CMS_PLAYER) return videoUrl;
    
    const httpUrl = wsToHttp(videoUrl);
    if (httpUrl.includes('PlayBackVideo.html')) return httpUrl;
    
    // Extract parameters from video URL
    let jsession = '', devIdno = '', channel = '0', playFile = '';
    let fileBeg = '0', fileEnd = '86399';
    
    try {
        const urlParams = new URL(httpUrl).searchParams;
        jsession = urlParams.get('jsession') || '';
        devIdno = urlParams.get('DevIDNO') || '';
        channel = urlParams.get('FILECHN') || urlParams.get('PLAYCHN') || '0';
        fileBeg = urlParams.get('FILEBEG') || '0';
        fileEnd = urlParams.get('FILEEND') || '86399';
        playFile = urlParams.get('PLAYFILE') || '';
    } catch (e) {
        const jsMatch = httpUrl.match(/jsession=([^&]+)/);
        const devMatch = httpUrl.match(/DevIDNO=([^&]+)/);
        const chnMatch = httpUrl.match(/FILECHN=([^&]+)/);
        if (jsMatch) jsession = jsMatch[1];
        if (devMatch) devIdno = devMatch[1];
        if (chnMatch) channel = chnMatch[1];
    }
    
    // Extract date from PLAYFILE or use today UTC (CMS configured for UTC)
    let videoDate = getCurrentDateUTC();
    const dateMatch = playFile.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) videoDate = dateMatch[1];
    
    // Convert seconds to time strings
    const toTime = (secs) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    };
    
    const begintime = `${videoDate} ${toTime(parseInt(fileBeg) || 0)}`;
    const endtime = `${videoDate} ${toTime(parseInt(fileEnd) || 86399)}`;
    
    const baseUrl = `http://${CMS_PLAYER.BASE_HOST}:${CMS_PLAYER.WEB_PORT}`;
    return `${baseUrl}/808gps/open/player/PlayBackVideo.html?devIdno=${encodeURIComponent(devIdno)}&channel=${channel}&begintime=${encodeURIComponent(begintime)}&endtime=${encodeURIComponent(endtime)}${jsession ? `&jsession=${encodeURIComponent(jsession)}` : ''}&lang=en`;
}

// ============================================================================
// Local Storage Helpers
// ============================================================================

/**
 * Get value from localStorage with default
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if not found
 * @returns {*} Stored or default value
 */
function getStorageValue(key, defaultValue = null) {
    try {
        const value = localStorage.getItem(key);
        return value !== null ? value : defaultValue;
    } catch {
        return defaultValue;
    }
}

/**
 * Set value in localStorage
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 */
function setStorageValue(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        console.error('localStorage error:', e);
    }
}

// ============================================================================
// Export for module usage (if needed)
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        toLocalDatetimeLocalValue,
        formatDateTimeForApiUTC,
        formatDateTime,
        getWorkingTimezone,
        setWorkingTimezone,
        formatTime,
        isValidDate,
        formatDateValue,
        getDateDaysAgo,
        getCurrentDate,
        getCurrentDateUTC,
        isValidCoordinate,
        formatLocation,
        getHeadingDirection,
        decodeAdasStatus,
        decodeDsmStatus,
        decodeBsdStatus,
        escapeForOnclick,
        escapeForAttribute,
        wsToHttp,
        buildPlayerUrl,
        getStorageValue,
        setStorageValue
    };
}
