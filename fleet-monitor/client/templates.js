/**
 * Fleet Monitor - HTML Templates
 * Reusable template functions for generating HTML components
 */

// ============================================================================
// Card Components
// ============================================================================

/**
 * Create a card component
 * @param {string} title - Card title
 * @param {string} content - Card body content
 * @param {string} headerExtra - Extra content for header (optional)
 * @returns {string} Card HTML
 */
function createCard(title, content, headerExtra = '') {
    return `
        <div class="card">
            <div class="card-header">
                <h3>${title}</h3>
                ${headerExtra}
            </div>
            <div class="card-body">
                ${content}
            </div>
        </div>
    `;
}

/**
 * Create an info grid item
 * @param {string} label - Item label
 * @param {*} value - Item value
 * @param {boolean} fullWidth - Whether item spans full width
 * @returns {string} Info item HTML or empty string if no value
 */
function createInfoItem(label, value, fullWidth = false) {
    if (!value && value !== 0) return '';
    const widthClass = fullWidth ? ' full-width' : '';
    return `
        <div class="info-item${widthClass}">
            <label>${label}</label>
            <span>${value}</span>
        </div>
    `;
}

/**
 * Create a status badge
 * @param {boolean} isOnline - Online status
 * @returns {string} Badge HTML
 */
function createStatusBadge(isOnline) {
    const status = isOnline ? 'online' : 'offline';
    const text = isOnline ? 'Online' : 'Offline';
    return `<span class="status-badge ${status}">${text}</span>`;
}

/**
 * Create offline device message
 * @param {string} feature - Feature name that requires online device
 * @returns {string} Message HTML
 */
function createOfflineDeviceMessage(feature) {
    return `
        <div class="offline-message">
            <div class="offline-icon">📴</div>
            <h3>Device Offline</h3>
            <p>${feature} is not available when the device is offline.</p>
            <p class="offline-hint">The device must be online to fetch real-time data.</p>
        </div>
    `;
}

// ============================================================================
// Device Status Templates
// ============================================================================

/**
 * Create device status card
 * @param {Object} device - Device status object
 * @param {string} deviceId - Device ID
 * @param {number} channels - Number of channels
 * @returns {string} Card HTML
 */
function createDeviceStatusCard(device, deviceId, channels) {
    const d = device;
    return createCard('Device Status', `
        <div class="info-grid">
            ${createInfoItem('Device ID', deviceId)}
            ${createInfoItem('Plate Number', d.plateNumber || '-')}
            ${createInfoItem('Speed', `${d.speed || 0} km/h`)}
            ${createInfoItem('Mileage', `${(d.mileage / 10).toFixed(1)} km`)}
            ${createInfoItem('Network', d.network || '-')}
            ${createInfoItem('Satellites', d.satellites || 0)}
            ${createInfoItem('GPS Time', formatDateTime(d.gpsTime))}
            ${createInfoItem('Channels', channels ?? d.channels ?? 4)}
        </div>
    `, createStatusBadge(d.online));
}

/**
 * Create location card
 * @param {Object} device - Device status object
 * @returns {string} Card HTML
 */
function createLocationCard(device) {
    const d = device;
    const hasCoords = isValidCoordinate(d.lat, d.lng);
    const addressId = `deviceAddress_${Date.now()}`;
    
    // Queue geocoding if coordinates are valid
    if (hasCoords && typeof queueGeocode === 'function') {
        setTimeout(() => {
            queueGeocode(d.lat, d.lng, (result) => {
                const el = document.getElementById(addressId);
                if (el && result.success) {
                    el.innerHTML = `<span title="${escapeHtml(result.displayName || result.address)}">${escapeHtml(result.shortAddress)}</span>`;
                } else if (el) {
                    el.innerHTML = '-';
                }
            });
        }, 100);
    }
    
    return createCard('Location', `
        <div class="info-grid">
            ${createInfoItem('Coordinates', hasCoords ? `${d.lat.toFixed(6)}, ${d.lng.toFixed(6)}` : '-', true)}
            <div class="info-item full-width">
                <label>Address</label>
                <span id="${addressId}" style="font-size: 13px;">${hasCoords ? '<span style="color: var(--text-muted); font-style: italic;">Loading...</span>' : '-'}</span>
            </div>
            ${createInfoItem('Heading', `${d.heading || 0}° ${hasCoords ? getHeadingDirection(d.heading || 0) : ''}`)}
            ${createInfoItem('Altitude', `${d.altitude || 0} m`)}
        </div>
        ${hasCoords ? `
            <div style="margin-top: 16px;">
                <a href="https://maps.google.com?q=${d.lat},${d.lng}" target="_blank" class="btn btn-secondary">
                    View on Google Maps
                </a>
            </div>
        ` : ''}
    `);
}

