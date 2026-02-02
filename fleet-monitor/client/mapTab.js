/**
 * Fleet Monitor - Map Tab
 * Live device tracking on an interactive map
 */

// ============================================================================
// Map State
// ============================================================================

let map = null;
let deviceMarkers = {};
let deviceTrails = {};
let trailEndpoints = {}; // Start/End markers for trails
let mapUpdateInterval = null;
let isMapInitialized = false;
let showAllDevices = false;
let followSelectedDevice = true;
let trailPoints = {}; // Store trail points for each device

// Map update interval (ms)
const MAP_UPDATE_INTERVAL = 2000; // 2 seconds for faster tracking
const MAX_TRAIL_POINTS = 200;

// ============================================================================
// Map Tab Renderer
// ============================================================================

/**
 * Render Map tab
 * @returns {string} Tab HTML
 */
function renderMapTab() {
    // Default to last 2 hours for trail
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 2 * 60 * 60 * 1000);
    
    return `
        <div class="map-container">
            <div class="map-toolbar">
                <div class="map-toolbar-left">
                    <label class="filter-checkbox">
                        <input type="checkbox" id="showAllDevicesToggle" ${showAllDevices ? 'checked' : ''} onchange="toggleShowAllDevices()">
                        <span class="checkmark"></span>
                        <span class="filter-label">Show all devices</span>
                    </label>
                    <label class="filter-checkbox" style="margin-left: 16px;">
                        <input type="checkbox" id="followDeviceToggle" ${followSelectedDevice ? 'checked' : ''} onchange="toggleFollowDevice()">
                        <span class="checkmark"></span>
                        <span class="filter-label">Follow selected</span>
                    </label>
                </div>
                <div class="map-toolbar-right">
                    <select id="trailDuration" class="trail-select" onchange="loadHistoricalTrail()">
                        <option value="0">No Trail</option>
                        <option value="1">Last 1 Hour</option>
                        <option value="2" selected>Last 2 Hours</option>
                        <option value="6">Last 6 Hours</option>
                        <option value="12">Last 12 Hours</option>
                        <option value="24">Last 24 Hours</option>
                    </select>
                    <button class="btn btn-secondary btn-small" onclick="loadHistoricalTrail()">Load Trail</button>
                    <button class="btn btn-secondary btn-small" onclick="clearAllTrails()">Clear</button>
                    <button class="btn btn-primary btn-small" onclick="centerMapOnDevice()">Center</button>
                </div>
            </div>
            <div id="mapElement" class="map-element"></div>
            <div class="map-legend">
                <div class="legend-item"><span class="legend-marker online"></span> Online</div>
                <div class="legend-item"><span class="legend-marker offline"></span> Offline</div>
                <div class="legend-item"><span class="legend-marker selected"></span> Selected</div>
                <div class="legend-item"><span class="legend-line"></span> Trail</div>
            </div>
        </div>
    `;
}

// ============================================================================
// Map Initialization
// ============================================================================

/**
 * Initialize or re-initialize the map
 */
function initializeMap() {
    const mapElement = document.getElementById('mapElement');
    if (!mapElement) return;
    
    // Clean up existing map if any
    if (map) {
        map.remove();
        map = null;
    }
    
    // Reset state
    deviceMarkers = {};
    deviceTrails = {};
    trailEndpoints = {};
    
    // Create map centered on a default location (will be updated when devices load)
    map = L.map('mapElement', {
        zoomControl: true,
        attributionControl: true
    }).setView([0, 0], 2);
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);
    
    isMapInitialized = true;
    
    // Load devices onto map
    updateMapDevices();
    
    // Start auto-refresh
    startMapUpdates();
    
    // Auto-load historical trail if device is selected
    if (selectedDevice) {
        setTimeout(() => loadHistoricalTrail(), 1000);
    }
}

/**
 * Start map auto-updates
 */
function startMapUpdates() {
    stopMapUpdates();
    mapUpdateInterval = setInterval(async () => {
        // Fetch fresh device status for real-time tracking
        if (selectedDevice && typeof fetchDeviceStatus === 'function') {
            try {
                const data = await fetchDeviceStatus(
                    selectedDevice.deviceId, 
                    selectedDevice.plateNumber, 
                    selectedDevice.plateType
                );
                if (data.success && data.device) {
                    deviceStatus = data.device;
                }
            } catch (e) {
                console.warn('[Map] Status fetch error:', e);
            }
        }
        updateMapDevices();
    }, MAP_UPDATE_INTERVAL);
}

