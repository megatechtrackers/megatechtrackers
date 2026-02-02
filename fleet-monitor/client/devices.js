/**
 * Fleet Monitor - Device Management
 * Handles device loading, tree rendering, selection, and polling
 */

// ============================================================================
// Application State (shared with app.js)
// ============================================================================

let selectedDevice = null;
let deviceStatus = null;
let allDevicesData = {};
let allDevicesList = []; // Store full device list for filtering
let devicePollInterval = null;

/**
 * Check if the currently selected device is online
 * @returns {boolean} True if device is online
 */
function isSelectedDeviceOnline() {
    if (!selectedDevice) return false;
    
    // Check from selectedDevice first
    if (selectedDevice.online === true || selectedDevice.online === 1 || selectedDevice.online === '1') {
        return true;
    }
    
    // Fallback to deviceStatus if available
    if (deviceStatus && (deviceStatus.online === true || deviceStatus.online === 1 || deviceStatus.online === '1')) {
        return true;
    }
    
    // Check cached device data
    const deviceId = selectedDevice.deviceId;
    if (deviceId && allDevicesData[deviceId]) {
        const cached = allDevicesData[deviceId];
        return cached.online === true || cached.online === 1 || cached.online === '1';
    }
    
    return false;
}

// ============================================================================
// Device Polling
// ============================================================================

/**
 * Start polling for device status updates
 */
function startDevicePolling() {
    if (devicePollInterval) {
        clearInterval(devicePollInterval);
    }
    
    devicePollInterval = setInterval(() => {
        console.log('[Polling] Refreshing device status...');
        loadDevices(true);
    }, DEVICE_POLL_INTERVAL);
}

/**
 * Stop device polling
 */
function stopDevicePolling() {
    if (devicePollInterval) {
        clearInterval(devicePollInterval);
        devicePollInterval = null;
    }
}

// ============================================================================
// Connection Status
// ============================================================================

/**
 * Update connection status indicator
 * @param {boolean} connected - Connection status
 */
function updateConnectionStatus(connected) {
    const status = document.getElementById('connectionStatus');
    if (status) {
        status.innerHTML = connected 
            ? '<span class="dot online"></span><span class="text">Connected</span>'
            : '<span class="dot offline"></span><span class="text">Disconnected</span>';
    }
}

// ============================================================================
// Device Loading
// ============================================================================

/**
 * Load all devices
 * @param {boolean} silent - Whether to show loading indicator
 */
async function loadDevices(silent = false) {
    const deviceTree = document.getElementById('deviceTree');
    
    if (!silent) {
        deviceTree.innerHTML = createLoadingIndicator('Loading devices...');
    }
    
    try {
        const data = await fetchDevices();
        
        if (data.success && data.devices) {
            const currentSelectedId = selectedDevice?.deviceId;
            
            renderDeviceTree(data.devices);
            updateConnectionStatus(true);
            
            // Restore selection after refresh
            if (currentSelectedId) {
                restoreDeviceSelection(currentSelectedId, data.devices, silent);
            }
        } else if (!silent) {
            deviceTree.innerHTML = createEmptyState('No devices found');
        }
    } catch (error) {
        console.error('Error loading devices:', error);
        if (!silent) {
            deviceTree.innerHTML = createErrorState(error.message);
        }
        updateConnectionStatus(false);
    }
}

/**
 * Restore device selection after refresh
 * @param {string} deviceId - Device ID to restore
 * @param {Array} devices - Updated devices array
 * @param {boolean} silent - Whether this is a silent refresh
 */
function restoreDeviceSelection(deviceId, devices, silent) {
    const deviceEl = document.querySelector(`[data-device-id="${deviceId}"]`);
    if (deviceEl) {
        deviceEl.classList.add('selected');
    }
    
    // Update selectedDevice with latest data
    const updatedDevice = devices.find(d => {
        const did = d.deviceId || d.plateNumber || d.did || '';
        return did === deviceId;
    });
    
    if (updatedDevice && selectedDevice) {
        selectedDevice.online = updatedDevice.online;
        selectedDevice.channels = updatedDevice.channels ?? selectedDevice.channels;
        if (updatedDevice.plateType !== undefined) {
            selectedDevice.plateType = updatedDevice.plateType;
        }
    }
    
    // Refresh device status during polling
    if (silent && selectedDevice) {
        loadDeviceStatus(true);
    }
}

