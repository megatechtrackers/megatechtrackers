#!/bin/bash
# Complete Clean Restart Script for Megatechtrackers (PRODUCTION)
# Linux/macOS equivalent of complete-clean-restart.ps1
# Full stack: parsers, consumers, alarm-service, monitoring; no mocks.

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "  COMPLETE CLEAN RESTART (PRODUCTION)"
echo "  WARNING: This will delete ALL data!"
echo "========================================"
echo ""

read -p "Are you sure you want to delete ALL Docker resources? Type 'YES' to continue: " confirm
if [ "$confirm" != "YES" ]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "=== Step 1: Stopping all containers (all profiles) ==="
docker compose --profile testing --profile frappe --profile production down || true
docker compose down || true

echo ""
echo "=== Step 2: Removing all containers ==="
containers=$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E 'parser-service|camera-parser|consumer-service-|postgres-|rabbitmq-|monitoring-service|prometheus|grafana|alertmanager|.*-exporter|alarm-service|haproxy-tracker|sms-gateway-service|ops-service|mariadb|frappe|access-gateway|web-app|mobile-app|docs' || true)
if [ -n "$containers" ]; then
    echo "$containers" | while read -r name; do
        [ -z "$name" ] && continue
        echo "  Removing container: $name"
        docker rm -f "$name" 2>/dev/null || true
    done
    echo "Removed remaining containers"
else
    echo "All containers removed by docker compose down"
fi

echo ""
echo "=== Step 3: Removing all volumes ==="
docker compose down -v 2>/dev/null || true
volumes=$(docker volume ls --format '{{.Name}}' 2>/dev/null | grep -E 'postgres-primary|postgres-replica|rabbitmq-[123]|mariadb-data|frappe-data' || true)
if [ -n "$volumes" ]; then
    echo "$volumes" | while read -r vol; do
        [ -z "$vol" ] && continue
        echo "  Removing volume: $vol"
        docker volume rm "$vol" 2>/dev/null || true
    done
    echo "All volumes removed"
else
    echo "All volumes removed by docker compose down"
fi

echo ""
echo "=== Step 4: Removing all networks ==="
networks=$(docker network ls --format '{{.Name}}' 2>/dev/null | grep -E 'tracking-network|ingestion' || true)
if [ -n "$networks" ]; then
    echo "$networks" | while read -r net; do
        [ -z "$net" ] && continue
        echo "  Removing network: $net"
        docker network rm "$net" 2>/dev/null || true
    done
    echo "All networks removed"
else
    echo "All networks removed by docker compose down"
fi

echo ""
echo "=== Step 5: Removing Docker images (optional) ==="
read -p "Do you want to remove Docker images? This will force a complete rebuild (y/N): " removeImages
if [ "$removeImages" = "y" ] || [ "$removeImages" = "Y" ]; then
    images=$(docker images --filter "reference=ingestion*" --format "{{.Repository}}:{{.Tag}}" 2>/dev/null || true)
    if [ -n "$images" ]; then
        echo "$images" | while read -r img; do
            [ -z "$img" ] && continue
            echo "  Removing image: $img"
            docker rmi -f "$img" 2>/dev/null || true
        done
        echo "All images removed"
    else
        echo "No images found"
    fi
else
    echo "Keeping images (will use cache if available)"
fi

echo ""
echo "=== Step 6: Cleaning up Docker system ==="
read -p "Do you want to run 'docker system prune'? This removes unused Docker resources (y/N): " pruneSystem
if [ "$pruneSystem" = "y" ] || [ "$pruneSystem" = "Y" ]; then
    echo "Running docker system prune (this may take a while)..."
    echo "  Note: This command can take several minutes if there are many unused resources"
    docker system prune -f || true
    echo "System cleanup complete"
else
    echo "Skipping system prune"
fi

echo ""
echo "=== Step 7: Rebuilding Docker images (one at a time to prevent throttling) ==="

# Build services sequentially to prevent network throttling
services=(
    "postgres-primary"
    "pgbouncer"
    "parser-service-1"
    "consumer-service-database"
    "consumer-service-alarm"
    "monitoring-service"
    "sms-gateway-service"
    "camera-parser"
    "ops-service-backend"
    "ops-service-frontend"
    "access-gateway"
    "web-app"
    "docs"
    "frappe"
    "mobile-app"
)

