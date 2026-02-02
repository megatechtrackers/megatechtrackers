# Frappe Setup

**Last Updated**: 2026-02-01

## Installation

```bash
# Copy app
cp -r frappe_apps/megatechtrackers /path/to/frappe-bench/apps/

# Install
bench --site [site] install-app megatechtrackers
bench --site [site] migrate
```

## Configuration

Add to `site_config.json`:
```json
{
  "access_gateway_url": "http://localhost:3001"
}
```

## DocTypes Created

- **Megatechtrackers Access Control**: Main access management
- **AC Frappe Form Assignment**: Form assignments (child table)
- **AC Grafana Report Assignment**: Report assignments (child table)
- **AC Vehicle/Company/Department Assignment**: Context assignments

## Usage

1. Navigate to Megatechtrackers Access Control
2. Create record for user
3. Click "Fetch Available Forms" or "Fetch Available Reports"
4. Select and assign items
5. Set context (vehicles, companies, departments)

## API Endpoints

All under `/api/method/megatechtrackers.api.*`:
- `permissions.get_user_permissions`
- `permissions.get_user_forms`
- `permissions.get_user_reports`
- `permissions.get_user_context`
- `permissions.get_available_forms`
- `permissions.validate_report_access`
- `grafana.get_available_reports`

## Permissions

Default: System Manager and Administrator only. Adjust in DocType settings.