// ============================================================================
// Device Tree Rendering
// ============================================================================

/**
 * Check if offline devices should be hidden
 * @returns {boolean} True if offline devices should be hidden
 */
function shouldHideOfflineDevices() {
    const stored = getStorageValue(STORAGE_KEYS.HIDE_OFFLINE_DEVICES);
    // Default to true (hide offline) if not set
    return stored === null ? true : stored === 'true';
}

/**
 * Toggle offline device filter
 */
function toggleOfflineFilter() {
    const checkbox = document.getElementById('hideOfflineDevices');
    const hideOffline = checkbox ? checkbox.checked : true;
    
    setStorageValue(STORAGE_KEYS.HIDE_OFFLINE_DEVICES, String(hideOffline));
    
    // Re-render device tree with current data
    if (allDevicesList && allDevicesList.length > 0) {
        renderDeviceTree(allDevicesList);
    }
}

/**
 * Initialize offline filter checkbox state
 */
function initializeOfflineFilter() {
    const checkbox = document.getElementById('hideOfflineDevices');
    if (checkbox) {
        checkbox.checked = shouldHideOfflineDevices();
    }
}

/**
 * Update device count display
 * @param {number} total - Total devices
 * @param {number} online - Online devices
 * @param {number} shown - Shown devices (after filtering)
 */
function updateDeviceCount(total, online, shown) {
    const countEl = document.getElementById('deviceCount');
    if (countEl) {
        const hideOffline = shouldHideOfflineDevices();
        if (hideOffline) {
            countEl.innerHTML = `<span style="color: var(--success);">${online}</span> online`;
        } else {
            countEl.innerHTML = `<span style="color: var(--success);">${online}</span>/<span>${total}</span>`;
        }
    }
}

/**
 * Render device tree
 * @param {Array} devices - Array of devices
 */
function renderDeviceTree(devices) {
    const deviceTree = document.getElementById('deviceTree');
    
    if (!devices || !Array.isArray(devices) || devices.length === 0) {
        deviceTree.innerHTML = createEmptyState('No devices found');
        updateDeviceCount(0, 0, 0);
        return;
    }
    
    // Store full list for re-filtering
    allDevicesList = devices;
    
    console.log('[Device Tree] Rendering', devices.length, 'devices');
    
    // Cache device data
    devices.forEach(device => {
        const deviceId = device.deviceId || device.plateNumber || device.did || '';
        if (deviceId) {
            allDevicesData[deviceId] = device;
        }
    });
    
    // Filter devices based on offline filter
    const hideOffline = shouldHideOfflineDevices();
    const filteredDevices = hideOffline 
        ? devices.filter(d => d.online === true || d.online === 1 || d.online === '1')
        : devices;
    
    // Count stats
    const onlineCount = devices.filter(d => d.online === true || d.online === 1 || d.online === '1').length;
    updateDeviceCount(devices.length, onlineCount, filteredDevices.length);
    
    if (filteredDevices.length === 0) {
        deviceTree.innerHTML = createEmptyState(hideOffline 
            ? 'No online devices found<br><small style="font-size: 11px;">Uncheck "Hide offline devices" to see all</small>' 
            : 'No devices found');
        return;
    }
    
    // Group devices by group name
    const groups = {};
    filteredDevices.forEach(device => {
        const groupName = device.group || 'Ungrouped';
        if (!groups[groupName]) {
            groups[groupName] = [];
        }
        groups[groupName].push(device);
    });
    
    // Render groups
    let html = '';
    for (const [groupName, groupDevices] of Object.entries(groups)) {
        html += createDeviceGroup(groupName, groupDevices);
    }
    
    deviceTree.innerHTML = html || createEmptyState('No devices found');
    console.log('[Device Tree] Rendered', Object.keys(groups).length, 'groups,', filteredDevices.length, 'devices');
}

/**
 * Toggle device group expansion
 * @param {HTMLElement} header - Group header element
 */