/**
 * Create vehicle information card
 * @param {Object} vehicle - Vehicle data
 * @returns {string} Card HTML
 */
function createVehicleInfoCard(vehicle) {
    const v = vehicle || {};
    const items = [
        createInfoItem('Brand', v.vehicleBrand),
        createInfoItem('Model', v.vehicleModel),
        createInfoItem('Vehicle Type', v.vehicleType),
        createInfoItem('Color', v.vehicleColor),
        createInfoItem('Usage', v.vehicleUse),
        createInfoItem('Plate Type', v.plateType),
        createInfoItem('Car Type', v.carType),
        createInfoItem('Car Place', v.carPlace),
        createInfoItem('Industry', v.industry)
    ].filter(item => item).join('');
    
    if (!items) return '';
    
    return createCard('Vehicle Information', `<div class="info-grid">${items}</div>`);
}

/**
 * Create vehicle specifications card
 * @param {Object} vehicle - Vehicle data
 * @returns {string} Card HTML
 */
function createVehicleSpecsCard(vehicle) {
    const v = vehicle || {};
    const hasDimensions = v.lengthDimension || v.widthDimension || v.heightDimension;
    
    const items = [
        createInfoItem('Engine Number', v.engineNum),
        createInfoItem('Engine Model', v.engineModel),
        createInfoItem('Frame Number', v.frameNum),
        createInfoItem('Axles', v.axesNumber),
        createInfoItem('Total Weight', v.totalWeight),
        createInfoItem('Approved Seats', v.approvedNumber),
        createInfoItem('Approved Load', v.approvedLoad),
        v.speedLimit ? createInfoItem('Speed Limit', `${v.speedLimit} km/h`) : '',
        hasDimensions ? createInfoItem('Dimensions (L×W×H)', 
            `${v.lengthDimension || '-'} × ${v.widthDimension || '-'} × ${v.heightDimension || '-'}`, true) : ''
    ].filter(item => item).join('');
    
    if (!items) return '';
    
    return createCard('Vehicle Specifications', `<div class="info-grid">${items}</div>`);
}

/**
 * Create owner/contact card
 * @param {Object} vehicle - Vehicle data
 * @returns {string} Card HTML
 */
function createOwnerContactCard(vehicle) {
    const v = vehicle || {};
    const items = [
        createInfoItem('Owner Name', v.ownerName),
        createInfoItem('Contact Person', v.linkPeople),
        createInfoItem('Contact Phone', v.linkPhone)
    ].filter(item => item).join('');
    
    if (!items) return '';
    
    return createCard('Owner & Contact', `<div class="info-grid">${items}</div>`);
}

/**
 * Create important dates card
 * @param {Object} vehicle - Vehicle data
 * @returns {string} Card HTML
 */
function createDatesCard(vehicle) {
    const v = vehicle || {};
    const items = [
        isValidDate(v.productDate) ? createInfoItem('Production Date', formatDateValue(v.productDate)) : '',
        isValidDate(v.purchaseDate) ? createInfoItem('Purchase Date', formatDateValue(v.purchaseDate)) : '',
        isValidDate(v.annualSurveyDate) ? createInfoItem('Annual Survey', formatDateValue(v.annualSurveyDate)) : '',
        isValidDate(v.safeDate) ? createInfoItem('Safety Inspection', formatDateValue(v.safeDate)) : '',
        isValidDate(v.repairDate) ? createInfoItem('Repair Date', formatDateValue(v.repairDate)) : ''
    ].filter(item => item).join('');
    
    if (!items) return '';
    
    return createCard('Important Dates', `<div class="info-grid">${items}</div>`);
}

