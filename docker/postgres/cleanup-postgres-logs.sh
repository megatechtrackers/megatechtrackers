#!/bin/bash
#
# PostgreSQL Log Cleanup Script
# Automatically removes old PostgreSQL server logs
# Runs as a cron job inside postgres container
#
# Retention: Keeps last N days of logs (default: 7 days)
#

set -e

# Configuration
LOG_DIR="${PGDATA}/log"
RETENTION_DAYS="${PG_LOG_RETENTION_DAYS:-7}"
CLEANUP_LOG="/var/log/postgresql/log-cleanup.log"

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$CLEANUP_LOG")"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$CLEANUP_LOG"
}

log "=========================================="
log "Starting PostgreSQL log cleanup"
log "Log directory: $LOG_DIR"
log "Retention period: $RETENTION_DAYS days"
log "=========================================="

# Check if log directory exists
if [ ! -d "$LOG_DIR" ]; then
    log "WARNING: Log directory does not exist: $LOG_DIR"
    log "Creating log directory..."
    mkdir -p "$LOG_DIR"
fi

# Count files before cleanup
BEFORE_COUNT=$(find "$LOG_DIR" -type f -name "postgresql-*.log*" 2>/dev/null | wc -l)
BEFORE_SIZE=$(du -sh "$LOG_DIR" 2>/dev/null | awk '{print $1}')

log "Log files before cleanup: $BEFORE_COUNT"
log "Directory size before: $BEFORE_SIZE"

# Delete log files older than retention period
if [ "$BEFORE_COUNT" -gt 0 ]; then
    # Find and delete old log files
    find "$LOG_DIR" -type f -name "postgresql-*.log*" -mtime +$RETENTION_DAYS -print0 2>/dev/null | while IFS= read -r -d '' file; do
        if rm -f "$file" 2>/dev/null; then
            log "Deleted: $(basename "$file")"
        fi
    done
fi

# Count files after cleanup
AFTER_COUNT=$(find "$LOG_DIR" -type f -name "postgresql-*.log*" 2>/dev/null | wc -l)
AFTER_SIZE=$(du -sh "$LOG_DIR" 2>/dev/null | awk '{print $1}')

log "=========================================="
log "Cleanup completed"
log "Files deleted: $((BEFORE_COUNT - AFTER_COUNT))"
log "Files remaining: $AFTER_COUNT"
log "Directory size after: $AFTER_SIZE"
log "=========================================="

# Rotate cleanup log itself (keep last 10MB)
if [ -f "$CLEANUP_LOG" ]; then
    LOG_SIZE=$(stat -f%z "$CLEANUP_LOG" 2>/dev/null || stat -c%s "$CLEANUP_LOG" 2>/dev/null || echo "0")
    if [ "$LOG_SIZE" -gt 10485760 ]; then  # 10MB
        mv "$CLEANUP_LOG" "${CLEANUP_LOG}.old"
        log "Rotated cleanup log file"
    fi
fi

exit 0
