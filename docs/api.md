# API Documentation

**Last Updated**: 2025-12-23

**📚 Complete Documentation**: See [api-complete.md](./api-complete.md) for full API reference

**Interactive Documentation**:
- **Access Gateway API**: [Swagger UI](http://localhost:3001/api-docs) (OpenAPI 3.0)
- **Frappe API**: [Swagger UI](http://localhost:3001/frappe-api-docs) | [OpenAPI Spec](./frappe-api-openapi.yaml)

---

## Quick Reference

### Frappe API Endpoints

Base: `http://your-frappe-site/api/method/`

### Get User Permissions
**Endpoint**: `megatechtrackers.api.permissions.get_user_permissions`  
**Method**: GET  
**Params**: `user` (optional)

**Response**:
```json
{
  "message": {
    "forms": [{"name": "...", "label": "...", "inherited": false}],
    "reports": [{"id": 1, "uid": "...", "name": "...", "context": {...}}],
    "context": {"vehicles": [], "companies": [], "departments": []}
  }
}
```

### Get Available Forms
**Endpoint**: `megatechtrackers.api.permissions.get_available_forms`  
**Method**: GET

### Get User Reports
**Endpoint**: `megatechtrackers.api.permissions.get_user_reports`  
**Method**: GET  
**Params**: `user` (optional)

### Validate Report Access
**Endpoint**: `megatechtrackers.api.permissions.validate_report_access`  
**Method**: POST  
**Body**: `{"user": "...", "report_id": 1}`

### Get Available Grafana Reports
**Endpoint**: `megatechtrackers.api.grafana.get_available_reports`  
**Method**: GET

## Access Gateway API

Base: `http://localhost:3001/api/`

### Generate Embed URL
**Endpoint**: `/grafana/generate-embed-url`  
**Method**: POST  
**Headers**: `X-Frappe-User` (required)

**Body**:
```json
{
  "reportId": 1,
  "reportUid": "abc123",
  "filters": {"vehicle": "V001", "company": "Company A"},
  "frappeUser": "user@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "embedUrl": "http://localhost:3000/d/abc123?token=TOKEN&kiosk=1&orgId=1&var-vehicle=V001&var-vehicle-locked=true",
  "expiresAt": "2025-12-23T12:00:00.000Z"
}
```

### Get Available Reports
**Endpoint**: `/reports`  
**Method**: GET  
**Headers**: `X-Frappe-User` (required)

### Get User Reports
**Endpoint**: `/reports/user`  
**Method**: GET  
**Headers**: `X-Frappe-User` (required)

### Health Check
**Endpoint**: `/health`  
**Method**: GET

## Authentication

- **Frappe API**: Session cookies or API key (`Authorization: token key:secret`)
- **Access Gateway**: `X-Frappe-User` header (required), `X-Frappe-Session-Id` (optional)

## Rate Limiting

- 100 requests per 15 minutes per IP
- Returns 429 when exceeded

## Error Codes

- `200`: Success
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `429`: Rate Limited
- `500`: Server Error
