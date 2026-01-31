# Operations Service

A simplified GPS Tracker Configuration System with IMEI as the primary identifier. Located at `ops_node/` in the repository.

## Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Next.js 14     │────▶│  FastAPI Backend │────▶│   PostgreSQL     │
│   Frontend       │     │  Python 3.11     │     │   Database       │
│   Port: 3000     │     │  Port: 8000      │     │   Port: 5432     │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                                           │
                                                           │
                         ┌──────────────────┐              │
                         │  Modem Service   │◀─────────────┘
                         │  Python Async    │
                         │  Huawei SMS API  │
                         └────────┬─────────┘
                                  │
                         ┌────────▼─────────┐
                         │  Huawei Modem    │
                         │  192.168.8.1     │
                         └──────────────────┘
```

## Features

- **Simplified Schema**: 5 tables instead of 10+
- **IMEI as Primary Key**: Real-world identifier for devices
- **Denormalized Design**: Fast queries, easy exports
- **Modern Stack**: FastAPI + Next.js 14 + PostgreSQL
- **Docker Ready**: Full containerization support

## Quick Start

### 1. Start with Docker Compose

```bash
# Start Operations Service backend and frontend (see root docker-compose.yml)
docker compose up -d ops-service-backend ops-service-frontend
```

### 2. Development Mode

```bash
# Run backend locally
cd ops_node/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Run frontend locally
cd ops_node/frontend
npm install
npm run dev
```

### 3. Access the Application

- **Operations UI**: http://localhost:13000 (Docker) or http://localhost:3000 (local dev)
- **API Docs**: http://localhost:18000/docs (Docker) or http://localhost:8000/docs (local)

## Database Schema

See [Database Schema](database.md). Key tables used by Operations Service:

- `device_config` - Device configuration templates
- `unit` - GPS tracker units (IMEI primary key)
- `unit_config` - Saved configuration values per unit
- `command_outbox` / `command_sent` / `command_history` - Command queue and history

## API Endpoints

### Devices
- `GET /api/devices/` - List device types
- `GET /api/devices/{device_name}/configs` - Get device configs
- `POST /api/devices/` - Create device config

### Units
- `GET /api/units/search?q=...` - Search units
- `GET /api/units/{imei}` - Get unit by IMEI
- `GET /api/units/{imei}/settings` - Get unit settings with values
- `GET /api/units/{imei}/commands` - Get available commands
- `PUT /api/units/{imei}/values` - Save configuration values

### Commands
- `POST /api/commands/{imei}/send` - Send command to unit
- `GET /api/commands/{imei}/history` - Get command history
- `GET /api/commands/outbox/pending` - Get pending commands (for modem)

## Configuration

### Environment Variables

**Backend:**
- `DATABASE_URL`: PostgreSQL connection string (default: `postgresql+asyncpg://postgres:postgres@localhost:5432/tracking_db`)
- `CORS_ORIGINS`: Allowed CORS origins (JSON array)
- `DEBUG`: Enable debug mode

**Frontend:**
- `NEXT_PUBLIC_API_URL`: Backend API URL

## Project Structure

```
ops_node/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── main.py         # Application entry
│   │   ├── config.py       # Configuration
│   │   ├── models/         # SQLAlchemy models
│   │   ├── routers/        # API routes
│   │   └── ...
│   └── requirements.txt
├── frontend/               # Next.js frontend
│   ├── app/                # App router pages
│   ├── components/        # React components
│   └── package.json
└── ...
```

## License

MIT