/**
 * Create driver information card
 * @param {Object} vehicle - Vehicle data
 * @returns {string} Card HTML
 */
function createDriverInfoCard(vehicle) {
    const v = vehicle || {};
    const items = [
        createInfoItem('Driving License', v.drivingNum),
        isValidDate(v.drivingDate) ? createInfoItem('License Date', formatDateValue(v.drivingDate)) : '',
        createInfoItem('Operating License', v.operatingNum),
        isValidDate(v.operatingDate) ? createInfoItem('Operating Date', formatDateValue(v.operatingDate)) : ''
    ].filter(item => item).join('');
    
    if (!items) return '';
    
    return createCard('Driver Information', `<div class="info-grid">${items}</div>`);
}

/**
 * Create AI safety equipment card
 * @param {Object} device - Device status
 * @returns {string} Card HTML
 */
function createSafetyEquipmentCard(device) {
    const d = device;
    return createCard('AI Safety Equipment', `
        <div class="info-grid">
            <div class="info-item">
                <label>ADAS (Forward Collision)</label>
                <span>${decodeAdasStatus(d.adas1, d.adas2)}</span>
            </div>
            <div class="info-item">
                <label>DSM (Driver Monitoring)</label>
                <span>${decodeDsmStatus(d.dsm1, d.dsm2)}</span>
            </div>
            <div class="info-item">
                <label>BSD (Blind Spot)</label>
                <span>${decodeBsdStatus(d.bsd1)}</span>
            </div>
        </div>
        <p style="margin-top: 12px; color: var(--text-muted); font-size: 12px;">
            Check the <strong>Safety</strong> tab for historical ADAS/DSM alarm events and videos.
        </p>
    `);
}

/**
 * Create remarks card
 * @param {string} remark - Remark text
 * @returns {string} Card HTML
 */
function createRemarksCard(remark) {
    if (!remark) return '';
    return createCard('Remarks', `<p>${remark}</p>`);
}

// ============================================================================
// Table Templates
// ============================================================================

/**
 * Create safety alarm table row
 * @param {Object} alarm - Alarm data
 * @param {number} index - Row index
 * @returns {string} Table row HTML
 */
