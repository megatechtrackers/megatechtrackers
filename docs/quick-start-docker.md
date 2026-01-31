# Quick Start - Docker Setup

Get all services running quickly for testing.

## Prerequisites

- Docker Desktop running
- Ports available: 3000, 3001, 3002, 6379

## Step 1: Start Docker Services

```bash
# Start Frappe stack (Frappe, web app, Access Gateway, Grafana, docs)
# Windows:
#   .\docker-start-frappe.ps1
# Linux/macOS:
#   ./docker-start-frappe.sh
#
# Manual equivalent:
docker compose --profile frappe up -d
```

This starts:
- ✅ Frappe Nginx Proxy (http://localhost:8000) → Frappe Framework
- ✅ Grafana Nginx Proxy (http://localhost:3000) → Grafana
- ✅ MariaDB (port 3306)
- ✅ Redis (port 6379)

## Step 2: Auto-provisioned keys

The start scripts automatically:
- create a **Grafana API key**
- generate a **Frappe API key/secret** (for `Administrator`)
- write them into a root `.env` (used by `docker-compose.yml`)

If you want to override them, edit `.env` and re-run `.\docker-start-frappe.ps1` / `./docker-start-frappe.sh`.

## Step 3: Wait for Frappe to Initialize

Frappe takes 3-5 minutes on first startup. Check logs:
```bash
docker compose logs -f frappe
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

## Step 4: Test Docker Services

1. **Frappe**: http://localhost:8000 ✅
2. **Grafana**: http://localhost:3000 ✅
3. **MariaDB**: localhost:3306 ✅
4. **Redis**: localhost:6379 ✅

## Step 5: Verify

- **Access Gateway**: http://localhost:3001/health ✅
- **API Docs**: http://localhost:3001/api-docs ✅
- **Web App**: http://localhost:3002 ✅
- **Docs**: http://localhost:8001 ✅

## Troubleshooting

### Services not starting
```bash
# Check logs
docker compose logs -f

# Check status
docker compose ps
```

### Access Gateway errors
- Verify Grafana is accessible
- Check API key is correct
- Verify `.env` file exists

### Port conflicts
- Change ports in `docker-compose.yml` if needed

### Frappe not starting
- Wait 3-5 minutes for first-time initialization
- Check logs: `docker compose logs -f frappe`
- Verify MariaDB is healthy: `docker compose ps mariadb`

## Stop Services

```bash
docker compose down
```

## Clean Start (Remove all data)

```bash
docker compose down -v
```