/**
 * Stop map auto-updates
 */
function stopMapUpdates() {
    if (mapUpdateInterval) {
        clearInterval(mapUpdateInterval);
        mapUpdateInterval = null;
    }
}

// ============================================================================
// Map Device Management
// ============================================================================

/**
 * Create a custom icon for a device
 */
function createDeviceIcon(device, isSelected) {
    const isOnline = device.online === true || device.online === 1 || device.online === '1';
    const color = isSelected ? '#3b82f6' : (isOnline ? '#22c55e' : '#6b7280');
    const size = isSelected ? 14 : 10;
    
    return L.divIcon({
        className: 'device-map-marker',
        html: `
            <div class="marker-pin" style="background-color: ${color}; width: ${size}px; height: ${size}px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
            </div>
            ${isSelected ? `<div class="marker-label">${escapeHtml(device.plateNumber || device.deviceId)}</div>` : ''}
        `,
        iconSize: [size + 4, size + 4],
        iconAnchor: [(size + 4) / 2, (size + 4) / 2]
    });
}

/**
 * Create a directional icon showing heading
 */
function createDirectionalIcon(device, isSelected) {
    const isOnline = device.online === true || device.online === 1 || device.online === '1';
    const color = isSelected ? '#3b82f6' : (isOnline ? '#22c55e' : '#6b7280');
    const heading = device.heading || 0;
    const size = isSelected ? 32 : 24;
    
    return L.divIcon({
        className: 'device-map-marker directional',
        html: `
            <div class="marker-arrow" style="transform: rotate(${heading}deg);">
                <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
                    <path d="M12 2L4 20h3l5-6 5 6h3L12 2z" stroke="white" stroke-width="1"/>
                </svg>
            </div>
            <div class="marker-label-below">${escapeHtml(device.plateNumber || device.deviceId)}</div>
        `,
        iconSize: [size, size + 20],
        iconAnchor: [size / 2, size / 2]
    });
}

/**
 * Update all devices on the map
 */
async function updateMapDevices() {
    if (!map || !isMapInitialized) return;
    
    try {
        // Get device list
        let devicesToShow = [];
        
        if (showAllDevices && allDevicesList && allDevicesList.length > 0) {
            devicesToShow = allDevicesList.filter(d => {
                const isOnline = d.online === true || d.online === 1 || d.online === '1';
                return isOnline; // Only show online devices when showing all
            });
        } else if (selectedDevice) {
            // Get latest status for selected device
            if (deviceStatus) {
                devicesToShow = [{
                    ...selectedDevice,
                    ...deviceStatus
                }];
            } else {
                devicesToShow = [selectedDevice];
            }
        }
        
        // Track which devices we've updated
        const updatedDeviceIds = new Set();
        
        for (const device of devicesToShow) {
            const deviceId = device.deviceId;
            updatedDeviceIds.add(deviceId);
            
            // Skip if no valid coordinates
            const lat = device.lat || 0;
            const lng = device.lng || 0;
            if (Math.abs(lat) < 0.1 && Math.abs(lng) < 0.1) continue;
            
            const isSelected = selectedDevice && selectedDevice.deviceId === deviceId;
            const icon = createDirectionalIcon(device, isSelected);
            
            // Create popup content (use formatDateTime for timezone-aware display)
            const popupContent = `
                <div class="map-popup">
                    <strong>${escapeHtml(device.plateNumber || deviceId)}</strong><br>
                    <span>Speed: ${device.speed || 0} km/h</span><br>
                    <span>Heading: ${device.heading || 0}°</span><br>
                    <span>Time: ${device.gpsTime ? formatDateTime(device.gpsTime) : '-'}</span>
                </div>
            `;
            
            if (deviceMarkers[deviceId]) {
                // Update existing marker
                deviceMarkers[deviceId].setLatLng([lat, lng]);
                deviceMarkers[deviceId].setIcon(icon);
                deviceMarkers[deviceId].getPopup().setContent(popupContent);
            } else {
                // Create new marker
                const marker = L.marker([lat, lng], { icon })
                    .bindPopup(popupContent)
                    .addTo(map);
                
                marker.on('click', () => {
                    // Select device when marker is clicked
                    if (!isSelected) {
                        const deviceData = allDevicesData[deviceId] || device;
                        if (deviceData) {
                            selectDevice(
                                deviceData.deviceId,
                                deviceData.plateNumber,
                                deviceData.channels || 4,
                                deviceData.plateType
                            );
                        }
                    }
                });
                
                deviceMarkers[deviceId] = marker;
            }
            
            // Update trail
            updateDeviceTrail(deviceId, lat, lng, device);
        }
        
        // Remove markers for devices no longer shown
        for (const deviceId of Object.keys(deviceMarkers)) {
            if (!updatedDeviceIds.has(deviceId)) {
                map.removeLayer(deviceMarkers[deviceId]);
                delete deviceMarkers[deviceId];
            }
        }
        
        // Center on selected device if following
        if (followSelectedDevice && selectedDevice && deviceStatus) {
            const lat = deviceStatus.lat || 0;
            const lng = deviceStatus.lng || 0;
            if (Math.abs(lat) > 0.1 || Math.abs(lng) > 0.1) {
                map.setView([lat, lng], map.getZoom() < 10 ? 15 : map.getZoom());
            }
        } else if (devicesToShow.length > 0 && Object.keys(deviceMarkers).length > 0) {
            // Fit bounds to show all markers on first load
            const markers = Object.values(deviceMarkers);
            if (markers.length > 0 && map.getZoom() <= 2) {
                const group = L.featureGroup(markers);
                map.fitBounds(group.getBounds().pad(0.1));
            }
        }
        
    } catch (error) {
        console.error('[Map] Error updating devices:', error);
    }
}

