/**
 * Fleet Monitor - Live Stream Player
 * Handles live video streaming for device channels
 */

// ============================================================================
// Live Stream State
// ============================================================================

const liveStreamPlayers = {};

// ============================================================================
// Live Stream Management
// ============================================================================

/**
 * Open live stream for a channel
 * @param {number} channel - Channel number
 */
async function openLiveStream(channel) {
    if (!selectedDevice) return;
    
    const frameElement = document.getElementById(`liveFrame${channel}`);
    const streamBtn = document.getElementById(`streamBtn${channel}`);
    const stopBtn = document.getElementById(`stopBtn${channel}`);
    
    if (!frameElement) return;
    
    // Clean up existing player
    cleanupLiveStreamPlayer(channel);
    
    // Show loading state
    frameElement.innerHTML = createLiveStreamLoadingHtml(channel);
    
    try {
        const data = await fetchStreamUrl(selectedDevice.deviceId, channel, 1);
        
        if (data.success) {
            console.log('[LiveStream] Got stream URLs:', { flv: data.flvUrl, hls: data.hlsUrl, player: data.streamUrl });
            
            if (streamBtn) streamBtn.style.display = 'none';
            if (stopBtn) stopBtn.style.display = 'inline-block';
            
            if (data.flvUrl) {
                tryLiveFlvPlayback(channel, data.flvUrl, data.hlsUrl);
            } else if (data.hlsUrl) {
                tryLiveHlsPlayback(channel, data.hlsUrl, null);
            } else {
                showLiveStreamError(channel, 'No stream URL available');
            }
        } else {
            showLiveStreamError(channel, 'Failed to get stream URL');
        }
    } catch (error) {
        showLiveStreamError(channel, `Error: ${error.message}`);
    }
}

/**
 * Create loading HTML for live stream
 * @param {number} channel - Channel number
 * @returns {string} Loading HTML
 */
function createLiveStreamLoadingHtml(channel) {
    return `
        <div style="position: relative; width: 100%; height: 100%; background: #1a1a2e;">
            <video id="liveVideo${channel}" style="width: 100%; height: 100%; object-fit: contain; background: #000;" autoplay muted playsinline></video>
            <div id="liveLoading${channel}" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #999; display: flex; flex-direction: column; align-items: center; gap: 10px;">
                <div class="spinner" style="width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #4285f4; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <span>Connecting to stream...</span>
            </div>
            <div id="liveError${channel}" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #ea4335; text-align: center; display: none; padding: 20px;">
                <div style="font-size: 24px; margin-bottom: 10px;">&#9888;</div>
                <div id="liveErrorMsg${channel}">Stream unavailable</div>
            </div>
        </div>
    `;
}

// ============================================================================
// HLS Live Playback
// ============================================================================

/**
 * Try HLS playback for live stream
 * @param {number} channel - Channel number
 * @param {string} hlsUrl - HLS URL
 * @param {string} fallbackFlvUrl - Fallback FLV URL
 */
function tryLiveHlsPlayback(channel, hlsUrl, fallbackFlvUrl) {
    const videoElement = document.getElementById(`liveVideo${channel}`);
    const loadingElement = document.getElementById(`liveLoading${channel}`);
    
    if (!videoElement) return;
    
    console.log('[LiveStream] Trying HLS playback:', hlsUrl);
    
    const proxyUrl = getVideoProxyUrl(hlsUrl);
    
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
        const hls = new Hls({
            enableWorker: false,
            lowLatencyMode: true,
            backBufferLength: 30
        });
        
        liveStreamPlayers[channel] = { type: 'hls', player: hls };
        
        hls.loadSource(proxyUrl);
        hls.attachMedia(videoElement);
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            console.log('[LiveStream] HLS manifest parsed');
            if (loadingElement) loadingElement.style.display = 'none';
            videoElement.play().catch(e => console.log('[LiveStream] HLS autoplay blocked:', e.name));
        });
        
        hls.on(Hls.Events.ERROR, (event, data) => {
            console.error('[LiveStream] HLS error:', data);
            if (data.fatal) {
                cleanupLiveStreamPlayer(channel);
                if (fallbackFlvUrl) {
                    tryLiveFlvPlayback(channel, fallbackFlvUrl);
                } else {
                    showLiveStreamError(channel, 'HLS stream failed');
                }
            }
        });
        
        setTimeout(() => {
            if (loadingElement && loadingElement.style.display !== 'none' && videoElement.readyState < 2) {
                cleanupLiveStreamPlayer(channel);
                if (fallbackFlvUrl) {
                    tryLiveFlvPlayback(channel, fallbackFlvUrl);
                } else {
                    showLiveStreamError(channel, 'Stream connection timeout');
                }
            }
        }, HLS_TIMEOUT);
        
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        videoElement.src = proxyUrl;
        videoElement.addEventListener('loadedmetadata', () => {
            if (loadingElement) loadingElement.style.display = 'none';
            videoElement.play().catch(e => console.log('[LiveStream] Native HLS autoplay blocked:', e.name));
        });
        videoElement.addEventListener('error', () => {
            if (fallbackFlvUrl) {
                tryLiveFlvPlayback(channel, fallbackFlvUrl);
            } else {
                showLiveStreamError(channel, 'Native HLS failed');
            }
        });
    } else if (fallbackFlvUrl) {
        tryLiveFlvPlayback(channel, fallbackFlvUrl);
    } else {
        showLiveStreamError(channel, 'HLS not supported');
    }
}

// ============================================================================
// FLV Live Playback
// ============================================================================

/**
 * Try FLV playback for live stream
 * @param {number} channel - Channel number
 * @param {string} flvUrl - FLV URL
 * @param {string} fallbackHlsUrl - Fallback HLS URL
 */