function createSafetyAlarmRow(alarm, index) {
    const a = alarm;
    const videoId = `safetyVideo${index}`;
    const addressId = `alarmAddr${index}`;
    const hasVideoUrl = (a.videoUrl && a.videoUrl.trim() !== '') || (a.playerUrl && a.playerUrl.trim() !== '');
    const hasVideo = hasVideoUrl || (a.mediaType === 1);
    const hasPhoto = a.photoUrl && a.photoUrl.trim() !== '';
    const sourceUrl = a.playerUrl || a.videoUrl || '';
    const playerUrlForIframe = (hasVideoUrl && sourceUrl) ? buildPlayerUrl(sourceUrl) : '';
    
    const safeVideoUrl = hasVideoUrl ? escapeForAttribute(sourceUrl) : '';
    const safePlayerUrl = escapeForAttribute(playerUrlForIframe);
    const safePhotoUrl = hasPhoto ? escapeForAttribute(a.photoUrl) : '';
    
    // Format location with geocoding
    const locationHtml = formatLocationWithAddress(a.lat, a.lng, a.mapLat, a.mapLng, addressId);
    
    return `
        <tr style="border-bottom: 1px solid var(--border-light);">
            <td style="padding: 8px; font-size: 12px; color: #666;">${index + 1}</td>
            <td style="padding: 8px; font-size: 10px; font-family: monospace; color: #666; min-width: 280px; word-break: break-all;" title="${a.id || '-'}">${a.id || '-'}</td>
            <td style="padding: 8px; font-size: 12px;">${a.deviceId || '-'}</td>
            <td style="padding: 8px;">
                <span style="padding: 3px 6px; border-radius: 4px; font-size: 11px; background: #e3f2fd; color: #1565c0; white-space: nowrap;">
                    ${a.typeName || '-'}
                </span>
            </td>
            <td style="padding: 8px; font-size: 11px; color: #666;">${a.type || '-'}</td>
            <td style="padding: 8px; font-size: 12px; white-space: nowrap;">${a.timeISO ? formatDateTime(a.timeISO) : (a.time || '-')}</td>
            <td style="padding: 8px; font-size: 12px;">${a.channel !== undefined ? a.channel : '-'}</td>
            <td style="padding: 8px; font-size: 12px; min-width: 180px;">
                ${locationHtml}
            </td>
            <td style="padding: 8px; font-size: 11px;">${a.mediaType === 0 ? 'Photo' : a.mediaType === 1 ? 'Video' : '-'}</td>
            <td style="padding: 8px;">
                ${hasPhoto ? `<a href="${safePhotoUrl}" target="_blank" style="color: var(--accent); margin-right: 8px; text-decoration: none;">📷 Photo</a>` : ''}
                ${hasVideo && hasVideoUrl ? `<button class="btn-small" onclick="playVideo('${videoId}', '${safeVideoUrl}', '${safePlayerUrl}')" style="margin-right: 8px;">▶ Play Video</button>` : ''}
                ${hasVideo && !hasVideoUrl ? `<button class="btn-small" disabled title="Video URL not available" style="margin-right: 8px; opacity: 0.5;">▶ No Video</button>` : ''}
                ${!hasPhoto && !hasVideo ? '<span style="color: #999;">-</span>' : ''}
            </td>
        </tr>
        ${hasVideo && hasVideoUrl ? `
        <tr id="videoRow${index}" style="display: none;">
            <td colspan="10" style="padding: 8px;">
                <div id="${videoId}" style="margin-top: 8px;">
                    <iframe 
                        style="width: 100%; height: 400px; border: none; background: #000;"
                        allowfullscreen
                        allow="autoplay; fullscreen">
                    </iframe>
                </div>
            </td>
        </tr>
        ` : ''}
    `;
}

/**
 * Format location with coordinates and geocoded address
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} mapLat - Pre-converted map latitude
 * @param {number} mapLng - Pre-converted map longitude
 * @param {string} addressId - Element ID for address
 * @returns {string} HTML with location info
 */
function formatLocationWithAddress(lat, lng, mapLat, mapLng, addressId) {
    // Normalize coordinates
    if (lat && lat > 1000) lat = lat / 1000000;
    if (lng && lng > 1000) lng = lng / 1000000;
    
    const hasCoords = isValidCoordinate(lat, lng);
    const hasMapCoords = isValidCoordinate(mapLat, mapLng);
    
    if (!hasCoords && !hasMapCoords) {
        return '-';
    }
    
    const useLat = hasCoords ? lat : mapLat;
    const useLng = hasCoords ? lng : mapLng;
    const coordsStr = `${useLat.toFixed(6)}, ${useLng.toFixed(6)}`;
    const mapsLink = `https://maps.google.com?q=${useLat.toFixed(6)},${useLng.toFixed(6)}`;
    
    // Check for cached address
    const cachedAddress = typeof getCachedAddress === 'function' ? getCachedAddress(useLat, useLng) : null;
    
    // Queue geocoding if not cached
    if (!cachedAddress && typeof queueGeocode === 'function') {
        setTimeout(() => {
            queueGeocode(useLat, useLng, (result) => {
                const el = document.getElementById(addressId);
                if (el && result.success) {
                    el.innerHTML = result.shortAddress;
                    el.title = result.displayName || result.address;
                    el.style.color = 'var(--text-secondary)';
                } else if (el) {
                    el.style.display = 'none';
                }
            });
        }, 50 + Math.random() * 100); // Slight random delay to avoid bunching
    }
    
    return `
        <a href="${mapsLink}" target="_blank" style="color: var(--accent); text-decoration: none; font-size: 11px;">
            ${coordsStr}
        </a>
        <div id="${addressId}" style="font-size: 10px; color: var(--text-muted); margin-top: 2px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="">
            ${cachedAddress || '<span style="font-style: italic;">Loading...</span>'}
        </div>
    `;
}

