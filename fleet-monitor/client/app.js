/**
 * Fleet Monitor - Main Application
 * Professional MDVR monitoring dashboard
 * 
 * Dependencies (load in order):
 * 1. constants.js - Configuration values
 * 2. utils.js - Helper functions
 * 3. templates.js - HTML templates
 * 4. api.js - API client
 * 5. devices.js - Device management
 * 6. tabs.js - Tab management
 * 7. liveStream.js - Live streaming
 * 8. videoPlayer.js - Video playback
 * 9. app.js - Main application (this file)
 */

// ============================================================================
// DOM References
// ============================================================================

const content = document.getElementById('content');

// ============================================================================
// Application Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

/**
 * Initialize the application
 */
async function initializeApp() {
    console.log('[App] Initializing Fleet Monitor...');
    
    // Wait for CMS config to load from server (required)
    try {
        await getCmsConfig();
        console.log('[App] CMS config loaded successfully');
    } catch (e) {
        console.error('[App] Failed to load CMS config:', e);
        // Show error to user but continue - some features may not work
        updateConnectionStatus(false);
    }
    
    initializeOfflineFilter();
    initializeWorkingTimezone();
    loadDevices();
    updateConnectionStatus(true);
    startDevicePolling();
    restoreSelectedDevice();
    setupKeyboardHandlers();
    
    console.log('[App] Initialization complete');
}

/**
 * Initialize working timezone selector (for viewing device times in US/Pakistan etc.)
 */
function initializeWorkingTimezone() {
    const sel = document.getElementById('working-timezone');
    if (!sel) return;
    sel.value = getWorkingTimezone();
    sel.addEventListener('change', () => {
        setWorkingTimezone(sel.value);
        if (typeof loadTabContent === 'function') {
            const tab = getStorageValue(STORAGE_KEYS.SELECTED_TAB, TABS.OVERVIEW);
            loadTabContent(tab);
        }
    });
}

/**
 * Restore previously selected device from localStorage
 */
function restoreSelectedDevice() {
    const savedDeviceId = getStorageValue(STORAGE_KEYS.SELECTED_DEVICE_ID);
    if (savedDeviceId) {
        setTimeout(() => {
            const deviceEl = document.querySelector(`[data-device-id="${savedDeviceId}"]`);
            if (deviceEl) {
                deviceEl.click();
            }
        }, 1000);
    }
}

/**
 * Setup keyboard event handlers
 */
function setupKeyboardHandlers() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Close video modal
            const modal = document.getElementById('videoModal');
            if (modal && modal.style.display !== 'none') {
                closeVideoModal();
                return;
            }
            // Close mobile menu
            const sidebar = document.querySelector('.sidebar');
            if (sidebar && sidebar.classList.contains('open')) {
                toggleMobileMenu();
            }
        }
    });
}

// ============================================================================
// Mobile Menu
// ============================================================================

/**
 * Toggle mobile sidebar menu
 */
function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const menuIcon = document.getElementById('menuIcon');
    
    if (sidebar) {
        sidebar.classList.toggle('open');
        
        if (overlay) {
            overlay.classList.toggle('visible', sidebar.classList.contains('open'));
        }
        
        if (menuIcon) {
            menuIcon.textContent = sidebar.classList.contains('open') ? '✕' : '☰';
        }
        
        // Prevent body scroll when menu is open
        document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
    }
}

/**
 * Close mobile menu when a device is selected (for better UX)
 */
function closeMobileMenuIfOpen() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && sidebar.classList.contains('open') && window.innerWidth <= 768) {
        toggleMobileMenu();
    }
}

// ============================================================================
// Dashboard Rendering
// ============================================================================

/**
 * Render device dashboard
 */
function renderDeviceDashboard() {
    if (!selectedDevice) return;
    
    const savedTab = getStorageValue(STORAGE_KEYS.SELECTED_TAB, TABS.OVERVIEW);
    
    content.innerHTML = `
        <div class="tabs">
            <button class="tab ${savedTab === TABS.OVERVIEW ? 'active' : ''}" onclick="showTab('${TABS.OVERVIEW}')">Overview</button>
            <button class="tab ${savedTab === TABS.MAP ? 'active' : ''}" onclick="showTab('${TABS.MAP}')">Map</button>
            <button class="tab ${savedTab === TABS.SAFETY ? 'active' : ''}" onclick="showTab('${TABS.SAFETY}')">Safety</button>
            <button class="tab ${savedTab === TABS.VIDEOS ? 'active' : ''}" onclick="showTab('${TABS.VIDEOS}')">Videos</button>
            <button class="tab ${savedTab === TABS.GPS ? 'active' : ''}" onclick="showTab('${TABS.GPS}')">GPS Log</button>
            <button class="tab ${savedTab === TABS.LIVE ? 'active' : ''}" onclick="showTab('${TABS.LIVE}')">Live Stream</button>
        </div>
        <div id="tabContent">
            ${createLoadingIndicator()}
        </div>
    `;
    
    loadTabContent(savedTab);
}
