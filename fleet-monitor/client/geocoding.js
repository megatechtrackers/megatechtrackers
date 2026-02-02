/**
 * Fleet Monitor - Geocoding Service
 * Reverse geocoding using Photon API (Komoot) - faster, no strict rate limits
 * Includes caching and basic rate limiting
 */

// ============================================================================
// Configuration
// ============================================================================

const GEOCODE_CONFIG = {
    API_URL: 'https://photon.komoot.io/reverse',
    CACHE_KEY: 'fleet_geocode_cache',
    CACHE_MAX_SIZE: 500,
    CACHE_EXPIRY_DAYS: 7,
    REQUEST_DELAY_MS: 100, // Photon is faster, minimal delay to be polite
    PRECISION: 4, // Decimal places for cache key (reduces duplicate lookups)
};

// ============================================================================
// Geocoding Cache
// ============================================================================

let geocodeCache = {};
let geocodeQueue = [];
let isProcessingQueue = false;
let lastRequestTime = 0;

/**
 * Load geocode cache from localStorage
 */
function loadGeocodeCache() {
    try {
        const cached = localStorage.getItem(GEOCODE_CONFIG.CACHE_KEY);
        if (cached) {
            const data = JSON.parse(cached);
            const now = Date.now();
            const expiryMs = GEOCODE_CONFIG.CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
            
            // Filter out expired entries
            geocodeCache = {};
            for (const [key, entry] of Object.entries(data)) {
                if (entry.timestamp && (now - entry.timestamp) < expiryMs) {
                    geocodeCache[key] = entry;
                }
            }
            console.log(`[Geocode] Loaded ${Object.keys(geocodeCache).length} cached locations`);
        }
    } catch (e) {
        console.error('[Geocode] Error loading cache:', e);
        geocodeCache = {};
    }
}

/**
 * Save geocode cache to localStorage
 */
function saveGeocodeCache() {
    try {
        // Limit cache size
        const keys = Object.keys(geocodeCache);
        if (keys.length > GEOCODE_CONFIG.CACHE_MAX_SIZE) {
            // Remove oldest entries
            const sorted = keys.sort((a, b) => 
                (geocodeCache[a].timestamp || 0) - (geocodeCache[b].timestamp || 0)
            );
            const toRemove = sorted.slice(0, keys.length - GEOCODE_CONFIG.CACHE_MAX_SIZE);
            toRemove.forEach(key => delete geocodeCache[key]);
        }
        
        localStorage.setItem(GEOCODE_CONFIG.CACHE_KEY, JSON.stringify(geocodeCache));
    } catch (e) {
        console.error('[Geocode] Error saving cache:', e);
    }
}

/**
 * Generate cache key from coordinates
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {string} Cache key
 */
function getCacheKey(lat, lng) {
    const precision = GEOCODE_CONFIG.PRECISION;
    return `${lat.toFixed(precision)},${lng.toFixed(precision)}`;
}

// ============================================================================
// Geocoding API
// ============================================================================

/**
 * Reverse geocode coordinates to address
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<Object>} Location data with address
 */
