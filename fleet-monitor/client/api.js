/**
 * Fleet Monitor - API Client
 * Centralized API calls with error handling
 */

// ============================================================================
// Device API
// ============================================================================

/**
 * Fetch all devices
 * @returns {Promise<Object>} Response with devices array
 */
async function fetchDevices() {
    const response = await fetch(`${API_BASE}/devices`);
    return response.json();
}

/**
 * Fetch device status
 * @param {string} deviceId - Device ID
 * @param {string} plateNumber - Optional plate number
 * @param {*} plateType - Optional plate type
 * @returns {Promise<Object>} Response with device status
 */
async function fetchDeviceStatus(deviceId, plateNumber = null, plateType = null) {
    let url = `${API_BASE}/device/${encodeURIComponent(deviceId)}/status`;
    const params = [];
    
    if (plateNumber && plateNumber !== deviceId && plateNumber !== 'null' && plateNumber !== 'undefined') {
        params.push(`plateNumber=${encodeURIComponent(plateNumber)}`);
    }
    if (plateType !== undefined && plateType !== null) {
        params.push(`plateType=${encodeURIComponent(plateType)}`);
    }
    if (params.length > 0) {
        url += '?' + params.join('&');
    }
    
    const response = await fetch(url);
    return response.json();
}

// ============================================================================
// Safety Alarms API
// ============================================================================

/**
 * Fetch safety alarms for a device
 * @param {string} deviceId - Device ID
 * @param {string} plateNumber - Plate number
 * @param {string} startTime - Start time (YYYY-MM-DD HH:MM:SS)
 * @param {string} endTime - End time (YYYY-MM-DD HH:MM:SS)
 * @returns {Promise<Object>} Response with alarms array
 */
async function fetchSafetyAlarms(deviceId, plateNumber, startTime, endTime) {
    const url = `${API_BASE}/device/${deviceId}/safety?start=${encodeURIComponent(startTime)}&end=${encodeURIComponent(endTime)}&plateNumber=${encodeURIComponent(plateNumber)}`;
    const response = await fetch(url);
    return response.json();
}

// ============================================================================
// Video API
// ============================================================================

/**
 * Fetch video list for a device on a specific date
 * @param {string} deviceId - Device ID
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @param {number} day - Day
 * @param {number} channel - Channel number
 * @returns {Promise<Object>} Response with videos array
 */
async function fetchVideos(deviceId, year, month, day, channel) {
    const url = `${API_BASE}/device/${deviceId}/videos?year=${year}&month=${month}&day=${day}&channel=${channel}`;
    const response = await fetch(url);
    return response.json();
}

/**
 * Fetch videos for multiple channels on a date range
 * @param {string} deviceId - Device ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {string|number} channelSelect - Channel selection ('all' or channel number)
 * @param {number} numChannels - Total number of channels
 * @returns {Promise<Array>} Array of video objects with date added
 */
async function fetchVideosDateRange(deviceId, startDate, endDate, channelSelect, numChannels) {
    const allVideos = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        const day = currentDate.getDate();
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        if (channelSelect === 'all') {
            for (let ch = 0; ch < numChannels; ch++) {
                const data = await fetchVideos(deviceId, year, month, day, ch);
                if (data.success && data.videos) {
                    data.videos.forEach(v => {
                        v.date = dateStr;
                        allVideos.push(v);
                    });
                }
            }
        } else {
            const data = await fetchVideos(deviceId, year, month, day, channelSelect);
            if (data.success && data.videos) {
                data.videos.forEach(v => {
                    v.date = dateStr;
                    allVideos.push(v);
                });
            }
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return allVideos;
}

// ============================================================================
// GPS API
// ============================================================================

/**
 * Fetch GPS tracking data
 * @param {string} deviceId - Device ID
 * @param {string} startTime - Start time (YYYY-MM-DD HH:MM:SS)
 * @param {string} endTime - End time (YYYY-MM-DD HH:MM:SS)
 * @returns {Promise<Object>} Response with tracks array
 */
async function fetchGpsData(deviceId, startTime, endTime) {
    const url = `${API_BASE}/device/${deviceId}/gps?start=${encodeURIComponent(startTime)}&end=${encodeURIComponent(endTime)}`;
    const response = await fetch(url);
    return response.json();
}

// ============================================================================
// Live Stream API
// ============================================================================

/**
 * Fetch live stream URL
 * @param {string} deviceId - Device ID
 * @param {number} channel - Channel number
 * @param {number} streamType - Stream type (0=main, 1=sub)
 * @returns {Promise<Object>} Response with stream URLs
 */
async function fetchStreamUrl(deviceId, channel, streamType = 1) {
    const url = `${API_BASE}/device/${deviceId}/stream?channel=${channel}&streamType=${streamType}`;
    const response = await fetch(url);
    return response.json();
}

// ============================================================================
// Video Proxy API
// ============================================================================

/**
 * Get proxy URL for video
 * @param {string} videoUrl - Original video URL
 * @returns {string} Proxy URL
 */
function getVideoProxyUrl(videoUrl) {
    const baseUrl = window.location.origin;
    return `${baseUrl}/api/video/proxy?url=${encodeURIComponent(videoUrl)}`;
}

// ============================================================================
// Export for module usage (if needed)
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        fetchDevices,
        fetchDeviceStatus,
        fetchSafetyAlarms,
        fetchVideos,
        fetchVideosDateRange,
        fetchGpsData,
        fetchStreamUrl,
        getVideoProxyUrl
    };
}
