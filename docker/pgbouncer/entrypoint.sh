#!/bin/sh
# Note: set -e removed for compatibility with minimal shells

# Generate userlist.txt by extracting SCRAM-SHA-256 hashes from PostgreSQL
# This ensures the hashes match what PostgreSQL actually stores
echo "Generating userlist.txt with SCRAM-SHA-256 hashes from PostgreSQL..."

POSTGRES_HOST="${POSTGRES_HOST:-postgres-primary}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-tracking_db}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"

# Wait for PostgreSQL to be ready before extracting hashes
echo "Waiting for PostgreSQL to be ready..."
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if (timeout 1 sh -c "echo > /dev/tcp/$POSTGRES_HOST/$POSTGRES_PORT" 2>/dev/null) || \
       (command -v nc >/dev/null 2>&1 && nc -z "$POSTGRES_HOST" "$POSTGRES_PORT" 2>/dev/null); then
        echo "PostgreSQL port is open"
        break
    fi
    if [ $i -eq 15 ]; then
        echo "Warning: PostgreSQL port check timeout, will retry hash extraction"
    fi
    sleep 2
done

# Wait a bit more for PostgreSQL to be fully ready
sleep 3

# Extract SCRAM-SHA-256 hashes from PostgreSQL
# Try to install postgresql-client if not available (Alpine-based image)
if ! command -v psql >/dev/null 2>&1; then
    echo "psql not found, attempting to install postgresql-client..."
    if command -v apk >/dev/null 2>&1; then
        # Update package index and install postgresql-client
        apk update >/dev/null 2>&1 && apk add --no-cache postgresql-client >/dev/null 2>&1 || echo "Warning: Could not install postgresql-client (Alpine package index may be unavailable)"
    elif command -v apt-get >/dev/null 2>&1; then
        apt-get update >/dev/null 2>&1 && apt-get install -y --no-install-recommends postgresql-client >/dev/null 2>&1 || echo "Warning: Could not install postgresql-client"
    fi
fi

# Extract hashes using psql if available
if command -v psql >/dev/null 2>&1; then
    echo "Extracting SCRAM-SHA-256 hashes from PostgreSQL..."
    MAX_RETRIES=10
    RETRY_COUNT=0
    
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        # Try to extract hashes using psql
        # Note: We need to connect as postgres user to read pg_authid
        PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -c "SELECT '\"' || rolname || '\" \"' || rolpassword || '\"' FROM pg_authid WHERE rolname IN ('postgres', 'tracking_writer', 'parser_readonly') ORDER BY rolname;" 2>/dev/null > /tmp/userlist_extracted.txt
        
        if [ -s /tmp/userlist_extracted.txt ] && [ $(wc -l < /tmp/userlist_extracted.txt) -ge 3 ]; then
            echo "Successfully extracted hashes from PostgreSQL"
            cp /tmp/userlist_extracted.txt /etc/pgbouncer/userlist.txt
            rm -f /tmp/userlist_extracted.txt
            break
        else
            RETRY_COUNT=$((RETRY_COUNT + 1))
            if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
                echo "Waiting for PostgreSQL to be ready for hash extraction... (attempt $RETRY_COUNT/$MAX_RETRIES)"
                sleep 3
            else
                echo "ERROR: Could not extract hashes from PostgreSQL after $MAX_RETRIES attempts."
                echo "PgBouncer cannot start without userlist.txt"
                echo "Please ensure PostgreSQL is running and accessible, then restart PgBouncer"
                exit 1
            fi
        fi
    done
else
    echo "ERROR: psql not available and cannot extract hashes dynamically"
    echo "PgBouncer requires postgresql-client to extract SCRAM-SHA-256 hashes from PostgreSQL"
    echo "Please ensure the PgBouncer image includes postgresql-client (see docker/pgbouncer/Dockerfile)"
    exit 1
fi

echo "Final userlist.txt contents:"
cat /etc/pgbouncer/userlist.txt

# Create log and pid directories
mkdir -p /var/log/pgbouncer
mkdir -p /var/run/pgbouncer
chmod 777 /var/log/pgbouncer /var/run/pgbouncer

# Wait for PostgreSQL to be ready (check both port and database readiness)
# This is done earlier in the script, but we need the variables here too
POSTGRES_HOST="${POSTGRES_HOST:-postgres-primary}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-tracking_db}"

# Additional wait after hash extraction to ensure PostgreSQL is fully ready
echo "PostgreSQL check complete - starting PgBouncer"

# Start PgBouncer (using full path to binary, run as current user)
exec /opt/pgbouncer/pgbouncer /etc/pgbouncer/pgbouncer.ini
