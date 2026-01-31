#!/bin/bash
set -e

# Wait for database to be ready
until pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"; do
  echo "Waiting for database..."
  sleep 2
done

# Note: setup-replication-user.sh (02-setup-replication-user.sh) runs automatically
# from docker-entrypoint-initdb.d before this script, so we don't need to call it again

# Create read-only user for parser services (if not exists)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'parser_readonly') THEN
            CREATE USER parser_readonly WITH PASSWORD 'readonly_password';
        END IF;
    END
    \$\$;
    GRANT CONNECT ON DATABASE tracking_db TO parser_readonly;
    GRANT USAGE ON SCHEMA public TO parser_readonly;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO parser_readonly;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO parser_readonly;
EOSQL

# Create write user for consumers (if not exists)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'tracking_writer') THEN
            CREATE USER tracking_writer WITH PASSWORD 'writer_password';
        END IF;
    END
    \$\$;
    GRANT ALL PRIVILEGES ON DATABASE tracking_db TO tracking_writer;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tracking_writer;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO tracking_writer;
EOSQL

echo "Database users created successfully"
