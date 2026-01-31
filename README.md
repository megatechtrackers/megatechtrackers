# Megatechtrackers

High-performance GPS/telematics tracking platform for fleet management, vehicle tracking, and IoT device monitoring. Microservices architecture with real-time processing, Grafana dashboards, and Frappe-based access control.

## Documentation

**All documentation lives in the [`docs/`](docs/) folder.**

- **[Start here](docs/start-here.md)** – Quick start with Docker
- **[Docker setup](docs/docker.md)** – Full Docker guide
- **[API reference](docs/api-complete.md)** – REST API
- **[Index](docs/index.md)** – Full documentation index

To serve the docs locally (MkDocs):

```bash
docker compose --profile frappe up -d docs   # http://localhost:8001
# or: mkdocs serve
```

## Quick start

```powershell
# Windows
.\complete-clean-restart.ps1

# Optional: add Frappe, web app, mobile app
docker compose --profile frappe up -d
```

```bash
# Linux/Mac
docker compose up -d
docker compose --profile frappe up -d   # optional
```

## License

MIT – see [LICENSE](LICENSE).
