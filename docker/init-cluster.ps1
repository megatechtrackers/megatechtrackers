# PowerShell script to initialize RabbitMQ cluster

Write-Host "Waiting for RabbitMQ nodes to be ready..." -ForegroundColor Yellow

# Wait for node 1 to be ready
Write-Host "Waiting for rabbitmq-1 to be ready..." -ForegroundColor Cyan
$maxWait = 120
$waited = 0
while ($waited -lt $maxWait) {
    $result = docker exec rabbitmq-1 rabbitmq-diagnostics -q ping 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ rabbitmq-1 is ready" -ForegroundColor Green
        break
    }
    if ($waited -eq $maxWait) {
        Write-Host "ERROR: rabbitmq-1 did not become ready in time" -ForegroundColor Red
        exit 1
    }
    Start-Sleep -Seconds 2
    $waited += 2
    if ($waited % 10 -eq 0) {
        Write-Host "  Still waiting for rabbitmq-1... ($waited/$maxWait s)" -ForegroundColor Yellow
    }
}

# Wait for node 2 to be ready
Write-Host "Waiting for rabbitmq-2 to be ready..." -ForegroundColor Cyan
$waited = 0
while ($waited -lt $maxWait) {
    $result = docker exec rabbitmq-2 rabbitmq-diagnostics -q ping 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ rabbitmq-2 is ready" -ForegroundColor Green
        break
    }
    if ($waited -eq $maxWait) {
        Write-Host "ERROR: rabbitmq-2 did not become ready in time" -ForegroundColor Red
        exit 1
    }
    Start-Sleep -Seconds 2
    $waited += 2
    if ($waited % 10 -eq 0) {
        Write-Host "  Still waiting for rabbitmq-2... ($waited/$maxWait s)" -ForegroundColor Yellow
    }
}

# Wait for node 3 to be ready
Write-Host "Waiting for rabbitmq-3 to be ready..." -ForegroundColor Cyan
$waited = 0
while ($waited -lt $maxWait) {
    $result = docker exec rabbitmq-3 rabbitmq-diagnostics -q ping 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ rabbitmq-3 is ready" -ForegroundColor Green
        break
    }
    if ($waited -eq $maxWait) {
        Write-Host "ERROR: rabbitmq-3 did not become ready in time" -ForegroundColor Red
        exit 1
    }
    Start-Sleep -Seconds 2
    $waited += 2
    if ($waited % 10 -eq 0) {
        Write-Host "  Still waiting for rabbitmq-3... ($waited/$maxWait s)" -ForegroundColor Yellow
    }
}

Write-Host "Setting up RabbitMQ cluster..." -ForegroundColor Green

# Join node 2 to cluster
Write-Host "Joining rabbitmq-2 to cluster..." -ForegroundColor Yellow
docker exec rabbitmq-2 rabbitmqctl stop_app 2>$null
docker exec rabbitmq-2 rabbitmqctl reset 2>$null
docker exec rabbitmq-2 rabbitmqctl join_cluster rabbit@rabbitmq-1
docker exec rabbitmq-2 rabbitmqctl start_app

# Join node 3 to cluster
Write-Host "Joining rabbitmq-3 to cluster..." -ForegroundColor Yellow
docker exec rabbitmq-3 rabbitmqctl stop_app 2>$null
docker exec rabbitmq-3 rabbitmqctl reset 2>$null
docker exec rabbitmq-3 rabbitmqctl join_cluster rabbit@rabbitmq-1
docker exec rabbitmq-3 rabbitmqctl start_app

# Set HA policy for all queues
Write-Host "Setting HA policy..." -ForegroundColor Yellow
docker exec rabbitmq-1 rabbitmqctl set_policy ha-all ".*" '{"ha-mode":"all","ha-sync-mode":"automatic"}' --priority 0 --apply-to queues

# Verify cluster status
Write-Host ""
Write-Host "Cluster status:" -ForegroundColor Cyan
docker exec rabbitmq-1 rabbitmqctl cluster_status

Write-Host ""
Write-Host "RabbitMQ cluster setup complete!" -ForegroundColor Green
