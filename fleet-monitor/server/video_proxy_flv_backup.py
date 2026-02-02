"""
Fleet Monitor - FLV Proxy Backup Code

BACKUP: This file contains the FLV (DownType=5) proxy fallback logic for safety alarm videos.
Archived on: 2026-01-27
Reason: Simplified to use DownType=3 (MP4) only, which works more reliably across servers.

This code was part of the video proxy in app.py and handled:
1. Converting DownType=5 URLs to DownType=3 for better reliability
2. Fallback chain through different FILELOCs and DownTypes
3. Pre-buffering and streaming FLV data

Keep this for reference in case the full fallback logic is needed in the future.
"""

# ============================================================================
# DownType=5 to DownType=3 Conversion (ARCHIVED)
# ============================================================================

def convert_to_downtype3(video_url, fileloc):
    """
    Convert a DownType=5 (FLV stream) URL to DownType=3 (MP4 download) URL.
    
    DownType=5 format (input):
        /3/5?DownType=5&jsession=...&DevIDNO=...&FILELOC=...
        &PLAYFILE=path/to/file.avi&FILEBEG=0&FILEEND=86399&FILECHN=0
    
    DownType=3 format (output):
        /3/5?DownType=3&jsession=...&DevIDNO=...&FILELOC=...
        &FPATH=path/to/file.avi&FLENGTH=0&FOFFSET=0&MTYPE=1
        &SAVENAME=file.avi&YEAR=26&MON=1&DAY=27&BEG=0&END=86399
        &CHNMASK=0&FILEATTR=2
    
    Args:
        video_url: DownType=5 URL string
        fileloc: Target FILELOC value (1=Device, 2=Storage, 4=Download)
    
    Returns:
        DownType=3 URL string, or None if conversion fails
    """
    import re
    import os
    from urllib.parse import urlparse, parse_qs, urlencode, unquote
    
    CMS_HOST = os.environ.get('CMS_HOST', '203.101.163.180')
    CMS_STORAGE_PORT = int(os.environ.get('CMS_STORAGE_PORT', 6611))
    CMS_DOWNLOAD_PORT = int(os.environ.get('CMS_DOWNLOAD_PORT', 6609))
    CMS_STREAM_PORT = int(os.environ.get('CMS_STREAM_PORT', 6604))
    
    try:
        parsed = urlparse(video_url)
        params = parse_qs(parsed.query)
        
        # Extract required parameters
        jsession = params.get('jsession', [''])[0]
        dev_idno = params.get('DevIDNO', [''])[0]
        playfile = params.get('PLAYFILE', [''])[0]
        
        if not playfile or not dev_idno:
            print(f"[VideoProxy] Missing PLAYFILE or DevIDNO for DownType=3 conversion")
            return None
        
        # Decode playfile if URL-encoded
        playfile = unquote(playfile)
        
        # Extract other parameters with defaults
        file_beg = params.get('FILEBEG', params.get('PLAYBEG', ['0']))[0]
        file_end = params.get('FILEEND', params.get('PLAYEND', ['86399']))[0]
        file_chn = params.get('FILECHN', params.get('PLAYCHN', ['0']))[0]
        
        # Extract date from file path (format: .../2026-01-27/...)
        date_match = re.search(r'(\d{4})-(\d{2})-(\d{2})', playfile)
        if date_match:
            year = date_match.group(1)[-2:]  # Last 2 digits
            mon = str(int(date_match.group(2)))  # Remove leading zero
            day = str(int(date_match.group(3)))
        else:
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            year = str(now.year)[-2:]
            mon = str(now.month)
            day = str(now.day)
        
        # Extract filename for SAVENAME
        save_name = playfile.split('/')[-1].split('\\')[-1]
        
        # Determine port based on FILELOC
        if fileloc == 2:
            port = CMS_STORAGE_PORT
        elif fileloc == 4:
            port = CMS_DOWNLOAD_PORT
        else:
            port = CMS_STREAM_PORT
        
        # Build DownType=3 URL
        dt3_url = (f"http://{CMS_HOST}:{port}/3/5?DownType=3"
                  f"&jsession={jsession}"
                  f"&DevIDNO={dev_idno}"
                  f"&FILELOC={fileloc}"
                  f"&FLENGTH=0&FOFFSET=0&MTYPE=1"
                  f"&FPATH={playfile}"  # Will be URL-encoded by proxy
                  f"&SAVENAME={save_name}"
                  f"&YEAR={year}&MON={mon}&DAY={day}"
                  f"&BEG={file_beg}&END={file_end}"
                  f"&CHNMASK={file_chn}&FILEATTR=2")
        return dt3_url
    except Exception as e:
        print(f"[VideoProxy] Error converting to DownType=3: {e}")
        return None


# ============================================================================
# Full Fallback Chain Logic (ARCHIVED)
# ============================================================================

