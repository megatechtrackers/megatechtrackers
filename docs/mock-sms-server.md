# Mock SMS Server

A lightweight HTTP server that simulates an SMS API for testing alarm notifications without sending real SMS messages. Located at `tools/mock_sms_server/`.

## Features

- **SMS API Endpoint**: Accepts standard SMS send requests (`POST /sms/send`)
- **Web UI**: View all received SMS messages in a dark-themed dashboard
- **REST API**: Query messages, stats, and clear history programmatically
- **Configurable Failures**: Simulate random failures and rate limiting for testing
- **In-Memory Storage**: Keeps up to 1000 messages in memory

## Quick Start

### With Docker

```bash
# Start with docker-compose (testing profile)
docker compose --profile testing up -d mock-sms-server

# View logs
docker logs -f mock-sms-server
```

### Standalone

```bash
cd tools/mock_sms_server
pip install -r requirements.txt
python mock_sms_server.py
```

## API Endpoints

### Send SMS

```bash
POST /sms/send
Content-Type: application/json
Authorization: Bearer your-api-key

{
  "to": "+1234567890",
  "from": "YourApp",
  "message": "Hello, this is a test message!"
}
```

### Health Check

```bash
GET /health
```

### Get All Messages

```bash
GET /api/messages?limit=100
```

### Get Statistics

```bash
GET /api/stats
```

### Clear All Messages

```bash
DELETE /api/messages
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8086 | HTTP server port |
| `LOG_LEVEL` | INFO | Logging level |
| `SIMULATE_FAILURES` | 0 | Percentage of requests to fail (0-100) |
| `FAILURE_RATE_LIMIT` | 0 | Simulate rate limiting after N messages |
| `MAX_HISTORY` | 1000 | Maximum messages to keep in memory |

## Web UI

Access the web dashboard at `http://localhost:8086/`

## Testing Alarm Notifications

1. Start the mock SMS server: `docker compose --profile testing up -d mock-sms-server`
2. Configure alarm service to use mock server (SMS_API_URL, SMS_API_KEY in env)
3. Trigger alarms and view messages at http://localhost:8086/

## Integration

The alarm service is pre-configured to use this mock server when running in testing profile. See root `docker-compose.yml` for `SMS_API_URL` and `SMS_FROM` (e.g. Megatechtrackers).
