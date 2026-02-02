"""
Fleet Monitor - Flask Backend Server
Provides API endpoints for CMS device monitoring
"""

from flask import Flask, jsonify, request, send_from_directory, Response, stream_with_context
from flask_cors import CORS
from datetime import datetime, timezone
import os
import re
import requests

from cms_api import CMSApi

app = Flask(__name__, static_folder='../client', static_url_path='')
CORS(app)

# Initialize CMS API client
cms = CMSApi()


@app.route('/')
def serve_index():
    """Serve the main page"""
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/favicon.ico')
def serve_favicon():
    """Serve favicon or return 204 No Content"""
    try:
        return send_from_directory(app.static_folder, 'favicon.ico')
    except:
        # Return 204 No Content if favicon doesn't exist
        return '', 204


@app.route('/api/config')
def get_config():
    """Get CMS configuration for client-side use (all from environment)"""
    # Ensure we have a valid session
    try:
        session = cms._ensure_session()
    except:
        session = None
    
    return jsonify({
        'success': True,
        'cmsHost': cms._server_host,
        'storagePort': cms._storage_port,    # FILELOC=2 (recorded video)
        'downloadPort': cms._download_port,  # FILELOC=4 (downloads)
        'streamPort': cms._stream_port,      # Live streaming & FILELOC=1
        'webPort': cms._web_port,
        'jsession': session
    })


@app.route('/api/devices')
def get_devices():
    """Get all devices from CMS"""
    try:
        result = cms.get_all_devices()
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/device/<device_id>/status')
def get_device_status(device_id):
    """Get detailed status for a single device"""
    try:
        # Get plate number from query parameter if available
        plate_number = request.args.get('plateNumber', None)
        plate_type = request.args.get('plateType', None)
        
        # If plateType not provided, try to get it from device list
        if plate_type is None:
            try:
                devices_result = cms.get_all_devices()
                if devices_result.get('success'):
                    for device in devices_result.get('devices', []):
                        if (device.get('deviceId') == device_id or device.get('plateNumber') == plate_number):
                            plate_type = device.get('plateType')
                            if plate_type is not None:
                                print(f"[API] Found plateType={plate_type} for device {device_id}")
                                break
                    if plate_type is None:
                        print(f"[API] Warning: plateType not found for device {device_id}, plateNumber {plate_number}")
            except Exception as e:
                print(f"[API] Error getting plateType: {e}")
                pass  # If we can't get plateType, continue without it
        
        # plate_type might be a string (Chinese) or number, so pass it as-is and let cms_api handle conversion
        result = cms.get_device_status(device_id, plate_number, plate_type)
        if result['success'] and result.get('device'):
            return jsonify({'success': True, 'device': result['device']})
        return jsonify({'success': False, 'error': result.get('error', 'Device not found')})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/device/<device_id>/videos')
def get_device_videos(device_id):
    """Get video list for a device"""
    try:
        now = datetime.now(timezone.utc)
        year = int(request.args.get('year', now.year))
        month = int(request.args.get('month', now.month))
        day = int(request.args.get('day', now.day))
        channel = int(request.args.get('channel', 0))
        
        result = cms.get_video_list(device_id, year, month, day, channel)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/device/<device_id>/stream')
def get_device_stream(device_id):
    """Get live stream URL for a device"""
    try:
        channel = int(request.args.get('channel', 0))
        stream_type = int(request.args.get('streamType', 1))
        
        result = cms.get_realtime_stream_url(device_id, channel, stream_type)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/device/<device_id>/gps')
def get_device_gps(device_id):
    """Get GPS tracking data for a device"""
    try:
        start_time = request.args.get('start')
        end_time = request.args.get('end')
        
        if not start_time or not end_time:
            return jsonify({'success': False, 'error': 'start and end parameters are required'}), 400
        
        result = cms.get_gps_track(device_id, start_time, end_time)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/device/<device_id>/safety')
