# Docker Setup Guide

Complete Docker environment for Megatechtrackers project.

## Architecture

**Docker Services (run in containers):**
- **Frappe Nginx Proxy** (Port 8000) - Reverse proxy for Frappe (fixes Content-Length issues)
- **Frappe Framework** (Internal) - Backend API (accessed via nginx)
- **Grafana Nginx Proxy** (Port 3000) - Reverse proxy for Grafana (token validation)
- **Grafana** (Internal) - Dashboard/Reports (accessed via nginx)
- **MariaDB** (Port 3306) - Database
- **Redis** (Port 6379) - Caching
- **Access Gateway** (Port 3001) - Token generation + validation + proxy
- **Web App** (Port 3002) - Web frontend
- **Docs** (Port 8001) - MkDocs documentation (optional)
- **React Native / Expo** (Ports 19000-19006) - Mobile dev server (optional)

## Quick Start

### Windows (PowerShell)
```powershell
.\docker-start-frappe.ps1
```

### Linux/Mac (Bash)
```bash
chmod +x docker-start-frappe.sh
./docker-start-frappe.sh
```

### Manual Start
```bash
docker compose --profile frappe up -d
```

## Frappe Docker Setup Details

Frappe Docker setup handles the following automatically:

1. **Initialization Process**: Frappe needs to:
   - Wait for MariaDB to be ready
   - Initialize bench (Frappe's workspace)
   - Create a site
   - Install apps (like megatechtrackers)
   - Run migrations

2. **Dependencies**: Frappe requires:
   - MariaDB/MySQL connection
   - Redis for caching/queues
   - Proper volume mounts for persistence
   - Custom initialization scripts

3. **Our Solution**: 
   - Uses official `frappe/bench:latest` image
   - Custom `init-frappe.sh` script handles initialization
   - Automatically installs `megatechtrackers` app
   - Waits for MariaDB before starting
   - Handles first-time setup and subsequent restarts

## Services Details

### Frappe Nginx Proxy (Required)
- **Image**: `nginx:alpine`
- **Port**: 8000 (external) → 8080 (internal nginx) → Frappe:8000
- **Purpose**: Fixes Frappe's Content-Length header issues
- **Configuration**: `docker/nginx/frappe-nginx.conf`
- **Features**: Response buffering, compression, WebSocket support
- **Access**: http://localhost:8000

### Frappe Framework
- **Image**: `frappe/bench:latest` (official)
- **Ports**: Internal only (accessed via nginx proxy)
- **Initialization**: 3-5 minutes on first startup
- **Health Check**: `/api/method/ping`
- **Credentials**: Administrator / admin
- **Note**: Always access through nginx on port 8000, not directly

### Grafana
- **Image**: `grafana/grafana:latest`
- **Port**: 3000
- **Access**: http://localhost:3000 (admin / admin)

### MariaDB
- **Image**: `mariadb:10.11`
- **Port**: 3306
- **Credentials**: root/admin, frappe/frappe

### Redis
- **Image**: `redis:7-alpine`
- **Port**: 6379

## Initial Setup

### 1. Wait for Frappe Initialization

Frappe takes 3-5 minutes on first startup. Monitor logs:
```bash
docker compose logs -f frappe
```

Look for:
```
✅ MariaDB is ready!
✅ Site created!
✅ megatechtrackers app installed!
🚀 Starting Frappe...
```

### 2. Verify Frappe is Running

```bash
curl http://localhost:8000/api/method/ping
```

Should return: `{"message":"pong"}`

### 3. Auto-provisioned keys

The start scripts automatically:
- create a **Grafana API key**
- generate a **Frappe API key/secret** (for `Administrator`)
- write them into a root `.env` (used by `docker-compose.yml`)

### 4. Services

All services (Access Gateway + Next.js + Docs) are started by the Docker script by default.

## Access Points

- **Frappe**: http://localhost:8000
- **Grafana**: http://localhost:3000
- **Access Gateway**: http://localhost:3001/health
- **API Documentation**: http://localhost:3001/api-docs
- **Web App**: http://localhost:3002
- **Docs**: http://localhost:8001

## Useful Commands

```bash
# View all logs
docker compose logs -f

# View specific service logs
docker compose logs -f frappe
docker compose logs -f grafana

# Stop all services
docker compose down

# Stop and remove volumes (clean slate)
docker compose down -v

# Restart a service
docker compose restart frappe

# Execute command in container
docker exec -it frappe bash
docker exec -it grafana sh

# Check service health
docker compose ps

# Rebuild after code changes
docker compose up --build -d
```

## Troubleshooting

### Frappe not starting
- **Check MariaDB**: `docker compose ps mariadb`
- **Check logs**: `docker compose logs frappe`
- **Wait longer**: First startup takes 3-5 minutes
- **Check app mount**: `docker exec -it frappe ls -la /workspace/apps/`
- **Manual install**: If app didn't install, run:
  ```bash
  docker exec -it frappe bash
  cd /workspace/frappe-bench
  bench --site site1.localhost install-app megatechtrackers
  ```

### Access Gateway can't connect to Frappe
- Ensure Frappe is running: `curl http://localhost:8000/api/method/ping`
- Check `.env` file has correct `FRAPPE_URL`
- Verify API key/secret are correct
- Check network: Services should use `http://localhost:8000` (not container name)

### Port conflicts
- Change ports in `docker-compose.yml` if needed
- Grafana: 3000
- Frappe: 8000, 9000
- MariaDB: 3306
- Redis: 6379

### Database connection issues
- Ensure MariaDB is healthy before Frappe starts
- Check database credentials in `docker-compose.yml`
- Verify MariaDB is accessible: `docker exec -it mariadb mysql -u root -padmin`

## Data Persistence

All data is stored in Docker volumes:
- `mariadb-data` - Database data
- `redis-data` - Cache data
- `frappe-data` - Frappe files and sites
- `grafana-data` - Grafana dashboards and config

To reset everything:
```bash
docker compose down -v
```

## Updating Access Control App

If you modify the `megatechtrackers` app:

1. Stop Frappe: `docker compose stop frappe`
2. Update code in `frappe_apps/megatechtrackers/`
3. Restart: `docker compose start frappe`
4. Run migrations:
   ```bash
   docker exec -it frappe bash
   cd /workspace/frappe-bench
   bench --site site1.localhost migrate
   ```

## Environment Variables

The start scripts generate a root `.env` automatically (Grafana + Frappe keys).
You can override any value in `.env` and re-run the start script.

## Troubleshooting

### "lookup registry-1.docker.io: no such host" when building

Your machine can reach the internet, but **Docker Desktop’s network cannot resolve** `registry-1.docker.io`. Builds fail when pulling base images (e.g. `node:20-alpine`, `alpine:3.19`, `python:3.11-slim-bookworm`).

**Fix: give Docker a working DNS**

1. Open **Docker Desktop** → **Settings** (gear icon).
2. Go to **Docker Engine**.
3. In the JSON, add a `"dns"` key (or merge with existing keys). Example:
   ```json
   {
     "builder": { ... },
     "dns": ["8.8.8.8", "8.8.4.4"]
   }
   ```
   Use **Apply and restart**.
4. Retry the build (e.g. `docker compose build` or your clean-restart script).

If the error persists:

- **Resources → Network**: check if there is a DNS override and set it to `8.8.8.8` (or your preferred resolver).
- **WSL 2**: ensure Windows has a working DNS (e.g. adapter DNS `8.8.8.8` / `8.8.4.4`) so the WSL/Docker VM gets it.
- Restart Docker Desktop after changing DNS.