function tryLiveFlvPlayback(channel, flvUrl, fallbackHlsUrl = null) {
    const videoElement = document.getElementById(`liveVideo${channel}`);
    const loadingElement = document.getElementById(`liveLoading${channel}`);
    
    if (!videoElement) return;
    
    console.log('[LiveStream] Trying FLV playback:', flvUrl);
    
    if (typeof mpegts === 'undefined' || !mpegts.isSupported()) {
        if (fallbackHlsUrl) {
            tryLiveHlsPlayback(channel, fallbackHlsUrl, null);
        } else {
            showLiveStreamError(channel, 'Browser does not support MSE playback');
        }
        return;
    }
    
    const proxyUrl = getVideoProxyUrl(flvUrl);
    
    try {
        const player = mpegts.createPlayer({
            type: 'flv',
            url: proxyUrl,
            isLive: true,
            hasAudio: true,
            hasVideo: true
        }, {
            enableWorker: false,
            enableStashBuffer: true,
            stashInitialSize: 128 * 1024,
            autoCleanupSourceBuffer: true,
            liveBufferLatencyChasing: true,
            liveBufferLatencyMaxLatency: 3.0,
            liveBufferLatencyMinRemain: 0.5
        });
        
        liveStreamPlayers[channel] = { type: 'mpegts', player: player, fallbackUrl: fallbackHlsUrl };
        
        player.attachMediaElement(videoElement);
        player.load();
        
        let dataReceived = false;
        
        player.on(mpegts.Events.MEDIA_INFO, () => {
            dataReceived = true;
            if (loadingElement) loadingElement.style.display = 'none';
            videoElement.play().catch(e => console.log('[LiveStream] FLV autoplay blocked:', e.name));
        });
        
        player.on(mpegts.Events.STATISTICS_INFO, () => {
            dataReceived = true;
        });
        
        player.on(mpegts.Events.ERROR, (errorType, errorDetail) => {
            console.error('[LiveStream] mpegts.js error:', errorType, errorDetail);
            if (!dataReceived) {
                cleanupLiveStreamPlayer(channel);
                if (fallbackHlsUrl) {
                    tryLiveHlsPlayback(channel, fallbackHlsUrl, null);
                } else {
                    showLiveStreamError(channel, `Stream error: ${errorDetail}`);
                }
            }
        });
        
        setTimeout(() => {
            if (videoElement && videoElement.paused) {
                videoElement.play().catch(e => {
                    if (loadingElement) loadingElement.style.display = 'none';
                });
            }
        }, 2000);
        
        setTimeout(() => {
            if (!dataReceived && loadingElement && loadingElement.style.display !== 'none') {
                cleanupLiveStreamPlayer(channel);
                if (fallbackHlsUrl) {
                    tryLiveHlsPlayback(channel, fallbackHlsUrl, null);
                } else {
                    showLiveStreamError(channel, 'Stream connection timeout');
                }
            } else if (loadingElement && loadingElement.style.display !== 'none') {
                loadingElement.style.display = 'none';
            }
        }, STREAM_TIMEOUT);
        
    } catch (e) {
        console.error('[LiveStream] mpegts.js creation error:', e);
        if (fallbackHlsUrl) {
            tryLiveHlsPlayback(channel, fallbackHlsUrl, null);
        } else {
            showLiveStreamError(channel, `Player error: ${e.message}`);
        }
    }
}

// ============================================================================
// Error Handling and Cleanup
// ============================================================================

/**
 * Show error for live stream
 * @param {number} channel - Channel number
 * @param {string} message - Error message
 */
function showLiveStreamError(channel, message) {
    const loadingElement = document.getElementById(`liveLoading${channel}`);
    const errorElement = document.getElementById(`liveError${channel}`);
    const errorMsgElement = document.getElementById(`liveErrorMsg${channel}`);
    
    if (loadingElement) loadingElement.style.display = 'none';
    if (errorElement) errorElement.style.display = 'block';
    if (errorMsgElement) errorMsgElement.textContent = message;
    
    console.error('[LiveStream] Error:', message);
}

/**
 * Cleanup live stream player for a channel
 * @param {number} channel - Channel number
 */
function cleanupLiveStreamPlayer(channel) {
    const playerInfo = liveStreamPlayers[channel];
    if (playerInfo) {
        try {
            if (playerInfo.type === 'hls' && playerInfo.player) {
                playerInfo.player.destroy();
            } else if (playerInfo.type === 'mpegts' && playerInfo.player) {
                playerInfo.player.pause();
                playerInfo.player.unload();
                playerInfo.player.detachMediaElement();
                playerInfo.player.destroy();
            }
        } catch (e) {
            console.error('[LiveStream] Cleanup error:', e);
        }
        delete liveStreamPlayers[channel];
    }
    
    const videoElement = document.getElementById(`liveVideo${channel}`);
    if (videoElement) {
        videoElement.pause();
        videoElement.src = '';
        videoElement.load();
    }
}

/**
 * Stop live stream
 * @param {number} channel - Channel number
 */
function stopLiveStream(channel) {
    cleanupLiveStreamPlayer(channel);
    
    const frameElement = document.getElementById(`liveFrame${channel}`);
    const streamBtn = document.getElementById(`streamBtn${channel}`);
    const stopBtn = document.getElementById(`stopBtn${channel}`);
    
    if (frameElement) {
        frameElement.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #666;">Click "Open Stream" to start</div>';
    }
    
    if (streamBtn) streamBtn.style.display = 'inline-block';
    if (stopBtn) stopBtn.style.display = 'none';
}
