#!/bin/bash
#
# RabbitMQ Disk Usage Monitor and Cleanup
# Monitors RabbitMQ data directory and triggers cleanup if needed
# Runs periodically via cron
#

set -e

# Configuration
RABBITMQ_DATA="${RABBITMQ_DATA:-/var/lib/rabbitmq}"
THRESHOLD_PERCENT="${RABBITMQ_DISK_THRESHOLD:-80}"
LOG_FILE="${LOG_FILE:-/var/log/rabbitmq-monitor.log}"

# Create log directory
mkdir -p "$(dirname "$LOG_FILE")"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=========================================="
log "RabbitMQ disk usage monitor"
log "Data directory: $RABBITMQ_DATA"
log "Threshold: ${THRESHOLD_PERCENT}%"
log "=========================================="

# Check if RabbitMQ data directory exists
if [ ! -d "$RABBITMQ_DATA" ]; then
    log "ERROR: RabbitMQ data directory not found: $RABBITMQ_DATA"
    exit 1
fi

# Get disk usage
DISK_USAGE=$(df -h "$RABBITMQ_DATA" | tail -1 | awk '{print $5}' | sed 's/%//')
DISK_SIZE=$(du -sh "$RABBITMQ_DATA" | awk '{print $1}')

log "Current RabbitMQ data size: $DISK_SIZE"
log "Disk usage: ${DISK_USAGE}%"

# Check if usage exceeds threshold
if [ "$DISK_USAGE" -gt "$THRESHOLD_PERCENT" ]; then
    log "WARNING: Disk usage (${DISK_USAGE}%) exceeds threshold (${THRESHOLD_PERCENT}%)"
    log "Triggering RabbitMQ cleanup..."
    
    # Cleanup old message store files
    if [ -d "$RABBITMQ_DATA/mnesia" ]; then
        log "Cleaning up old message store files..."
        
        # Find and list large queue directories
        log "Large queue directories:"
        find "$RABBITMQ_DATA/mnesia" -type d -name "*.idx" -o -name "*.ets" 2>/dev/null | while read -r dir; do
            SIZE=$(du -sh "$dir" 2>/dev/null | awk '{print $1}')
            log "  $dir: $SIZE"
        done
        
        # Clean up old queue index files (older than 30 days)
        find "$RABBITMQ_DATA/mnesia" -type f -name "*.idx" -mtime +30 -delete 2>/dev/null || true
        find "$RABBITMQ_DATA/mnesia" -type f -name "*.ets" -mtime +30 -delete 2>/dev/null || true
        
        # Compact RabbitMQ message store (if rabbitmqctl is available)
        if command -v rabbitmqctl &> /dev/null; then
            log "Triggering RabbitMQ message store compaction..."
            rabbitmqctl eval 'rabbit_msg_store:gc_all().' 2>&1 | tee -a "$LOG_FILE" || true
        fi
    fi
    
    # Get disk usage after cleanup
    DISK_USAGE_AFTER=$(df -h "$RABBITMQ_DATA" | tail -1 | awk '{print $5}' | sed 's/%//')
    DISK_SIZE_AFTER=$(du -sh "$RABBITMQ_DATA" | awk '{print $1}')
    
    log "After cleanup:"
    log "  Data size: $DISK_SIZE -> $DISK_SIZE_AFTER"
    log "  Disk usage: ${DISK_USAGE}% -> ${DISK_USAGE_AFTER}%"
else
    log "Disk usage is within acceptable limits"
fi

# Report queue statistics (if rabbitmqctl is available)
if command -v rabbitmqctl &> /dev/null; then
    log ""
    log "Queue statistics:"
    rabbitmqctl list_queues name messages consumers memory 2>&1 | head -20 | tee -a "$LOG_FILE" || true
fi

log "=========================================="
log "RabbitMQ disk monitor completed"
log "=========================================="

# Rotate log file
if [ -f "$LOG_FILE" ]; then
    LOG_SIZE=$(stat -c%s "$LOG_FILE" 2>/dev/null || stat -f%z "$LOG_FILE" 2>/dev/null || echo "0")
    if [ "$LOG_SIZE" -gt 10485760 ]; then  # 10MB
        mv "$LOG_FILE" "${LOG_FILE}.old"
        log "Rotated monitor log file"
    fi
fi

exit 0
