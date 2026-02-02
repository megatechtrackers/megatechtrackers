# Web App

**Last Updated**: 2026-02-01

## Setup (Docker)

Next.js runs in Docker as part of the Frappe stack:

```bash
.\docker-start-frappe.ps1
# or: ./docker-start-frappe.sh
# or: docker compose --profile frappe up -d
```

Open: `http://localhost:3002`

## Setup (Local dev - optional)

```bash
cd web_app_node
npm install
npm run dev
```

## Configuration

**`.env.local` (local dev)**:
```env
NEXT_PUBLIC_FRAPPE_URL=http://localhost:8000
NEXT_PUBLIC_ACCESS_GATEWAY_URL=http://localhost:3001
```

## Features

- Frappe authentication
- Forms/reports in iframes
- Navbar with user menu
- Sidebar with forms/reports
- Content area for iframes
- Error boundaries

## Components

- `Navbar`: User menu, notifications
- `Sidebar`: Forms/reports navigation
- `ContentArea`: Iframe display
- `Login`: Sign-in page
- `ErrorBoundary`: Error handling

## Development

```bash
cd web_app_node
npm run dev    # Development
npm run build  # Production build
npm start      # Production server
```

## Deployment

- Vercel: Connect repo, set env vars
- Docker: Use provided Dockerfile
- Custom: Build and deploy `dist/`
