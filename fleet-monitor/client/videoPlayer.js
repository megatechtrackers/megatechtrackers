/**
 * Fleet Monitor - Video Player Modal
 * Handles recorded video playback using DownType=3 (MP4) format via mp4box.js + MSE
 */

// ============================================================================
// State
// ============================================================================

let currentRawUrl = null;
let currentPlaybackId = 0;

// mp4box.js state
let currentMp4boxFile = null;
let currentMediaSource = null;
let sourceBuffers = {};
let segmentQueues = {};

const PLAYBACK_TIMEOUT = 15000;

// ============================================================================
// Modal Management
// ============================================================================

function openVideoModal(videoUrl, title = 'Video Playback') {
    const modal = document.getElementById('videoModal');
    const videoPlayer = document.getElementById('videoPlayer');
    const videoError = document.getElementById('videoError');
    const videoLoading = document.getElementById('videoLoading');
    const titleEl = document.getElementById('videoModalTitle');
    
    if (!modal) return;
    
    titleEl.textContent = title;
    cleanupVideoPlayers();
    currentPlaybackId++;
    const thisPlaybackId = currentPlaybackId;
    
    if (videoPlayer) {
        videoPlayer.style.display = 'none';
        videoPlayer.src = '';
    }
    if (videoError) videoError.style.display = 'none';
    if (videoLoading) videoLoading.style.display = 'flex';
    
    let rawUrl = extractRawVideoUrl(videoUrl);
    rawUrl = normalizeVideoUrl(rawUrl);
    currentRawUrl = rawUrl;
    
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    playWithMp4box(thisPlaybackId);
}

function extractRawVideoUrl(videoUrl) {
    let rawUrl = videoUrl;
    
    if (videoUrl.includes('PlayBackVideo.html') && videoUrl.includes('url=')) {
        try {
            const urlObj = new URL(videoUrl);
            const encodedVideoUrl = urlObj.searchParams.get('url');
            if (encodedVideoUrl) {
                rawUrl = decodeURIComponent(encodedVideoUrl);
            }
        } catch (e) {}
    }
    
    return wsToHttp(rawUrl);
}

function normalizeVideoUrl(rawUrl) {
    if (!CMS_PLAYER) return rawUrl;
    
    if (rawUrl.startsWith('/3/5')) {
        rawUrl = `http://${CMS_PLAYER.BASE_HOST}:${CMS_PLAYER.STORAGE_PORT}${rawUrl}`;
    } else if (rawUrl.startsWith('/hls/')) {
        rawUrl = `http://${CMS_PLAYER.BASE_HOST}:${CMS_PLAYER.STREAM_PORT}${rawUrl}`;
    }
    
    return rawUrl;
}

function closeVideoModal() {
    const modal = document.getElementById('videoModal');
    const videoPlayer = document.getElementById('videoPlayer');
    const videoError = document.getElementById('videoError');
    const videoLoading = document.getElementById('videoLoading');
    
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
    
    cleanupVideoPlayers();
    
    if (videoPlayer) {
        videoPlayer.pause();
        videoPlayer.src = '';
        videoPlayer.style.display = 'none';
    }
    
    if (videoError) videoError.style.display = 'none';
    if (videoLoading) videoLoading.style.display = 'none';
    
    currentRawUrl = null;
}

// ============================================================================
// Player Cleanup
// ============================================================================

function cleanupVideoPlayers() {
    cleanupMp4boxPlayer();
}

function cleanupMp4boxPlayer() {
    if (currentMp4boxFile) {
        try { currentMp4boxFile.stop(); } catch (e) {}
        currentMp4boxFile = null;
    }
    if (currentMediaSource && currentMediaSource.readyState === 'open') {
        try { currentMediaSource.endOfStream(); } catch (e) {}
    }
    currentMediaSource = null;
    sourceBuffers = {};
    segmentQueues = {};
}

// ============================================================================
// DownType=3 URL Builder
// ============================================================================

