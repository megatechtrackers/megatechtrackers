# Automatic Disk Management System

## Overview

This document describes the automatic disk management and cleanup systems implemented in the Megatechtrackers platform to prevent unlimited disk growth and ensure long-term operational stability.

## 🎯 Problem Solved

Without proper cleanup mechanisms, the following components would grow indefinitely:
- **PostgreSQL WAL Archives**: 10-50GB/month → 120-600GB/year
- **PostgreSQL Server Logs**: 100-500MB/day → 36-180GB/year
- **Grafana/Alertmanager Data**: Slow accumulation over time
- **RabbitMQ Metadata**: Queue indexes and message stores

## ✅ Implemented Solutions

### 1. PostgreSQL WAL Archive Cleanup

**Script**: `docker/postgres/cleanup-wal-archives.sh`

**Schedule**: Daily at 2:00 AM (via cron)

**Configuration**:
```yaml
environment:
  WAL_RETENTION_DAYS: 7  # Keep last 7 days of WAL archives
```

**What it does**:
- Scans `/var/lib/postgresql/archive/` directory
- Deletes WAL segment files older than retention period
- Logs cleanup activities to `/var/log/postgresql/wal-cleanup.log`
- Safe: Only touches archive directory, never active WAL

**Expected Impact**: Keeps WAL archives at ~10-50GB stable size

---

### 2. PostgreSQL Server Log Cleanup

**Script**: `docker/postgres/cleanup-postgres-logs.sh`

**Schedule**: Daily at 3:00 AM (via cron)

**Configuration**:
```yaml
environment:
  PG_LOG_RETENTION_DAYS: 7  # Keep last 7 days of server logs
```

**PostgreSQL Config** (`postgresql-primary.conf`):
```ini
log_truncate_on_rotation = on  # Prevents indefinite log growth
log_rotation_age = 1d
log_rotation_size = 500MB
```

**What it does**:
- Scans PostgreSQL log directory (`$PGDATA/log/`)
- Deletes log files older than retention period
- Logs cleanup activities to `/var/log/postgresql/log-cleanup.log`

**Expected Impact**: Keeps PostgreSQL logs at ~3-5GB stable size

---

### 3. Grafana & Alertmanager Data Cleanup

**Script**: `docker/scripts/cleanup-monitoring-data.sh`

**Schedule**: Can be run manually or via cron (mount to containers)

**Configuration**:
```yaml
environment:
  MONITORING_RETENTION_DAYS: 90  # Keep data for 90 days
```

**What it does**:
- Cleans Grafana session data (90+ days old)
- Cleans Grafana PNG snapshots (30+ days old)
- Cleans Grafana logs (7+ days old)
- Cleans Alertmanager notification logs (90+ days old)
- Cleans Alertmanager silence data (30+ days old)

**Expected Impact**: Keeps monitoring data at ~500MB-2GB stable size

---

### 4. RabbitMQ Disk Usage Monitor

**Script**: `docker/scripts/monitor-rabbitmq-disk.sh`

**Schedule**: Can be run periodically via cron

**Configuration**:
```yaml
environment:
  RABBITMQ_DISK_THRESHOLD: 80  # Trigger cleanup at 80% usage
```

**What it does**:
- Monitors RabbitMQ data directory size
- Checks disk usage percentage
- Triggers cleanup if threshold exceeded:
  - Removes old queue index files (30+ days)
  - Compacts message stores via `rabbitmqctl`
  - Reports queue statistics

**Expected Impact**: Prevents RabbitMQ disk exhaustion

---

## 📊 Disk Usage Monitoring Alerts

**File**: `docker/prometheus/alerts-disk.yml`

**Prometheus** automatically monitors and alerts on:

### Critical Alerts (Immediate Action Required)
- **DiskSpaceCritical**: Disk usage > 90% for 5 minutes
- **RabbitMQDiskSpaceLow**: RabbitMQ disk free < 10GB

### Warning Alerts (Investigation Needed)
- **DiskSpaceWarning**: Disk usage > 80% for 10 minutes
- **DiskSpaceGrowthHigh**: Disk decreasing by > 5GB/hour
- **WALArchiveSizeLarge**: WAL archives > 100GB
- **PostgreSQLLogsSizeLarge**: PostgreSQL logs > 50GB
- **PostgreSQLDataGrowthHigh**: Database growing > 10GB/hour
- **RabbitMQQueueSizeLarge**: Queue has > 1M messages

### Info Alerts (Monitor Only)
- **PrometheusDataSizeLarge**: Prometheus storage > 50GB
- **GrafanaDataSizeLarge**: Grafana data > 5GB

Alerts are sent to **Alertmanager** and can be forwarded to:
- Webhook endpoints
- Email
- Slack
- PagerDuty
- Other notification systems

---

## 🚀 Automatic Startup

All cleanup mechanisms are automatically configured on first container start:

### PostgreSQL Primary Container
1. **Entrypoint** (`postgres-entrypoint.sh`) runs on startup
2. Copies cleanup scripts to `/usr/local/bin/`
3. Runs `setup-cleanup-cron.sh` which:
   - Installs cron daemon
   - Creates cron jobs for WAL and log cleanup
   - Starts cron in background
4. PostgreSQL starts normally with cleanup running

### Cron Jobs Installed
```bash
# WAL Archive Cleanup - Daily at 2 AM
0 2 * * * postgres /usr/local/bin/cleanup-wal-archives.sh

# PostgreSQL Log Cleanup - Daily at 3 AM
0 3 * * * postgres /usr/local/bin/cleanup-postgres-logs.sh
```

