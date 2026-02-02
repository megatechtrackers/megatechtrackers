# Quick Start

**Last Updated**: 2026-02-01

## 5-Minute Setup

### Option 1: Docker (Recommended)

```bash
# 1. Start Docker services (Frappe stack: web app, API, Grafana)
.\docker-start-frappe.ps1
# or: ./docker-start-frappe.sh
# or: docker compose --profile frappe up -d

# 2. Wait for Frappe (3-5 minutes)
docker compose --profile frappe logs -f frappe
# Wait for: ✅ megatechtrackers app installed!

# 3. Done
```
**Complete clean restart (full stack):**

| Mode       | Windows (PowerShell)              | Linux/macOS (Bash)                 |
|-----------|------------------------------------|------------------------------------|
| **Test**  | `.\complete-clean-restart-test.ps1` | `./complete-clean-restart-test.sh` |
| **Prod**  | `.\complete-clean-restart.ps1`     | `./complete-clean-restart.sh`      |

Test mode adds Mock Tracker, MailHog, Mock SMS, and alarm-service-test. Make scripts executable: `chmod +x *.sh`.

### Option 2: Local Frappe

```bash
# 1. Install dependencies
cd web_app_node && npm install
cd access_control_node && npm install

# 2. Configure .env files (see setup.md)

# 3. Setup Frappe
cp -r frappe_apps/megatechtrackers /path/to/frappe-bench/apps/
bench --site [site] install-app megatechtrackers
bench --site [site] migrate

# 4. Run services (in separate terminals)
# Terminal 1: cd web_app_node && npm run dev
# Terminal 2: cd access_control_node && npm run dev
```

## What's Next?

1. Create users in Frappe
2. Assign forms and reports
3. Verify authentication

See [setup.md](setup.md) for details. For Docker setup, see [quick-start-docker.md](quick-start-docker.md).
