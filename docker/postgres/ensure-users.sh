#!/bin/bash
set -e

# Script to ensure PostgreSQL users exist (idempotent)
# This runs on every container startup, not just first init

echo "=========================================="
echo "Ensuring PostgreSQL users exist..."
echo "=========================================="

# Wait for database to be ready
until pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"; do
  echo "Waiting for database to be ready..."
  sleep 2
done

echo "Database is ready, checking users..."

# Ensure replication user exists
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'replica_user') THEN
            CREATE USER replica_user WITH REPLICATION PASSWORD 'replica_password';
            RAISE NOTICE 'Replication user created';
        ELSE
            RAISE NOTICE 'Replication user already exists';
        END IF;
    END
    \$\$;
EOSQL

# Ensure replication slot exists
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_replication_slots WHERE slot_name = 'replica_slot') THEN
            PERFORM pg_create_physical_replication_slot('replica_slot');
            RAISE NOTICE 'Replication slot created';
        ELSE
            RAISE NOTICE 'Replication slot already exists';
        END IF;
    END
    \$\$;
EOSQL

# Ensure parser_readonly user exists
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'parser_readonly') THEN
            CREATE USER parser_readonly WITH PASSWORD 'readonly_password';
            RAISE NOTICE 'parser_readonly user created';
        ELSE
            RAISE NOTICE 'parser_readonly user already exists';
        END IF;
    END
    \$\$;
    GRANT CONNECT ON DATABASE tracking_db TO parser_readonly;
    GRANT USAGE, CREATE ON SCHEMA public TO parser_readonly;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO parser_readonly;
    GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO parser_readonly;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO parser_readonly;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO parser_readonly;
EOSQL

# Ensure tracking_writer user exists
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'tracking_writer') THEN
            CREATE USER tracking_writer WITH PASSWORD 'writer_password';
            RAISE NOTICE 'tracking_writer user created';
        ELSE
            RAISE NOTICE 'tracking_writer user already exists';
        END IF;
    END
    \$\$;
    GRANT ALL PRIVILEGES ON DATABASE tracking_db TO tracking_writer;
    GRANT ALL PRIVILEGES ON SCHEMA public TO tracking_writer;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tracking_writer;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO tracking_writer;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO tracking_writer;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO tracking_writer;
EOSQL

# Ensure TimescaleDB extension exists
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS timescaledb;
EOSQL

# Execute schema SQL file if tables don't exist (fallback if ORM hasn't created them yet)
# This ensures tables exist even if consumer/parser services haven't started
SCHEMA_FILE="/docker-entrypoint-initdb.d/01-schema.sql"
if [ -f "$SCHEMA_FILE" ]; then
    echo "Checking if database schema needs to be created..."
    # Check if trackdata table exists (main table that should always exist)
    TABLE_EXISTS=$(psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'trackdata');" 2>/dev/null | tr -d ' ' || echo "f")
    
    if [ "$TABLE_EXISTS" != "t" ]; then
        echo "Tables do not exist, executing schema SQL file..."
        psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$SCHEMA_FILE" 2>&1
        if [ $? -eq 0 ]; then
            echo "✓ Database schema created successfully"
        else
            echo "⚠ Warning: Schema SQL execution had errors (tables may be created by ORM later)"
        fi
    else
        echo "✓ Database tables already exist"
    fi
else
    echo "⚠ Schema SQL file not found at $SCHEMA_FILE (tables will be created by ORM)"
fi

# Load Unit IO mapping from CSV (if CSV file exists and table is empty)
# This ensures data is loaded on fresh restarts
CSV_FILE="/docker-entrypoint-initdb.d/unit_io_mapping.csv"
if [ -f "$CSV_FILE" ]; then
    echo "Checking if Unit IO mapping need to be loaded..."
    # Check if unit_io_mapping table exists and has data
    MAPPING_COUNT=$(psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM unit_io_mapping;" 2>/dev/null | tr -d ' ' || echo "0")
    if [ "$MAPPING_COUNT" = "0" ] || [ -z "$MAPPING_COUNT" ]; then
        echo "Unit IO mappings table is empty, loading from CSV..."
        /docker-entrypoint-initdb.d/04-load-unit-io-mapping.sh 2>&1 || echo "Warning: Failed to load Unit IO mappings from CSV (may already be loaded)"
    else
        echo "Unit IO mappings already loaded ($MAPPING_COUNT records)"
    fi
else
    echo "Unit IO mapping CSV file not found at $CSV_FILE (skipping)"
fi

# Load location reference data from CSV (if CSV file exists and table is empty)
# This ensures data is loaded on fresh restarts
LOC_CSV_FILE="/docker-entrypoint-initdb.d/location_reference.csv"
if [ -f "$LOC_CSV_FILE" ]; then
    echo "Checking if location reference data needs to be loaded..."
    # Check if location reference table exists and has data
    REF_COUNT=$(psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM location_reference;" 2>/dev/null | tr -d ' ' || echo "0")
    if [ "$REF_COUNT" = "0" ] || [ -z "$REF_COUNT" ]; then
        echo "Location reference table is empty, loading from CSV..."
        /docker-entrypoint-initdb.d/05-load-location-reference-data.sh 2>&1 || echo "Warning: Failed to load location reference data from CSV (may already be loaded)"
    else
        echo "Location reference data already loaded ($REF_COUNT records)"
    fi
else
    echo "Location reference CSV file not found at $LOC_CSV_FILE (skipping)"
fi

echo "All users, extensions, and tables verified!"
echo "=========================================="
