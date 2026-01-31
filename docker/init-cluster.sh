#!/bin/bash
# Initialize RabbitMQ cluster after containers are up

set -e

echo "Waiting for RabbitMQ nodes to be ready..."

# Wait for node 1 to be ready
echo "Waiting for rabbitmq-1 to be ready..."
MAX_WAIT=120
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if docker exec rabbitmq-1 rabbitmq-diagnostics -q ping 2>/dev/null; then
        echo "✓ rabbitmq-1 is ready"
        break
    fi
    if [ $WAITED -eq $MAX_WAIT ]; then
        echo "ERROR: rabbitmq-1 did not become ready in time"
        exit 1
    fi
    sleep 2
    WAITED=$((WAITED + 2))
    if [ $((WAITED % 10)) -eq 0 ]; then
        echo "  Still waiting for rabbitmq-1... (${WAITED}/${MAX_WAIT}s)"
    fi
done

# Wait for node 2 to be ready
echo "Waiting for rabbitmq-2 to be ready..."
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if docker exec rabbitmq-2 rabbitmq-diagnostics -q ping 2>/dev/null; then
        echo "✓ rabbitmq-2 is ready"
        break
    fi
    if [ $WAITED -eq $MAX_WAIT ]; then
        echo "ERROR: rabbitmq-2 did not become ready in time"
        exit 1
    fi
    sleep 2
    WAITED=$((WAITED + 2))
    if [ $((WAITED % 10)) -eq 0 ]; then
        echo "  Still waiting for rabbitmq-2... (${WAITED}/${MAX_WAIT}s)"
    fi
done

# Wait for node 3 to be ready
echo "Waiting for rabbitmq-3 to be ready..."
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if docker exec rabbitmq-3 rabbitmq-diagnostics -q ping 2>/dev/null; then
        echo "✓ rabbitmq-3 is ready"
        break
    fi
    if [ $WAITED -eq $MAX_WAIT ]; then
        echo "ERROR: rabbitmq-3 did not become ready in time"
        exit 1
    fi
    sleep 2
    WAITED=$((WAITED + 2))
    if [ $((WAITED % 10)) -eq 0 ]; then
        echo "  Still waiting for rabbitmq-3... (${WAITED}/${MAX_WAIT}s)"
    fi
done

echo "Setting up RabbitMQ cluster..."

# Join node 2 to cluster
echo "Joining rabbitmq-2 to cluster..."
docker exec rabbitmq-2 rabbitmqctl stop_app || true
docker exec rabbitmq-2 rabbitmqctl reset || true
docker exec rabbitmq-2 rabbitmqctl join_cluster rabbit@rabbitmq-1
docker exec rabbitmq-2 rabbitmqctl start_app

# Join node 3 to cluster
echo "Joining rabbitmq-3 to cluster..."
docker exec rabbitmq-3 rabbitmqctl stop_app || true
docker exec rabbitmq-3 rabbitmqctl reset || true
docker exec rabbitmq-3 rabbitmqctl join_cluster rabbit@rabbitmq-1
docker exec rabbitmq-3 rabbitmqctl start_app

# Set HA policy for all queues
echo "Setting HA policy..."
docker exec rabbitmq-1 rabbitmqctl set_policy ha-all ".*" '{"ha-mode":"all","ha-sync-mode":"automatic"}' --priority 0 --apply-to queues

# Verify cluster status
echo ""
echo "Cluster status:"
docker exec rabbitmq-1 rabbitmqctl cluster_status

echo ""
echo "RabbitMQ cluster setup complete!"