async function reverseGeocode(lat, lng) {
    if (!isValidCoordinate(lat, lng)) {
        return { success: false, error: 'Invalid coordinates' };
    }
    
    const cacheKey = getCacheKey(lat, lng);
    
    // Check cache first
    if (geocodeCache[cacheKey]) {
        return { 
            success: true, 
            ...geocodeCache[cacheKey],
            fromCache: true 
        };
    }
    
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < GEOCODE_CONFIG.REQUEST_DELAY_MS) {
        await new Promise(resolve => 
            setTimeout(resolve, GEOCODE_CONFIG.REQUEST_DELAY_MS - timeSinceLastRequest)
        );
    }
    
    try {
        lastRequestTime = Date.now();
        
        const url = `${GEOCODE_CONFIG.API_URL}?lat=${lat}&lon=${lng}&lang=en`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        // Photon returns GeoJSON format with features array
        if (!data.features || data.features.length === 0) {
            return { success: false, error: 'No results found' };
        }
        
        const feature = data.features[0];
        const props = feature.properties || {};
        
        const result = {
            displayName: formatPhotonDisplayName(props),
            address: formatAddressFromPhoton(props),
            shortAddress: formatShortAddressPhoton(props),
            road: props.street || props.name || '',
            suburb: props.district || props.locality || '',
            city: props.city || props.town || props.village || props.municipality || '',
            state: props.state || '',
            country: props.country || '',
            postcode: props.postcode || '',
            timestamp: Date.now()
        };
        
        // Cache the result
        geocodeCache[cacheKey] = result;
        saveGeocodeCache();
        
        return { success: true, ...result, fromCache: false };
        
    } catch (e) {
        console.error('[Geocode] API error:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Format display name from Photon response
 * @param {Object} props - Properties object from Photon
 * @returns {string} Full display name
 */
function formatPhotonDisplayName(props) {
    const parts = [];
    
    if (props.housenumber && props.street) {
        parts.push(`${props.housenumber} ${props.street}`);
    } else if (props.street) {
        parts.push(props.street);
    } else if (props.name) {
        parts.push(props.name);
    }
    
    if (props.district) parts.push(props.district);
    if (props.city || props.town || props.village) {
        parts.push(props.city || props.town || props.village);
    }
    if (props.state) parts.push(props.state);
    if (props.country) parts.push(props.country);
    
    return parts.join(', ') || 'Unknown location';
}

/**
 * Format full address from Photon response
 * @param {Object} props - Properties object from Photon
 * @returns {string} Formatted address
 */
function formatAddressFromPhoton(props) {
    const parts = [];
    
    if (props.housenumber && props.street) {
        parts.push(`${props.housenumber} ${props.street}`);
    } else if (props.street) {
        parts.push(props.street);
    } else if (props.name) {
        parts.push(props.name);
    }
    
    if (props.district || props.locality) parts.push(props.district || props.locality);
    if (props.city || props.town || props.village) {
        parts.push(props.city || props.town || props.village);
    }
    if (props.state) parts.push(props.state);
    if (props.country) parts.push(props.country);
    
    return parts.join(', ') || 'Unknown location';
}

/**
 * Format short address from Photon (road + suburb/city)
 * @param {Object} props - Properties object from Photon
 * @returns {string} Short address
 */
function formatShortAddressPhoton(props) {
    const parts = [];
    
    if (props.housenumber && props.street) {
        parts.push(`${props.housenumber} ${props.street}`);
    } else if (props.street) {
        parts.push(props.street);
    } else if (props.name) {
        parts.push(props.name);
    }
    
    const area = props.district || props.locality || 
                 props.city || props.town || props.village || '';
    if (area && !parts.includes(area)) {
        parts.push(area);
    }
    
    return parts.join(', ') || 'Unknown';
}

// ============================================================================
// Batch Geocoding with Queue
// ============================================================================

/**
 * Add coordinates to geocoding queue
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {Function} callback - Callback with result
 */
function queueGeocode(lat, lng, callback) {
    if (!isValidCoordinate(lat, lng)) {
        callback({ success: false, error: 'Invalid coordinates' });
        return;
    }
    
    const cacheKey = getCacheKey(lat, lng);
    
    // Return cached immediately
    if (geocodeCache[cacheKey]) {
        callback({ success: true, ...geocodeCache[cacheKey], fromCache: true });
        return;
    }
    
    // Add to queue
    geocodeQueue.push({ lat, lng, callback, cacheKey });
    processGeocodeQueue();
}

/**
 * Process geocoding queue with rate limiting
 */
async function processGeocodeQueue() {
    if (isProcessingQueue || geocodeQueue.length === 0) return;
    
    isProcessingQueue = true;
    
    while (geocodeQueue.length > 0) {
        const item = geocodeQueue.shift();
        
        // Check cache again (might have been added while waiting)
        if (geocodeCache[item.cacheKey]) {
            item.callback({ success: true, ...geocodeCache[item.cacheKey], fromCache: true });
            continue;
        }
        
        const result = await reverseGeocode(item.lat, item.lng);
        item.callback(result);
    }
    
    isProcessingQueue = false;
}

// ============================================================================
// UI Helper Functions
// ============================================================================

/**
 * Get cached address for coordinates (synchronous, returns null if not cached)
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {string|null} Cached address or null
 */
function getCachedAddress(lat, lng) {
    if (!isValidCoordinate(lat, lng)) return null;
    
    const cacheKey = getCacheKey(lat, lng);
    const cached = geocodeCache[cacheKey];
    
    return cached ? cached.shortAddress : null;
}

/**
 * Format location with geocoded address (enhanced version)
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string} elementId - Element ID to update with address
 * @returns {string} HTML with coordinates and placeholder for address
 */
function formatLocationWithGeocode(lat, lng, elementId) {
    if (!isValidCoordinate(lat, lng)) return '-';
    
    const coords = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    const mapsLink = `https://maps.google.com?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
    const cachedAddress = getCachedAddress(lat, lng);
    
    // If we have cached address, show it immediately
    const addressHtml = cachedAddress 
        ? `<div class="geocode-address" style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(cachedAddress)}</div>`
        : `<div class="geocode-address" id="${elementId}" style="font-size: 11px; color: var(--text-muted); margin-top: 2px;"><span class="geocode-loading">Loading address...</span></div>`;
    
    // Queue geocoding if not cached
    if (!cachedAddress && elementId) {
        setTimeout(() => {
            queueGeocode(lat, lng, (result) => {
                const el = document.getElementById(elementId);
                if (el && result.success) {
                    el.innerHTML = escapeHtml(result.shortAddress);
                } else if (el) {
                    el.innerHTML = '<span style="color: var(--text-muted);">-</span>';
                }
            });
        }, 100);
    }
    
    return `
        <a href="${mapsLink}" target="_blank" style="color: var(--accent); text-decoration: none;">
            ${coords}
        </a>
        ${addressHtml}
    `;
}

/**
 * Geocode a location and update an element
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string} elementId - Element ID to update
 */
function geocodeAndUpdate(lat, lng, elementId) {
    if (!isValidCoordinate(lat, lng)) return;
    
    const el = document.getElementById(elementId);
    if (!el) return;
    
    queueGeocode(lat, lng, (result) => {
        if (result.success) {
            el.innerHTML = escapeHtml(result.shortAddress);
            el.title = result.displayName || result.address;
        } else {
            el.innerHTML = '-';
        }
    });
}

/**
 * Simple HTML escape
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================================================
// Initialization
// ============================================================================

// Load cache on script load
loadGeocodeCache();

// ============================================================================
// CSS for geocoding elements
// ============================================================================

(function() {
    const style = document.createElement('style');
    style.textContent = `
        .geocode-loading {
            color: var(--text-muted);
            font-style: italic;
        }
        .geocode-address {
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .geocode-address:hover {
            white-space: normal;
            word-break: break-word;
        }
    `;
    document.head.appendChild(style);
})();
