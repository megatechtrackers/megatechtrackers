#!/bin/bash
set -e

# Script to load location_reference.csv into location_reference table and create geometries
# This runs on every container startup to ensure data is loaded

echo "=========================================="
echo "Loading location reference data from CSV..."
echo "=========================================="

# Wait for database to be ready
until pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"; do
  echo "Waiting for database to be ready..."
  sleep 2
done

echo "Database is ready, checking for CSV file..."

# Path to CSV file (mounted from docker-compose)
CSV_FILE="/docker-entrypoint-initdb.d/location_reference.csv"

if [ ! -f "$CSV_FILE" ]; then
    echo "Warning: location_reference.csv not found at $CSV_FILE"
    echo "Location reference data will not be loaded from CSV"
    echo "=========================================="
    exit 0
fi

# Check if location reference table exists, wait for it if it doesn't exist yet
# This handles cases where script runs before table is created
TABLE_EXISTS=$(psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'location_reference');" 2>/dev/null | tr -d ' ' || echo "f")

if [ "$TABLE_EXISTS" != "t" ]; then
    echo "location reference table does not exist yet, waiting for it to be created..."
    MAX_WAIT=60  # Wait up to 1 minute for table creation
    WAITED=0
    
    while [ $WAITED -lt $MAX_WAIT ]; do
        TABLE_EXISTS=$(psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'reference');" 2>/dev/null | tr -d ' ' || echo "f")
        
        if [ "$TABLE_EXISTS" = "t" ]; then
            echo "✓ location reference table now exists"
            break
        fi
        
        sleep 2
        WAITED=$((WAITED + 2))
        if [ $((WAITED % 10)) -eq 0 ]; then
            echo "  Still waiting for table... (${WAITED}/${MAX_WAIT}s)"
        fi
    done
    
    if [ "$TABLE_EXISTS" != "t" ]; then
        echo "⚠ Warning: location reference table was not created within ${MAX_WAIT}s"
        echo "Location reference data will be loaded after table is created."
        echo "=========================================="
        exit 0
    fi
fi

echo "Loading location reference data from $CSV_FILE..."

# Load data using COPY command (fastest method)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOF
-- Create temporary table for bulk loading
CREATE TEMP TABLE location_reference_temp (
    id INTEGER,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    reference TEXT
);

-- Copy data from CSV (skip header row)
\copy location_reference_temp(id, latitude, longitude, reference) FROM '$CSV_FILE' WITH (FORMAT csv, HEADER true, DELIMITER ',');

-- Upsert into main location reference table and create geometries
-- Handle NULL reference values by replacing with empty string
INSERT INTO location_reference (id, latitude, longitude, reference, geom)
SELECT 
    id,
    latitude,
    longitude,
    COALESCE(reference, '') as reference,
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) as geom
FROM location_reference_temp
WHERE latitude IS NOT NULL AND longitude IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    reference = COALESCE(EXCLUDED.reference, ''),
    geom = ST_SetSRID(ST_MakePoint(EXCLUDED.longitude, EXCLUDED.latitude), 4326);

-- Update any existing rows that might have NULL geometry
UPDATE location_reference 
SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE geom IS NULL;

-- Analyze table for query optimizer
ANALYZE location_reference;

-- Show statistics
SELECT 
    COUNT(*) as total_references,
    COUNT(geom) as references_with_geometry
FROM location_reference;
EOF

echo "Reference data loaded successfully!"
echo "=========================================="