/**
 * Create GPS track table row
 * @param {Object} track - Track point data
 * @param {number} index - Row index
 * @returns {string} Table row HTML
 */
function createGpsTrackRow(track, index) {
    const addressId = `gpsAddr${index}`;
    const hasPosition = track.position && track.position.trim() !== '';
    
    // If no position from API, try to get geocoded address
    let addressHtml = '';
    if (hasPosition) {
        addressHtml = `<span style="color: var(--text-muted);">${track.position}</span>`;
    } else {
        // Check cache first
        const cachedAddress = typeof getCachedAddress === 'function' ? getCachedAddress(track.lat, track.lng) : null;
        if (cachedAddress) {
            addressHtml = `<span id="${addressId}" style="color: var(--text-muted);">${cachedAddress}</span>`;
        } else {
            addressHtml = `<span id="${addressId}" style="color: var(--text-muted); font-style: italic;">-</span>`;
        }
    }
    
    return `
        <tr>
            <td style="white-space: nowrap;">${formatDateTime(track.gpsTime)}</td>
            <td style="font-size: 11px; min-width: 140px;">
                <a href="https://maps.google.com?q=${track.lat.toFixed(6)},${track.lng.toFixed(6)}" target="_blank" style="color: var(--accent); text-decoration: none;">
                    ${track.lat.toFixed(6)}, ${track.lng.toFixed(6)}
                </a>
                <br>${addressHtml}
            </td>
            <td>${track.speed.toFixed(1)} km/h</td>
            <td>${track.heading}° ${getHeadingDirection(track.heading)}</td>
            <td><span class="status-dot ${track.accOn ? 'on' : 'off'}"></span> ${track.accOn ? 'ON' : 'OFF'}</td>
            <td>${track.fuel > 0 ? track.fuel.toFixed(1) + ' L' : '-'}</td>
            <td>${(track.mileage / 1000).toFixed(1)} km</td>
            <td>${track.network || '-'}</td>
            <td>${track.satellites || '-'}</td>
            <td style="font-size: 11px;">${track.driverName || '-'}</td>
            <td>
                <a href="https://maps.google.com?q=${track.lat},${track.lng}" target="_blank" class="btn btn-small btn-secondary">Map</a>
            </td>
        </tr>
    `;
}

// ============================================================================
// Device Tree Templates
// ============================================================================

/**
 * Create device tree item
 * @param {Object} device - Device data
 * @returns {string} Device item HTML
 */
function createDeviceTreeItem(device) {
    const deviceId = device.deviceId || device.plateNumber || device.did || '';
    const plateNumber = device.plateNumber || device.nm || deviceId || 'Unknown';
    const channels = device.channels || device.chs || 4;
    const isOnline = device.online === true || device.online === 1 || device.online === '1' || device.ol === 1;
    const onlineClass = isOnline ? 'online' : 'offline';
    
    // Skip devices with no identifier
    if ((!deviceId || deviceId === 'null' || deviceId === 'undefined') && 
        (!plateNumber || plateNumber === 'null' || plateNumber === 'Unknown')) {
        return '';
    }
    
    const finalDeviceId = (deviceId && deviceId !== 'null' && deviceId !== 'undefined') ? deviceId : plateNumber;
    const finalPlateNumber = plateNumber || finalDeviceId;
    
    const safeDeviceId = escapeForOnclick(finalDeviceId);
    const safePlateNumber = escapeForOnclick(finalPlateNumber);
    
    let plateTypeValue = 'null';
    if (device.plateType !== undefined && device.plateType !== null) {
        if (typeof device.plateType === 'number') {
            plateTypeValue = String(device.plateType);
        } else {
            const escaped = escapeForOnclick(device.plateType);
            plateTypeValue = `'${escaped}'`;
        }
    }
    
    return `
        <div class="device-item ${onlineClass}" 
             data-device-id="${safeDeviceId}"
             data-online="${isOnline}"
             onclick="selectDevice('${safeDeviceId}', '${safePlateNumber}', ${channels}, ${plateTypeValue})">
            <span class="device-status ${onlineClass}" title="${isOnline ? 'Online' : 'Offline'}"></span>
            <span class="device-name">${finalPlateNumber}</span>
        </div>
    `;
}

