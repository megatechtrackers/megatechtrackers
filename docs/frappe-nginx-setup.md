# Frappe Nginx Proxy Setup

## ⚠️ Required Setup

This is **not optional** - nginx proxy is **required** for the mobile app to work properly.

## Problem

Frappe's development server (Werkzeug) sends incorrect `Content-Length` headers, causing `ERR_CONTENT_LENGTH_MISMATCH` errors in WebViews and browsers. This results in:
- Pages loading incompletely
- Constant reloads and retries
- Poor user experience in mobile apps
- Inconsistent behavior

## Solution

Put **nginx as a reverse proxy** in front of Frappe (already configured). Nginx will:
1. **Buffer responses** from Frappe's dev server
2. **Calculate correct Content-Length** headers
3. **Fix Content-Length mismatches** at the proxy level
4. Provide **production-ready** request handling
5. Enable proper **caching and compression**

## Architecture

```
Mobile App / Browser
        ↓
    Port 8000 (nginx)
        ↓
    Port 8080 (frappe-nginx container)
        ↓
  Internal frappe:8000 (Frappe dev server)
```

## Setup Instructions

### 1. Stop Existing Containers

```bash
docker-compose down
```

### 2. Start with Nginx Proxy

```bash
docker-compose up -d frappe-nginx
```

This will:
- Start MariaDB, Redis, Frappe
- Start the new `frappe-nginx` container
- Expose Frappe through nginx on port 8000

### 3. Verify Setup

Check that nginx is proxying correctly:

```bash
# Test through nginx (should work without Content-Length errors)
curl -I http://localhost:8000/api/method/ping

# Test direct to Frappe (for debugging, may have Content-Length issues)
curl -I http://localhost:8001/api/method/ping
```

### 4. Update Mobile App Connection

The Mobile App should connect to:
```
http://10.0.2.2:8000  # Android emulator → nginx → Frappe
```

This is already configured in `mobile_app_node/src/lib/urls.ts`.

## Port Mapping

| Service | Port | Description |
|---------|------|-------------|
| `frappe-nginx` | 8000 | **Main entry point** - nginx proxy to Frappe |
| `frappe` | 8001 | Direct Frappe access (debugging only) |
| `frappe` | 9001 | SocketIO direct access |

## Configuration Files

### 1. `docker/nginx/frappe-nginx.conf`
- Main nginx configuration
- Proxy settings with proper buffering
- Timeout configuration
- Static file caching
- WebSocket support for SocketIO

### 2. `docker-compose.yml`
- `frappe-nginx` service definition
- Port mappings
- Health checks

### 3. `docker/frappe/init-frappe.sh`
- Increased HTTP timeout settings
- Improved buffering configuration

## Benefits

### Before (Direct Frappe)
- ❌ Content-Length mismatch errors
- ❌ Incomplete page loads
- ❌ Constant retries
- ❌ Unpredictable behavior

### After (Through Nginx)
- ✅ Correct Content-Length headers
- ✅ Complete, reliable page loads
- ✅ No retries needed
- ✅ Production-ready setup
- ✅ Better performance with caching
- ✅ Proper gzip compression

## Troubleshooting

### Still seeing Content-Length errors?

1. **Check you're connecting through nginx:**
   ```bash
   # Should show nginx in headers
   curl -I http://localhost:8000/api/method/ping | grep -i server
   ```

2. **Check nginx is running:**
   ```bash
   docker ps | grep frappe-nginx
   ```

3. **Check nginx logs:**
   ```bash
   docker logs frappe-proxy
   ```

4. **Verify Frappe is healthy:**
   ```bash
   docker exec frappe curl -f http://localhost:8000/api/method/ping
   ```

### Direct Frappe access still has issues

That's expected! The Frappe dev server on port 8001 will still have Content-Length issues. Always use port 8000 (nginx) for normal operation.

## Production Considerations

For production deployment:

1. **Use Gunicorn** instead of Frappe's dev server
2. **SSL/TLS** configuration in nginx
3. **Rate limiting** in nginx
4. **Load balancing** for multiple Frappe instances
5. **Separate nginx container** or use host nginx

The current setup provides a solid foundation for production hardening.

## Monitoring

Monitor nginx performance:

```bash
# Access logs
docker exec frappe-proxy tail -f /var/log/nginx/frappe-access.log

# Error logs
docker exec frappe-proxy tail -f /var/log/nginx/frappe-error.log
```

## References

- [Frappe Framework Documentation](https://frappeframework.com/docs)
- [Nginx Reverse Proxy Guide](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/)
- [WebView Content-Length Issues](https://developer.android.com/reference/android/webkit/WebView)