def build_fallback_chain_flv(video_url, switch_fileloc_and_port_fn, convert_to_downtype3_fn):
    """
    Build the full fallback chain for video proxy requests.
    
    This was used when DownType=5 was the primary format.
    Fallback order:
    1. DownType=3 with Download Server (FILELOC=4) - fastest, most reliable
    2. DownType=3 with Storage Server (FILELOC=2)
    3. DownType=5 with Download Server (FILELOC=4)
    4. DownType=5 with Storage Server (FILELOC=2)
    5. DownType=5 with Device MDVR (FILELOC=1) - last resort
    
    Args:
        video_url: Original video URL
        switch_fileloc_and_port_fn: Function to switch FILELOC and port
        convert_to_downtype3_fn: Function to convert to DownType=3
    
    Returns:
        List of (url, description) tuples
    """
    import re
    
    fallback_urls = []
    
    is_downtype5 = 'DownType=5' in video_url
    
    if is_downtype5:
        print(f"[VideoProxy] DownType=5 detected - will try DownType=3 first (more reliable)")
        
        # Priority: DownType=3 first (Download Server → Storage), then DownType=5 as fallback
        # 1. DownType=3 with Download Server (fastest, most reliable)
        dt3_download = convert_to_downtype3_fn(video_url, 4)
        if dt3_download:
            fallback_urls.append((dt3_download, 'DownType=3 Download Server (FILELOC=4)'))
        
        # 2. DownType=3 with Storage Server
        dt3_storage = convert_to_downtype3_fn(video_url, 2)
        if dt3_storage:
            fallback_urls.append((dt3_storage, 'DownType=3 Storage Server (FILELOC=2)'))
        
        # 3. DownType=5 with Download Server (fallback)
        dt5_download = switch_fileloc_and_port_fn(video_url, 4)
        fallback_urls.append((dt5_download, 'DownType=5 Download Server (FILELOC=4)'))
        
        # 4. DownType=5 with Storage Server
        dt5_storage = switch_fileloc_and_port_fn(video_url, 2)
        fallback_urls.append((dt5_storage, 'DownType=5 Storage Server (FILELOC=2)'))
        
        # 5. DownType=5 with Device (last resort)
        dt5_device = switch_fileloc_and_port_fn(video_url, 1)
        fallback_urls.append((dt5_device, 'DownType=5 Device MDVR (FILELOC=1)'))
        
    elif 'DownType=3' in video_url:
        # Already DownType=3, try different FILELOC values
        print(f"[VideoProxy] DownType=3 URL")
        fallback_urls = [
            (switch_fileloc_and_port_fn(video_url, 4), 'DownType=3 Download Server (FILELOC=4)'),
            (switch_fileloc_and_port_fn(video_url, 2), 'DownType=3 Storage Server (FILELOC=2)'),
            (switch_fileloc_and_port_fn(video_url, 1), 'DownType=3 Device MDVR (FILELOC=1)')
        ]
    else:
        # Other URL types (live streams, etc.) - just use as-is with FILELOC fallbacks
        fileloc_match = re.search(r'FILELOC=(\d+)', video_url)
        if fileloc_match:
            fallback_urls = [
                (switch_fileloc_and_port_fn(video_url, 4), 'Download Server (FILELOC=4)'),
                (switch_fileloc_and_port_fn(video_url, 2), 'Storage Server (FILELOC=2)'),
                (switch_fileloc_and_port_fn(video_url, 1), 'Device MDVR (FILELOC=1)')
            ]
        else:
            fallback_urls = [(video_url, 'Original URL')]
    
    return fallback_urls


# ============================================================================
# URL Format Reference
# ============================================================================

"""
DownType=5 (FLV Playback Stream) URL Format:

http://{HOST}:{PORT}/3/5?DownType=5
  &jsession={SESSION_ID}
  &DevIDNO={DEVICE_ID}
  &FILELOC={1|2|4}          # 1=Device, 2=Storage, 4=Download
  &PLAYFILE={FILE_PATH}     # URL-encoded file path
  &FILEBEG={START_SECONDS}  # e.g., 0
  &FILEEND={END_SECONDS}    # e.g., 86399
  &FILECHN={CHANNEL}        # e.g., 0
  &PLAYIFRM=1               # Streaming mode

Ports:
  FILELOC=1 (Device): 6604 (STREAM_PORT)
  FILELOC=2 (Storage): 6611 (STORAGE_PORT)
  FILELOC=4 (Download): 6609 (DOWNLOAD_PORT)

Returns: FLV video stream (HEVC encoded)
Content-Type: video/x-flv or "Flash"

DownType=3 (MP4 Download) URL Format:

http://{HOST}:{PORT}/3/5?DownType=3
  &jsession={SESSION_ID}
  &DevIDNO={DEVICE_ID}
  &FILELOC={1|2|4}
  &FPATH={FILE_PATH}        # Same as PLAYFILE
  &FLENGTH=0                # 0 = full file
  &FOFFSET=0                # Start offset
  &MTYPE=1                  # Media type
  &SAVENAME={FILENAME}      # Suggested filename
  &YEAR={YY}                # 2-digit year
  &MON={M}                  # Month (no leading zero)
  &DAY={D}                  # Day (no leading zero)
  &BEG={START_SECONDS}      # Same as FILEBEG
  &END={END_SECONDS}        # Same as FILEEND
  &CHNMASK={CHANNEL}        # Same as FILECHN
  &FILEATTR=2               # File attributes

Returns: MP4 video file (HEVC encoded)
Content-Type: video/mp4

Known Issues:
- Server 124.29.204.5 returns non-FLV data for DownType=5 recorded videos
- Some servers require specific port/FILELOC combinations
- DownType=3 is more reliable across different server configurations
"""
