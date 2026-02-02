/**
 * Fleet Monitor - Tab Management
 * Handles tab switching and individual tab content rendering
 * 
 * Dependencies: gpsTab.js (for GPS tab)
 */

// ============================================================================
// Tab Navigation
// ============================================================================

/**
 * Show a tab
 * @param {string} tabName - Tab name
 */
function showTab(tabName) {
    const previousTab = getStorageValue(STORAGE_KEYS.SELECTED_TAB, TABS.OVERVIEW);
    setStorageValue(STORAGE_KEYS.SELECTED_TAB, tabName);
    
    // Clean up previous tab resources
    if (previousTab === TABS.MAP && tabName !== TABS.MAP) {
        if (typeof stopMapUpdates === 'function') {
            stopMapUpdates();
        }
    }
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    loadTabContent(tabName);
}

/**
 * Load tab content
 * @param {string} tabName - Tab name
 */
function loadTabContent(tabName) {
    const tabContent = document.getElementById('tabContent');
    if (!tabContent) return;
    
    switch(tabName) {
        case TABS.OVERVIEW:
            tabContent.innerHTML = renderOverviewTab();
            if (!deviceStatus && selectedDevice) {
                loadDeviceStatus();
            }
            break;
        case TABS.MAP:
            tabContent.innerHTML = renderMapTab();
            // Initialize map after DOM is ready
            setTimeout(() => initializeMap(), 100);
            break;
        case TABS.SAFETY:
            tabContent.innerHTML = renderSafetyTab();
            break;
        case TABS.VIDEOS:
            tabContent.innerHTML = renderVideosTab();
            break;
        case TABS.GPS:
            tabContent.innerHTML = renderGpsTab();
            break;
        case TABS.LIVE:
            tabContent.innerHTML = renderLiveTab();
            break;
        default:
            tabContent.innerHTML = renderOverviewTab();
    }
}

// ============================================================================
// Overview Tab
// ============================================================================

/**
 * Render overview tab
 * @returns {string} Tab HTML
 */
function renderOverviewTab() {
    if (!selectedDevice) {
        return createCard('Device Overview', createEmptyState('Please select a device from the sidebar'));
    }
    
    if (!deviceStatus) {
        return createCard('Device Overview', `
            <div class="empty-state">
                <p>Device: <strong>${selectedDevice.deviceId}</strong></p>
                <p style="margin-top: 10px;">
                    <button class="btn btn-primary" onclick="loadDeviceStatus()">Load Device Status</button>
                </p>
            </div>
        `);
    }
    
    const d = deviceStatus;
    const v = selectedDevice || {};
    const channels = selectedDevice.channels ?? d.channels ?? DEFAULT_CHANNELS;
    
    return `
        <div class="dashboard-grid">
            ${createDeviceStatusCard(d, selectedDevice.deviceId, channels)}
            ${createLocationCard(d)}
            ${createVehicleInfoCard(v)}
            ${createVehicleSpecsCard(v)}
            ${createOwnerContactCard(v)}
            ${createDatesCard(v)}
            ${createDriverInfoCard(v)}
            ${createSafetyEquipmentCard(d)}
            ${createRemarksCard(v.remark)}
        </div>
    `;
}

// ============================================================================
// Safety Tab
// ============================================================================

/**
 * Render safety tab
 * @returns {string} Tab HTML
 */
function renderSafetyTab() {
    if (!selectedDevice) {
        return createCard('Safety', createEmptyState('Please select a device first'));
    }
    
    if (!isSelectedDeviceOnline()) {
        return createCard('Active Safety (ADAS/DSM)', createOfflineDeviceMessage('Safety alarms data'));
    }
    
    const startDate = getDateDaysAgo(DEFAULT_ALARM_DAYS);
    const endDate = getCurrentDate();
    
    return createCard('Active Safety (ADAS/DSM)', `
        ${createDateRangeFilter('safetyStartDate', 'safetyEndDate', startDate, endDate, 'Load Safety Alarms', 'fetchSafetyAlarmsUI()')}
        <div id="safetyList">
            ${createEmptyState('Click "Load Safety Alarms" to fetch ADAS/DSM events<br><small>Includes: Fatigue, Phone Call, Smoking, Distracted Driving, etc.</small>')}
        </div>
    `);
}

