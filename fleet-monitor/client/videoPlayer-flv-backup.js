/**
 * Fleet Monitor - FLV Playback Backup Code
 * 
 * BACKUP: This file contains the FLV (DownType=5) playback code for safety alarm videos.
 * Archived on: 2026-01-27
 * Reason: Simplified to use DownType=3 (MP4) only, which works more reliably across servers.
 * 
 * This code uses mpegts.js library for FLV/MPEG-TS playback via MSE.
 * Keep this for reference in case FLV playback is needed in the future.
 * 
 * Note: Live stream FLV playback is still active in the main videoPlayer.js
 */

// ============================================================================
// FLV Playback for Safety Alarm Videos (ARCHIVED)
// ============================================================================

/**
 * Try FLV playback for modal video using mpegts.js
 * This was the primary playback method before switching to DownType=3
 * 
 * @param {string} url - Video URL (DownType=5 format)
 * @param {number} playbackId - Current playback attempt ID
 */
function tryFlvPlayback_BACKUP(url, playbackId) {
    const videoPlayer = document.getElementById('videoPlayer');
    const videoLoading = document.getElementById('videoLoading');
    
    let mpegtsDataReceived = false;
    
    if (typeof mpegts === 'undefined' || !mpegts.isSupported()) {
        console.log('[FLV] mpegts.js not available, falling back to native');
        tryNativePlayback(url, playbackId);
        return;
    }
    
    const proxyUrl = getVideoProxyUrl(url);
    videoPlayer.style.display = 'block';
    
    try {
        const player = mpegts.createPlayer({
            type: 'mse',
            url: proxyUrl,
            isLive: false,
            hasAudio: true,
            hasVideo: true
        }, {
            enableWorker: false,
            enableStashBuffer: true,
            stashInitialSize: 384 * 1024,
            autoCleanupSourceBuffer: true,
            autoCleanupMaxBackwardDuration: 60,
            autoCleanupMinBackwardDuration: 30
        });
        
        player.attachMediaElement(videoPlayer);
        player.load();
        
        // Error handling - fallback on format issues
        player.on(mpegts.Events.ERROR, (errorType, errorDetail, errorInfo) => {
            console.error('[FLV] mpegts error:', errorType, errorDetail);
            // FormatUnsupported means the data is not FLV/MPEG-TS - must fallback
            if (errorDetail === 'FormatUnsupported' || !mpegtsDataReceived) {
                console.log('[FLV] Falling back to native playback...');
                cleanupMpegtsPlayer(player);
                tryNativePlayback(url, playbackId);
            }
        });
        
        player.on(mpegts.Events.LOADING_COMPLETE, () => {
            mpegtsDataReceived = true;
        });
        
        player.on(mpegts.Events.MEDIA_INFO, () => {
            mpegtsDataReceived = true;
            if (videoLoading) videoLoading.style.display = 'none';
            if (videoPlayer && videoPlayer.paused) {
                videoPlayer.play().catch(() => {});
            }
        });
        
        player.on(mpegts.Events.STATISTICS_INFO, () => {
            mpegtsDataReceived = true;
        });
        
        // Auto-play timeout
        setTimeout(() => {
            if (player && videoPlayer && videoPlayer.paused) {
                videoPlayer.play().then(() => {
                    if (videoLoading) videoLoading.style.display = 'none';
                }).catch(() => {
                    if (videoLoading) videoLoading.style.display = 'none';
                });
            }
        }, 1500);
        
        // Timeout fallback - if no data received after timeout, try native
        const VIDEO_RETRY_TIMEOUT = 6000;
        setTimeout(() => {
            if (!mpegtsDataReceived && videoLoading && videoLoading.style.display !== 'none') {
                cleanupMpegtsPlayer(player);
                tryNativePlayback(url, playbackId);
            } else if (videoLoading && videoLoading.style.display !== 'none') {
                videoLoading.style.display = 'none';
            }
        }, VIDEO_RETRY_TIMEOUT);
        
        return player;
        
    } catch (e) {
        console.error('[FLV] mpegts.js creation error:', e);
        tryNativePlayback(url, playbackId);
        return null;
    }
}