function buildDownType3Url(fileloc) {
    if (!currentRawUrl || !CMS_PLAYER) return null;
    
    let jsession = '', devIdno = '', playFile = '';
    let fileBeg = '0', fileEnd = '86399', channel = '0';
    
    try {
        const urlObj = new URL(currentRawUrl);
        jsession = urlObj.searchParams.get('jsession') || '';
        devIdno = urlObj.searchParams.get('DevIDNO') || '';
        playFile = urlObj.searchParams.get('PLAYFILE') || urlObj.searchParams.get('FPATH') || '';
        fileBeg = urlObj.searchParams.get('FILEBEG') || urlObj.searchParams.get('BEG') || '0';
        fileEnd = urlObj.searchParams.get('FILEEND') || urlObj.searchParams.get('END') || '86399';
        channel = urlObj.searchParams.get('FILECHN') || urlObj.searchParams.get('CHNMASK') || '0';
    } catch (e) {
        const matches = {
            jsession: currentRawUrl.match(/jsession=([^&]+)/),
            devIdno: currentRawUrl.match(/DevIDNO=([^&]+)/),
            playFile: currentRawUrl.match(/PLAYFILE=([^&]+)/) || currentRawUrl.match(/FPATH=([^&]+)/),
            fileBeg: currentRawUrl.match(/FILEBEG=([^&]+)/) || currentRawUrl.match(/BEG=([^&]+)/),
            fileEnd: currentRawUrl.match(/FILEEND=([^&]+)/) || currentRawUrl.match(/END=([^&]+)/),
            channel: currentRawUrl.match(/FILECHN=([^&]+)/) || currentRawUrl.match(/CHNMASK=([^&]+)/)
        };
        if (matches.jsession) jsession = matches.jsession[1];
        if (matches.devIdno) devIdno = matches.devIdno[1];
        if (matches.playFile) playFile = decodeURIComponent(matches.playFile[1]);
        if (matches.fileBeg) fileBeg = matches.fileBeg[1];
        if (matches.fileEnd) fileEnd = matches.fileEnd[1];
        if (matches.channel) channel = matches.channel[1];
    }
    
    if (!jsession && window.currentJsession) jsession = window.currentJsession;
    if (!playFile || !devIdno) return null;
    if (playFile.includes('%')) playFile = decodeURIComponent(playFile);
    
    const saveName = playFile.split('/').pop().split('\\').pop();
    
    let year = '26', mon = '1', day = '27';
    const dateMatch = playFile.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
        year = dateMatch[1].slice(-2);
        mon = String(parseInt(dateMatch[2]));
        day = String(parseInt(dateMatch[3]));
    }
    
    let port;
    if (fileloc === 2) port = CMS_PLAYER.STORAGE_PORT;
    else if (fileloc === 4) port = CMS_PLAYER.DOWNLOAD_PORT;
    else port = CMS_PLAYER.STREAM_PORT;
    
    return `http://${CMS_PLAYER.BASE_HOST}:${port}/3/5?DownType=3` +
        `&jsession=${encodeURIComponent(jsession)}` +
        `&DevIDNO=${encodeURIComponent(devIdno)}` +
        `&FILELOC=${fileloc}` +
        `&FLENGTH=0&FOFFSET=0&MTYPE=1` +
        `&FPATH=${encodeURIComponent(playFile)}` +
        `&SAVENAME=${encodeURIComponent(saveName)}` +
        `&YEAR=${year}&MON=${mon}&DAY=${day}` +
        `&BEG=${fileBeg}&END=${fileEnd}` +
        `&CHNMASK=${channel}&FILEATTR=2`;
}

// ============================================================================
// MP4 Playback with mp4box.js
// ============================================================================

function playWithMp4box(playbackId) {
    if (playbackId !== currentPlaybackId) return;
    
    const videoPlayer = document.getElementById('videoPlayer');
    const videoLoading = document.getElementById('videoLoading');
    
    // Try Download → Storage → Device
    const url = buildDownType3Url(4) || buildDownType3Url(2) || buildDownType3Url(1);
    
    if (!url) {
        showError('Cannot build video URL');
        return;
    }
    
    if (typeof MP4Box === 'undefined' || !window.MediaSource) {
        playNative(url, playbackId);
        return;
    }
    
    const proxyUrl = getVideoProxyUrl(url);
    
    cleanupMp4boxPlayer();
    currentMediaSource = new MediaSource();
    videoPlayer.src = URL.createObjectURL(currentMediaSource);
    videoPlayer.style.display = 'block';
    
    let errorOccurred = false;
    
    currentMediaSource.addEventListener('sourceopen', () => {
        if (playbackId !== currentPlaybackId || errorOccurred) return;
        initMp4boxPlayback(proxyUrl, url, playbackId);
    });
    
    currentMediaSource.addEventListener('error', () => {
        if (playbackId !== currentPlaybackId || errorOccurred) return;
        errorOccurred = true;
        playNative(url, playbackId);
    });
    
    setTimeout(() => {
        if (playbackId !== currentPlaybackId) return;
        if (videoLoading && videoLoading.style.display !== 'none' && videoPlayer.readyState < 2) {
            errorOccurred = true;
            playNative(url, playbackId);
        }
    }, PLAYBACK_TIMEOUT);
}

