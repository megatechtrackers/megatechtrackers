#!/bin/bash
#
# WAL Archive Cleanup Script
# Automatically removes WAL archives older than specified retention period
# Runs as a cron job inside postgres container
#
# Safety: Only deletes files from archive directory, never from pg_wal
# Retention: Keeps last N days of WAL archives (default: 7 days)
#

set -e

# Configuration
ARCHIVE_DIR="${ARCHIVE_DIR:-/var/lib/postgresql/archive}"
RETENTION_DAYS="${WAL_RETENTION_DAYS:-7}"
LOG_FILE="${LOG_FILE:-/var/log/postgresql/wal-cleanup.log}"

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=========================================="
log "Starting WAL archive cleanup"
log "Archive directory: $ARCHIVE_DIR"
log "Retention period: $RETENTION_DAYS days"
log "=========================================="

# Check if archive directory exists
if [ ! -d "$ARCHIVE_DIR" ]; then
    log "ERROR: Archive directory does not exist: $ARCHIVE_DIR"
    exit 1
fi

# Count files before cleanup
BEFORE_COUNT=$(find "$ARCHIVE_DIR" -type f -name "*.backup" -o -name "[0-9A-F]*" 2>/dev/null | wc -l)
BEFORE_SIZE=$(du -sh "$ARCHIVE_DIR" 2>/dev/null | awk '{print $1}')

log "Files before cleanup: $BEFORE_COUNT"
log "Directory size before: $BEFORE_SIZE"

# Delete WAL files older than retention period
# WAL files match pattern: 000000010000000000000001
# Backup history files match pattern: *.backup
DELETED_COUNT=0

# Find and delete old WAL segment files
if [ "$BEFORE_COUNT" -gt 0 ]; then
    # Delete files older than RETENTION_DAYS
    find "$ARCHIVE_DIR" -type f \( -name "[0-9A-F]*" -o -name "*.backup" \) -mtime +$RETENTION_DAYS -print0 2>/dev/null | while IFS= read -r -d '' file; do
        if rm -f "$file" 2>/dev/null; then
            DELETED_COUNT=$((DELETED_COUNT + 1))
            log "Deleted: $(basename "$file")"
        fi
    done
    
    # Also delete empty directories
    find "$ARCHIVE_DIR" -type d -empty -delete 2>/dev/null || true
fi

# Count files after cleanup
AFTER_COUNT=$(find "$ARCHIVE_DIR" -type f -name "*.backup" -o -name "[0-9A-F]*" 2>/dev/null | wc -l)
AFTER_SIZE=$(du -sh "$ARCHIVE_DIR" 2>/dev/null | awk '{print $1}')

log "=========================================="
log "Cleanup completed"
log "Files deleted: $((BEFORE_COUNT - AFTER_COUNT))"
log "Files remaining: $AFTER_COUNT"
log "Directory size after: $AFTER_SIZE"
log "=========================================="

# Log rotation for cleanup log itself (keep last 10 runs)
if [ -f "$LOG_FILE" ]; then
    LOG_SIZE=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo "0")
    if [ "$LOG_SIZE" -gt 10485760 ]; then  # 10MB
        mv "$LOG_FILE" "${LOG_FILE}.old"
        log "Rotated cleanup log file"
    fi
fi

exit 0
