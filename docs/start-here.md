# 🚀 Quick Start - Docker Setup

This guide will help you get all services running quickly.

## Architecture

**Docker Services:**
- ✅ **Frappe Nginx Proxy** - Backend API reverse proxy (http://localhost:8000)
- ✅ **Frappe Framework** - ERP backend (internal, accessed via nginx)
- ✅ **Grafana Nginx Proxy** - Dashboard reverse proxy (http://localhost:3000)
- ✅ **Grafana** - Analytics (internal, accessed via nginx)
- ✅ **MariaDB** - Database (port 3306)
- ✅ **Redis** - Caching (port 6379)

**Services (run in containers):**
- ✅ **Access Gateway** - Token + embed + proxy API (http://localhost:3001)
- ✅ **Web App** - Web frontend (http://localhost:3002)
- ✅ **Mobile App** - Mobile dev server (http://localhost:19000)

## Step 1: Start Docker Services

### Windows (PowerShell)
```powershell
.\docker-start-frappe.ps1
```
Or for the full tracking stack (Postgres, RabbitMQ, parsers, etc.): `.\complete-clean-restart.ps1`

### Linux/Mac
```bash
chmod +x docker-start-frappe.sh
./docker-start-frappe.sh
```
Or: `docker compose --profile frappe up -d`

### Manual
```bash
docker compose --profile frappe up -d
```

This will start:
- MariaDB on port 3306
- Redis on port 6379
- Frappe on port 8000 (takes 3-5 minutes to initialize)
- Grafana on port 3000

## Step 2: Wait for Frappe to Initialize

Frappe takes 3-5 minutes on first startup. Check logs:
```bash
docker compose --profile frappe logs -f frappe
```

Wait until you see:
```
✅ megatechtrackers app installed!
🚀 Starting Frappe...
```

Then verify it's running:
```bash
curl http://localhost:8000/api/method/ping
```

## Step 3: Auto-provisioned keys

The start scripts automatically:
- create a **Grafana API key**
- generate a **Frappe API key/secret** (for `Administrator`)
- write them into a root `.env` (used by `docker-compose.yml`)

## Step 4: Stack services

By default, the Docker start script brings up:
- Frappe + MariaDB + Redis
- Grafana + Nginx
- Access Gateway (API)
- Next.js (web)
- MkDocs (docs)

### (Optional) Override generated keys

Edit the root `.env` file and re-run the start script.

## Step 5: Test Everything

1. **Frappe**: http://localhost:8000 ✅
2. **Grafana**: http://localhost:3000 ✅
3. **Access Gateway**: http://localhost:3001/health ✅
4. **API Docs**: http://localhost:3001/api-docs ✅
5. **Web App**: http://localhost:3002 ✅
6. **Docs**: http://localhost:8001 ✅
7. **Mobile (Expo)**: http://localhost:19000 ✅

## Quick Commands

```bash
# View Docker logs
docker compose logs -f

# View specific service logs
docker compose logs -f frappe
docker compose logs -f grafana

# Stop Docker services
docker compose down

# Restart a service
docker compose restart frappe

# Check service health
docker compose ps
```

## Troubleshooting

### Frappe not starting
- Check MariaDB is healthy: `docker compose ps mariadb`
- Check logs: `docker compose logs frappe`
- Wait 3-5 minutes for first-time initialization
- Verify megatechtrackers app is mounted: `docker exec -it frappe ls -la /workspace/apps/`

### Access Gateway can't connect to Frappe
- Ensure Frappe is running: `curl http://localhost:8000/api/method/ping`
- Check `.env` file has correct `FRAPPE_URL`
- Verify API key/secret are correct

### Port conflicts
- Change ports in `docker-compose.yml` if needed
- Grafana: 3000
- Frappe: 8000, 9000
- MariaDB: 3306
- Redis: 6379

## Next Steps

1. Create users in Frappe
2. Assign forms and reports to users
3. Test the Web App login
4. View Grafana reports in the app

For detailed setup, see:
- [frappe-setup-guide.md](frappe-setup-guide.md) - Frappe Docker details
- [docker.md](docker.md) - Complete Docker documentation
- [quick-start-docker.md](quick-start-docker.md) - Docker quick start
