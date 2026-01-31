#!/bin/bash
set -e

# Wait for database to be ready
until pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"; do
  echo "Waiting for database to be ready..."
  sleep 2
done

echo "Setting up replication user..."

# Create replication user (if not exists)
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

# Create replication slot (if not exists)
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

echo "Replication user and slot setup complete"