def get_device_safety(device_id):
    """Get Active Safety alarms (ADAS/DSM) for a device"""
    try:
        end = datetime.now(timezone.utc)
        start = request.args.get('start', (end.replace(day=1)).strftime('%Y-%m-%d %H:%M:%S'))
        end_str = request.args.get('end', end.strftime('%Y-%m-%d %H:%M:%S'))
        
        # Plate number is needed for safety alarms API
        plate_number = request.args.get('plateNumber', device_id)
        
        result = cms.get_safety_alarms(plate_number, start, end_str)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/video/proxy')
def proxy_video():
    """Proxy video stream to prevent auto-download and enable playback"""
    try:
        video_url = request.args.get('url', '')
        if not video_url:
            return jsonify({'success': False, 'error': 'Missing video URL'}), 400
        
        print(f"[VideoProxy] Requested URL: {video_url[:100]}...")
        
        # Convert WebSocket URL to HTTP if needed
        if video_url.startswith('ws://'):
            video_url = video_url.replace('ws://', 'http://', 1)
        elif video_url.startswith('wss://'):
            video_url = video_url.replace('wss://', 'https://', 1)
        
        # Handle HLS m3u8 playlists - proxy the content and rewrite URLs
        if '.m3u8' in video_url:
            print(f"[VideoProxy] HLS playlist, fetching: {video_url[:100]}...")
            
            # Get base URL for the HLS stream
            from urllib.parse import urlparse, urljoin, quote
            parsed = urlparse(video_url)
            base_url = f"{parsed.scheme}://{parsed.netloc}{'/'.join(parsed.path.rsplit('/', 1)[:-1])}/"
            
            # Fetch the HLS playlist
            response = requests.get(video_url, timeout=30)
            
            if response.status_code == 200:
                # Rewrite relative URLs in the playlist to go through our proxy
                content = response.text
                lines = content.split('\n')
                rewritten_lines = []
                
                for line in lines:
                    line = line.strip()
                    if line and not line.startswith('#'):
                        # This is a segment URL - could be relative or absolute
                        if line.startswith('http://') or line.startswith('https://'):
                            # Already absolute URL
                            segment_url = line
                        else:
                            # Relative URL - make it absolute
                            segment_url = urljoin(base_url, line)
                        
                        # Wrap in proxy URL
                        proxy_segment_url = f"/api/video/proxy?url={quote(segment_url, safe='')}"
                        rewritten_lines.append(proxy_segment_url)
                        print(f"[VideoProxy] Rewriting segment: {line[:50]}... -> proxy")
                    else:
                        rewritten_lines.append(line)
                
                rewritten_content = '\n'.join(rewritten_lines)
                
                return Response(
                    rewritten_content,
                    headers={
                        'Content-Type': 'application/vnd.apple.mpegurl',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-cache'
                    },
                    status=200
                )
            else:
                return Response(
                    response.content,
                    headers={
                        'Content-Type': 'application/vnd.apple.mpegurl',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-cache'
                    },
                    status=response.status_code
                )
        
        # Handle HLS .ts segments
        if '.ts' in video_url:
            print(f"[VideoProxy] HLS segment, fetching: {video_url[:100]}...")
            
            response = requests.get(video_url, stream=True, timeout=60)
            
            def generate_ts():
                try:
                    for chunk in response.iter_content(chunk_size=65536):
                        if chunk:
                            yield chunk
                except Exception as e:
                    print(f"[VideoProxy] TS segment stream error: {e}")
            
            return Response(
                stream_with_context(generate_ts()),
                headers={
                    'Content-Type': 'video/mp2t',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-cache'
                },
                status=response.status_code
            )
        
        print(f"[VideoProxy] Streaming video: {video_url[:100]}...")
        
        # Forward range header if present for seeking
        headers = {}
        range_header = request.headers.get('Range')
        if range_header:
            headers['Range'] = range_header
        
        # Helper function to try fetching video from a URL
        def try_fetch_video(url, location_name):
            try:
                print(f"[VideoProxy] Trying {location_name}...")
                resp = requests.get(url, stream=True, timeout=60, headers=headers)
                if resp.status_code in [200, 206]:
                    content_length = resp.headers.get('Content-Length')
                    if content_length and int(content_length) < 1000:
                        resp.close()
                        return None, None
                    return resp, None
                resp.close()
                return None, None
            except Exception as e:
                print(f"[VideoProxy] {location_name} failed: {e}")
                return None, None
        
        # Port mapping
        storage_port = cms._storage_port
        download_port = cms._download_port
        stream_port = cms._stream_port
        server_host = cms._server_host
        
        def switch_fileloc_and_port(url, new_fileloc):
            """Change FILELOC and corresponding port in URL"""
            url = re.sub(r'FILELOC=\d+', f'FILELOC={new_fileloc}', url)
            if new_fileloc == 2:
                url = re.sub(r':(\d{4,5})/', f':{storage_port}/', url)
            elif new_fileloc == 4:
                url = re.sub(r':(\d{4,5})/', f':{download_port}/', url)
            elif new_fileloc == 1:
                url = re.sub(r':(\d{4,5})/', f':{stream_port}/', url)
            return url
        
        # Build fallback list: Download Server → Storage → Device (all DownType=3)
        fallback_urls = []
        
        if 'DownType=3' in video_url:
            # Already DownType=3, try different FILELOC values
            fallback_urls = [
                (switch_fileloc_and_port(video_url, 4), 'Download Server'),
                (switch_fileloc_and_port(video_url, 2), 'Storage Server'),
                (switch_fileloc_and_port(video_url, 1), 'Device')
            ]
        else:
            # Other URL types (live streams, etc.) - use as-is
            fallback_urls = [(video_url, 'Original URL')]
        
        # Try each location until we get a valid response
        response = None
        initial_buffer = None
        successful_location = None
        for url, location_name in fallback_urls:
            response, initial_buffer = try_fetch_video(url, location_name)
            if response:
                successful_location = location_name
                video_url = url
                break
        
        if not response:
            return jsonify({'success': False, 'error': 'Video not available'}), 404
        
        print(f"[VideoProxy] SUCCESS from {successful_location}")
        
        # Check for error responses
        if response.status_code != 200 and response.status_code != 206:
            return jsonify({'success': False, 'error': f'CMS error {response.status_code}'}), response.status_code
        
        # Determine content type - DownType=3 always returns MP4
        content_type = response.headers.get('Content-Type', 'video/mp4')
        if 'text/html' in content_type.lower():
            return jsonify({'success': False, 'error': 'CMS returned error page'}), 500
        
        # DownType=3 returns MP4
        if 'DownType=3' in video_url or content_type == 'application/octet-stream' or content_type.lower() == 'flash':
            content_type = 'video/mp4'
        
        # Streaming with optional initial buffer from pre-buffering phase
        total_bytes = 0
        
        def generate():
            nonlocal total_bytes
            try:
                # First yield the initial buffer if we pre-buffered
                if initial_buffer:
                    total_bytes += len(initial_buffer)
                    yield initial_buffer
                
                # Then continue streaming the rest
                for chunk in response.iter_content(chunk_size=65536):
                    if chunk:
                        total_bytes += len(chunk)
                        yield chunk
            except Exception as e:
                print(f"[VideoProxy] Stream error: {e}")
            finally:
                print(f"[VideoProxy] Total bytes streamed: {total_bytes}")
        
        resp_headers = {
            'Content-Type': content_type,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers': 'Content-Length, Content-Range'
        }
        
        # Forward content-length and content-range headers
        if 'Content-Length' in response.headers:
            resp_headers['Content-Length'] = response.headers['Content-Length']
        if 'Content-Range' in response.headers:
            resp_headers['Content-Range'] = response.headers['Content-Range']
        
        return Response(
            stream_with_context(generate()),
            headers=resp_headers,
            status=response.status_code,
            mimetype=content_type
        )
    except requests.exceptions.Timeout:
        print(f"[VideoProxy] Timeout fetching video")
        return jsonify({'success': False, 'error': 'Video fetch timeout'}), 504
    except Exception as e:
        import traceback
        print(f"[VideoProxy] Error: {e}")
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/<path:path>')
def serve_static(path):
    """Serve static files - must be last route"""
    return send_from_directory(app.static_folder, path)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5002))
    print(f"\n{'='*50}")
    print(f"  Fleet Monitor Server")
    print(f"  Running on http://localhost:{port}")
    print(f"{'='*50}\n")
    app.run(host='0.0.0.0', port=port, debug=True)
