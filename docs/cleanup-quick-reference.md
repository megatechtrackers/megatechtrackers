# Automatic Cleanup - Quick Reference

## 📅 Cleanup Schedule

| Time | Component | Retention | Script |
|------|-----------|-----------|--------|
| **Daily 2:00 AM** | WAL Archives | 7 days | `cleanup-wal-archives.sh` |
| **Daily 3:00 AM** | PostgreSQL Logs | 7 days | `cleanup-postgres-logs.sh` |
| **Continuous** | TimescaleDB Data | 12 months (trackdata/events)<br>24 months (alarms) | Built-in retention policy |
| **Hourly** | command_history | 90 days | ops_node backend (`cleanup_old_history`) |
| **Hourly** | command_inbox | 90 days | ops_node backend (`cleanup_old_command_inbox`) |
| **Daily** | alarms_history | 365 days | alarm_node (`cleanup_old_alarms_history`) |
| **Daily** | alarms_dlq (reprocessed) | 90 days | alarm_node (`cleanup_old_alarms_dlq`) |
| **Daily** | alarms_sms_modem_usage | 730 days | alarm_node (`cleanup_old_alarms_sms_modem_usage`) |
| **Every 5 min** | processed_message_ids | TTL-based | consumer_node dedup cleanup |
| **Continuous** | RabbitMQ Messages | 1 hour (trackdata)<br>24 hours (alarms/events) | Built-in TTL |
| **Continuous** | Application Logs | 10MB × 5 backups = 50MB | Log rotation |
| **Continuous** | Prometheus Metrics | 30 days | Built-in retention |
| **Continuous** | alarms_workers (stale) | Heartbeat-based | alarm_node worker registry cleanup |
| **On-demand** | Grafana Data | 90 days | `cleanup-monitoring-data.sh` |
| **On-demand** | RabbitMQ Disk | Monitor at 80% | `monitor-rabbitmq-disk.sh` |

## 🔧 Quick Commands

### Check Cleanup Status
```bash
# Verify all cleanup systems are working
bash docker/scripts/verify-cleanup-setup.sh

# Check PostgreSQL cleanup logs
docker exec -it postgres-primary tail -f /var/log/postgresql/wal-cleanup.log
docker exec -it postgres-primary tail -f /var/log/postgresql/log-cleanup.log

# Check cron status
docker exec -it postgres-primary pgrep cron
```

### Manual Cleanup
```bash
# WAL archives
docker exec -it postgres-primary /usr/local/bin/cleanup-wal-archives.sh

# PostgreSQL logs  
docker exec -it postgres-primary /usr/local/bin/cleanup-postgres-logs.sh

# Grafana/Alertmanager
docker exec -it grafana /usr/local/bin/cleanup-monitoring-data.sh
```

### Check Disk Usage
```bash
# PostgreSQL data
docker exec -it postgres-primary du -sh /var/lib/postgresql/data

# WAL archives
docker exec -it postgres-primary du -sh /var/lib/postgresql/archive

# PostgreSQL logs
docker exec -it postgres-primary du -sh /var/lib/postgresql/data/log

# RabbitMQ data
docker exec -it rabbitmq-1 du -sh /var/lib/rabbitmq

# Prometheus data
docker exec -it prometheus du -sh /prometheus

# Grafana data
docker exec -it grafana du -sh /var/lib/grafana
```

### View Prometheus Alerts
```bash
# Open in browser
http://localhost:9090/alerts

# Check disk-related alerts specifically
curl -s http://localhost:9090/api/v1/rules | jq '.data.groups[] | select(.name | contains("disk"))'
```

## 📊 Expected Disk Usage (Stable State)

| Component | Size | Status |
|-----------|------|--------|
| PostgreSQL Data | 300-600GB | ✅ Auto-deleted (12 months) |
| WAL Archives | 10-50GB | ✅ Auto-cleaned (7 days) |
| PostgreSQL Logs | 3-5GB | ✅ Auto-cleaned (7 days) |
| RabbitMQ Data | 5-10GB | ✅ TTL + limits |
| Prometheus | 10-20GB | ✅ 30-day retention |
| Application Logs | 0.5GB | ✅ Rotating |
| Grafana/Alertmanager | 1-2GB | ✅ Cleanup available |
| **TOTAL OVERHEAD** | **30-90GB** | **✅ STABLE** |

## 🚨 Alert Thresholds

| Alert | Threshold | Severity |
|-------|-----------|----------|
| Disk Space Critical | < 10% free | Critical |
| Disk Space Warning | < 20% free | Warning |
| Disk Growth High | > 5GB/hour | Warning |
| WAL Archive Large | > 100GB | Warning |
| PostgreSQL Logs Large | > 50GB | Warning |
| RabbitMQ Disk Low | < 10GB free | Critical |
| RabbitMQ Queue Large | > 1M messages | Warning |

## 📝 Configuration

### Adjust Retention Periods

Edit `docker-compose.yml`:

```yaml
postgres-primary:
  environment:
    WAL_RETENTION_DAYS: 7          # Default: 7 days
    PG_LOG_RETENTION_DAYS: 7       # Default: 7 days

grafana:
  environment:
    MONITORING_RETENTION_DAYS: 90  # Default: 90 days
```

### Restart Containers
```bash
docker-compose restart postgres-primary
docker-compose restart grafana
```

## 🔍 Troubleshooting

### Cleanup not running?
```bash
# Check cron is running
docker exec -it postgres-primary pgrep cron

# Restart cron
docker exec -it postgres-primary cron

# Check cron logs
docker exec -it postgres-primary tail -f /var/log/postgresql/wal-cleanup-cron.log
```

### Disk still growing?
```bash
# Force immediate cleanup
docker exec -it postgres-primary /usr/local/bin/cleanup-wal-archives.sh
docker exec -it postgres-primary /usr/local/bin/cleanup-postgres-logs.sh

# Check TimescaleDB retention policies
docker exec -it postgres-primary psql -U postgres -d tracking_db -c "
  SELECT * FROM timescaledb_information.jobs 
  WHERE proc_name IN ('policy_retention', 'policy_compression');"
```

### Need more retention?
```bash
# Increase retention periods in docker-compose.yml
# Then restart containers
docker-compose restart postgres-primary

# Or manually adjust TimescaleDB retention
docker exec -it postgres-primary psql -U postgres -d tracking_db -c "
  SELECT remove_retention_policy('trackdata');
  SELECT add_retention_policy('trackdata', INTERVAL '24 months');"
```

## 📖 Full Documentation

See `disk-management.md` for detailed documentation.
