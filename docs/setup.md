# Setup Guide

**Last Updated**: 2026-02-01

## Prerequisites

- Node.js 20+, Python 3.11+, Docker 24+, Docker Compose 2.20+

## Installation

### 1. Install Dependencies
```bash
# Install Web App dependencies
cd web_app_node && npm install

# Install Access Gateway dependencies
cd access_control_node && npm install

# Install Mobile App dependencies (optional)
cd mobile_app_node && npm install
```

### 2. Frappe Setup

**Option A: Docker (Recommended)**
```bash
.\docker-start-frappe.ps1
# or: ./docker-start-frappe.sh
# or: docker compose --profile frappe up -d
# Wait for: ✅ megatechtrackers app installed!
```

**Option B: Local Installation**
```bash
cp -r frappe_apps/megatechtrackers /path/to/frappe-bench/apps/
bench --site [site] install-app megatechtrackers
bench --site [site] migrate
```

See [frappe-setup-guide.md](frappe-setup-guide.md) for detailed instructions.

### 3. Configure Environment

Docker auto-generates a root `.env` (Grafana + Frappe keys) when you run the start script.

**Web App** (`web_app_node/.env.local`):
```env
NEXT_PUBLIC_FRAPPE_URL=http://localhost:8000
NEXT_PUBLIC_ACCESS_GATEWAY_URL=http://localhost:3001
```

### 4. Run Services

**Terminal 1 - Web App:**
```bash
cd web_app_node
npm run dev
```

**Terminal 2 - Access Gateway:**
```bash
cd access_control_node
npm run dev
```

**Terminal 3 - Mobile App (optional):**
```bash
cd mobile_app_node
npm start
```

## Docker

```bash
# Core tracking stack (Postgres, RabbitMQ, parsers, etc.)
docker compose up -d

# Frappe stack (web app, API gateway, Grafana, docs)
docker compose --profile frappe up -d
```

## Mobile App Setup

```bash
cd mobile_app_node
npm install
# Create .env with EXPO_PUBLIC_* variables
npm start
```

## API Documentation

Access Swagger UI at: `http://localhost:3001/api-docs`

## Next Steps

1. Create users in Frappe
2. Assign forms and reports
3. Access API docs at `/api-docs`

For details, see:
- [index.md](index.md) - Documentation home
- [docker.md](docker.md) - Docker setup guide
- [quick-start-docker.md](quick-start-docker.md) - Docker quick start
