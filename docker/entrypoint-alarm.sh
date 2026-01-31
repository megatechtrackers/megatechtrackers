#!/bin/sh
set -e

echo "========================================"
echo "Alarm Service Entrypoint"
echo "========================================"

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
until PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST:-postgres-primary}" -U "${DB_USER:-postgres}" -d "${DB_NAME:-tracking_db}" -c '\q' 2>/dev/null; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done
echo "✓ PostgreSQL is up and running!"

# Wait for Redis to be ready (if REDIS_URL is configured)
if [ -n "${REDIS_URL}" ]; then
  echo "Waiting for Redis to be ready..."
  REDIS_HOST=$(echo "${REDIS_URL}" | sed -E 's|redis://([^:]+):([0-9]+).*|\1|')
  REDIS_PORT=$(echo "${REDIS_URL}" | sed -E 's|redis://([^:]+):([0-9]+).*|\2|' || echo "6379")
  
  until nc -z "${REDIS_HOST:-redis}" "${REDIS_PORT:-6379}" 2>/dev/null; do
    echo "Redis is unavailable - sleeping"
    sleep 2
  done
  echo "✓ Redis is up and running!"
else
  echo "⚠ Redis URL not configured - rate limiting will be disabled"
fi

# Wait for RabbitMQ to be ready (if RABBITMQ_URL is configured)
if [ -n "${RABBITMQ_URL}" ]; then
  echo "Waiting for RabbitMQ to be ready..."
  RABBITMQ_HOST=$(echo "${RABBITMQ_URL}" | sed -E 's|amqp://[^@]+@([^:]+):([0-9]+).*|\1|')
  RABBITMQ_PORT=$(echo "${RABBITMQ_URL}" | sed -E 's|amqp://[^@]+@([^:]+):([0-9]+).*|\2|' || echo "5672")
  
  until nc -z "${RABBITMQ_HOST:-rabbitmq-lb}" "${RABBITMQ_PORT:-5672}" 2>/dev/null; do
    echo "RabbitMQ is unavailable - sleeping"
    sleep 2
  done
  echo "✓ RabbitMQ is up and running!"
else
  echo "⚠ RabbitMQ URL not configured - message queuing will be disabled"
fi

# Verify dist folder exists (should be built in Dockerfile)
if [ ! -d "dist" ] || [ ! -f "dist/index.js" ]; then
  echo "❌ Error: dist folder not found. TypeScript build failed in Dockerfile."
  exit 1
fi

# Display configuration
echo "========================================"
echo "Configuration:"
echo "  Database Host: ${DB_HOST:-postgres-primary}"
echo "  Database Port: ${DB_PORT:-5432}"
echo "  Database Name: ${DB_NAME:-tracking_db}"
echo "  Redis URL: ${REDIS_URL:-not configured}"
echo "  RabbitMQ URL: ${RABBITMQ_URL:-not configured}"
echo "  Poll Interval: ${POLL_INTERVAL:-5000}ms"
echo "  Email Host: ${EMAIL_HOST:-smtp.gmail.com}"
echo "  Email Port: ${EMAIL_PORT:-587}"
echo "  Email User: ${EMAIL_USER:-not configured}"
echo "  SMS API URL: ${SMS_API_URL:-not configured}"
echo "  Node Environment: ${NODE_ENV:-production}"
echo "========================================"

# Execute the main command
exec "$@"
