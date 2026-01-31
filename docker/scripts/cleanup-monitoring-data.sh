#!/bin/bash
#
# Monitoring Data Cleanup Script
# Cleans up old data from Grafana and Alertmanager
# Runs periodically via cron or systemd timer
#

set -e

# Configuration
GRAFANA_DATA="${GRAFANA_DATA:-/var/lib/grafana}"
ALERTMANAGER_DATA="${ALERTMANAGER_DATA:-/alertmanager}"
RETENTION_DAYS="${MONITORING_RETENTION_DAYS:-90}"
LOG_FILE="${LOG_FILE:-/var/log/monitoring-cleanup.log}"

# Create log directory
mkdir -p "$(dirname "$LOG_FILE")"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=========================================="
log "Starting monitoring data cleanup"
log "Retention period: $RETENTION_DAYS days"
log "=========================================="

# Cleanup Grafana session data
if [ -d "$GRAFANA_DATA" ]; then
    log "Cleaning Grafana data..."
    
    # Clean old sessions (if sessions directory exists)
    if [ -d "$GRAFANA_DATA/sessions" ]; then
        BEFORE=$(du -sh "$GRAFANA_DATA/sessions" 2>/dev/null | awk '{print $1}')
        find "$GRAFANA_DATA/sessions" -type f -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
        AFTER=$(du -sh "$GRAFANA_DATA/sessions" 2>/dev/null | awk '{print $1}')
        log "  Grafana sessions: $BEFORE -> $AFTER"
    fi
    
    # Clean old PNG snapshots (if png directory exists)
    if [ -d "$GRAFANA_DATA/png" ]; then
        BEFORE=$(du -sh "$GRAFANA_DATA/png" 2>/dev/null | awk '{print $1}')
        find "$GRAFANA_DATA/png" -type f -mtime +30 -delete 2>/dev/null || true
        AFTER=$(du -sh "$GRAFANA_DATA/png" 2>/dev/null | awk '{print $1}')
        log "  Grafana snapshots: $BEFORE -> $AFTER"
    fi
    
    # Clean old logs
    if [ -d "$GRAFANA_DATA/log" ]; then
        BEFORE=$(du -sh "$GRAFANA_DATA/log" 2>/dev/null | awk '{print $1}')
        find "$GRAFANA_DATA/log" -type f -name "*.log*" -mtime +7 -delete 2>/dev/null || true
        AFTER=$(du -sh "$GRAFANA_DATA/log" 2>/dev/null | awk '{print $1}')
        log "  Grafana logs: $BEFORE -> $AFTER"
    fi
else
    log "WARNING: Grafana data directory not found: $GRAFANA_DATA"
fi

# Cleanup Alertmanager data
if [ -d "$ALERTMANAGER_DATA" ]; then
    log "Cleaning Alertmanager data..."
    
    # Clean old notification logs
    if [ -d "$ALERTMANAGER_DATA/nflog" ]; then
        BEFORE=$(du -sh "$ALERTMANAGER_DATA/nflog" 2>/dev/null | awk '{print $1}')
        find "$ALERTMANAGER_DATA/nflog" -type f -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
        AFTER=$(du -sh "$ALERTMANAGER_DATA/nflog" 2>/dev/null | awk '{print $1}')
        log "  Alertmanager nflog: $BEFORE -> $AFTER"
    fi
    
    # Clean old silence data (keep last 30 days)
    if [ -d "$ALERTMANAGER_DATA/silences" ]; then
        BEFORE=$(du -sh "$ALERTMANAGER_DATA/silences" 2>/dev/null | awk '{print $1}')
        find "$ALERTMANAGER_DATA/silences" -type f -mtime +30 -delete 2>/dev/null || true
        AFTER=$(du -sh "$ALERTMANAGER_DATA/silences" 2>/dev/null | awk '{print $1}')
        log "  Alertmanager silences: $BEFORE -> $AFTER"
    fi
else
    log "WARNING: Alertmanager data directory not found: $ALERTMANAGER_DATA"
fi

log "=========================================="
log "Monitoring data cleanup completed"
log "=========================================="

# Rotate log file
if [ -f "$LOG_FILE" ]; then
    LOG_SIZE=$(stat -c%s "$LOG_FILE" 2>/dev/null || stat -f%z "$LOG_FILE" 2>/dev/null || echo "0")
    if [ "$LOG_SIZE" -gt 10485760 ]; then  # 10MB
        mv "$LOG_FILE" "${LOG_FILE}.old"
        log "Rotated cleanup log file"
    fi
fi

exit 0
