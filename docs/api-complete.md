# Complete API Documentation

**Last Updated**: 2026-02-01

**Interactive Documentation**:
- **Access Gateway API**: [Swagger UI](http://localhost:3001/api-docs) (OpenAPI 3.0)
- **Frappe API**: [OpenAPI Spec](./frappe-api-openapi.yaml) | [View in Swagger Editor](https://editor.swagger.io/?url=https://raw.githubusercontent.com/your-repo/frappe-api-openapi.yaml)

---

## Table of Contents

1. [Frappe API Endpoints](#frappe-api-endpoints)
2. [Access Gateway API](#access-gateway-api)
3. [Authentication](#authentication)
4. [Error Handling](#error-handling)
5. [Rate Limiting](#rate-limiting)

---

## Frappe API Endpoints

**Base URL**: `http://your-frappe-site/api/method/`

All Frappe endpoints require authentication via session cookies or API key.

### Permissions

#### Get User Permissions
Get all permissions (forms, reports, context) for a user.

**Endpoint**: `megatechtrackers.api.permissions.get_user_permissions`  
**Method**: `GET`  
**Authentication**: Required

**Query Parameters**:
- `user` (optional): Username. Defaults to current user.

**Response**:
```json
{
  "message": {
    "forms": [
      {
        "name": "AC Company",
        "label": "Company",
        "url": "/app/ac-company",
        "inherited": false
      }
    ],
    "reports": [
      {
        "id": 1,
        "uid": "abc123",
        "name": "Sales Dashboard",
        "context": {
          "vehicles": ["V001"],
          "companies": ["Company A"]
        }
      }
    ],
    "context": {
      "vehicles": ["V001", "V002"],
      "companies": ["Company A"],
      "departments": ["Sales"]
    }
  }
}
```

#### Get User Forms
Get all forms assigned to a user.

**Endpoint**: `megatechtrackers.api.permissions.get_user_forms`  
**Method**: `GET`

**Query Parameters**:
- `user` (optional): Username. Defaults to current user.

**Response**:
```json
{
  "message": [
    {
      "name": "AC Company",
      "label": "Company",
      "url": "/app/ac-company",
      "inherited": false
    }
  ]
}
```

#### Get User Reports
Get all reports assigned to a user.

**Endpoint**: `megatechtrackers.api.permissions.get_user_reports`  
**Method**: `GET`

**Query Parameters**:
- `user` (optional): Username. Defaults to current user.

**Response**:
```json
{
  "message": [
    {
      "id": 1,
      "uid": "abc123",
      "name": "Sales Dashboard",
      "context": {}
    }
  ]
}
```

#### Get User Context
Get context scope (vehicles, companies, departments) for a user.

**Endpoint**: `megatechtrackers.api.permissions.get_user_context`  
**Method**: `GET`

**Query Parameters**:
- `user` (optional): Username. Defaults to current user.

**Response**:
```json
{
  "message": {
    "vehicles": ["V001", "V002"],
    "companies": ["Company A"],
    "departments": ["Sales"]
  }
}
```

### Forms

#### Get Available Forms
Get all available Frappe forms with pagination.

**Endpoint**: `megatechtrackers.api.permissions.get_available_forms`  
**Method**: `GET`

**Query Parameters**:
- `page` (optional): Page number. Default: 1
- `limit` (optional): Items per page (max 100). Default: 20

**Response**:
```json
{
  "message": {
    "forms": [
      {
        "name": "AC Company",
        "label": "Company",
        "url": "/app/ac-company",
        "type": "doctype"
      }
    ],
    "total": 50,
    "page": 1,
    "limit": 20,
    "has_more": true
  }
}
```

#### Add Form Assignment
Assign a form to a user. (System Manager only)

**Endpoint**: `megatechtrackers.api.permissions.add_form_assignment`  
**Method**: `POST`

**Request Body**:
```json
{
  "user": "user@example.com",
  "form_name": "AC Company",
  "form_label": "Company",
  "form_url": "/app/ac-company"
}
```

**Response**:
```json
{
  "message": {
    "success": true
  }
}
```

#### Remove Form Assignment
Remove a form assignment from a user. (System Manager only)

**Endpoint**: `megatechtrackers.api.permissions.remove_form_assignment`  
**Method**: `POST`

**Request Body**:
```json
{
  "user": "user@example.com",
  "form_name": "AC Company"
}
```

**Response**:
```json
{
  "message": {
    "success": true
  }
}
```

#### Bulk Assign Forms
Assign multiple forms to multiple users based on filters. (System Manager only)

**Endpoint**: `megatechtrackers.api.permissions.bulk_assign_forms`  
**Method**: `POST`

**Request Body**:
```json
{
  "form_names": ["AC Company", "AC Department"],
  "user_filters": {
    "ac_user_type": "Client - Company",
    "ac_parent_company": "Company A"
  }
}
```

**Response**:
```json
{
  "message": {
    "success": true,
    "assigned_count": 10,
    "users_affected": 5
  }
}
```

### Reports

#### Validate Report Access
Validate if user has access to a specific report.

**Endpoint**: `megatechtrackers.api.permissions.validate_report_access`  
**Method**: `POST`

**Request Body**:
```json
{
  "user": "user@example.com",
  "report_id": 1
}
```

**Response**:
```json
{
  "message": {
    "has_access": true,
    "report": {
      "id": 1,
      "uid": "abc123",
      "name": "Sales Dashboard"
    },
    "context": {
      "vehicles": ["V001"],
      "companies": ["Company A"]
    }
  }
}
```

#### Add Report Assignment
Assign a Grafana report to a user. (System Manager only)

**Endpoint**: `megatechtrackers.api.permissions.add_report_assignment`  
**Method**: `POST`

**Request Body**:
```json
{
  "user": "user@example.com",
  "report_id": 1,
  "report_uid": "abc123"
}
```

**Response**:
```json
{
  "message": {
    "success": true
  }
}
```

#### Remove Report Assignment
Remove a report assignment from a user. (System Manager only)

**Endpoint**: `megatechtrackers.api.permissions.remove_report_assignment`  
**Method**: `POST`

**Request Body**:
```json
{
  "user": "user@example.com",
  "report_id": 1
}
```

**Response**:
```json
{
  "message": {
    "success": true
  }
}
```

#### Bulk Assign Reports
Assign multiple reports to multiple users based on filters. (System Manager only)

**Endpoint**: `megatechtrackers.api.permissions.bulk_assign_reports`  
**Method**: `POST`

**Request Body**:
```json
{
  "report_ids": [1, 2, 3],
  "user_filters": {
    "ac_user_type": "Client - Company",
    "ac_parent_company": "Company A"
  }
}
```

**Response**:
```json
{
  "message": {
    "success": true,
    "assigned_count": 15,
    "users_affected": 5
  }
}
```

### Access Control Management

#### Create Megatechtrackers Access Control
Create a new Megatechtrackers Access Control record. (System Manager only)

**Endpoint**: `megatechtrackers.api.permissions.create_megatechtrackers_access_control`  
**Method**: `POST`

**Request Body**:
```json
{
  "user": "user@example.com",
  "user_type": "Internal",
  "parent_company": "Company A",
  "parent_department": "Sales"
}
```

**User Types**:
- `Internal`
- `Client - Single User`
- `Client - Company`
- `Client - Sub-Company`

**Response**:
```json
{
  "message": {
    "success": true,
    "name": "MAC-00001"
  }
}
```

#### Update Megatechtrackers Access Control
Update a Megatechtrackers Access Control record. (System Manager only)

**Endpoint**: `megatechtrackers.api.permissions.update_megatechtrackers_access_control`  
**Method**: `POST`

**Request Body**:
```json
{
  "name": "MAC-00001",
  "user_type": "Client - Company",
  "parent_company": "Company B"
}
```

**Response**:
```json
{
  "message": {
    "success": true
  }
}
```

#### Delete Megatechtrackers Access Control
Delete a Megatechtrackers Access Control record. (System Manager only)

**Endpoint**: `megatechtrackers.api.permissions.delete_megatechtrackers_access_control`  
**Method**: `POST`

**Request Body**:
```json
{
  "name": "MAC-00001"
}
```

**Response**:
```json
{
  "message": {
    "success": true
  }
}
```

### Grafana Integration

#### Get Available Grafana Reports
Fetch all available reports from Grafana and sync to Frappe.

**Endpoint**: `megatechtrackers.api.grafana.get_available_reports`  
**Method**: `GET`

**Response**:
```json
{
  "message": [
    {
      "id": 1,
      "uid": "abc123",
      "title": "Sales Dashboard",
      "name": "sales-dashboard"
    }
  ]
}
```

#### Generate Grafana Embed URL
Generate authenticated embed URL via Access Gateway.

**Endpoint**: `megatechtrackers.api.grafana.generate_embed_url`  
**Method**: `POST`

**Request Body**:
```json
{
  "report_id": 1,
  "report_uid": "abc123",
  "filters": {
    "vehicle": "V001",
    "company": "Company A"
  }
}
```

**Response**:
```json
{
  "message": "http://localhost:3000/d/abc123?token=TOKEN&kiosk=1&orgId=1&var-vehicle=V001&var-vehicle-locked=true"
}
```

---

## Access Gateway API

**Base URL**: `http://localhost:3001/api/`

**Interactive Documentation**: [Swagger UI](http://localhost:3001/api-docs)

### Generate Embed URL
Generate authenticated Grafana embed URL with locked filters.

**Endpoint**: `/grafana/generate-embed-url`  
**Method**: `POST`  
**Headers**: 
- `X-Frappe-User` (required): Frappe username
- `X-Frappe-Session-Id` (optional): Frappe session ID

**Request Body**:
```json
{
  "reportId": 1,
  "reportUid": "abc123",
  "filters": {
    "vehicle": "V001",
    "company": "Company A"
  },
  "frappeUser": "user@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "embedUrl": "http://localhost:3000/d/abc123?token=TOKEN&kiosk=1&orgId=1&var-vehicle=V001&var-vehicle-locked=true",
  "expiresAt": "2026-02-01T12:00:00.000Z"
}
```

### Get Available Reports
Fetch all available Grafana reports.

**Endpoint**: `/reports`  
**Method**: `GET`  
**Headers**: `X-Frappe-User` (required)

**Response**:
```json
{
  "success": true,
  "reports": [
    {
      "id": 1,
      "uid": "abc123",
      "title": "Sales Dashboard"
    }
  ]
}
```

### Get User Reports
Get reports assigned to current user.

**Endpoint**: `/reports/user`  
**Method**: `GET`  
**Headers**: `X-Frappe-User` (required)

**Response**:
```json
{
  "success": true,
  "reports": [
    {
      "id": 1,
      "uid": "abc123",
      "title": "Sales Dashboard"
    }
  ]
}
```

### Health Check
Service health check.

**Endpoint**: `/health`  
**Method**: `GET`

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2026-02-01T12:00:00.000Z",
  "version": "1.0.0",
  "services": {
    "grafana": "ok",
    "frappe": "ok"
  }
}
```

---

## Authentication

### Frappe API

**Method 1: Session Cookie**
```bash
curl -X GET "http://localhost:8000/api/method/megatechtrackers.api.permissions.get_user_permissions" \
  -H "Cookie: sid=your-session-id"
```

**Method 2: API Key**
```bash
curl -X GET "http://localhost:8000/api/method/megatechtrackers.api.permissions.get_user_permissions" \
  -H "Authorization: token api_key:api_secret"
```

### Access Gateway API

**Required Header**:
```bash
curl -X POST "http://localhost:3001/api/grafana/generate-embed-url" \
  -H "X-Frappe-User: user@example.com" \
  -H "Content-Type: application/json" \
  -d '{"reportId": 1}'
```

---

## Error Handling

All APIs return standard HTTP status codes:

- `200`: Success
- `400`: Bad Request (invalid parameters)
- `401`: Unauthorized (authentication required)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found
- `429`: Rate Limited
- `500`: Server Error

**Error Response Format**:
```json
{
  "exc_type": "ValidationError",
  "exc": "frappe.exceptions.ValidationError",
  "message": "Error message here"
}
```

---

## Rate Limiting

### Access Gateway
- **Limit**: 100 requests per 15 minutes per IP
- **Response**: `429 Too Many Requests` when exceeded

### Frappe API
- Rate limiting is handled by Frappe framework
- Default limits apply based on Frappe configuration

---

## OpenAPI Specifications

- **Frappe API**: [frappe-api-openapi.yaml](./frappe-api-openapi.yaml)
- **Access Gateway**: Available at `http://localhost:3001/api-docs.json`

You can import these specs into:
- [Swagger Editor](https://editor.swagger.io/)
- [Postman](https://www.postman.com/)
- [Insomnia](https://insomnia.rest/)
- Any OpenAPI-compatible tool

---

## Examples

### JavaScript/TypeScript

```typescript
// Get user permissions
const response = await fetch(
  'http://localhost:8000/api/method/megatechtrackers.api.permissions.get_user_permissions',
  {
    credentials: 'include', // Include session cookies
  }
);
const data = await response.json();
console.log(data.message);
```

### Python

```python
import requests

# Using session cookies
session = requests.Session()
session.get('http://localhost:8000', auth=('user', 'password'))

response = session.get(
    'http://localhost:8000/api/method/megatechtrackers.api.permissions.get_user_permissions'
)
data = response.json()
print(data['message'])
```

### cURL

```bash
# Get user permissions
curl -X GET "http://localhost:8000/api/method/megatechtrackers.api.permissions.get_user_permissions" \
  -H "Cookie: sid=your-session-id"
```

---

## Support

For API support, contact: support@megatechtrackers.com
