# Access Gateway

**Last Updated**: 2026-02-01

## Setup (Docker)

Access Gateway runs in Docker as part of the Frappe stack:

```bash
.\docker-start-frappe.ps1
# or: ./docker-start-frappe.sh
# or: docker compose --profile frappe up -d
```

It will be available at:
- `http://localhost:3001/health`
- `http://localhost:3001/api-docs`

### Configure credentials

The start scripts generate a root `.env` automatically (Grafana + Frappe keys).
If you want to override them, edit `.env` and re-run the start script.

## Setup (Local dev - optional)

```bash
cd access_control_node
npm install
npm run dev
```

## Configuration

**Required**:
- `GRAFANA_URL` - Grafana instance URL
- `GRAFANA_API_KEY` or `GRAFANA_USER` + `GRAFANA_PASSWORD`
- `FRAPPE_URL` - Frappe instance URL
- `FRAPPE_API_KEY` + `FRAPPE_API_SECRET`

**Optional**:
- `PORT` (default: 3001)
- `NODE_ENV` (default: development)
- `LOG_LEVEL` (default: info)
- `ALLOWED_ORIGINS` (CORS)

## API Endpoints

### Grafana Integration
- `POST /api/grafana/generate-embed-url` - Generate authenticated embed URL
- `GET /api/grafana/validate-access` - Validate report access
- `GET /api/grafana/proxy/d/*` - Proxy dashboard requests

### Reports
- `GET /api/reports` - Get all Grafana reports (paginated)
- `GET /api/reports/user` - Get user-assigned reports

### Validation
- `GET /api/validate-embed-token` - Validate embed token

### System
- `GET /health` - Health check
- `GET /metrics` - Prometheus metrics
- `GET /api-docs` - Swagger UI documentation

## Security

- Rate limiting: 100 req/15min per IP
- Audit logging: All embed URL generation logged
- Filter validation: Server-side enforcement
- Session validation: Frappe session checked

## Grafana Configuration

Configure dashboard variables for filtering (as needed).

## Troubleshooting

- **Connection issues**: Verify Grafana URL and API key
- **Auth failures**: Check API key permissions
- **Filter errors**: Verify user context in Frappe
