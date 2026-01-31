# Alertmanager Configuration

Alertmanager handles alert notifications from Prometheus and routes them to webhooks, email, Slack, etc. Configuration: `docker/alertmanager/alertmanager.yml`.

## Webhook Configuration

### Current Webhook URL

```
http://localhost:5001/webhook
```

### To Update Webhook URL

1. Edit `docker/alertmanager/alertmanager.yml`
2. Change the `url` field in `webhook_configs`
3. Restart: `docker restart alertmanager` (or container name from docker-compose)

### Example Webhook URLs

- **Slack:** `https://hooks.slack.com/services/YOUR/WEBHOOK/URL`
- **Discord:** `https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN`
- **Custom:** `http://your-service:port/webhook`

### Webhook Payload

Alertmanager sends POST requests with JSON: `version`, `groupKey`, `status` (firing/resolved), `receiver`, `groupLabels`, `commonLabels`, `commonAnnotations`, `externalURL`, `alerts[]`.

## Access

- **Alertmanager UI:** http://localhost:9093
- **Prometheus Alerts:** http://localhost:9090/alerts
- **Grafana:** http://localhost:3000 → Alerts Overview dashboard
