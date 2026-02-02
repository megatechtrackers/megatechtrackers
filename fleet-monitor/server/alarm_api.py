"""
CMS Alarm API - Safety alarm functionality (ADAS/DSM)
"""

import requests
from datetime import datetime, timezone
from typing import Dict, Any, Tuple
from urllib.parse import quote, urlparse, parse_qs

from device_api import CMSDeviceApi
from alarm_names import ALARM_TYPE_NAMES
from utils import (
    convert_coordinate,
    timestamp_to_seconds_in_day,
    ensure_jsession_in_url,
)


class CMSAlarmApi(CMSDeviceApi):
    """CMS API methods for safety alarms."""
    
    # =========================================================================
    # Alarm Name Resolution
    # =========================================================================
    
    def _get_alarm_name(self, alarm_type: int) -> str:
        """Get alarm type name using documented alarmType field.
        
        Per CMS documentation (alertManager.js), alarms should return distinct
        type codes: 618/619 (Fatigue), 620/621 (Phone), 622/623 (Smoking),
        624/625 (Distracted), 626/627 (Driver Abnormal), etc.
        
        We use ALARM_TYPE_NAMES lookup which maps these codes to display names.
        """
        try:
            code = int(alarm_type)
        except (TypeError, ValueError):
            return f'Safety Alert {alarm_type}'
        return ALARM_TYPE_NAMES.get(code, f'Safety Alert {code}')
    
    def _get_port_for_fileloc(self, fileloc) -> int:
        """Get the correct port for a given FILELOC value.
        
        FILELOC=1: Device MDVR -> stream_port (6604)
        FILELOC=2: Storage Server -> storage_port (6611)
        FILELOC=4: Download Server -> download_port (6609)
        """
        try:
            fileloc = int(fileloc)
        except (TypeError, ValueError):
            fileloc = 2  # Default to storage
        
        if fileloc == 1:
            return self._stream_port
        elif fileloc == 4:
            return self._download_port
        else:  # Default to storage (FILELOC=2)
            return self._storage_port
    
    # =========================================================================
    # Video URL Construction
    # =========================================================================
    
    def _construct_video_url(self, alarm: Dict[str, Any], session: str, 
                              plate_number: str) -> Tuple[str, str]:
        """Construct video URL from alarm data."""
        media_type = alarm.get('mediaType')
        alarm_id = (alarm.get('id') or alarm.get('label') or 'unknown')[:20]
        
        print(f"[Safety v2] _construct_video_url called: alarm={alarm_id}, mediaType={media_type}")
        
        # Only process video URLs for video-type alarms (mediaType=1)
        # mediaType=0 is photo, mediaType=1 is video
        if media_type != 1:
            print(f"[Safety v2] SKIPPING - Not a video (mediaType={media_type}), returning empty URLs")
            return '', ''
        
        # Check all possible video URL fields
        video_file = alarm.get('videoFile')
        video_url_field = alarm.get('videoUrl')
        video_field = alarm.get('video')
        video_path = alarm.get('videoPath')
        playback_url = alarm.get('playbackUrl')
        file_url = alarm.get('fileUrl')
        
        print(f"[Safety] Raw video fields: videoFile={video_file}, videoUrl={video_url_field}, "
              f"video={video_field}, videoPath={video_path}, playbackUrl={playback_url}, fileUrl={file_url}")
        
        video_url = video_file or video_url_field or video_field or video_path or playback_url or ''
        
        source = 'direct_field' if video_url else 'none'
        
        if not video_url:
            if file_url and ('video' in file_url.lower() or '.mp4' in file_url.lower() or
                           '.avi' in file_url.lower() or 'DownType=5' in file_url):
                video_url = file_url
                source = 'fileUrl'
        
        if not video_url:
            video_url = self._build_video_url_from_alarm(alarm, session, plate_number)
            source = 'built_from_alarm'
        
        if not video_url:
            return '', ''
        
        # Log video URL source for debugging
        alarm_id = alarm.get('id') or alarm.get('label') or 'unknown'
        print(f"[Safety] Video URL for alarm {alarm_id[:20]}... source={source}, url={video_url[:80]}...")
        
        video_url = self._normalize_video_url(video_url, session)
        
        player_url = video_url
        if '/3/5' in video_url or 'DownType=5' in video_url:
            player_url = self.get_playback_player_url(video_url)
        
        return video_url, player_url
    
    def _build_video_url_from_alarm(self, alarm: Dict[str, Any], session: str,
                                     plate_number: str) -> str:
        """Build video URL from alarm file path and metadata."""
        file_path = alarm.get('filePath') or alarm.get('fileName') or ''
        dev_idno = alarm.get('devIdno') or ''
        vehi_idno = alarm.get('vehiIdno') or plate_number or ''
        channel = alarm.get('channel')
        file_time = alarm.get('fileTime')
        file_stime = alarm.get('fileSTime')
        file_etime = alarm.get('fileETime')
        svr_id = alarm.get('svrId')
        alarm_id = alarm.get('id') or alarm.get('label')
        
        if not dev_idno and alarm_id and len(alarm_id) > 14:
            try:
                potential_dev_id = alarm_id[:-14]
                if potential_dev_id and potential_dev_id.isdigit():
                    dev_idno = potential_dev_id
            except:
                pass
        
        # Determine FILELOC - check if file is on storage server
        # svrId > 0 indicates storage server
        # Also check file path for storage indicators (gStorage, RECORD_FILE)
        is_storage_path = False
        if file_path:
            path_lower = file_path.lower()
            is_storage_path = ('gstorage' in path_lower or 
                              'record_file' in path_lower or 
                              'storage' in path_lower or
                              path_lower.startswith('d:') or 
                              path_lower.startswith('e:'))
        
        if svr_id is not None and svr_id != 0:
            file_loc = '2'  # Storage server (svrId indicates server)
        elif is_storage_path:
            file_loc = '2'  # Storage server (path indicates storage)
            print(f"[Safety] Detected storage path from filename: {file_path[:50]}...")
        else:
            file_loc = '1'  # Device MDVR
        
        file_svr = str(svr_id) if svr_id is not None else '0'
        
        # Per CMS docs: "DevIDNO: When query video on server, it means the license plate number"
        # FILELOC=1 (device): use device ID (devIdno)
        # FILELOC=2,4 (server): use plate number (vehiIdno)
        if file_loc == '1':
            device_id = dev_idno or vehi_idno  # Device access uses device ID
        else:
            device_id = vehi_idno or dev_idno  # Server access uses plate number
        
        if not device_id:
            return ''
        file_chn = str(channel) if channel is not None else '0'
        
        file_beg = '0'
        file_end = '0'
        
        # Calculate time range from alarm timestamps
        # FILEBEG/FILEEND are seconds since midnight
        if file_stime and isinstance(file_stime, (int, float)) and file_stime > 0:
            file_beg = str(timestamp_to_seconds_in_day(file_stime))
        if file_etime and isinstance(file_etime, (int, float)) and file_etime > 0:
            file_end = str(timestamp_to_seconds_in_day(file_etime))
        
        # Fallback: use fileTime if we don't have valid start/end
        if (file_beg == '0' or file_end == '0') and file_time and file_time > 0:
            try:
                ts_sec = int(file_time / 1000)
                seconds_in_day = ts_sec % 86400
                file_beg = str(seconds_in_day)
                # Default to 2 minutes of video
                file_end = str(min(86399, seconds_in_day + 120))
            except:
                pass
        
        # Final fallback: if still 0, try to extract timestamp from filename
        # Filename format: 02_00_6505_03_00000000134182260127124417390500.mp4
        # Structure: channel_xx_alarmtype_xx_deviceid(14digits)date(6digits)time(6digits)extra.mp4
        # The time is HHMMSS (e.g., 124417 = 12:44:17)
        if file_beg == '0' and file_end == '0' and file_path:
            try:
                import re
                filename = file_path.split('/')[-1].split('\\')[-1]
                print(f"[Safety] Trying to extract time from filename: {filename}")
                
                # Method 1: Look for pattern deviceid(12+digits) + date(YYMMDD) + time(HHMMSS) + extra
                # The time portion is 6 digits where first 2 are hours (00-23)
                # Pattern: ...YYMMDDHHMMSS... where HHMMSS is valid time
                
                # Find all sequences of 12 consecutive digits that could contain YYMMDDHHMMSS
                all_digits = re.findall(r'\d{12,}', filename)
                for digit_seq in all_digits:
                    # Try to find YYMMDDHHMMSS pattern within the sequence
                    # Look for valid dates (YY=20-30, MM=01-12, DD=01-31) followed by valid time
                    for i in range(len(digit_seq) - 11):
                        chunk = digit_seq[i:i+12]
                        yy = int(chunk[0:2])
                        mm = int(chunk[2:4])
                        dd = int(chunk[4:6])
                        hh = int(chunk[6:8])
                        mi = int(chunk[8:10])
                        ss = int(chunk[10:12])
                        
                        # Validate as date+time (year 20-30, valid month/day/time)
                        if (20 <= yy <= 30 and 1 <= mm <= 12 and 1 <= dd <= 31 and
                            0 <= hh <= 23 and 0 <= mi <= 59 and 0 <= ss <= 59):
                            seconds_in_day = hh * 3600 + mi * 60 + ss
                            file_beg = str(seconds_in_day)
                            file_end = str(min(86399, seconds_in_day + 120))
                            print(f"[Safety] Found timestamp 20{yy}-{mm:02d}-{dd:02d} {hh:02d}:{mi:02d}:{ss:02d}, beg={file_beg}, end={file_end}")
                            break
                    if file_beg != '0':
                        break
                            
            except Exception as e:
                print(f"[Safety] Could not extract time from filename: {e}")
        
        # Last resort: if still no valid range, use full file (some servers support this)
        if file_beg == '0' and file_end == '0':
            print(f"[Safety] Warning: No valid time range, using 0-86399 (full day)")
            file_end = '86399'
        
        print(f"[Safety] Building URL: device={device_id}, file={file_path[:50]}..., beg={file_beg}, end={file_end}")
        
        if file_path:
            # Use correct port based on FILELOC
            port = self._get_port_for_fileloc(file_loc)
            return (f"http://{self._server_host}:{port}/3/5?DownType=5&DevIDNO={device_id}"
                   f"&FILELOC={file_loc}&FILESVR={file_svr}&FILECHN={file_chn}"
                   f"&FILEBEG={file_beg}&FILEEND={file_end}"
                   f"&PLAYIFRM=0&PLAYFILE={quote(file_path)}&PLAYBEG=0&PLAYEND=0&PLAYCHN={file_chn}"
                   f"&jsession={session}")
        elif file_time:
            try:
                # Convert milliseconds to UTC datetime, then to CMS local time for URL
                alarm_dt = datetime.fromtimestamp(file_time / 1000, tz=timezone.utc)
                cms_local_time = self._utc_to_cms_local(alarm_dt)
                player_base = f"http://{self._server_host}:{self._web_port}/808gps/open/player/PlayBackVideo.html"
                return (f"{player_base}?devIdno={device_id}&channel={file_chn}"
                       f"&begintime={cms_local_time}"
                       f"&endtime={cms_local_time}"
                       f"&jsession={session}&lang=en")
            except:
                pass
        
        return ''
    
    def _normalize_video_url(self, video_url: str, session: str) -> str:
        """Normalize video URL format."""
        if not video_url:
            return ''
        
        # Fix invalid FILEBEG=0&FILEEND=0 - try to extract time from filename
        if 'FILEBEG=0' in video_url and 'FILEEND=0' in video_url:
            print(f"[Safety] Fixing invalid FILEBEG=0&FILEEND=0 in URL")
            
            # Try to extract timestamp from PLAYFILE parameter
            import re
            from urllib.parse import unquote
            playfile_match = re.search(r'PLAYFILE=([^&]+)', video_url)
            if playfile_match:
                playfile = unquote(playfile_match.group(1))
                filename = playfile.split('/')[-1].split('\\')[-1]
                print(f"[Safety] Trying to extract time from: {filename}")
                
                # Find all sequences of 12+ consecutive digits
                all_digits = re.findall(r'\d{12,}', filename)
                for digit_seq in all_digits:
                    # Look for YYMMDDHHMMSS pattern
                    for i in range(len(digit_seq) - 11):
                        chunk = digit_seq[i:i+12]
                        yy = int(chunk[0:2])
                        mm = int(chunk[2:4])
                        dd = int(chunk[4:6])
                        hh = int(chunk[6:8])
                        mi = int(chunk[8:10])
                        ss = int(chunk[10:12])
                        
                        # Validate as date+time
                        if (20 <= yy <= 30 and 1 <= mm <= 12 and 1 <= dd <= 31 and
                            0 <= hh <= 23 and 0 <= mi <= 59 and 0 <= ss <= 59):
                            seconds_in_day = hh * 3600 + mi * 60 + ss
                            file_beg = str(seconds_in_day)
                            file_end = str(min(86399, seconds_in_day + 120))
                            video_url = video_url.replace('FILEBEG=0', f'FILEBEG={file_beg}')
                            video_url = video_url.replace('FILEEND=0', f'FILEEND={file_end}')
                            print(f"[Safety] Extracted time: {hh:02d}:{mi:02d}:{ss:02d}, beg={file_beg}, end={file_end}")
                            break
                    if 'FILEBEG=0' not in video_url:
                        break
            
            # Fallback: use full day if couldn't extract time
            if 'FILEEND=0' in video_url:
                video_url = video_url.replace('FILEEND=0', 'FILEEND=86399')
        
        if video_url.startswith('playback.m3u8') or '/hls/playback.m3u8' in video_url:
            try:
                if '?' in video_url:
                    if video_url.startswith('http'):
                        parsed = urlparse(video_url)
                        params = parse_qs(parsed.query)
                    else:
                        params = parse_qs(video_url.split('?', 1)[1])
                    
                    dev_idno = params.get('DevIDNO', [''])[0]
                    file_loc = params.get('FILELOC', [''])[0]
                    file_svr = params.get('FILESVR', [''])[0]
                    file_chn = params.get('FILECHN', [''])[0]
                    file_beg = params.get('FILEBEG', ['0'])[0]
                    file_end = params.get('FILEEND', ['0'])[0]
                    play_file = params.get('PLAYFILE', [''])[0]
                    play_beg = params.get('PLAYBEG', ['0'])[0]
                    play_end = params.get('PLAYEND', ['0'])[0]
                    play_chn = params.get('PLAYCHN', ['0'])[0]
                    
                    # Check if file path indicates storage server
                    if play_file and file_loc == '1':
                        path_lower = play_file.lower()
                        if ('gstorage' in path_lower or 'record_file' in path_lower or 
                            'storage' in path_lower or path_lower.startswith('d:') or 
                            path_lower.startswith('e:')):
                            file_loc = '2'  # Fix to storage server
                            print(f"[Safety] Fixed FILELOC=1 to 2 based on storage path")
                    
                    # Use correct port based on FILELOC
                    port = self._get_port_for_fileloc(file_loc)
                    video_url = (f"http://{self._server_host}:{port}/3/5?DownType=5&DevIDNO={dev_idno}"
                               f"&FILELOC={file_loc}&FILESVR={file_svr}&FILECHN={file_chn}"
                               f"&FILEBEG={file_beg}&FILEEND={file_end}&PLAYIFRM=0"
                               f"&PLAYFILE={play_file}&PLAYBEG={play_beg}&PLAYEND={play_end}"
                               f"&PLAYCHN={play_chn}&jsession={session}")
            except Exception as e:
                print(f"[Safety] Error converting playback.m3u8 URL: {e}")
                if video_url.startswith('playback.m3u8'):
                    # HLS streams use the stream port
                    video_url = f"http://{self._server_host}:{self._stream_port}/hls/{video_url}"
        elif video_url.startswith('/hls/'):
            # HLS streams use the stream port
            video_url = f"http://{self._server_host}:{self._stream_port}{video_url}"
        
        return ensure_jsession_in_url(video_url, session)
    
    # =========================================================================
    # Alarm Parsing
    # =========================================================================
    
    def _parse_safety_alarm(self, alarm: Dict[str, Any], session: str,
                            plate_number: str) -> Dict[str, Any]:
        """Parse a single safety alarm from API response."""
        # Debug: log raw time fields
        file_time = alarm.get('fileTime')
        file_stime = alarm.get('fileSTime')
        file_etime = alarm.get('fileETime')
        print(f"[Safety] Raw alarm times: fileTime={file_time}, fileSTime={file_stime}, fileETime={file_etime}")
        
        time_str = None
        time_iso = None  # ISO format for client-side timezone conversion
        if file_time:
            try:
                dt_utc = datetime.fromtimestamp(file_time / 1000, tz=timezone.utc)
                time_str = dt_utc.strftime('%Y-%m-%d %H:%M:%S')
                time_iso = dt_utc.isoformat()  # e.g., "2026-01-30T22:36:30+00:00"
            except:
                time_str = str(file_time)
                time_iso = None
        
        alarm_type = alarm.get('alarmType')
        alarm_param = alarm.get('alarmParam')
        raw_id = alarm.get('id')
        raw_label = alarm.get('label')
        alarm_id = raw_id or raw_label
        type_name = self._get_alarm_name(alarm_type)
        
        try:
            wei_du = float(alarm.get('weiDu', 0) or 0)
            jing_du = float(alarm.get('jingDu', 0) or 0)
        except (ValueError, TypeError):
            wei_du = jing_du = 0
        
        lat = convert_coordinate(wei_du)
        lng = convert_coordinate(jing_du)
        
        # Only use fileUrl for photo if mediaType == 0 (photo)
        # When mediaType == 1 (video), fileUrl contains the video, not photo
        media_type = alarm.get('mediaType')
        if media_type == 0:
            # Photo type - fileUrl is the photo
            photo_url = alarm.get('fileUrl') or alarm.get('photoUrl') or alarm.get('photo') or ''
        else:
            # Video type or unknown - only use explicit photo fields, not fileUrl
            photo_url = alarm.get('photoUrl') or alarm.get('photo') or ''
        
        if photo_url:
            photo_url = ensure_jsession_in_url(photo_url, session)
        
        video_url, player_url = self._construct_video_url(alarm, session, plate_number)
        
        return {
            'id': alarm_id,
            'rawId': raw_id,
            'label': raw_label,
            'type': alarm_type,
            'typeName': type_name,
            'alarmParam': alarm_param,
            'time': time_str,
            'timeISO': time_iso,  # ISO format for client-side timezone display
            'fileTime': file_time,
            'fileStartTime': alarm.get('fileSTime'),
            'fileEndTime': alarm.get('fileETime'),
            'lat': lat,
            'lng': lng,
            'mapLat': alarm.get('mapWeiDu'),
            'mapLng': alarm.get('mapJingDu'),
            'channel': alarm.get('channel'),
            'photoUrl': photo_url,
            'videoUrl': video_url,
            'playerUrl': player_url,
            'position': alarm.get('position'),
            'deviceId': alarm.get('devIdno'),
            'plateNumber': alarm.get('vehiIdno') or plate_number,  # Use passed plate_number as fallback
            'fileSize': alarm.get('fileSize'),
            'mediaType': alarm.get('mediaType'),
            'status': alarm.get('status'),
            'svrId': alarm.get('svrId')
        }
    
    # =========================================================================
    # Get Safety Alarms
    # =========================================================================
    
    def get_safety_alarms(self, plate_number: str, start_time: str, 
                          end_time: str) -> Dict[str, Any]:
        """Get Active Safety alarms - ADAS/DSM events with photos/videos.
        
        Args:
            plate_number: Vehicle plate number (or device ID)
            start_time: Start time "YYYY-MM-DD HH:MM:SS" (UTC from client)
            end_time: End time "YYYY-MM-DD HH:MM:SS" (UTC from client)
        """
        session = self._ensure_session()
        url = f"{self.base_url}/StandardApiAction_performanceReportPhotoListSafe.action"
        
        # Convert UTC times to CMS local timezone for query
        try:
            start_dt = datetime.strptime(start_time, '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
            end_dt = datetime.strptime(end_time, '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
            cms_start = self._utc_to_cms_local(start_dt)
            cms_end = self._utc_to_cms_local(end_dt)
            print(f"[Safety] Time conversion: UTC {start_time} -> CMS {cms_start} (tz={self._cms_timezone})")
        except Exception as e:
            print(f"[Safety] Time conversion error: {e}, using as-is")
            cms_start = start_time
            cms_end = end_time
        
        all_alarms = {}
        by_composite = {}
        
        print(f"[Safety] Querying plate={plate_number}, start={cms_start}, end={cms_end} (CMS local)")
        
        alarm_type_lists = [
            '600,601,602,603,604,605,606,607,608,609,610,611,612,613,614,615,616,617',
            '618,619,620,621,622,623,624,625,626,627,628,629,630,631,632,633,634,635,636,637,638,639,640,641,642,643,644,645',
            '700,701,702,703,704,705,706,707,708,709,710,711,712,713,714,715,716,717,718,719,720,721,722,723,724,725,726,727,728,729,730,731,732,733,734,735,736,737,738,739,740,741,742,743,744,745,746',
            '840,841,842,843,844,845,846',
            '1200,1201,1202,1203,1204,1205,1206,1207,1208,1209,1210',
            '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30',
            '31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60',
            '61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80',
        ]
        
        media_types = [0, 1]
        
        for alarm_types in alarm_type_lists:
            for media_type_filter in media_types:
                try:
                    for page in range(1, 10):
                        response = requests.get(url, params={
                            'jsession': session,
                            'vehiIdno': plate_number,
                            'begintime': cms_start,
                            'endtime': cms_end,
                            'alarmType': alarm_types,
                            'mediaType': media_type_filter,
                            'toMap': 1,
                            'currentPage': page,
                            'pageRecords': self.DEFAULT_PAGE_SIZE
                        }, timeout=self.timeout)
                        
                        data = response.json()
                        infos = data.get('infos', [])
                        
                        if data.get('result') == 0 and infos:
                            for a in infos:
                                alarm_data = self._parse_safety_alarm(a, session, plate_number)
                                alarm_id = alarm_data['id']
                                
                                if not alarm_id:
                                    continue
                                
                                device_id = alarm_data.get('deviceId') or alarm_data.get('plateNumber') or 'unknown'
                                composite_key = (
                                    str(device_id),
                                    str(alarm_data.get('fileTime') or ''),
                                    str(alarm_data.get('type') or ''),
                                    int(alarm_data.get('channel') or 0)
                                )
                                
                                existing_key = None
                                if alarm_id in all_alarms:
                                    existing_key = alarm_id
                                elif composite_key in by_composite:
                                    existing_key = by_composite[composite_key]
                                
                                if existing_key:
                                    existing = all_alarms[existing_key]
                                    # If new alarm is a video (mediaType=1) and has video URL, 
                                    # update the existing alarm with video data
                                    if alarm_data.get('videoUrl') and alarm_data.get('mediaType') == 1:
                                        existing['videoUrl'] = alarm_data['videoUrl']
                                        existing['playerUrl'] = alarm_data.get('playerUrl')
                                        existing['mediaType'] = 1  # Update mediaType to video
                                    if alarm_data.get('photoUrl') and not existing.get('photoUrl'):
                                        existing['photoUrl'] = alarm_data['photoUrl']
                                else:
                                    all_alarms[alarm_id] = alarm_data
                                    by_composite[composite_key] = alarm_id
                            
                            pagination = data.get('pagination', {})
                            if page >= pagination.get('totalPages', 1):
                                break
                        else:
                            break
                            
                except Exception as e:
                    print(f"[Safety] Error with types {alarm_types[:20]}...: {e}")
                    continue
        
        alarm_list = list(all_alarms.values())
        alarm_list.sort(key=lambda x: x.get('time') or '', reverse=True)
        
        print(f"[Safety] Total unique alarms found: {len(alarm_list)}")
        return {'success': True, 'alarms': alarm_list, 'total': len(alarm_list)}
