/**
 * Fleet Monitor - GPS Tab
 * GPS location log, data fetching, and export
 */

// ============================================================================
// GPS Data Cache
// ============================================================================

let gpsDataCache = [];

// ============================================================================
// GPS Tab Renderer
// ============================================================================

/**
 * Render GPS log tab
 * @returns {string} Tab HTML
 */
function renderGpsTab() {
    if (!selectedDevice) {
        return createCard('GPS Log', createEmptyState('Please select a device first'));
    }
    
    if (!isSelectedDeviceOnline()) {
        return createCard('GPS Location Log', createOfflineDeviceMessage('GPS tracking data'));
    }
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - DEFAULT_GPS_DAYS);
    
    return createCard('GPS Location Log', `
        <div class="video-filters" style="margin-bottom: 16px;">
            <label>From:</label>
            <input type="datetime-local" id="gpsStartDate" value="${toLocalDatetimeLocalValue(startDate)}">
            <label>To:</label>
            <input type="datetime-local" id="gpsEndDate" value="${toLocalDatetimeLocalValue(endDate)}">
            <button class="btn btn-primary" onclick="fetchGpsDataUI()">Load GPS Data</button>
            <button class="btn btn-secondary" onclick="exportGpsData()">Export CSV</button>
        </div>
        <div id="gpsSummary" style="display: none; margin-bottom: 16px; padding: 12px; background: var(--bg-tertiary); border-radius: 8px;">
            <div style="display: flex; gap: 24px; flex-wrap: wrap;">
                <div><strong>Total Points:</strong> <span id="gpsTotalPoints">0</span></div>
                <div><strong>Distance:</strong> <span id="gpsTotalDistance">0</span> km</div>
                <div><strong>Max Speed:</strong> <span id="gpsMaxSpeed">0</span> km/h</div>
                <div><strong>Avg Speed:</strong> <span id="gpsAvgSpeed">0</span> km/h</div>
                <div><strong>ACC On Time:</strong> <span id="gpsAccOnTime">0</span></div>
                <div><strong>Total Parking:</strong> <span id="gpsTotalParking">0</span></div>
            </div>
        </div>
        <div id="gpsLogList">
            ${createEmptyState('Click "Load GPS Data" to fetch location history')}
        </div>
    `);
}

// ============================================================================
// GPS Data Fetching
// ============================================================================

/**
 * Fetch and display GPS data
 */
async function fetchGpsDataUI() {
    if (!selectedDevice) return;
    
    const startDateStr = document.getElementById('gpsStartDate').value;
    const endDateStr = document.getElementById('gpsEndDate').value;
    const gpsLogList = document.getElementById('gpsLogList');
    const gpsSummary = document.getElementById('gpsSummary');
    
    gpsLogList.innerHTML = createLoadingIndicator('Loading GPS data...');
    gpsSummary.style.display = 'none';
    
    try {
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        
        const start = formatDateTimeForApiUTC(startDate);
        const end = formatDateTimeForApiUTC(endDate, true);
        
        const data = await fetchGpsData(selectedDevice.deviceId, start, end);
        
        if (data.success && data.tracks && data.tracks.length > 0) {
            gpsDataCache = data.tracks;
            
            const summary = calculateGpsSummary(data.tracks, data.totalDistance);
            updateGpsSummary(summary);
            gpsSummary.style.display = 'block';
            
            gpsLogList.innerHTML = renderGpsTable(data.tracks, data.totalRecords);
        } else {
            gpsDataCache = [];
            gpsLogList.innerHTML = createEmptyState('No GPS data found for the selected time range');
        }
    } catch (error) {
        console.error('Error fetching GPS data:', error);
        gpsLogList.innerHTML = createErrorState(error.message);
    }
}

// formatDateTimeForApiUTC is in utils.js - converts user's local input to UTC for API

// ============================================================================
// GPS Summary Calculation
// ============================================================================

/**
 * Calculate GPS summary statistics
 * @param {Array} tracks - Track points
 * @param {number} totalDistance - Total distance from API
 * @returns {Object} Summary statistics
 */
function calculateGpsSummary(tracks, totalDistance) {
    let maxSpeed = 0;
    let totalSpeed = 0;
    let speedCount = 0;
    let accOnCount = 0;
    let totalParkingTime = 0;
    
    for (const track of tracks) {
        if (track.speed > 0) {
            totalSpeed += track.speed;
            speedCount++;
            if (track.speed > maxSpeed) maxSpeed = track.speed;
        }
        if (track.accOn) accOnCount++;
        if (track.parkingTime > 0) totalParkingTime += track.parkingTime;
    }
    
    const parkingHours = Math.floor(totalParkingTime / 3600);
    const parkingMins = Math.floor((totalParkingTime % 3600) / 60);
    const parkingStr = parkingHours > 0 ? `${parkingHours}h ${parkingMins}m` : `${parkingMins}m`;
    const accOnPercent = tracks.length > 0 ? ((accOnCount / tracks.length) * 100).toFixed(0) : 0;
    
    return {
        totalPoints: tracks.length,
        totalDistance: (totalDistance || 0).toFixed(2),
        maxSpeed: maxSpeed.toFixed(1),
        avgSpeed: speedCount > 0 ? (totalSpeed / speedCount).toFixed(1) : '0',
        accOnTime: `${accOnPercent}% (${accOnCount} points)`,
        totalParking: parkingStr
    };
}