/**
 * Clean up mpegts player instance
 */
function cleanupMpegtsPlayer(player) {
    if (player) {
        try {
            player.pause();
            player.unload();
            player.detachMediaElement();
            player.destroy();
        } catch (e) {
            console.log('[FLV] Error cleaning up mpegts player:', e);
        }
    }
}

// ============================================================================
// Native Playback Fallback (ARCHIVED)
// ============================================================================

/**
 * Try native HTML5 video playback as fallback
 * This was used when FLV playback failed
 * 
 * @param {string} url - Video URL
 * @param {number} playbackId - Current playback attempt ID
 */
function tryNativePlayback_BACKUP(url, playbackId) {
    const videoPlayer = document.getElementById('videoPlayer');
    const videoLoading = document.getElementById('videoLoading');
    
    console.log('[Native] Trying native playback...');
    
    const proxyUrl = getVideoProxyUrl(url);
    
    videoPlayer.style.display = 'block';
    
    let handled = false;
    
    const handleCanPlay = () => {
        if (handled) return;
        handled = true;
        videoPlayer.removeEventListener('error', handleError);
        console.log('[Native] Playback ready');
        if (videoLoading) videoLoading.style.display = 'none';
        videoPlayer.play().catch(() => {});
    };
    
    const handleError = () => {
        if (handled) return;
        handled = true;
        videoPlayer.removeEventListener('canplay', handleCanPlay);
        console.error('[Native] Playback failed');
        // Show error state
        videoPlayer.style.display = 'none';
        if (videoLoading) videoLoading.style.display = 'none';
        const videoError = document.getElementById('videoError');
        if (videoError) videoError.style.display = 'block';
    };
    
    videoPlayer.addEventListener('canplay', handleCanPlay, { once: true });
    videoPlayer.addEventListener('error', handleError, { once: true });
    
    // Set src AFTER adding listeners
    videoPlayer.src = proxyUrl;
    
    // Timeout
    setTimeout(() => {
        if (!handled && videoLoading && videoLoading.style.display !== 'none' && videoPlayer.readyState < 2) {
            handled = true;
            console.log('[Native] Playback timeout');
            videoPlayer.removeEventListener('canplay', handleCanPlay);
            videoPlayer.removeEventListener('error', handleError);
            handleError();
        }
    }, 10000);
}

// ============================================================================
// URL Format Reference
// ============================================================================

/**
 * DownType=5 (FLV Playback Stream) URL Format:
 * 
 * http://{HOST}:{PORT}/3/5?DownType=5
 *   &jsession={SESSION_ID}
 *   &DevIDNO={DEVICE_ID}
 *   &FILELOC={1|2|4}          // 1=Device, 2=Storage, 4=Download
 *   &PLAYFILE={FILE_PATH}     // URL-encoded file path
 *   &FILEBEG={START_SECONDS}  // e.g., 0
 *   &FILEEND={END_SECONDS}    // e.g., 86399
 *   &FILECHN={CHANNEL}        // e.g., 0
 *   &PLAYIFRM=1               // Streaming mode
 * 
 * Ports:
 *   FILELOC=1 (Device): 6604 (STREAM_PORT)
 *   FILELOC=2 (Storage): 6611 (STORAGE_PORT)
 *   FILELOC=4 (Download): 6609 (DOWNLOAD_PORT)
 * 
 * Returns: FLV video stream (HEVC encoded)
 * Player: mpegts.js via MSE
 * 
 * Known Issues:
 * - Some servers return MP4 instead of FLV for DownType=5
 * - HEVC in FLV works via mpegts.js but HEVC in MP4 needs mp4box.js
 * - Server 124.29.204.5 returns non-FLV data for recorded videos
 */