function initMp4boxPlayback(proxyUrl, originalUrl, playbackId) {
    const videoPlayer = document.getElementById('videoPlayer');
    const videoLoading = document.getElementById('videoLoading');
    
    currentMp4boxFile = MP4Box.createFile();
    sourceBuffers = {};
    segmentQueues = {};
    let errorOccurred = false;
    
    currentMp4boxFile.onReady = (info) => {
        if (errorOccurred || playbackId !== currentPlaybackId) return;
        
        if (info.duration && currentMediaSource && currentMediaSource.readyState === 'open') {
            try { currentMediaSource.duration = info.duration / info.timescale; } catch (e) {}
        }
        
        for (const track of info.tracks) {
            const codec = track.codec;
            let mimeType;
            
            if (track.type === 'video') mimeType = `video/mp4; codecs="${codec}"`;
            else if (track.type === 'audio') mimeType = `audio/mp4; codecs="${codec}"`;
            else continue;
            
            let sb = null;
            const isHevc = codec.startsWith('hvc') || codec.startsWith('hev');
            
            const mimeTypesToTry = [mimeType];
            if (isHevc && track.type === 'video') {
                mimeTypesToTry.push(
                    'video/mp4; codecs="hvc1.1.6.L93.B0"',
                    'video/mp4; codecs="hvc1.1.6.L120.90"',
                    'video/mp4; codecs="hev1.1.6.L93.B0"',
                    'video/mp4; codecs="hvc1"',
                    'video/mp4'
                );
            }
            
            for (const tryMime of mimeTypesToTry) {
                try {
                    sb = currentMediaSource.addSourceBuffer(tryMime);
                    break;
                } catch (e) {
                    sb = null;
                }
            }
            
            if (!sb) {
                if (isHevc) {
                    errorOccurred = true;
                    showHevcError(originalUrl);
                    return;
                }
                continue;
            }
            
            sb.mode = 'segments';
            sourceBuffers[track.id] = sb;
            segmentQueues[track.id] = [];
            
            sb.addEventListener('updateend', () => {
                const queue = segmentQueues[track.id];
                if (queue && queue.length > 0 && !sb.updating) {
                    const next = queue.shift();
                    try {
                        sb.appendBuffer(next.buffer);
                        if (next.isLast) sb._pendingEnd = true;
                    } catch (e) {}
                } else if (sb._pendingEnd && !sb.updating) {
                    sb._pendingEnd = false;
                    setTimeout(() => {
                        if (currentMediaSource && currentMediaSource.readyState === 'open') {
                            const allDone = Object.values(sourceBuffers).every(s => !s.updating);
                            const allEmpty = Object.values(segmentQueues).every(q => q.length === 0);
                            if (allDone && allEmpty) {
                                try { currentMediaSource.endOfStream(); } catch (e) {}
                            }
                        }
                    }, 50);
                }
                if (currentMp4boxFile && !errorOccurred) {
                    try { currentMp4boxFile.flush(); } catch (e) {}
                }
            });
            
            currentMp4boxFile.setSegmentOptions(track.id, sb, { nbSamples: 100 });
        }
        
        if (Object.keys(sourceBuffers).length === 0) {
            errorOccurred = true;
            showError('No supported video tracks');
            return;
        }
        
        try {
            const initSegs = currentMp4boxFile.initializeSegmentation();
            for (const initSeg of initSegs) {
                const sb = sourceBuffers[initSeg.id];
                if (sb && !sb.updating) sb.appendBuffer(initSeg.buffer);
            }
            currentMp4boxFile.start();
        } catch (e) {
            errorOccurred = true;
            showError('Video processing error');
        }
    };
    
    currentMp4boxFile.onSegment = (id, user, buffer, sampleNum, is_last) => {
        if (errorOccurred || playbackId !== currentPlaybackId) return;
        
        const sb = user;
        const queue = segmentQueues[id];
        
        if (sb && !sb.updating && (!queue || queue.length === 0)) {
            try {
                sb.appendBuffer(buffer);
                if (is_last) sb._pendingEnd = true;
            } catch (e) {}
        } else if (sb && queue) {
            queue.push({ buffer, isLast: is_last });
        }
    };
    
    currentMp4boxFile.onError = () => {
        if (!errorOccurred && playbackId === currentPlaybackId) {
            errorOccurred = true;
            playNative(originalUrl, playbackId);
        }
    };
    
    fetch(proxyUrl)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.arrayBuffer();
        })
        .then(buffer => {
            if (errorOccurred || playbackId !== currentPlaybackId || !currentMp4boxFile) return;
            
            if (videoLoading) videoLoading.style.display = 'none';
            
            buffer.fileStart = 0;
            currentMp4boxFile.appendBuffer(buffer);
            currentMp4boxFile.flush();
            
            const tryPlay = () => {
                if (playbackId !== currentPlaybackId) return;
                const buffered = videoPlayer.buffered;
                if (videoPlayer.readyState >= 2 || (buffered.length > 0 && buffered.end(0) > 0)) {
                    videoPlayer.play().catch(() => {});
                } else {
                    setTimeout(tryPlay, 300);
                }
            };
            setTimeout(tryPlay, 300);
        })
        .catch(() => {
            if (errorOccurred || playbackId !== currentPlaybackId) return;
            errorOccurred = true;
            playNative(originalUrl, playbackId);
        });
}