/**
 * Update trail for a device
 */
function updateDeviceTrail(deviceId, lat, lng, device) {
    if (!map) return;
    
    // Initialize trail points array if needed
    if (!trailPoints[deviceId]) {
        trailPoints[deviceId] = [];
    }
    
    // Initialize trail layer group if needed
    if (!deviceTrails[deviceId]) {
        deviceTrails[deviceId] = L.layerGroup().addTo(map);
    }
    
    // Add new point if position changed
    const points = trailPoints[deviceId];
    const lastPoint = points.length > 0 ? points[points.length - 1] : null;
    
    if (!lastPoint || lastPoint[0] !== lat || lastPoint[1] !== lng) {
        points.push([lat, lng]);
        
        // Add circle marker for this point
        const trailColor = '#22c55e';
        const circleMarker = L.circleMarker([lat, lng], {
            radius: 5,
            fillColor: trailColor,
            color: '#ffffff',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
        });
        deviceTrails[deviceId].addLayer(circleMarker);
        
        // Limit trail length - remove oldest point
        if (points.length > MAX_TRAIL_POINTS) {
            points.shift();
            // Remove oldest circle from layer group
            const layers = deviceTrails[deviceId].getLayers();
            if (layers.length > MAX_TRAIL_POINTS) {
                deviceTrails[deviceId].removeLayer(layers[0]);
            }
        }
    }
}

// ============================================================================
// Historical Trail Loading
// ============================================================================

/**
 * Load historical GPS trail for selected device
 */
async function loadHistoricalTrail() {
    if (!selectedDevice || !map) {
        // No device selected, silently return
        return;
    }
    
    const durationSelect = document.getElementById('trailDuration');
    const hours = parseInt(durationSelect?.value || '2');
    
    if (hours === 0) {
        // Clear trail for this device
        const deviceId = selectedDevice.deviceId;
        if (deviceTrails[deviceId]) {
            map.removeLayer(deviceTrails[deviceId]);
            delete deviceTrails[deviceId];
        }
        trailPoints[deviceId] = [];
        return;
    }
    
    const deviceId = selectedDevice.deviceId;
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - hours * 60 * 60 * 1000);
    
    console.log(`[Map] Loading trail for ${deviceId}, last ${hours} hours`);
    
    try {
        const data = await fetchGpsData(deviceId, formatDateTimeForApiUTC(startDate), formatDateTimeForApiUTC(endDate, true));
        
        if (data.success && data.tracks && data.tracks.length > 0) {
            // Convert tracks to points array
            const points = data.tracks
                .filter(t => Math.abs(t.lat) > 0.1 || Math.abs(t.lng) > 0.1)
                .map(t => [t.lat, t.lng]);
            
            if (points.length < 2) {
                // Not enough points, silently return
                return;
            }
            
            console.log(`[Map] Loaded ${points.length} trail points`);
            
            // Store points
            trailPoints[deviceId] = points;
            
            // Remove existing trail
            if (deviceTrails[deviceId]) {
                map.removeLayer(deviceTrails[deviceId]);
            }
            
            // Create trail with circle markers - green points
            const trailColor = '#22c55e';
            deviceTrails[deviceId] = L.layerGroup().addTo(map);
            
            points.forEach((point, index) => {
                const circleMarker = L.circleMarker(point, {
                    radius: 5,
                    fillColor: trailColor,
                    color: '#ffffff',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                });
                deviceTrails[deviceId].addLayer(circleMarker);
            });
            
            // Fit map to show entire trail
            const bounds = L.latLngBounds(points);
            map.fitBounds(bounds.pad(0.1));
            
            // Add start and end markers
            addTrailEndpoints(deviceId, points);
            
        } else {
            // No GPS data found, silently continue
        }
    } catch (error) {
        console.error('[Map] Error loading trail:', error);
        // Silently handle errors
    }
}

