#!/bin/bash
set -e

# Custom entrypoint for PostgreSQL primary
# Ensures users exist on every startup, not just first init
# Sets up automatic cleanup cron jobs

# Check if this is first initialization (data directory is empty)
DATA_DIR="/var/lib/postgresql/data"
FIRST_INIT=false
if [ -z "$(ls -A $DATA_DIR 2>/dev/null)" ]; then
    FIRST_INIT=true
    echo "=========================================="
    echo "First initialization detected"
    echo "Standard entrypoint will run init scripts"
    echo "=========================================="
fi

# Setup automatic cleanup cron jobs (on first init only)
if [ "$FIRST_INIT" = true ]; then
    echo "=========================================="
    echo "Setting up automatic cleanup tasks..."
    echo "=========================================="
    
    # NOTE: Windows-specific workaround
    # In a real Linux production system, you would:
    # 1. Copy scripts to /usr/local/bin/ and chmod +x them
    # 2. Execute them directly without 'bash' prefix
    # But on Windows, NTFS doesn't support Linux execute permissions,
    # so we use 'bash /path/to/script.sh' to execute mounted files directly.
    #
    # Production (Linux) approach:
    #   cp /mount/cleanup-wal-archives.sh /usr/local/bin/
    #   chmod +x /usr/local/bin/cleanup-wal-archives.sh
    #   /usr/local/bin/cleanup-wal-archives.sh
    #
    # Windows approach (current):
    #   bash /usr/local/bin/cleanup-wal-archives.sh
    
    # Check if cleanup scripts exist (they're Windows-mounted, so we use bash to execute)
    if [ -f "/usr/local/bin/cleanup-wal-archives.sh" ]; then
        echo "✓ WAL archive cleanup script found"
    else
        echo "⚠ WAL archive cleanup script not found"
    fi
    
    if [ -f "/usr/local/bin/cleanup-postgres-logs.sh" ]; then
        echo "✓ PostgreSQL log cleanup script found"
    else
        echo "⚠ PostgreSQL log cleanup script not found"
    fi
    
    # Run setup-cleanup-cron script if it exists
    if [ -f "/usr/local/bin/setup-cleanup-cron.sh" ]; then
        # Execute with bash directly (no chmod or copy needed for Windows mounts)
        bash /usr/local/bin/setup-cleanup-cron.sh
        echo "✓ Automatic cleanup cron jobs configured"
    else
        echo "⚠ Warning: setup-cleanup-cron.sh not found, skipping cron setup"
    fi
    
    echo "=========================================="
fi

# Ensure cron is running (on every startup)
# Note: Must run as root to start cron daemon
if ! pgrep cron > /dev/null 2>&1; then
    # Start cron daemon (requires root)
    echo "Starting cron daemon for automatic cleanup..."
    cron
    echo "✓ Cron daemon started"
fi

# Fix archive directory permissions (critical for WAL archiving)
# The archive directory is mounted as a volume and may have wrong ownership
ARCHIVE_DIR="/var/lib/postgresql/archive"
if [ ! -d "$ARCHIVE_DIR" ]; then
    echo "Creating archive directory: $ARCHIVE_DIR"
    mkdir -p "$ARCHIVE_DIR"
fi

# Get postgres user UID/GID (PostgreSQL runs as this user)
# In TimescaleDB image, postgres user typically has UID 999
POSTGRES_UID=$(id -u postgres 2>/dev/null || echo "999")
POSTGRES_GID=$(id -g postgres 2>/dev/null || echo "999")

# Set ownership and permissions for archive directory
echo "Setting archive directory permissions..."
chown -R "$POSTGRES_UID:$POSTGRES_GID" "$ARCHIVE_DIR"
chmod 700 "$ARCHIVE_DIR"
echo "✓ Archive directory permissions fixed (owner: postgres, mode: 700)"

# Start PostgreSQL in background using original entrypoint
# The standard entrypoint will run /docker-entrypoint-initdb.d/ scripts on first init
echo "Starting PostgreSQL..."
docker-entrypoint.sh postgres -c config_file=/etc/postgresql/postgresql.conf -c hba_file=/etc/postgresql/pg_hba.conf &
POSTGRES_PID=$!

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
for i in {1..90}; do
    if pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" 2>/dev/null; then
        echo "PostgreSQL is ready!"
        break
    fi
    if [ $i -eq 90 ]; then
        echo "ERROR: PostgreSQL did not become ready in time"
        exit 1
    fi
    sleep 1
done

# If first init, wait for initialization scripts to complete
# We check by polling if the trackdata table exists (main table from schema)
if [ "$FIRST_INIT" = true ]; then
    echo "Waiting for initialization scripts to complete..."
    MAX_WAIT=120  # Wait up to 2 minutes for init scripts
    WAITED=0
    INIT_COMPLETE=false
    
    while [ $WAITED -lt $MAX_WAIT ]; do
        # Check if trackdata table exists (indicates schema has been created)
        TABLE_EXISTS=$(psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'trackdata');" 2>/dev/null | tr -d ' ' || echo "f")
        
        if [ "$TABLE_EXISTS" = "t" ]; then
            echo "✓ Initialization scripts completed (tables exist)"
            INIT_COMPLETE=true
            break
        fi
        
        # Also check if we can connect and database exists (basic check)
        DB_EXISTS=$(psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -t -c "SELECT 1;" 2>/dev/null | tr -d ' ' || echo "")
        if [ -z "$DB_EXISTS" ]; then
            # Database might still be initializing
            sleep 2
            WAITED=$((WAITED + 2))
            continue
        fi
        
        # Database exists but tables don't - init scripts might still be running
        sleep 2
        WAITED=$((WAITED + 2))
        if [ $((WAITED % 10)) -eq 0 ]; then
            echo "  Still waiting for init scripts... (${WAITED}/${MAX_WAIT}s)"
        fi
    done
    
    if [ "$INIT_COMPLETE" = false ]; then
        echo "⚠ Warning: Initialization scripts may not have completed (timeout after ${MAX_WAIT}s)"
        echo "  Tables will be created by ensure-users.sh as fallback"
    fi
fi

# Give PostgreSQL a moment to fully initialize
sleep 2

# Run user setup script (which also ensures schema exists as fallback)
echo "Ensuring users and schema exist..."
/usr/local/bin/ensure-users.sh

# Wait for PostgreSQL process (foreground)
wait $POSTGRES_PID