/**
 * Parse YYYY-MM-DD (local calendar date) into start/end of that day in local time,
 * then return UTC strings for API (API expects UTC 0).
 */
function localDateRangeToUTC(startDateStr, endDateStr) {
    const [sy, sm, sd] = startDateStr.split('-').map(Number);
    const [ey, em, ed] = endDateStr.split('-').map(Number);
    const startLocal = new Date(sy, sm - 1, sd);
    const endLocal = new Date(ey, em - 1, ed, 23, 59, 59, 999);
    return {
        start: formatDateTimeForApiUTC(startLocal),
        end: formatDateTimeForApiUTC(endLocal, true)
    };
}

/**
 * Fetch and display safety alarms
 */
async function fetchSafetyAlarmsUI() {
    if (!selectedDevice) return;
    
    const startDate = document.getElementById('safetyStartDate').value;
    const endDate = document.getElementById('safetyEndDate').value;
    const safetyList = document.getElementById('safetyList');
    
    safetyList.innerHTML = createLoadingIndicator('Loading safety alarms...');
    
    try {
        const { start, end } = localDateRangeToUTC(startDate, endDate);
        const plateNumber = selectedDevice.plateNumber || selectedDevice.deviceId;
        
        const data = await fetchSafetyAlarms(selectedDevice.deviceId, plateNumber, start, end);
        
        if (data.success && data.alarms?.length > 0) {
            safetyList.innerHTML = renderSafetyAlarmsList(data.alarms);
        } else {
            safetyList.innerHTML = createEmptyState('No safety alarms found for this date range');
        }
    } catch (error) {
        safetyList.innerHTML = createErrorState(error.message);
    }
}

/**
 * Render safety alarms list
 * @param {Array} alarms - Alarms array
 * @returns {string} HTML string
 */
