#!/bin/bash
set -e

# Script to load unit_io_mapping.csv into the database
# This runs on every container startup to ensure data is loaded

echo "=========================================="
echo "Loading Unit IO mappings from CSV..."
echo "=========================================="

# Wait for database to be ready
until pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"; do
  echo "Waiting for database to be ready..."
  sleep 2
done

echo "Database is ready, checking for CSV file..."

# Path to CSV file (mounted from docker-compose)
CSV_FILE="/docker-entrypoint-initdb.d/unit_io_mapping.csv"

if [ ! -f "$CSV_FILE" ]; then
    echo "Warning: unit_io_mapping.csv not found at $CSV_FILE"
    echo "Unit IO mappings will not be loaded from CSV"
    echo "=========================================="
    exit 0
fi

# Check if unit_io_mapping table exists, wait for it if it doesn't exist yet
# This handles cases where script runs before table is created
TABLE_EXISTS=$(psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'unit_io_mapping');" 2>/dev/null | tr -d ' ' || echo "f")

if [ "$TABLE_EXISTS" != "t" ]; then
    echo "unit_io_mapping table does not exist yet, waiting for it to be created..."
    MAX_WAIT=60  # Wait up to 1 minute for table creation
    WAITED=0
    
    while [ $WAITED -lt $MAX_WAIT ]; do
        TABLE_EXISTS=$(psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'unit_io_mapping');" 2>/dev/null | tr -d ' ' || echo "f")
        
        if [ "$TABLE_EXISTS" = "t" ]; then
            echo "✓ unit_io_mapping table now exists"
            break
        fi
        
        sleep 2
        WAITED=$((WAITED + 2))
        if [ $((WAITED % 10)) -eq 0 ]; then
            echo "  Still waiting for table... (${WAITED}/${MAX_WAIT}s)"
        fi
    done
    
    if [ "$TABLE_EXISTS" != "t" ]; then
        echo "⚠ Warning: unit_io_mapping table was not created within ${MAX_WAIT}s"
        echo "Unit IO mappings will be loaded after table is created."
        echo "=========================================="
        exit 0
    fi
fi

echo "Found Unit IO mapping CSV file, loading into database..."

# Load CSV using PostgreSQL COPY command
# Check for duplicates before inserting
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create temporary table for CSV import
    CREATE TEMP TABLE unit_io_mapping_temp (
        imei TEXT,
        io_id INTEGER,
        io_multiplier DOUBLE PRECISION,
        io_type INTEGER,
        io_name VARCHAR(255),
        value_name VARCHAR(255),
        value TEXT,
        target INTEGER,
        column_name VARCHAR(255),
        start_time TIME,
        end_time TIME,
        is_alarm INTEGER,
        is_sms INTEGER,
        is_email INTEGER,
        is_call INTEGER
    );
    
    -- Copy CSV data into temp table
    COPY unit_io_mapping_temp FROM '$CSV_FILE' WITH (FORMAT csv, HEADER true, DELIMITER ',');
    
    -- Insert into unit_io_mapping table, handling:
    -- 1. IMEI conversion (scientific notation to BIGINT)
    -- 2. NULL value handling
    -- 3. Duplicate prevention (skip if already exists)
    INSERT INTO unit_io_mapping (
        imei, io_id, io_multiplier, io_type, io_name, value_name, value,
        target, column_name, start_time, end_time,
        is_alarm, is_sms, is_email, is_call
    )
    SELECT 
        CASE 
            WHEN temp.imei ~ '^[0-9]+\.?[0-9]*[Ee][+-]?[0-9]+$' THEN
                -- Handle scientific notation (e.g., 3.57691E+14)
                CAST(CAST(temp.imei AS DOUBLE PRECISION) AS BIGINT)
            ELSE
                -- Regular number
                CAST(temp.imei AS BIGINT)
        END as imei,
        temp.io_id,
        temp.io_multiplier,
        temp.io_type,
        temp.io_name,
        temp.value_name,
        CASE 
            WHEN temp.value = '' OR temp.value = 'NA' OR temp.value IS NULL THEN NULL
            ELSE CAST(temp.value AS DOUBLE PRECISION)
        END as value,
        temp.target,
        temp.column_name,
        temp.start_time::TIME,
        temp.end_time::TIME,
        temp.is_alarm,
        temp.is_sms,
        temp.is_email,
        temp.is_call
    FROM unit_io_mapping_temp temp
    WHERE NOT EXISTS (
        -- Prevent duplicates: check if same imei, io_id, value_name, and value already exists
        SELECT 1 FROM unit_io_mapping existing
        WHERE existing.imei = CASE 
            WHEN temp.imei ~ '^[0-9]+\.?[0-9]*[Ee][+-]?[0-9]+$' THEN
                CAST(CAST(temp.imei AS DOUBLE PRECISION) AS BIGINT)
            ELSE
                CAST(temp.imei AS BIGINT)
        END
        AND existing.io_id = temp.io_id
        AND existing.value_name = temp.value_name
        AND (
            (existing.value IS NULL AND (temp.value = '' OR temp.value = 'NA' OR temp.value IS NULL))
            OR (existing.value IS NOT NULL AND temp.value != '' AND temp.value != 'NA' AND temp.value IS NOT NULL 
                AND existing.value = CAST(temp.value AS DOUBLE PRECISION))
        )
    );
    
    -- Get count of inserted rows
    DO \$\$
    DECLARE
        inserted_count INTEGER;
        total_count INTEGER;
    BEGIN
        GET DIAGNOSTICS inserted_count = ROW_COUNT;
        SELECT COUNT(*) INTO total_count FROM unit_io_mapping;
        RAISE NOTICE 'Inserted % new Unit IO mapping records from CSV (total: %)', inserted_count, total_count;
    END
    \$\$;
    
    -- Drop temp table
    DROP TABLE unit_io_mapping_temp;
EOSQL

echo "Unit IO mappings loaded successfully!"
echo "=========================================="