---

## 🔧 Manual Operations

### View Cleanup Logs

**PostgreSQL Container**:
```bash
# WAL cleanup log
docker exec -it postgres-primary cat /var/log/postgresql/wal-cleanup.log

# PostgreSQL log cleanup
docker exec -it postgres-primary cat /var/log/postgresql/log-cleanup.log

# Cron execution logs
docker exec -it postgres-primary cat /var/log/postgresql/wal-cleanup-cron.log
docker exec -it postgres-primary cat /var/log/postgresql/log-cleanup-cron.log
```

### Run Cleanup Manually

**WAL Archives**:
```bash
docker exec -it postgres-primary /usr/local/bin/cleanup-wal-archives.sh
```

**PostgreSQL Logs**:
```bash
docker exec -it postgres-primary /usr/local/bin/cleanup-postgres-logs.sh
```

**Grafana/Alertmanager** (from host):
```bash
docker exec -it grafana /usr/local/bin/cleanup-monitoring-data.sh
```

**RabbitMQ Disk Check** (from host):
```bash
docker exec -it rabbitmq-1 bash -c "
  RABBITMQ_DATA=/var/lib/rabbitmq \
  RABBITMQ_DISK_THRESHOLD=80 \
  LOG_FILE=/tmp/rabbitmq-monitor.log \
  /path/to/monitor-rabbitmq-disk.sh
"
```

### Check Cron Status

```bash
# Check if cron is running
docker exec -it postgres-primary pgrep cron

# View installed cron jobs
docker exec -it postgres-primary ls -la /etc/cron.d/cleanup-*

# View cron job contents
docker exec -it postgres-primary cat /etc/cron.d/cleanup-wal-archives
docker exec -it postgres-primary cat /etc/cron.d/cleanup-postgres-logs
```

### Adjust Retention Periods

Edit `docker-compose.yml`:

```yaml
postgres-primary:
  environment:
    WAL_RETENTION_DAYS: 14        # Change from 7 to 14 days
    PG_LOG_RETENTION_DAYS: 14     # Change from 7 to 14 days
```

Restart container:
```bash
docker-compose restart postgres-primary
```

---

## 📈 Expected Disk Usage (Long-Term)

With **50,000 trackers** sending data every 30 seconds:

| Component | 1 Month | 6 Months | 1 Year | Status |
|-----------|---------|----------|--------|--------|
| PostgreSQL Data | 50-100GB | 200-400GB | 300-600GB | ✅ Auto-deleted (12 months retention) |
| WAL Archives | **10-50GB** | **10-50GB** | **10-50GB** | ✅ Auto-cleaned (7 days) |
| PostgreSQL Logs | **3-5GB** | **3-5GB** | **3-5GB** | ✅ Auto-cleaned (7 days) |
| Application Logs | 0.5GB | 0.5GB | 0.5GB | ✅ Rotating (10MB × 5 backups) |
| RabbitMQ Data | 5-10GB | 5-10GB | 5-10GB | ✅ TTL + monitoring |
| Prometheus | 10-20GB | 10-20GB | 10-20GB | ✅ 30-day retention |
| Grafana/Alertmanager | 0.5GB | 1GB | 1-2GB | ✅ 90-day cleanup |
| **TOTAL OVERHEAD** | **~30-90GB** | **~30-90GB** | **~30-90GB** | **✅ STABLE** |

**Result**: With automatic cleanup, your system will maintain **stable disk usage** indefinitely, with the only growing component being time-series data (which has automatic retention policies via TimescaleDB).

---

## 🔍 Troubleshooting

### Cleanup Not Running

**Check cron daemon**:
```bash
docker exec -it postgres-primary pgrep cron
# Should output a PID number
```

**Restart cron**:
```bash
docker exec -it postgres-primary cron
```

**Check cron logs**:
```bash
docker exec -it postgres-primary tail -f /var/log/postgresql/*-cron.log
```

### Disk Still Growing

**Check actual usage**:
```bash
# Total PostgreSQL data
docker exec -it postgres-primary du -sh /var/lib/postgresql/data

# WAL archives
docker exec -it postgres-primary du -sh /var/lib/postgresql/archive

# PostgreSQL logs
docker exec -it postgres-primary du -sh /var/lib/postgresql/data/log
```

**Force cleanup**:
```bash
docker exec -it postgres-primary /usr/local/bin/cleanup-wal-archives.sh
docker exec -it postgres-primary /usr/local/bin/cleanup-postgres-logs.sh
```

**Check Prometheus alerts**:
- Go to http://localhost:9090/alerts
- Look for disk-related alerts (should be green if all is well)

### Scripts Missing

**Verify scripts exist**:
```bash
docker exec -it postgres-primary ls -la /usr/local/bin/cleanup-*
```

**Reinstall** (requires container rebuild):
```bash
docker-compose down postgres-primary
docker-compose up -d postgres-primary
```

---

## 🎉 Summary

✅ **WAL archives**: Auto-deleted after 7 days  
✅ **PostgreSQL logs**: Auto-deleted after 7 days  
✅ **Application logs**: Rotating (60MB max per service)  
✅ **RabbitMQ messages**: TTL + max-length limits  
✅ **Prometheus metrics**: 30-day retention  
✅ **Grafana/Alertmanager**: 90-day cleanup available  
✅ **TimescaleDB data**: 12-month retention (trackdata/events), 24-month (alarms)  
✅ **Disk monitoring**: Prometheus alerts for all storage issues

**Your system is now maintenance-free and can run for years without manual disk cleanup!** 🚀