/**
 * Add start/end markers to trail
 */
function addTrailEndpoints(deviceId, points) {
    if (!map || points.length < 2) return;
    
    // Remove existing endpoint markers
    if (trailEndpoints[deviceId]) {
        trailEndpoints[deviceId].forEach(m => map.removeLayer(m));
    }
    
    const startPoint = points[0];
    const endPoint = points[points.length - 1];
    
    const startIcon = L.divIcon({
        className: 'trail-endpoint',
        html: '<div class="trail-start">S</div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
    
    const endIcon = L.divIcon({
        className: 'trail-endpoint',
        html: '<div class="trail-end">E</div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
    
    const startMarker = L.marker(startPoint, { icon: startIcon })
        .bindPopup('Trail Start')
        .addTo(map);
    
    const endMarker = L.marker(endPoint, { icon: endIcon })
        .bindPopup('Trail End (Latest)')
        .addTo(map);
    
    trailEndpoints[deviceId] = [startMarker, endMarker];
}

// ============================================================================
// Map Controls
// ============================================================================

/**
 * Toggle showing all devices
 */
function toggleShowAllDevices() {
    const checkbox = document.getElementById('showAllDevicesToggle');
    showAllDevices = checkbox ? checkbox.checked : false;
    
    // Clear existing markers when switching modes
    for (const deviceId of Object.keys(deviceMarkers)) {
        map.removeLayer(deviceMarkers[deviceId]);
    }
    deviceMarkers = {};
    
    // Clear trails
    clearAllTrails();
    
    updateMapDevices();
}

/**
 * Toggle follow selected device
 */
function toggleFollowDevice() {
    const checkbox = document.getElementById('followDeviceToggle');
    followSelectedDevice = checkbox ? checkbox.checked : false;
    
    if (followSelectedDevice) {
        centerMapOnDevice();
    }
}

/**
 * Clear all device trails
 */
function clearAllTrails() {
    // Clear trail lines
    for (const deviceId of Object.keys(deviceTrails)) {
        if (deviceTrails[deviceId]) {
            map.removeLayer(deviceTrails[deviceId]);
        }
    }
    deviceTrails = {};
    trailPoints = {};
    
    // Clear endpoint markers
    for (const deviceId of Object.keys(trailEndpoints)) {
        if (trailEndpoints[deviceId]) {
            trailEndpoints[deviceId].forEach(m => {
                if (map) map.removeLayer(m);
            });
        }
    }
    trailEndpoints = {};
}

/**
 * Center map on selected device
 */
function centerMapOnDevice() {
    if (!map || !selectedDevice) return;
    
    const device = deviceStatus || selectedDevice;
    const lat = device.lat || 0;
    const lng = device.lng || 0;
    
    if (Math.abs(lat) > 0.1 || Math.abs(lng) > 0.1) {
        map.setView([lat, lng], 16);
    }
}

/**
 * Manually refresh map
 */
function refreshMapNow() {
    updateMapDevices();
}

/**
 * Called when selected device changes
 */
function onMapDeviceChanged() {
    if (!isMapInitialized) return;
    
    // Clear markers and redraw
    for (const deviceId of Object.keys(deviceMarkers)) {
        map.removeLayer(deviceMarkers[deviceId]);
    }
    deviceMarkers = {};
    
    if (!showAllDevices) {
        clearAllTrails();
    }
    
    updateMapDevices();
    
    // Auto-load trail if duration is set
    const durationSelect = document.getElementById('trailDuration');
    if (durationSelect && parseInt(durationSelect.value) > 0) {
        setTimeout(() => loadHistoricalTrail(), 500);
    }
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Clean up map resources
 */
function cleanupMap() {
    stopMapUpdates();
    
    if (map) {
        map.remove();
        map = null;
    }
    
    deviceMarkers = {};
    deviceTrails = {};
    trailPoints = {};
    isMapInitialized = false;
}