function renderSafetyAlarmsList(alarms) {
    return `
        <div class="alarms-summary" style="margin-bottom: 16px; padding: 12px; background: var(--bg-secondary); border-radius: 6px;">
            Found <strong>${alarms.length}</strong> safety events
        </div>
        <div class="alarms-list" style="max-height: 600px; overflow-x: auto; overflow-y: auto;">
            <table style="width: 100%; border-collapse: collapse; min-width: 900px;">
                <thead>
                    <tr style="border-bottom: 2px solid var(--border-color); position: sticky; top: 0; background: white;">
                        <th style="text-align: left; padding: 8px; font-size: 12px;">#</th>
                        <th style="text-align: left; padding: 8px; font-size: 12px;">ID</th>
                        <th style="text-align: left; padding: 8px; font-size: 12px;">Device</th>
                        <th style="text-align: left; padding: 8px; font-size: 12px;">Alarm Type</th>
                        <th style="text-align: left; padding: 8px; font-size: 12px;">Code</th>
                        <th style="text-align: left; padding: 8px; font-size: 12px;">Time</th>
                        <th style="text-align: left; padding: 8px; font-size: 12px;">CH</th>
                        <th style="text-align: left; padding: 8px; font-size: 12px;">Location</th>
                        <th style="text-align: left; padding: 8px; font-size: 12px;">Media</th>
                        <th style="text-align: left; padding: 8px; font-size: 12px;">Evidence</th>
                    </tr>
                </thead>
                <tbody>
                    ${alarms.map((a, idx) => createSafetyAlarmRow(a, idx)).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// ============================================================================
// Videos Tab
// ============================================================================

/**
 * Render videos tab
 * @returns {string} Tab HTML
 */
function renderVideosTab() {
    if (!selectedDevice) {
        return createCard('Videos', createEmptyState('Please select a device first'));
    }
    
    if (!isSelectedDeviceOnline()) {
        return createCard('Video Recordings', createOfflineDeviceMessage('Video recordings'));
    }
    
    const today = getCurrentDate();
    const weekAgo = getDateDaysAgo(DEFAULT_VIDEO_DAYS);
    const numChannels = selectedDevice.channels || DEFAULT_CHANNELS;
    
    return createCard('Video Recordings', `
        <div class="video-filters" style="margin-bottom: 16px;">
            <label>From:</label>
            <input type="date" id="videoStartDate" value="${weekAgo}">
            <label>To:</label>
            <input type="date" id="videoEndDate" value="${today}">
            <label>Channel:</label>
            ${createChannelSelector('videoChannel', numChannels)}
            <button class="btn btn-primary" onclick="fetchVideosUI()">Load Videos</button>
        </div>
        <div id="videoList">
            ${createEmptyState('Click "Load Videos" to fetch video recordings')}
        </div>
    `);
}

/**
 * Fetch and display videos
 */
async function fetchVideosUI() {
    if (!selectedDevice) return;
    
    const startDateStr = document.getElementById('videoStartDate').value;
    const endDateStr = document.getElementById('videoEndDate').value;
    const channelSelect = document.getElementById('videoChannel').value;
    const videoList = document.getElementById('videoList');
    
    videoList.innerHTML = createLoadingIndicator('Loading videos...');
    
    try {
        // Parse YYYY-MM-DD as local calendar date (user's chosen day); new Date("YYYY-MM-DD") would be UTC midnight and shift the day in western TZs
        const [sy, sm, sd] = startDateStr.split('-').map(Number);
        const [ey, em, ed] = endDateStr.split('-').map(Number);
        const startDate = new Date(sy, sm - 1, sd);
        const endDate = new Date(ey, em - 1, ed);
        const numChannels = selectedDevice.channels || DEFAULT_CHANNELS;
        
        const allVideos = await fetchVideosDateRange(
            selectedDevice.deviceId, 
            startDate, 
            endDate, 
            channelSelect, 
            numChannels
        );
        
        if (allVideos.length > 0) {
            videoList.innerHTML = renderVideosList(allVideos);
        } else {
            videoList.innerHTML = createEmptyState('No videos found for this date range');
        }
    } catch (error) {
        videoList.innerHTML = createErrorState(error.message);
    }
}

/**
 * Render videos list grouped by date
 * @param {Array} videos - Videos array
 * @returns {string} HTML string
 */
function renderVideosList(videos) {
    const byDate = {};
    videos.forEach(v => {
        if (!byDate[v.date]) byDate[v.date] = [];
        byDate[v.date].push(v);
    });
    
    return `
        <div class="alarms-summary" style="margin-bottom: 16px; padding: 12px; background: var(--bg-secondary); border-radius: 6px;">
            Found <strong>${videos.length}</strong> video files across ${Object.keys(byDate).length} days
        </div>
        <div class="video-list" style="max-height: 500px; overflow-y: auto;">
            ${Object.entries(byDate).sort((a,b) => b[0].localeCompare(a[0])).map(([date, vids]) => `
                <div class="video-date-group" style="margin-bottom: 16px;">
                    <h4 style="margin-bottom: 8px; color: var(--text-secondary);">${date}</h4>
                    ${vids.map((v, idx) => createVideoItem(v, date, idx)).join('')}
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Create video item HTML
 */
function createVideoItem(video, date, index) {
    const uniqueId = `videoPlayer${date.replace(/-/g, '')}${index}`;
    const playUrl = video.playbackUrl || '';
    
    let playerUrl = wsToHttp(playUrl);
    if (playUrl.includes('/3/5') || playUrl.includes('DownType=5')) {
        if (!playerUrl.includes('PlayBackVideo.html')) {
            playerUrl = buildPlayerUrl(playerUrl);
        }
    } else if (playUrl.includes('.m3u8')) {
        playerUrl = playerUrl.replace(/PLAYIFRM=0/, 'PLAYIFRM=1');
    }
    
    return `
        <div class="video-item" style="padding: 8px; border-bottom: 1px solid var(--border-light);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div>
                    <span style="font-weight: 500;">Channel ${(video.channel || 0) + 1}</span>
                    <span style="color: var(--text-secondary); margin-left: 12px;">${formatTime(video.startTime)} - ${formatTime(video.endTime)}</span>
                </div>
                <div>
                    ${video.playbackUrl ? `<button class="btn-small" onclick="playVideoIframe('${uniqueId}', '${escapeForAttribute(playerUrl)}')">Play</button>` : ''}
                    ${video.downloadUrl ? `<a href="${video.downloadUrl}" target="_blank" class="btn-small btn-secondary" style="margin-left: 8px;">Download</a>` : ''}
                </div>
            </div>
        </div>
    `;
}

// ============================================================================
// Live Stream Tab
// ============================================================================

/**
 * Get live channels key for localStorage
 */
function liveChannelsKey() {
    return selectedDevice ? `${STORAGE_KEYS.LIVE_CHANNELS_PREFIX}${selectedDevice.deviceId}` : null;
}

/**
 * Get number of live channels to display
 */
function getLiveNumChannels() {
    const fromDevice = selectedDevice?.channels ?? deviceStatus?.channels ?? DEFAULT_CHANNELS;
    const key = liveChannelsKey();
    
    if (key) {
        const stored = getStorageValue(key);
        if (stored !== null) {
            const n = parseInt(stored, 10);
            if (n >= 1 && n <= MAX_CHANNELS) return n;
        }
    }
    return fromDevice;
}

/**
 * Set number of live channels
 */
function setLiveNumChannels(n) {
    const key = liveChannelsKey();
    if (key && n >= 1 && n <= MAX_CHANNELS) {
        setStorageValue(key, String(n));
        const tabContent = document.getElementById('tabContent');
        if (tabContent && getStorageValue(STORAGE_KEYS.SELECTED_TAB, TABS.OVERVIEW) === TABS.LIVE) {
            tabContent.innerHTML = renderLiveTab();
        }
    }
}

/**
 * Render live stream tab
 */
function renderLiveTab() {
    if (!selectedDevice) {
        return createCard('Live Stream', createEmptyState('Please select a device first'));
    }
    
    if (!isSelectedDeviceOnline()) {
        return createCard('Live Video Streams', createOfflineDeviceMessage('Live streaming'));
    }
    
    const numChannels = getLiveNumChannels();
    const override = liveChannelsKey() && getStorageValue(liveChannelsKey()) !== null;
    
    return createCard('Live Video Streams', `
        <div style="margin-bottom: 16px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
            <label>Channels to show:</label>
            <select id="liveChannelsSelect" onchange="setLiveNumChannels(parseInt(this.value,10))" style="min-width: 64px;">
                ${[1,2,3,4,5,6,7,8].map(n => `<option value="${n}" ${n === numChannels ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
            <span style="color: var(--text-secondary); font-size: 12px;">${override ? '(overridden)' : `(from device: ${selectedDevice.channels ?? deviceStatus?.channels ?? '?'})`}</span>
        </div>
        <div class="live-grid" style="display: grid; grid-template-columns: repeat(${UI_CONFIG.LIVE_GRID_COLUMNS}, 1fr); gap: 16px;">
            ${Array.from({length: numChannels}, (_, i) => createLiveChannelItem(i)).join('')}
        </div>
    `) + createCard('Test Live Stream URLs', createLiveUrlTestSection());
}

/**
 * Create live URL test section with all URL formats
 */
function createLiveUrlTestSection() {
    if (!selectedDevice || !CMS_PLAYER) {
        return '<p style="color: #888;">Select a device and ensure CMS config is loaded</p>';
    }
    
    const host = CMS_PLAYER.BASE_HOST;
    const port = CMS_PLAYER.STREAM_PORT;
    const webPort = CMS_PLAYER.WEB_PORT;
    const deviceId = selectedDevice.deviceId;
    const plateNum = selectedDevice.plateNumber || deviceId;
    const jsession = window.currentJsession || 'SESSION_NOT_SET';
    
    return `
        <div style="margin-bottom: 16px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
            <div>
                <label>Channel: </label>
                <select id="liveUrlChannel" onchange="updateLiveUrls()" style="min-width: 64px;">
                    ${[0,1,2,3,4,5,6,7].map(n => `<option value="${n}">CH ${n + 1}</option>`).join('')}
                </select>
            </div>
            <div>
                <label>Stream: </label>
                <select id="liveUrlStream" onchange="updateLiveUrls()" style="min-width: 80px;">
                    <option value="0">Main (0)</option>
                    <option value="1" selected>Sub (1)</option>
                </select>
            </div>
            <div>
                <button class="btn-small" onclick="refreshSession()">🔄 Refresh Session</button>
                <span id="sessionStatus" style="margin-left: 8px; font-size: 11px; color: ${jsession === 'SESSION_NOT_SET' ? '#ea4335' : '#34a853'};">
                    ${jsession === 'SESSION_NOT_SET' ? '⚠ No session' : '✓ ' + jsession.substring(0, 8) + '...'}
                </span>
            </div>
        </div>
        
        <div id="liveUrlsContainer">
            ${generateLiveUrlsHtml(host, port, webPort, deviceId, plateNum, jsession, 0, 1)}
        </div>
    `;
}

/**
 * Refresh the CMS session
 */
async function refreshSession() {
    const statusEl = document.getElementById('sessionStatus');
    if (statusEl) statusEl.innerHTML = '⏳ Refreshing...';
    
    try {
        const response = await fetch('/api/config');
        const data = await response.json();
        if (data.success && data.jsession) {
            window.currentJsession = data.jsession;
            if (statusEl) {
                statusEl.style.color = '#34a853';
                statusEl.innerHTML = '✓ ' + data.jsession.substring(0, 8) + '...';
            }
            updateLiveUrls();
            console.log('[Session] Refreshed:', data.jsession);
        } else {
            throw new Error('No session in response');
        }
    } catch (e) {
        console.error('[Session] Refresh failed:', e);
        if (statusEl) {
            statusEl.style.color = '#ea4335';
            statusEl.innerHTML = '⚠ Failed to refresh';
        }
    }
}

/**
 * Generate live URLs HTML
 */
function generateLiveUrlsHtml(host, port, webPort, deviceId, plateNum, jsession, channel, stream) {
    const urls = [
        {
            name: 'HLS (m3u8)',
            url: `http://${host}:${port}/hls/1_${deviceId}_${channel}_${stream}.m3u8?jsession=${jsession}`,
            desc: 'Apple HLS - works with hls.js',
            canPlay: true
        },
        {
            name: 'FLV (HTTP)',
            url: `http://${host}:${port}/3/3?AVType=1&jsession=${jsession}&DevIDNO=${deviceId}&Channel=${channel}&Stream=${stream}`,
            desc: 'FLV stream - works with mpegts.js',
            canPlay: true
        },
        {
            name: 'WebSocket FLV',
            url: `ws://${host}:${port}/3/3?AVType=1&jsession=${jsession}&DevIDNO=${deviceId}&Channel=${channel}&Stream=${stream}`,
            desc: 'WebSocket FLV - works with mpegts.js',
            canPlay: true
        },
        {
            name: 'RTSP',
            url: `rtsp://${host}:${port}/3/3?AVType=1&jsession=${jsession}&DevIDNO=${deviceId}&Channel=${channel}&Stream=${stream}`,
            desc: 'RTSP - use VLC or ffplay',
            canPlay: false
        },
        {
            name: 'RTMP',
            url: `rtmp://${host}:${port}/3/3?AVType=1&jsession=${jsession}&DevIDNO=${deviceId}&Channel=${channel}&Stream=${stream}`,
            desc: 'RTMP - use VLC or ffplay',
            canPlay: false
        }
    ];
    
    const playerPages = [
        {
            name: 'CMS RealPlay Page',
            url: `http://${host}:${webPort}/808gps/open/player/RealPlayVideo.html?jsession=${jsession}&PlateNum=${plateNum}&lang=en`,
            desc: 'CMS built-in live player'
        },
        {
            name: 'CMS Video Page',
            url: `http://${host}:${webPort}/808gps/open/player/video.html?jsession=${jsession}&vehiIdno=${plateNum}&channel=${channel}&lang=en`,
            desc: 'CMS video.html player'
        }
    ];
    
    let html = '<table style="width: 100%; font-size: 12px; border-collapse: collapse;">';
    html += '<tr style="background: var(--bg-secondary);"><th style="padding: 8px; text-align: left;">Type</th><th style="padding: 8px; text-align: left;">URL</th><th style="padding: 8px;">Actions</th></tr>';
    
    // Stream URLs
    for (const item of urls) {
        html += `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 8px; white-space: nowrap;">
                    <strong>${item.name}</strong><br>
                    <span style="color: #888; font-size: 11px;">${item.desc}</span>
                </td>
                <td style="padding: 8px; word-break: break-all; font-family: monospace; font-size: 11px; max-width: 400px;">${item.url}</td>
                <td style="padding: 8px; white-space: nowrap; text-align: center;">
                    <button class="btn-small" onclick="copyToClipboard('${item.url.replace(/'/g, "\\'")}')">📋 Copy</button>
                    ${item.canPlay ? `<button class="btn-small btn-v2" onclick="testLiveUrl('${item.url.replace(/'/g, "\\'")}', '${item.name}')" style="margin-left: 4px;">▶ Test</button>` : ''}
                    <button class="btn-small btn-direct" onclick="window.open('${item.url.replace(/'/g, "\\'")}', '_blank')" style="margin-left: 4px;">🔗 Open</button>
                </td>
            </tr>
        `;
    }
    
    // Separator
    html += '<tr><td colspan="3" style="padding: 12px 8px; font-weight: 600; background: var(--bg-secondary);">CMS Player Pages</td></tr>';
    
    // Player pages
    for (const item of playerPages) {
        html += `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 8px; white-space: nowrap;">
                    <strong>${item.name}</strong><br>
                    <span style="color: #888; font-size: 11px;">${item.desc}</span>
                </td>
                <td style="padding: 8px; word-break: break-all; font-family: monospace; font-size: 11px; max-width: 400px;">${item.url}</td>
                <td style="padding: 8px; white-space: nowrap; text-align: center;">
                    <button class="btn-small" onclick="copyToClipboard('${item.url.replace(/'/g, "\\'")}')">📋 Copy</button>
                    <button class="btn-small btn-direct" onclick="window.open('${item.url.replace(/'/g, "\\'")}', '_blank')" style="margin-left: 4px;">🔗 Open</button>
                </td>
            </tr>
        `;
    }
    
    html += '</table>';
    return html;
}

/**
 * Update live URLs when channel/stream changes
 */
function updateLiveUrls() {
    const channel = parseInt(document.getElementById('liveUrlChannel')?.value || 0);
    const stream = parseInt(document.getElementById('liveUrlStream')?.value || 1);
    const container = document.getElementById('liveUrlsContainer');
    
    if (!container || !selectedDevice || !CMS_PLAYER) return;
    
    const host = CMS_PLAYER.BASE_HOST;
    const port = CMS_PLAYER.STREAM_PORT;
    const webPort = CMS_PLAYER.WEB_PORT;
    const deviceId = selectedDevice.deviceId;
    const plateNum = selectedDevice.plateNumber || deviceId;
    const jsession = window.currentJsession || 'SESSION_NOT_SET';
    
    container.innerHTML = generateLiveUrlsHtml(host, port, webPort, deviceId, plateNum, jsession, channel, stream);
}

/**
 * Copy text to clipboard
 */
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        console.log('[Clipboard] Copied:', text.substring(0, 50) + '...');
    }).catch(err => {
        console.error('[Clipboard] Failed:', err);
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    });
}

/**
 * Test live URL in a popup player
 */
function testLiveUrl(url, name) {
    // Open video modal with this URL
    openVideoModal(url, `Test: ${name}`);
}

/**
 * Create live channel item HTML
 */
function createLiveChannelItem(channel) {
    return `
        <div class="live-channel" style="border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
            <div style="padding: 8px; background: var(--bg-secondary); display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 500;">Channel ${channel + 1}</span>
                <div>
                    <button class="btn-small" onclick="openLiveStream(${channel})" id="streamBtn${channel}">Open Stream</button>
                    <button class="btn-small btn-secondary" onclick="stopLiveStream(${channel})" id="stopBtn${channel}" style="margin-left: 4px; display: none;">Stop</button>
                </div>
            </div>
            <div id="liveFrame${channel}" style="height: ${UI_CONFIG.VIDEO_PLAYER_HEIGHT}; min-height: ${UI_CONFIG.VIDEO_PLAYER_HEIGHT}; background: #1a1a2e; display: flex; align-items: center; justify-content: center; color: #666; position: relative;">
                Click "Open Stream" to start
            </div>
        </div>
    `;
}
