# Nginx Token Validation Setup

This setup uses Nginx as a reverse proxy in front of Grafana to validate time-limited tokens before allowing access to dashboards.

## Architecture

```
User → Nginx (validates token) → Access Gateway (checks Redis) → Grafana (anonymous)
```

## How it works

1. **Token generation**: Access Gateway generates a random token and stores it in Redis with 1-hour expiration
2. **Embed URL**: Service returns a URL like `http://localhost:3000/d/dashboard-uid?token=abc123...`
3. **Nginx validation**: When the user accesses the URL, Nginx intercepts the request
4. **Token check**: Nginx calls the Access Gateway validation endpoint
5. **Access control**: If token is valid and not expired, Nginx forwards to Grafana; otherwise returns 403

## Components

### 1) Nginx configuration (`docker/nginx/nginx.conf`)

- Listens on port 3000
- Intercepts `/d/*` (dashboard) requests
- Forwards dashboard requests to Access Gateway for validation + proxying

### 2) Access Gateway validation endpoint

- Route: `GET /api/validate-embed-token`
- Checks Redis for token
- Validates expiration and dashboard UID match
- Returns 200 if valid, 403 if invalid/expired

### 3) Token storage

- Tokens stored in Redis with key: `embed_token:{token}`
- TTL: 3600 seconds (1 hour)
- Data includes: dashboard UID, user ID, expiration, filters

## Setup

1. **Start services**:

```bash
docker compose up -d nginx grafana access-gateway redis
```

2. **Verify Nginx is running**:

```bash
docker logs grafana-proxy
```

3. **Test token validation**:
- Generate embed URL via Access Gateway API
- Access URL in browser
- It should load dashboard if token is valid

## Security features

- Time-limited tokens (1 hour expiration)
- Token validation before dashboard access
- Dashboard UID matching (token only works for specific dashboard)
- Automatic cleanup (Redis TTL)
- No user management in Grafana (anonymous mode)

## Troubleshooting

### Nginx can't reach Access Gateway
- Verify `access-gateway` container is running: `docker compose ps`
- Check Nginx logs: `docker logs grafana-proxy`

### Token validation fails
- Check Redis is running and accessible
- Verify token exists in Redis: `redis-cli GET embed_token:{token}`
- Check Access Gateway logs for validation errors

### 403 Forbidden errors
- Token may be expired (check expiration timestamp)
- Token may not match dashboard UID
- Check Nginx error logs for details

## Configuration

### Token expiration

Edit `services/access-gateway/src/services/grafanaService.ts`:

```typescript
const expiresAt = Math.floor(Date.now() / 1000) + 3600; // Change 3600 to desired seconds
await setCache(`embed_token:${token}`, tokenData, 3600); // Update TTL here too
```

### Nginx timeout

Edit `docker/nginx/nginx.conf` to add timeout settings if needed:

```nginx
proxy_connect_timeout 5s;
proxy_send_timeout 5s;
proxy_read_timeout 5s;
```