total=${#services[@]}
current=0
failed_services=()

for service in "${services[@]}"; do
    ((current++))
    echo "  [$current/$total] Building $service..."
    if docker compose build --no-cache "$service" > /dev/null 2>&1; then
        echo "    ✓ $service built successfully"
    else
        echo "    ⚠ Failed to build $service (will retry later)"
        failed_services+=("$service")
    fi
done

# Retry failed services once
if [ ${#failed_services[@]} -gt 0 ]; then
    echo ""
    echo "  Retrying ${#failed_services[@]} failed service(s)..."
    for service in "${failed_services[@]}"; do
        echo "  Retrying $service..."
        if docker compose build --no-cache "$service"; then
            echo "    ✓ $service built successfully on retry"
        else
            echo "    ✗ $service failed again"
        fi
    done
fi

echo "Image building complete"

echo ""
echo "=== Step 8: Starting core services (PostgreSQL, RabbitMQ, Redis) ==="
docker compose up -d postgres-primary postgres-replica rabbitmq-1 rabbitmq-2 rabbitmq-3 rabbitmq-lb redis

echo "Waiting for PostgreSQL primary to be healthy (loading data may take 1-2 minutes)..."
max_wait=180
waited=0
primary_healthy=false
while [ $waited -lt $max_wait ]; do
    health=$(docker inspect postgres-primary --format='{{.State.Health.Status}}' 2>/dev/null || true)
    if [ "$health" = "healthy" ]; then
        echo "  ✓ PostgreSQL primary is healthy"
        primary_healthy=true
        break
    fi
    sleep 5
    waited=$((waited + 5))
    if [ $((waited % 15)) -eq 0 ]; then
        echo "  Waiting for PostgreSQL... ($waited/$max_wait seconds)"
    fi
done
if [ "$primary_healthy" = false ]; then
    echo "  ⚠ PostgreSQL primary health check timed out, continuing anyway..."
fi

echo "Starting pgbouncer..."
docker compose up -d pgbouncer || true
echo "Core services started"

echo ""
echo "=== Step 8b: Starting remaining core services (production) ==="
docker compose stop alarm-service-test 2>/dev/null || true
docker compose rm -f alarm-service-test 2>/dev/null || true
docker compose --profile production up -d haproxy-tracker parser-service-1 parser-service-2 parser-service-3 parser-service-4 parser-service-5 parser-service-6 parser-service-7 parser-service-8 camera-parser consumer-service-database consumer-service-alarm monitoring-service alarm-service sms-gateway-service ops-service-backend ops-service-frontend
echo "Core services started"
echo "Waiting for services to initialize..."
sleep 10

echo ""
echo "=== Step 8c: Starting monitoring stack ==="
docker compose up -d prometheus alertmanager grafana postgres-exporter postgres-exporter-replica node-exporter pgbouncer-exporter rabbitmq-exporter || true
echo "Monitoring stack started"

echo ""
echo "=== Step 9: Setting up RabbitMQ Cluster ==="
echo "Waiting for RabbitMQ nodes to be ready..."
sleep 15
if [ -f "$SCRIPT_DIR/docker/init-cluster.sh" ]; then
    echo "Running cluster formation script..."
    bash "$SCRIPT_DIR/docker/init-cluster.sh" && echo "  ✓ RabbitMQ cluster formed successfully" || echo "  ⚠ Cluster setup encountered issues"
else
    echo "  ⚠ Cluster script not found at: $SCRIPT_DIR/docker/init-cluster.sh"
fi
echo "Verifying cluster status..."
docker exec rabbitmq-1 rabbitmqctl cluster_status 2>/dev/null || true

echo ""
echo "=== Step 10: Waiting for services to initialize ==="
max_wait=90
waited=0
while [ $waited -lt $max_wait ]; do
    if docker exec postgres-primary pg_isready -U postgres 2>/dev/null | grep -q "accepting connections"; then
        echo "  ✓ PostgreSQL primary is ready"
        break
    fi
    sleep 3
    waited=$((waited + 3))
    echo "  Waiting... ($waited/$max_wait seconds)"
done

echo "Waiting for RabbitMQ..."
waited=0
while [ $waited -lt $max_wait ]; do
    if docker exec rabbitmq-1 rabbitmq-diagnostics ping 2>/dev/null | grep -q "pong"; then
        echo "  ✓ RabbitMQ is ready"
        break
    fi
    sleep 3
    waited=$((waited + 3))
    echo "  Waiting... ($waited/$max_wait seconds)"
done

echo "Waiting for other services to start..."
sleep 10

echo ""
echo "=== Step 11: Verifying PostgreSQL ==="
sleep 3
docker exec postgres-primary psql -U postgres -d tracking_db -t -c "SELECT 1 FROM pg_user WHERE usename = 'replica_user';" 2>/dev/null | grep -q "1" && echo "  ✓ replica_user exists" || echo "  ⚠ replica_user not found"
docker exec postgres-primary psql -U postgres -d tracking_db -t -c "SELECT 1 FROM pg_user WHERE usename = 'parser_readonly';" 2>/dev/null | grep -q "1" && echo "  ✓ parser_readonly exists" || echo "  ⚠ parser_readonly not found"
docker exec postgres-primary psql -U postgres -d tracking_db -t -c "SELECT 1 FROM pg_user WHERE usename = 'tracking_writer';" 2>/dev/null | grep -q "1" && echo "  ✓ tracking_writer exists" || echo "  ⚠ tracking_writer not found"
docker exec postgres-primary psql -U postgres -d tracking_db -t -c "SELECT 1 FROM information_schema.tables WHERE table_name = 'commands';" 2>/dev/null | grep -q "1" && echo "  ✓ commands table exists" || echo "  ⚠ commands table not found"
docker exec postgres-primary psql -U postgres -d tracking_db -t -c "SELECT 1 FROM information_schema.tables WHERE table_name = 'command_outbox';" 2>/dev/null | grep -q "1" && echo "  ✓ command_outbox table exists" || echo "  ⚠ command_outbox table not found"

echo ""
echo "=== Step 12: Final Verification ==="
echo ""
echo "Container Status:"
docker compose ps

echo ""
echo "PostgreSQL Replica Status:"
sleep 5
docker exec postgres-replica psql -U postgres -c "SELECT pg_is_in_recovery();" 2>/dev/null | grep -q "t" && echo "  ✓ Replica is in recovery mode" || echo "  ⚠ Replica may still be initializing"

echo ""
echo "RabbitMQ Connections:"
sleep 5
connections=$(docker exec rabbitmq-1 rabbitmqctl list_connections 2>/dev/null | grep -c "tracking_user" || echo "0")
echo "  ✓ $connections active connection(s) from tracking_user"

echo ""
echo "========================================"
echo "  CORE TRACKING SERVICES COMPLETE!"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. View all containers: docker compose ps"
echo "  2. RabbitMQ Management: http://localhost:15672 (tracking_user/tracking_password)"
echo "  3. Monitoring Dashboard: http://localhost:8888"
echo "  4. Prometheus: http://localhost:9090"
echo "  5. Grafana: http://localhost:3000 (admin/admin)"
echo "  6. Alertmanager: http://localhost:9093"
echo "  7. Operations Service UI: http://localhost:13000"
echo "  8. Operations Service API: http://localhost:18000/health"
echo ""
echo "To start Frappe layer later:"
echo "  docker compose --profile frappe up -d"
echo ""

echo "=== Optional: Frappe Access Control Layer ==="
read -p "Do you want to start the Frappe access control layer? (y/N): " startFrappe
if [ "$startFrappe" = "y" ] || [ "$startFrappe" = "Y" ]; then
    echo ""
    echo "Starting Frappe (run docker-start-frappe.sh)..."
    if [ -f "$SCRIPT_DIR/docker-start-frappe.sh" ]; then
        bash "$SCRIPT_DIR/docker-start-frappe.sh"
    else
        echo "  docker-start-frappe.sh not found. Run: docker compose --profile frappe up -d"
        docker compose --profile frappe up -d || true
    fi
fi