/**
 * Update GPS summary display
 * @param {Object} summary - Summary statistics
 */
function updateGpsSummary(summary) {
    document.getElementById('gpsTotalPoints').textContent = summary.totalPoints;
    document.getElementById('gpsTotalDistance').textContent = summary.totalDistance;
    document.getElementById('gpsMaxSpeed').textContent = summary.maxSpeed;
    document.getElementById('gpsAvgSpeed').textContent = summary.avgSpeed;
    document.getElementById('gpsAccOnTime').textContent = summary.accOnTime;
    document.getElementById('gpsTotalParking').textContent = summary.totalParking;
}

/**
 * Render GPS table
 * @param {Array} tracks - Track points
 * @param {number} totalRecords - Total records count
 * @returns {string} HTML string
 */
function renderGpsTable(tracks, totalRecords) {
    // Count how many tracks are missing position data
    const missingPositions = tracks.filter(t => !t.position || t.position.trim() === '').length;
    
    return `
        <div class="table-container" style="max-height: 500px; overflow-y: auto;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Position</th>
                        <th>Speed</th>
                        <th>Heading</th>
                        <th>ACC</th>
                        <th>Fuel</th>
                        <th>Mileage</th>
                        <th>Network</th>
                        <th>Sats</th>
                        <th>Driver</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${tracks.map((track, index) => createGpsTrackRow(track, index)).join('')}
                </tbody>
            </table>
        </div>
        <div style="margin-top: 12px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <p style="color: var(--text-muted); font-size: 12px; margin: 0;">
                Showing ${tracks.length} GPS points. Total records: ${totalRecords || tracks.length}
            </p>
            ${missingPositions > 0 ? `
                <button class="btn btn-secondary btn-small" onclick="geocodeMissingAddresses()" id="geocodeBtn">
                    📍 Geocode ${missingPositions} Missing Addresses
                </button>
            ` : ''}
        </div>
    `;
}

/**
 * Geocode addresses for GPS points missing position data
 */
function geocodeMissingAddresses() {
    if (!gpsDataCache || gpsDataCache.length === 0) {
        alert('No GPS data loaded.');
        return;
    }
    
    const btn = document.getElementById('geocodeBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Geocoding...';
    }
    
    // Find tracks without positions
    const toGeocode = gpsDataCache
        .map((track, index) => ({ track, index }))
        .filter(({ track }) => !track.position || track.position.trim() === '');
    
    if (toGeocode.length === 0) {
        if (btn) btn.textContent = '✓ All done';
        return;
    }
    
    let completed = 0;
    const total = toGeocode.length;
    
    toGeocode.forEach(({ track, index }) => {
        if (typeof queueGeocode === 'function') {
            queueGeocode(track.lat, track.lng, (result) => {
                completed++;
                
                // Update the table cell
                const el = document.getElementById(`gpsAddr${index}`);
                if (el && result.success) {
                    el.innerHTML = result.shortAddress;
                    el.title = result.displayName || result.address;
                    el.style.fontStyle = 'normal';
                }
                
                // Update button progress
                if (btn) {
                    if (completed < total) {
                        btn.textContent = `⏳ Geocoding... ${completed}/${total}`;
                    } else {
                        btn.textContent = '✓ Geocoding complete';
                        btn.disabled = false;
                        setTimeout(() => {
                            if (btn) btn.style.display = 'none';
                        }, 2000);
                    }
                }
            });
        }
    });
}

// ============================================================================
// GPS Export
// ============================================================================

/**
 * Export GPS data to CSV
 */
function exportGpsData() {
    if (!gpsDataCache || gpsDataCache.length === 0) {
        alert('No GPS data to export. Please load GPS data first.');
        return;
    }
    
    const headers = [
        'Time', 'Latitude', 'Longitude', 'Speed (km/h)', 'Heading', 'Direction',
        'ACC', 'Fuel (L)', 'Mileage (km)', 'Network', 'Satellites', 'Altitude (m)',
        'Driver', 'Position', 'Temp1', 'Temp2', 'Temp3', 'Temp4',
        'Engine RPM', 'Battery (V)', 'Parking (sec)'
    ];
    
    const rows = gpsDataCache.map(track => [
        track.gpsTime || '',
        track.lat.toFixed(6),
        track.lng.toFixed(6),
        track.speed.toFixed(1),
        track.heading || 0,
        getHeadingDirection(track.heading || 0),
        track.accOn ? 'ON' : 'OFF',
        track.fuel > 0 ? track.fuel.toFixed(1) : '',
        (track.mileage / 1000).toFixed(1),
        track.network || '',
        track.satellites || '',
        track.altitude || 0,
        track.driverName || '',
        `"${(track.position || '').replace(/"/g, '""')}"`,
        track.temp1 > -999 ? track.temp1 : '',
        track.temp2 > -999 ? track.temp2 : '',
        track.temp3 > -999 ? track.temp3 : '',
        track.temp4 > -999 ? track.temp4 : '',
        track.engineRpm || '',
        track.batteryVoltage > 0 ? track.batteryVoltage.toFixed(1) : '',
        track.parkingTime || ''
    ]);
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `gps_log_${selectedDevice.deviceId}_${getCurrentDate()}.csv`;
    link.click();
}