// ============================================================================
// Native Playback (Fallback)
// ============================================================================

function playNative(url, playbackId) {
    if (playbackId !== currentPlaybackId) return;
    
    const videoPlayer = document.getElementById('videoPlayer');
    const videoLoading = document.getElementById('videoLoading');
    
    cleanupMp4boxPlayer();
    
    const proxyUrl = getVideoProxyUrl(url);
    videoPlayer.style.display = 'block';
    
    let handled = false;
    
    const handleCanPlay = () => {
        if (handled || playbackId !== currentPlaybackId) return;
        handled = true;
        videoPlayer.removeEventListener('error', handleError);
        if (videoLoading) videoLoading.style.display = 'none';
        videoPlayer.play().catch(() => {});
    };
    
    const handleError = () => {
        if (handled || playbackId !== currentPlaybackId) return;
        handled = true;
        videoPlayer.removeEventListener('canplay', handleCanPlay);
        showHevcError(url);
    };
    
    videoPlayer.addEventListener('canplay', handleCanPlay, { once: true });
    videoPlayer.addEventListener('error', handleError, { once: true });
    videoPlayer.src = proxyUrl;
    
    setTimeout(() => {
        if (!handled && playbackId === currentPlaybackId && videoLoading && 
            videoLoading.style.display !== 'none' && videoPlayer.readyState < 2) {
            handled = true;
            videoPlayer.removeEventListener('canplay', handleCanPlay);
            videoPlayer.removeEventListener('error', handleError);
            showHevcError(url);
        }
    }, PLAYBACK_TIMEOUT);
}

// ============================================================================
// Error Display
// ============================================================================

function showError(message) {
    const videoPlayer = document.getElementById('videoPlayer');
    const videoLoading = document.getElementById('videoLoading');
    const videoError = document.getElementById('videoError');
    
    cleanupMp4boxPlayer();
    
    if (videoPlayer) videoPlayer.style.display = 'none';
    if (videoLoading) videoLoading.style.display = 'none';
    if (videoError) {
        videoError.innerHTML = `
            <p>${message}</p>
            <p style="font-size: 12px; color: #888;">Use the download buttons to save and play locally.</p>
        `;
        videoError.style.display = 'block';
    }
}

function showHevcError(directUrl) {
    const videoPlayer = document.getElementById('videoPlayer');
    const videoLoading = document.getElementById('videoLoading');
    const videoError = document.getElementById('videoError');
    
    cleanupMp4boxPlayer();
    
    if (videoPlayer) videoPlayer.style.display = 'none';
    if (videoLoading) videoLoading.style.display = 'none';
    if (videoError) {
        videoError.innerHTML = `
            <p>Cannot play HEVC video in browser</p>
            <p style="font-size: 12px; color: #888;">
                Your browser doesn't support HEVC playback.<br>
                Download the file and play with VLC.
            </p>
        `;
        videoError.style.display = 'block';
    }
}

// ============================================================================
// Download Buttons (DownType=3)
// ============================================================================

function playDirectFromDevice() {
    const url = buildDownType3Url(1);
    if (url) window.open(url, '_blank');
    else alert('Cannot build download URL');
}

function playDirectFromStorage() {
    const url = buildDownType3Url(2);
    if (url) window.open(url, '_blank');
    else alert('Cannot build download URL');
}

function playDirectFromDownload() {
    const url = buildDownType3Url(4);
    if (url) window.open(url, '_blank');
    else alert('Cannot build download URL');
}

// ============================================================================
// Template Helpers
// ============================================================================

function playVideoIframe(playerId, playerUrl) {
    let videoUrl = playerUrl;
    if (playerUrl.includes('PlayBackVideo.html') && playerUrl.includes('url=')) {
        try {
            const urlParams = new URL(playerUrl).searchParams;
            videoUrl = decodeURIComponent(urlParams.get('url') || playerUrl);
        } catch (e) {}
    }
    openVideoModal(videoUrl, 'Video Playback');
}

function playVideo(playerId, videoUrl, playerUrl = null) {
    const actualVideoUrl = videoUrl || playerUrl;
    if (!actualVideoUrl) return;
    
    let title = 'Safety Alarm Video';
    try {
        const idx = playerId.replace('safetyVideo', '');
        title = `Safety Alarm Video #${parseInt(idx) + 1}`;
    } catch (e) {}
    
    openVideoModal(actualVideoUrl, title);
}