function toggleGroup(header) {
    header.classList.toggle('expanded');
    const devices = header.nextElementSibling;
    devices.style.display = devices.style.display === 'none' ? 'block' : 'none';
}

// Device search filter
document.getElementById('deviceSearch')?.addEventListener('input', (e) => {
    const search = e.target.value.toLowerCase();
    document.querySelectorAll('.device-item').forEach(item => {
        const name = item.querySelector('.device-name').textContent.toLowerCase();
        item.style.display = name.includes(search) ? 'flex' : 'none';
    });
});

// ============================================================================
// Device Selection
// ============================================================================

/**
 * Select a device
 * @param {string} deviceId - Device ID
 * @param {string} plateNumber - Plate number
 * @param {number} channels - Number of channels
 * @param {*} plateType - Plate type
 */
function selectDevice(deviceId, plateNumber, channels, plateType = null) {
    // Remove previous selection
    document.querySelectorAll('.device-item').forEach(el => el.classList.remove('selected'));
    
    const deviceEl = document.querySelector(`[data-device-id="${deviceId}"]`);
    const cachedDevice = allDevicesData[deviceId] || {};
    
    if (deviceEl) {
        deviceEl.classList.add('selected');
        const isOnline = deviceEl.getAttribute('data-online') === 'true';
        selectedDevice = { 
            ...cachedDevice,
            deviceId, 
            plateNumber, 
            channels, 
            online: isOnline, 
            plateType 
        };
    } else {
        selectedDevice = { ...cachedDevice, deviceId, plateNumber, channels, plateType };
    }
    
    deviceStatus = null;
    setStorageValue(STORAGE_KEYS.SELECTED_DEVICE_ID, deviceId);
    
    // Update breadcrumb
    document.getElementById('breadcrumb').innerHTML = `
        <span>Devices</span> / <span>${plateNumber || deviceId}</span>
    `;
    
    // Close mobile menu when device is selected (better UX on mobile)
    if (typeof closeMobileMenuIfOpen === 'function') {
        closeMobileMenuIfOpen();
    }
    
    renderDeviceDashboard();
    loadDeviceStatus();
    
    // Notify map of device change
    if (typeof onMapDeviceChanged === 'function') {
        onMapDeviceChanged();
    }
}

// ============================================================================
// Device Status
// ============================================================================

/**
 * Load device status from API
 * @param {boolean} silent - Whether to show loading indicator
 */
async function loadDeviceStatus(silent = false) {
    if (!selectedDevice) return;
    
    const deviceId = selectedDevice.deviceId;
    const plateNumber = selectedDevice.plateNumber;
    
    if (!deviceId || deviceId === 'null' || deviceId === 'undefined') {
        console.error('[Device] Invalid device ID');
        return;
    }
    
    const tabContent = document.getElementById('tabContent');
    const currentTab = getStorageValue(STORAGE_KEYS.SELECTED_TAB, TABS.OVERVIEW);
    
    if (!silent && tabContent && currentTab === TABS.OVERVIEW) {
        tabContent.innerHTML = createLoadingIndicator('Loading device data...');
    }
    
    try {
        const data = await fetchDeviceStatus(deviceId, plateNumber, selectedDevice.plateType);
        
        if (data.success && data.device) {
            deviceStatus = data.device;
            
            const activeTab = getStorageValue(STORAGE_KEYS.SELECTED_TAB, TABS.OVERVIEW);
            if (tabContent && activeTab === TABS.OVERVIEW) {
                tabContent.innerHTML = renderOverviewTab();
            }
            
            // Update map if it's active
            if (activeTab === TABS.MAP && typeof updateMapDevices === 'function') {
                updateMapDevices();
            }
        } else if (!silent) {
            throw new Error(data.error || 'Failed to load device status');
        }
    } catch (error) {
        console.error('Error loading device status:', error);
        const activeTab = getStorageValue(STORAGE_KEYS.SELECTED_TAB, TABS.OVERVIEW);
        if (!silent && tabContent && activeTab === TABS.OVERVIEW) {
            tabContent.innerHTML = createErrorState(error.message);
        }
    }
}
