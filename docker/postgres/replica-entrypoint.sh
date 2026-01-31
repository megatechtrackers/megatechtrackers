#!/bin/bash
set -e

# Custom entrypoint for PostgreSQL replica
# Handles initial setup and then starts PostgreSQL in recovery mode

DATA_DIR="/var/lib/postgresql/data"
CONFIG_FILE="/etc/postgresql/postgresql.conf"
HBA_FILE="/etc/postgresql/pg_hba.conf"

# Check if data directory is empty (first run)
if [ -z "$(ls -A $DATA_DIR 2>/dev/null)" ]; then
    echo "=========================================="
    echo "First run: Setting up streaming replication"
    echo "=========================================="
    
    # Ensure data directory is completely empty for pg_basebackup
    # pg_basebackup requires an empty directory and will create the structure
    echo "Preparing empty data directory for pg_basebackup..."
    rm -rf $DATA_DIR/* $DATA_DIR/.* 2>/dev/null || true
    
    # Wait for primary to be ready
    echo "Waiting for primary database to be ready..."
    until pg_isready -h postgres-primary -p 5432 -U postgres; do
        echo "Primary not ready, waiting..."
        sleep 2
    done
    
    echo "Primary database is ready, waiting for initialization to complete..."
    
    # Wait for primary's initialization scripts to complete (check if tables exist)
    # This ensures we backup a fully initialized database, not an empty one
    MAX_WAIT=180  # Wait up to 3 minutes for primary init
    WAITED=0
    PRIMARY_READY=false
    
    while [ $WAITED -lt $MAX_WAIT ]; do
        # Check if trackdata table exists on primary (indicates schema has been created)
        TABLE_EXISTS=$(PGPASSWORD=postgres psql -h postgres-primary -p 5432 -U postgres -d tracking_db -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'trackdata');" 2>/dev/null | tr -d ' ' || echo "f")
        
        if [ "$TABLE_EXISTS" = "t" ]; then
            echo "✓ Primary initialization complete (tables exist)"
            PRIMARY_READY=true
            break
        fi
        
        # Also check if we can connect to database
        DB_EXISTS=$(PGPASSWORD=postgres psql -h postgres-primary -p 5432 -U postgres -d tracking_db -t -c "SELECT 1;" 2>/dev/null | tr -d ' ' || echo "")
        if [ -z "$DB_EXISTS" ]; then
            # Database might still be initializing
            sleep 3
            WAITED=$((WAITED + 3))
            continue
        fi
        
        # Database exists but tables don't - init scripts might still be running
        sleep 3
        WAITED=$((WAITED + 3))
        if [ $((WAITED % 15)) -eq 0 ]; then
            echo "  Still waiting for primary init scripts... (${WAITED}/${MAX_WAIT}s)"
        fi
    done
    
    if [ "$PRIMARY_READY" = false ]; then
        echo "⚠ Warning: Primary initialization may not have completed (timeout after ${MAX_WAIT}s)"
        echo "  Proceeding with backup anyway (replica will sync once primary is ready)"
    fi
    
    # Perform initial backup using pg_basebackup
    # Run as root (entrypoint runs as root), then fix ownership
    # pg_basebackup can run as root, PostgreSQL will fix ownership on startup
    echo "Performing initial backup from primary..."
    env PGPASSWORD=replica_password pg_basebackup \
        -h postgres-primary \
        -p 5432 \
        -U replica_user \
        -D $DATA_DIR \
        -Fp \
        -Xs \
        -P \
        -R \
        -S replica_slot \
        -v
    
    if [ $? -eq 0 ]; then
        echo "Initial backup completed successfully"
        
        # Verify recovery configuration was created by -R flag
        if [ -f $DATA_DIR/postgresql.auto.conf ]; then
            echo "Recovery configuration found"
        else
            echo "Creating recovery configuration..."
            cat >> $DATA_DIR/postgresql.auto.conf <<EOF
# Recovery configuration (created by replica setup)
primary_conninfo = 'host=postgres-primary port=5432 user=replica_user password=replica_password'
primary_slot_name = 'replica_slot'
EOF
        fi
        
        # Ensure standby.signal exists (PostgreSQL 12+)
        # pg_basebackup with -R flag should create this, but ensure it exists
        if [ ! -f $DATA_DIR/standby.signal ]; then
            touch $DATA_DIR/standby.signal
        fi
        
        # Note: Ownership will be fixed by PostgreSQL's docker-entrypoint.sh when it starts
        # The entrypoint script handles fixing ownership of data directory on startup
        
        echo "Replica configuration complete"
    else
        echo "ERROR: Initial backup failed!"
        exit 1
    fi
else
    echo "Data directory exists, starting replica in recovery mode"
    
    # Ensure standby.signal exists
    if [ ! -f $DATA_DIR/standby.signal ]; then
        echo "Creating standby.signal file..."
        touch $DATA_DIR/standby.signal
    fi
fi

# Start PostgreSQL with custom configuration
# Use docker-entrypoint.sh which will:
# 1. Fix ownership of data directory (if needed)
# 2. Skip initdb if database is already initialized (detected by PG_VERSION file)
# 3. Start PostgreSQL in recovery mode (detected by standby.signal file)
echo "Starting PostgreSQL replica..."
exec docker-entrypoint.sh postgres \
    -c config_file=$CONFIG_FILE \
    -c hba_file=$HBA_FILE