/**
 * Create device group
 * @param {string} groupName - Group name
 * @param {Array} devices - Array of devices
 * @returns {string} Device group HTML
 */
function createDeviceGroup(groupName, devices) {
    const onlineCount = devices.filter(d => d.online).length;
    const deviceItems = devices.map(d => createDeviceTreeItem(d)).filter(item => item.trim()).join('');
    
    return `
        <div class="device-group">
            <div class="group-header expanded" onclick="toggleGroup(this)">
                <span class="group-icon">▶</span>
                <span class="group-name">${groupName}</span>
                <span class="group-count">${onlineCount}/${devices.length}</span>
            </div>
            <div class="group-devices">
                ${deviceItems}
            </div>
        </div>
    `;
}

// ============================================================================
// Filter Components
// ============================================================================

/**
 * Create date range filter
 * @param {string} startId - Start date input ID
 * @param {string} endId - End date input ID
 * @param {string} startValue - Start date value
 * @param {string} endValue - End date value
 * @param {string} buttonText - Button text
 * @param {string} buttonOnclick - Button onclick handler
 * @returns {string} Filter HTML
 */
function createDateRangeFilter(startId, endId, startValue, endValue, buttonText, buttonOnclick) {
    return `
        <div class="video-filters" style="margin-bottom: 16px;">
            <label>From:</label>
            <input type="date" id="${startId}" value="${startValue}">
            <label>To:</label>
            <input type="date" id="${endId}" value="${endValue}">
            <button class="btn btn-primary" onclick="${buttonOnclick}">${buttonText}</button>
        </div>
    `;
}

/**
 * Create channel selector
 * @param {string} selectId - Select element ID
 * @param {number} numChannels - Number of channels
 * @returns {string} Select HTML
 */
function createChannelSelector(selectId, numChannels) {
    const options = Array.from({length: numChannels}, (_, i) => 
        `<option value="${i}">Channel ${i + 1}</option>`
    ).join('');
    
    return `
        <select id="${selectId}">
            <option value="all">All Channels</option>
            ${options}
        </select>
    `;
}

// ============================================================================
// Loading/Empty States
// ============================================================================

/**
 * Create loading indicator
 * @param {string} message - Loading message
 * @returns {string} Loading HTML
 */
function createLoadingIndicator(message = 'Loading...') {
    return `<div class="loading-indicator">${message}</div>`;
}

/**
 * Create empty state
 * @param {string} message - Empty state message
 * @returns {string} Empty state HTML
 */
function createEmptyState(message) {
    return `<div class="empty-state">${message}</div>`;
}

/**
 * Create error state
 * @param {string} message - Error message
 * @returns {string} Error state HTML
 */
function createErrorState(message) {
    return `<div class="empty-state">Error: ${message}</div>`;
}

// ============================================================================
// Export for module usage (if needed)
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        createCard,
        createInfoItem,
        createStatusBadge,
        createDeviceStatusCard,
        createLocationCard,
        createVehicleInfoCard,
        createVehicleSpecsCard,
        createOwnerContactCard,
        createDatesCard,
        createDriverInfoCard,
        createSafetyEquipmentCard,
        createRemarksCard,
        createSafetyAlarmRow,
        createGpsTrackRow,
        createDeviceTreeItem,
        createDeviceGroup,
        createDateRangeFilter,
        createChannelSelector,
        createLoadingIndicator,
        createEmptyState,
        createErrorState
    };
}
