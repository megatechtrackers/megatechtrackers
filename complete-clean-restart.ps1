# Complete Clean Restart Script for Megatechtrackers
# This script performs a COMPLETE cleanup of all Docker resources and restarts from scratch

Write-Host "========================================" -ForegroundColor Red
Write-Host "  COMPLETE CLEAN RESTART" -ForegroundColor Red
Write-Host "  WARNING: This will delete ALL data!" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Red
Write-Host ""

$confirm = Read-Host "Are you sure you want to delete ALL Docker resources? Type 'YES' to continue"
if ($confirm -ne "YES") {
    Write-Host "Aborted." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "=== Step 1: Stopping all containers (all profiles) ===" -ForegroundColor Yellow
# Stop all profiles: testing, frappe, production
docker compose --profile testing --profile frappe --profile production down
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Some containers may not have stopped cleanly" -ForegroundColor Yellow
}
# Also stop without profile to catch any remaining
docker compose down
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Some containers may not have stopped cleanly" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Step 2: Removing all containers ===" -ForegroundColor Yellow
# docker-compose down should have removed containers, but force remove any remaining
$containers = docker ps -a --format "{{.Names}}" | Where-Object { 
    $_ -match "parser-service|camera-parser|consumer-service-|metric-engine-service|postgres-|rabbitmq-|monitoring-service|prometheus|grafana|alertmanager|.*-exporter|alarm-service|haproxy-tracker|sms-gateway-service|ops-service|mariadb|frappe|access-gateway|web-app|mobile-app|docs" 
}
if ($containers) {
    $containers | ForEach-Object {
        Write-Host "  Removing container: $_" -ForegroundColor Gray
        docker rm -f $_ 2>&1 | Out-Null
    }
    Write-Host "Removed remaining containers" -ForegroundColor Green
} else {
    Write-Host "All containers removed by docker-compose down" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Step 3: Removing all volumes ===" -ForegroundColor Yellow
# Use docker-compose to get project name and remove volumes
Write-Host "  Removing volumes with docker compose..." -ForegroundColor Gray
docker compose down -v 2>&1 | Out-Null
# Also manually remove any volumes that might remain
$allVolumes = docker volume ls --format "{{.Name}}"
$projectVolumes = $allVolumes | Where-Object { 
    $_ -match "postgres-primary|postgres-replica|rabbitmq-[123]|mariadb-data|frappe-data" 
}
if ($projectVolumes) {
    $projectVolumes | ForEach-Object {
        Write-Host "  Removing volume: $_" -ForegroundColor Gray
        docker volume rm $_ 2>&1 | Out-Null
    }
    Write-Host "All volumes removed" -ForegroundColor Green
} else {
    Write-Host "All volumes removed by docker-compose" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Step 4: Removing all networks ===" -ForegroundColor Yellow
# docker-compose down should have removed the network, but check for any remaining
$networks = docker network ls --format "{{.Name}}" | Where-Object { 
    $_ -match "tracking-network|ingestion" 
}
if ($networks) {
    $networks | ForEach-Object {
        Write-Host "  Removing network: $_" -ForegroundColor Gray
        docker network rm $_ 2>&1 | Out-Null
    }
    Write-Host "All networks removed" -ForegroundColor Green
} else {
    Write-Host "All networks removed by docker-compose down" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Step 5: Removing Docker images (optional) ===" -ForegroundColor Yellow
$removeImages = Read-Host "Do you want to remove Docker images? This will force a complete rebuild (y/N)"
if ($removeImages -eq "y" -or $removeImages -eq "Y") {
    $images = docker images --filter "reference=ingestion*" --format "{{.Repository}}:{{.Tag}}"
    if ($images) {
        $images | ForEach-Object {
            Write-Host "  Removing image: $_" -ForegroundColor Gray
            docker rmi -f $_ 2>&1 | Out-Null
        }
        Write-Host "All images removed" -ForegroundColor Green
    } else {
        Write-Host "No images found" -ForegroundColor Gray
    }
} else {
    Write-Host "Keeping images (will use cache if available)" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "=== Step 6: Cleaning up Docker system ===" -ForegroundColor Yellow
$pruneSystem = Read-Host "Do you want to run 'docker system prune'? This removes unused Docker resources (y/N)"
if ($pruneSystem -eq "y" -or $pruneSystem -eq "Y") {
    Write-Host "Running docker system prune (this may take a while)..." -ForegroundColor Gray
    Write-Host "  Note: This command can take several minutes if there are many unused resources" -ForegroundColor Yellow
    # Run with timeout and show progress
    $job = Start-Job -ScriptBlock { docker system prune -f 2>&1 }
    $timeout = 120 # 2 minutes timeout
    $waited = 0
    while ($job.State -eq "Running" -and $waited -lt $timeout) {
        Start-Sleep -Seconds 2
        $waited += 2
        if ($waited % 10 -eq 0) {
            Write-Host "  Still cleaning... ($waited/$timeout seconds)" -ForegroundColor Gray
        }
    }
    if ($job.State -eq "Running") {
        Write-Host "  Prune is taking longer than expected, stopping..." -ForegroundColor Yellow
        Stop-Job $job
        Remove-Job $job
        Write-Host "  Prune stopped (you can run 'docker system prune -f' manually later)" -ForegroundColor Yellow
    } else {
        $result = Receive-Job $job
        Remove-Job $job
        Write-Host "System cleanup complete" -ForegroundColor Green
    }
} else {
    Write-Host "Skipping system prune" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "=== Step 7: Rebuilding Docker images (one at a time to prevent throttling) ===" -ForegroundColor Yellow

# Build services sequentially to prevent network throttling
$services = @(
    "postgres-primary",
    "pgbouncer",
    "parser-service-1",
    "consumer-service-database",
    "consumer-service-alarm",
    "metric-engine-service",
    "monitoring-service",
    "sms-gateway-service",
    "camera-parser",
    "ops-service-backend",
    "ops-service-frontend",
    "access-gateway",
    "web-app",
    "docs",
    "frappe",
    "mobile-app"
)

$totalServices = $services.Count
$currentService = 0
$failedServices = @()

foreach ($service in $services) {
    $currentService++
    Write-Host "  [$currentService/$totalServices] Building $service..." -ForegroundColor Cyan
    docker compose build --no-cache $service 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    ⚠ Failed to build $service (will retry later)" -ForegroundColor Yellow
        $failedServices += $service
    } else {
        Write-Host "    ✓ $service built successfully" -ForegroundColor Green
    }
}

# Retry failed services once
if ($failedServices.Count -gt 0) {
    Write-Host ""
    Write-Host "  Retrying $($failedServices.Count) failed service(s)..." -ForegroundColor Yellow
    foreach ($service in $failedServices) {
        Write-Host "  Retrying $service..." -ForegroundColor Cyan
        docker compose build --no-cache $service
        if ($LASTEXITCODE -ne 0) {
            Write-Host "    ✗ $service failed again" -ForegroundColor Red
        } else {
            Write-Host "    ✓ $service built successfully on retry" -ForegroundColor Green
        }
    }
}

Write-Host "Image building complete" -ForegroundColor Green

Write-Host ""
Write-Host "=== Step 8: Starting core services (PostgreSQL, RabbitMQ, Redis) ===" -ForegroundColor Yellow
# Start core infrastructure first (WITHOUT pgbouncer - it depends on postgres-primary being healthy)
docker compose up -d postgres-primary postgres-replica rabbitmq-1 rabbitmq-2 rabbitmq-3 rabbitmq-lb redis
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error starting core services" -ForegroundColor Red
    exit 1
}

# Wait for postgres-primary to be healthy before starting pgbouncer
Write-Host "Waiting for PostgreSQL primary to be healthy (loading data may take 1-2 minutes)..." -ForegroundColor Cyan
$maxWait = 180  # 3 minutes max wait
$waited = 0
$primaryHealthy = $false
while ($waited -lt $maxWait) {
    $health = docker inspect postgres-primary --format='{{.State.Health.Status}}' 2>&1
    if ($health -eq "healthy") {
        Write-Host "  ✓ PostgreSQL primary is healthy" -ForegroundColor Green
        $primaryHealthy = $true
        break
    }
    Start-Sleep -Seconds 5
    $waited += 5
    if ($waited % 15 -eq 0) {
        Write-Host "  Waiting for PostgreSQL... ($waited/$maxWait seconds)" -ForegroundColor Gray
    }
}
if (-not $primaryHealthy) {
    Write-Host "  ⚠ PostgreSQL primary health check timed out, continuing anyway..." -ForegroundColor Yellow
}

# Now start pgbouncer (depends on postgres-primary)
Write-Host "Starting pgbouncer..." -ForegroundColor Cyan
docker compose up -d pgbouncer
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: pgbouncer may have failed to start" -ForegroundColor Yellow
}
Write-Host "Core services started" -ForegroundColor Green

Write-Host ""
Write-Host "=== Step 8b: Starting remaining core services ===" -ForegroundColor Yellow
# Stop test alarm service if running (shouldn't be, but just in case)
docker compose stop alarm-service-test 2>&1 | Out-Null
docker compose rm -f alarm-service-test 2>&1 | Out-Null

# Start parsers (Teltonika + camera), consumers, haproxy, monitoring-service, alarm-service, sms-gateway-service, ops-service
# Use --profile production so alarm-service (which has that profile) is started
docker-compose --profile production up -d haproxy-tracker parser-service-1 parser-service-2 parser-service-3 parser-service-4 parser-service-5 parser-service-6 parser-service-7 parser-service-8 camera-parser consumer-service-database consumer-service-alarm metric-engine-service monitoring-service alarm-service sms-gateway-service ops-service-backend ops-service-frontend
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error starting core services" -ForegroundColor Red
    exit 1
}
Write-Host "Core services started" -ForegroundColor Green

# Wait a bit for services to initialize
Write-Host "Waiting for services to initialize..." -ForegroundColor Cyan
Start-Sleep -Seconds 10

Write-Host ""
Write-Host "=== Step 8c: Starting monitoring stack ===" -ForegroundColor Yellow
# Start monitoring stack (Prometheus, Grafana, exporters)
docker compose up -d prometheus alertmanager grafana postgres-exporter postgres-exporter-replica node-exporter pgbouncer-exporter rabbitmq-exporter
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Some monitoring services may have failed to start" -ForegroundColor Yellow
} else {
    Write-Host "Monitoring stack started" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Step 9: Setting up RabbitMQ Cluster ===" -ForegroundColor Yellow

# Wait for RabbitMQ to be ready
Write-Host "Waiting for RabbitMQ nodes to be ready..." -ForegroundColor Cyan
Start-Sleep -Seconds 15

# Run cluster setup
$initClusterScript = Join-Path $PSScriptRoot "docker\init-cluster.ps1"
if (Test-Path $initClusterScript) {
    Write-Host "Running cluster formation script..." -ForegroundColor Cyan
    & $initClusterScript
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ RabbitMQ cluster formed successfully" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Cluster setup encountered issues" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⚠ Cluster script not found at: $initClusterScript" -ForegroundColor Red
}

# Verify cluster
Write-Host "Verifying cluster status..." -ForegroundColor Cyan
docker exec rabbitmq-1 rabbitmqctl cluster_status

Write-Host ""
Write-Host "=== Step 10: Waiting for services to initialize ===" -ForegroundColor Yellow

# Wait for PostgreSQL primary
Write-Host "Waiting for PostgreSQL primary..." -ForegroundColor Cyan
$maxWait = 90
$waited = 0
$primaryReady = $false
while ($waited -lt $maxWait) {
    $result = docker exec postgres-primary pg_isready -U postgres 2>&1
    if ($result -match "accepting connections") {
        Write-Host "  ✓ PostgreSQL primary is ready" -ForegroundColor Green
        $primaryReady = $true
        break
    }
    Start-Sleep -Seconds 3
    $waited += 3
    Write-Host "  Waiting... ($waited/$maxWait seconds)" -ForegroundColor Gray
}
if (-not $primaryReady) {
    Write-Host "  ⚠ PostgreSQL primary may not be ready yet" -ForegroundColor Yellow
}

# Wait for RabbitMQ
Write-Host "Waiting for RabbitMQ..." -ForegroundColor Cyan
$waited = 0
$rabbitmqReady = $false
while ($waited -lt $maxWait) {
    $result = docker exec rabbitmq-1 rabbitmq-diagnostics ping 2>&1
    if ($result -match "pong") {
        Write-Host "  ✓ RabbitMQ is ready" -ForegroundColor Green
        $rabbitmqReady = $true
        break
    }
    Start-Sleep -Seconds 3
    $waited += 3
    Write-Host "  Waiting... ($waited/$maxWait seconds)" -ForegroundColor Gray
}
if (-not $rabbitmqReady) {
    Write-Host "  ⚠ RabbitMQ may not be ready yet" -ForegroundColor Yellow
}

# Wait a bit more for other services
Write-Host "Waiting for other services to start..." -ForegroundColor Cyan
Start-Sleep -Seconds 10

Write-Host ""
Write-Host "=== Step 10b: Verifying Database Indexes ===" -ForegroundColor Yellow
Write-Host "Database indexes are created by database/schema.sql during initialization" -ForegroundColor Cyan
Write-Host "  ✓ Indexes should already exist (created by consumer service)" -ForegroundColor Green

Write-Host ""
Write-Host "=== Step 11: Setting up PostgreSQL ===" -ForegroundColor Yellow

# Verify PostgreSQL users (created automatically by entrypoint script)
Write-Host "Verifying PostgreSQL users (created automatically)..." -ForegroundColor Cyan
Start-Sleep -Seconds 3
$replicaUser = docker exec postgres-primary psql -U postgres -d tracking_db -t -c "SELECT 1 FROM pg_user WHERE usename = 'replica_user';" 2>&1
$parserUser = docker exec postgres-primary psql -U postgres -d tracking_db -t -c "SELECT 1 FROM pg_user WHERE usename = 'parser_readonly';" 2>&1
$writerUser = docker exec postgres-primary psql -U postgres -d tracking_db -t -c "SELECT 1 FROM pg_user WHERE usename = 'tracking_writer';" 2>&1
$timescale = docker exec postgres-primary psql -U postgres -d tracking_db -t -c "SELECT 1 FROM pg_extension WHERE extname = 'timescaledb';" 2>&1

if ($replicaUser -match "1") {
    Write-Host "  ✓ replica_user exists" -ForegroundColor Green
} else {
    Write-Host "  ⚠ replica_user not found (may still be initializing)" -ForegroundColor Yellow
}

if ($parserUser -match "1") {
    Write-Host "  ✓ parser_readonly exists" -ForegroundColor Green
} else {
    Write-Host "  ⚠ parser_readonly not found (may still be initializing)" -ForegroundColor Yellow
}

if ($writerUser -match "1") {
    Write-Host "  ✓ tracking_writer exists" -ForegroundColor Green
} else {
    Write-Host "  ⚠ tracking_writer not found (may still be initializing)" -ForegroundColor Yellow
}

if ($timescale -match "1") {
    Write-Host "  ✓ TimescaleDB extension exists" -ForegroundColor Green
} else {
    Write-Host "  ⚠ TimescaleDB extension not found (may still be initializing)" -ForegroundColor Yellow
}

# Verify required tables (created automatically by entrypoint script)
Write-Host "Verifying required tables (created automatically)..." -ForegroundColor Cyan
Start-Sleep -Seconds 2

$processedTable = docker exec postgres-primary psql -U postgres -d tracking_db -t -c "SELECT 1 FROM information_schema.tables WHERE table_name = 'processed_message_ids';" 2>&1
if ($processedTable -match "1") {
    Write-Host "  ✓ processed_message_ids table exists" -ForegroundColor Green
} else {
    Write-Host "  ⚠ processed_message_ids table not found (may still be initializing)" -ForegroundColor Yellow
}

$commandsTable = docker exec postgres-primary psql -U postgres -d tracking_db -t -c "SELECT 1 FROM information_schema.tables WHERE table_name = 'commands';" 2>&1
if ($commandsTable -match "1") {
    Write-Host "  ✓ commands table exists" -ForegroundColor Green
} else {
    Write-Host "  ⚠ commands table not found (may still be initializing)" -ForegroundColor Yellow
}

$unitIOMappingTable = docker exec postgres-primary psql -U postgres -d tracking_db -t -c "SELECT 1 FROM information_schema.tables WHERE table_name = 'unit_io_mapping';" 2>&1
if ($unitIOMappingTable -match "1") {
    Write-Host "  ✓ unit_io_mapping table exists" -ForegroundColor Green
} else {
    Write-Host "  ⚠ unit_io_mapping table not found (may still be initializing)" -ForegroundColor Yellow
}

# Check command system tables (from Operations Service integration)
$commandOutboxTable = docker exec postgres-primary psql -U postgres -d tracking_db -t -c "SELECT 1 FROM information_schema.tables WHERE table_name = 'command_outbox';" 2>&1
if ($commandOutboxTable -match "1") {
    Write-Host "  ✓ command_outbox table exists" -ForegroundColor Green
} else {
    Write-Host "  ⚠ command_outbox table not found (may still be initializing)" -ForegroundColor Yellow
}

$unitTable = docker exec postgres-primary psql -U postgres -d tracking_db -t -c "SELECT 1 FROM information_schema.tables WHERE table_name = 'unit';" 2>&1
if ($unitTable -match "1") {
    Write-Host "  ✓ unit table exists" -ForegroundColor Green
} else {
    Write-Host "  ⚠ unit table not found (may still be initializing)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Step 11b: Configuring Alarm Service ===" -ForegroundColor Yellow
Write-Host "Waiting for alarm-service to be ready..." -ForegroundColor Cyan
Start-Sleep -Seconds 15

# Note: Circuit breakers and pending alarms are automatically reprocessed by the service on startup
# No manual intervention needed - the service handles this automatically
$alarmServiceRunning = docker ps --filter "name=alarm-service" --filter "status=running" --format "{{.Names}}" 2>&1
if ($alarmServiceRunning -match "alarm-service" -and -not ($alarmServiceRunning -match "alarm-service-test")) {
    Write-Host "  ✓ Alarm Service will automatically reset circuit breakers and reprocess pending alarms" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Alarm service not ready yet" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Step 12: Verifying RabbitMQ ===" -ForegroundColor Yellow
Start-Sleep -Seconds 5
Write-Host "Verifying RabbitMQ user (created automatically from definitions.json)..." -ForegroundColor Cyan
$rabbitmqUser = docker exec rabbitmq-1 rabbitmqctl list_users 2>&1
if ($rabbitmqUser -match "tracking_user") {
    Write-Host "  ✓ RabbitMQ user 'tracking_user' exists" -ForegroundColor Green
} else {
    Write-Host "  ⚠ RabbitMQ user 'tracking_user' not found (may still be initializing)" -ForegroundColor Yellow
    Write-Host "    Note: User should be created automatically from definitions.json" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== Step 12b: Health Check Validation ===" -ForegroundColor Yellow
Write-Host "Validating service health endpoints..." -ForegroundColor Cyan

# Wait for services to be ready
Start-Sleep -Seconds 15

$allHealthy = $true

# Check Alarm Service health
try {
    $alarmHealth = Invoke-WebRequest -Uri "http://localhost:3200/health" -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    if ($alarmHealth.StatusCode -eq 200) {
        Write-Host "  ✓ Alarm Service: Healthy" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Alarm Service: Unhealthy (Status: $($alarmHealth.StatusCode))" -ForegroundColor Red
        $allHealthy = $false
    }
} catch {
    Write-Host "  ✗ Alarm Service: Not responding" -ForegroundColor Red
    $allHealthy = $false
}

# Check PostgreSQL
try {
    $pgHealth = docker exec postgres-primary pg_isready -U postgres 2>&1
    if ($pgHealth -match "accepting connections") {
        Write-Host "  ✓ PostgreSQL: Healthy" -ForegroundColor Green
    } else {
        Write-Host "  ✗ PostgreSQL: Not ready" -ForegroundColor Red
        $allHealthy = $false
    }
} catch {
    Write-Host "  ✗ PostgreSQL: Health check failed" -ForegroundColor Red
    $allHealthy = $false
}

# Check RabbitMQ
try {
    $rmqHealth = docker exec rabbitmq-1 rabbitmq-diagnostics ping 2>&1
    if ($rmqHealth -match "pong") {
        Write-Host "  ✓ RabbitMQ: Healthy" -ForegroundColor Green
    } else {
        Write-Host "  ✗ RabbitMQ: Not ready" -ForegroundColor Red
        $allHealthy = $false
    }
} catch {
    Write-Host "  ✗ RabbitMQ: Health check failed" -ForegroundColor Red
    $allHealthy = $false
}

# Check Operations Service Backend health
try {
    $deviceNodeHealth = Invoke-WebRequest -Uri "http://localhost:18000/health" -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    if ($deviceNodeHealth.StatusCode -eq 200) {
        Write-Host "  ✓ Operations Service Backend: Healthy" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Operations Service Backend: Status $($deviceNodeHealth.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ⚠ Operations Service Backend: Not responding (may still be starting)" -ForegroundColor Yellow
}

# Check Metric Engine Service health
try {
    $metricEngineHealth = Invoke-WebRequest -Uri "http://localhost:9091/health" -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    if ($metricEngineHealth.StatusCode -eq 200) {
        Write-Host "  ✓ Metric Engine Service: Healthy" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Metric Engine Service: Status $($metricEngineHealth.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ⚠ Metric Engine Service: Not responding (may still be starting)" -ForegroundColor Yellow
}

if (-not $allHealthy) {
    Write-Host "  ⚠ Some services are not healthy. Check logs for details." -ForegroundColor Yellow
    Write-Host "    Alarm Service: docker logs alarm-service" -ForegroundColor Gray
    Write-Host "    PostgreSQL: docker logs postgres-primary" -ForegroundColor Gray
    Write-Host "    RabbitMQ: docker logs rabbitmq-1" -ForegroundColor Gray
} else {
    Write-Host "  ✓ All critical services are healthy" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Step 13: Final Verification ===" -ForegroundColor Yellow
Write-Host ""
Write-Host "Container Status:" -ForegroundColor Cyan
docker compose ps

Write-Host ""
Write-Host "PostgreSQL Replica Status:" -ForegroundColor Cyan
Start-Sleep -Seconds 5
$replicaStatus = docker exec postgres-replica psql -U postgres -c "SELECT pg_is_in_recovery();" 2>&1
if ($replicaStatus -match "t") {
    Write-Host "  ✓ Replica is in recovery mode (working correctly)" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Replica may still be initializing" -ForegroundColor Yellow
    Write-Host "    Check logs: docker logs postgres-replica" -ForegroundColor Gray
}

Write-Host ""
Write-Host "RabbitMQ Connections:" -ForegroundColor Cyan
Start-Sleep -Seconds 5
$connections = docker exec rabbitmq-1 rabbitmqctl list_connections 2>&1
$connectionCount = ($connections | Select-String "tracking_user").Count
if ($connectionCount -gt 0) {
    Write-Host "  ✓ $connectionCount active connection(s) from tracking_user" -ForegroundColor Green
} else {
    Write-Host "  ⚠ No connections yet (parser/consumer services may still be starting)" -ForegroundColor Yellow
    Write-Host "    This is normal - connections will appear as nodes start" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Service Health:" -ForegroundColor Cyan
$healthy = (docker ps --filter "name=ingestion" --filter "health=healthy" --format "{{.Names}}").Count
$total = (docker ps --filter "name=ingestion" --format "{{.Names}}").Count
Write-Host "  Healthy: $healthy / $total containers" -ForegroundColor $(if ($healthy -eq $total) { "Green" } else { "Yellow" })

Write-Host ""
Write-Host "Total Containers Running:" -ForegroundColor Cyan
$allContainers = (docker ps --format "{{.Names}}").Count
Write-Host "  Total: $allContainers containers" -ForegroundColor $(if ($allContainers -ge 32) { "Green" } else { "Yellow" })
Write-Host "  Expected: 32+ containers (20 core + 8 monitoring + 3 ops-service/gateway + metric-engine)" -ForegroundColor Gray

Write-Host ""
Write-Host "Production Services Status:" -ForegroundColor Cyan
$parserCount = (docker ps --filter "name=parser-service" --format "{{.Names}}").Count
$consumerCount = (docker ps --filter "name=consumer-" --format "{{.Names}}").Count
$alarmService = docker ps --filter "name=alarm-service" --filter "status=running" --format "{{.Names}}" 2>&1
$alarmServiceTest = docker ps --filter "name=alarm-service-test" --format "{{.Names}}" 2>&1

Write-Host "  ✓ Parser services: $parserCount / 8" -ForegroundColor $(if ($parserCount -eq 8) { "Green" } else { "Yellow" })
Write-Host "  ✓ Consumers: $consumerCount / 2" -ForegroundColor $(if ($consumerCount -eq 2) { "Green" } else { "Yellow" })
if ($alarmService -match "alarm-service" -and -not ($alarmService -match "alarm-service-test")) {
    Write-Host "  ✓ Alarm Service (Production): Running" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Alarm Service (Production): Not running" -ForegroundColor Yellow
}
if ($alarmServiceTest -match "alarm-service-test") {
    Write-Host "  ⚠ WARNING: alarm-service-test is running (should not be in production mode)" -ForegroundColor Red
}

# Check SMS Gateway Service
$smsGatewayService = docker ps --filter "name=sms-gateway-service" --filter "status=running" --format "{{.Names}}" 2>&1
if ($smsGatewayService -match "sms-gateway-service") {
    Write-Host "  ✓ SMS Gateway Service: Running" -ForegroundColor Green
} else {
    Write-Host "  ⚠ SMS Gateway Service: Not running" -ForegroundColor Yellow
}

# Check Operations Service
$opsServiceBackend = docker ps --filter "name=ops-service-backend" --filter "status=running" --format "{{.Names}}" 2>&1
$opsServiceFrontend = docker ps --filter "name=ops-service-frontend" --filter "status=running" --format "{{.Names}}" 2>&1
if ($opsServiceBackend -match "ops-service-backend") {
    Write-Host "  ✓ Operations Service Backend: Running (http://localhost:18000)" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Operations Service Backend: Not running" -ForegroundColor Yellow
}
if ($opsServiceFrontend -match "ops-service-frontend") {
    Write-Host "  ✓ Operations Service Frontend: Running (http://localhost:13000)" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Operations Service Frontend: Not running" -ForegroundColor Yellow
}

# Metric Engine Service
$metricEngineService = docker ps --filter "name=metric-engine-service" --filter "status=running" --format "{{.Names}}" 2>&1
if ($metricEngineService -match "metric-engine-service") {
    Write-Host "  ✓ Metric Engine Service: Running (http://localhost:9091)" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Metric Engine Service: Not running" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  CORE TRACKING SERVICES COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

# =============================================================================
# OPTIONAL: Start Frappe Access Control Layer
# =============================================================================
Write-Host ""
Write-Host "=== Optional: Frappe Access Control Layer ===" -ForegroundColor Yellow
$startFrappe = Read-Host "Do you want to start the Frappe access control layer? (web app, mobile app, access gateway) (y/N)"

if ($startFrappe -eq "y" -or $startFrappe -eq "Y") {
    Write-Host ""
    Write-Host "Starting Frappe access control services..." -ForegroundColor Cyan
    
    # Helper functions for .env management
    function Set-DotEnvValue {
        param(
            [Parameter(Mandatory=$true)][string]$Path,
            [Parameter(Mandatory=$true)][string]$Name,
            [Parameter(Mandatory=$true)][string]$Value
        )
        $lines = @()
        if (Test-Path $Path) {
            $lines = Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue
        }
        $pattern = '^' + [regex]::Escape($Name) + '='
        $updated = $false
        $newLines = @()
        foreach ($l in $lines) {
            if ($l -match $pattern) {
                $newLines += "$Name=$Value"
                $updated = $true
            } else {
                $newLines += $l
            }
        }
        if (-not $updated) {
            if ($newLines.Count -gt 0 -and $newLines[-1] -ne "") { $newLines += "" }
            $newLines += "$Name=$Value"
        }
        Set-Content -LiteralPath $Path -Value $newLines -Encoding UTF8
    }

    function Get-DotEnvValue {
        param(
            [Parameter(Mandatory=$true)][string]$Path,
            [Parameter(Mandatory=$true)][string]$Name
        )
        if (-not (Test-Path $Path)) { return "" }
        $line = (Select-String -Path $Path -Pattern ('^' + [regex]::Escape($Name) + '=') -ErrorAction SilentlyContinue | Select-Object -First 1).Line
        if (-not $line) { return "" }
        $idx = $line.IndexOf('=')
        if ($idx -lt 0) { return "" }
        return $line.Substring($idx + 1).Trim()
    }

    # Start MariaDB first
    Write-Host "  Starting MariaDB..." -ForegroundColor Gray
    docker compose --profile frappe up -d mariadb
    
    # Wait for MariaDB to be healthy
    Write-Host "  Waiting for MariaDB to be ready..." -ForegroundColor Gray
    $maxWait = 60
    $waited = 0
    while ($waited -lt $maxWait) {
        $health = docker inspect mariadb --format='{{.State.Health.Status}}' 2>&1
        if ($health -eq "healthy") {
            Write-Host "    ✓ MariaDB is healthy" -ForegroundColor Green
            break
        }
        Start-Sleep -Seconds 3
        $waited += 3
    }
    
    # Start Frappe (takes a while on first run)
    Write-Host "  Starting Frappe (first startup may take 3-5 minutes)..." -ForegroundColor Gray
    docker compose --profile frappe up -d frappe
    
    # Wait for Frappe to be healthy
    Write-Host "  Waiting for Frappe to initialize..." -ForegroundColor Gray
    $maxWait = 420  # 7 minutes (first run can be slow)
    $waited = 0
    $frappeHealthy = $false
    while ($waited -lt $maxWait) {
        $health = docker inspect frappe --format='{{.State.Health.Status}}' 2>&1
        if ($health -eq "healthy") {
            Write-Host "    ✓ Frappe is healthy" -ForegroundColor Green
            $frappeHealthy = $true
            break
        }
        Start-Sleep -Seconds 10
        $waited += 10
        if ($waited % 30 -eq 0) {
            Write-Host "    Still waiting for Frappe... ($waited/$maxWait seconds)" -ForegroundColor Gray
        }
    }
    if (-not $frappeHealthy) {
        Write-Host "    ⚠ Frappe health check timed out, continuing anyway..." -ForegroundColor Yellow
    }
    
    # Start nginx proxy for Frappe
    Write-Host "  Starting Frappe nginx proxy..." -ForegroundColor Gray
    docker compose --profile frappe up -d frappe-nginx
    Start-Sleep -Seconds 5
    
    # Wait for megatechtrackers app to be installed
    Write-Host "  Waiting for megatechtrackers app to be installed..." -ForegroundColor Gray
    $maxWait = 300
    $waited = 0
    $appInstalled = $false
    while ($waited -lt $maxWait) {
        $out = docker exec frappe bash -lc "cd /home/frappe/frappe-bench && bench --site site1.localhost list-apps" 2>&1
        if ($out -match "megatechtrackers") {
            Write-Host "    ✓ megatechtrackers app installed" -ForegroundColor Green
            $appInstalled = $true
            break
        }
        Start-Sleep -Seconds 5
        $waited += 5
        if ($waited % 30 -eq 0) {
            Write-Host "    Still waiting for app... ($waited/$maxWait seconds)" -ForegroundColor Gray
        }
    }
    if (-not $appInstalled) {
        Write-Host "    ⚠ App installation check timed out" -ForegroundColor Yellow
    }
    
    # Start remaining services before provisioning
    Write-Host "  Starting access gateway, web app, and proxies..." -ForegroundColor Gray
    docker compose --profile frappe up -d grafana-proxy access-gateway web-app docs

    # Wait a moment for access-gateway to start
    Start-Sleep -Seconds 5

    # ==========================================================================
    # AUTO-PROVISIONING: Grafana API Key + Frappe API Key/Secret
    # ==========================================================================
    Write-Host ""
    Write-Host "  Auto-provisioning API keys..." -ForegroundColor Cyan
    
    $dotEnvPath = Join-Path (Get-Location) ".env"
    $provisioningFailed = $false

    try {
        # 1) Create Grafana API key (Service Account token)
        Write-Host "    Creating Grafana Service Account token..." -ForegroundColor Gray
        $existingGrafanaKey = Get-DotEnvValue -Path $dotEnvPath -Name "GRAFANA_API_KEY"
        
        if (-not $existingGrafanaKey) {
            $pair = "admin:admin"
            $token = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
            $headers = @{ Authorization = "Basic $token" }

            # Wait for Grafana API to be ready
            $maxWait = 60
            $waited = 0
            $grafanaReady = $false
            while ($waited -lt $maxWait) {
                try {
                    $resp = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 5
                    if ($resp.StatusCode -eq 200) {
                        $grafanaReady = $true
                        break
                    }
                } catch { }
                Start-Sleep -Seconds 3
                $waited += 3
            }
            
            if ($grafanaReady) {
                $saName = "fleet-service"
                try {
                    $search = Invoke-RestMethod -Method Get -Uri ("http://localhost:3000/api/serviceaccounts/search?name=" + [Uri]::EscapeDataString($saName)) -Headers $headers
                    $saId = $null
                    if ($search.serviceAccounts -and $search.serviceAccounts.Count -gt 0) {
                        $saId = $search.serviceAccounts[0].id
                    } else {
                        $createSaBody = @{ name = $saName; role = "Admin"; isDisabled = $false } | ConvertTo-Json
                        $created = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/serviceaccounts" -Headers $headers -ContentType "application/json" -Body $createSaBody
                        $saId = $created.id
                    }
                    
                    if ($saId) {
                        # Delete old tokens
                        try {
                            $tokens = Invoke-RestMethod -Method Get -Uri ("http://localhost:3000/api/serviceaccounts/$saId/tokens") -Headers $headers
                            foreach ($t in $tokens) {
                                if ($t.name -like "fleet-token*") {
                                    Invoke-RestMethod -Method Delete -Uri ("http://localhost:3000/api/serviceaccounts/$saId/tokens/" + $t.id) -Headers $headers | Out-Null
                                }
                            }
                        } catch { }
                        
                        # Create new token
                        $tokenName = "fleet-token-" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
                        $createTokenBody = @{ name = $tokenName; secondsToLive = 0 } | ConvertTo-Json
                        $tok = Invoke-RestMethod -Method Post -Uri ("http://localhost:3000/api/serviceaccounts/$saId/tokens") -Headers $headers -ContentType "application/json" -Body $createTokenBody
                        
                        if ($tok.key -and ($tok.key.ToString().Trim().Length -gt 0)) {
                            Set-DotEnvValue -Path $dotEnvPath -Name "GRAFANA_API_KEY" -Value $tok.key
                            Write-Host "      ✓ Grafana API key created" -ForegroundColor Green
                        }
                    }
                } catch {
                    Write-Host "      ⚠ Failed to create Grafana API key: $($_.Exception.Message)" -ForegroundColor Yellow
                    $provisioningFailed = $true
                }
            } else {
                Write-Host "      ⚠ Grafana API not ready" -ForegroundColor Yellow
                $provisioningFailed = $true
            }
        } else {
            Write-Host "      ✓ Grafana API key already exists" -ForegroundColor Green
        }
        
        # 2) Create Frappe API key/secret
        Write-Host "    Creating Frappe API key/secret..." -ForegroundColor Gray
        if ($frappeHealthy -and $appInstalled) {
            try {
                $json = docker exec frappe bash -lc "cd /home/frappe/frappe-bench && env FRAPPE_SITE=site1.localhost FRAPPE_SITES_PATH=/home/frappe/frappe-bench/sites env/bin/python /home/frappe/provision_frappe_keys.py" 2>&1
                $fr = $json | ConvertFrom-Json
                if ($fr.frappe_api_key -and $fr.frappe_api_secret) {
                    Set-DotEnvValue -Path $dotEnvPath -Name "FRAPPE_API_KEY" -Value $fr.frappe_api_key
                    Set-DotEnvValue -Path $dotEnvPath -Name "FRAPPE_API_SECRET" -Value $fr.frappe_api_secret
                    Write-Host "      ✓ Frappe API key/secret created" -ForegroundColor Green
                } else {
                    Write-Host "      ⚠ Frappe provisioning returned empty values" -ForegroundColor Yellow
                    $provisioningFailed = $true
                }
            } catch {
                Write-Host "      ⚠ Failed to create Frappe API key: $($_.Exception.Message)" -ForegroundColor Yellow
                $provisioningFailed = $true
            }
        } else {
            Write-Host "      ⚠ Skipped (Frappe not ready)" -ForegroundColor Yellow
            $provisioningFailed = $true
        }
        
        # 3) Configure CORS
        Set-DotEnvValue -Path $dotEnvPath -Name "ALLOWED_ORIGINS" -Value "http://localhost:*,http://127.0.0.1:*"
        
        # 4) Restart access-gateway to pick up new keys
        Write-Host "    Restarting access-gateway with new keys..." -ForegroundColor Gray
        docker compose --profile frappe up -d --no-deps --force-recreate access-gateway | Out-Null
        Start-Sleep -Seconds 5
        
        # 5) Configure Frappe CORS
        if ($frappeHealthy) {
            Write-Host "    Configuring Frappe CORS..." -ForegroundColor Gray
            docker exec frappe bash -lc "cd /home/frappe/frappe-bench && bench --site site1.localhost set-config allow_cors '*'" 2>&1 | Out-Null
            docker exec frappe bash -lc "cd /home/frappe/frappe-bench && bench --site site1.localhost set-config frame_ancestors 'http://localhost:* https://localhost:* http://127.0.0.1:* https://127.0.0.1:*'" 2>&1 | Out-Null
        }
        
        # 6) Seed test data and sync dashboards
        if ($frappeHealthy -and $appInstalled) {
            Write-Host "    Seeding Frappe test data..." -ForegroundColor Gray
            docker exec frappe bash -lc "cd /home/frappe/frappe-bench && env/bin/python /home/frappe/create_test_data.py" 2>&1 | Out-Null
            
            Write-Host "    Syncing Grafana dashboards to Frappe..." -ForegroundColor Gray
            docker exec frappe bash -lc "cd /home/frappe/frappe-bench && env GRAFANA_DASHBOARD_TAG=all env/bin/python /home/frappe/sync_grafana_reports_to_frappe.py" 2>&1
            Write-Host "      ✓ Dashboards synced to Frappe" -ForegroundColor Green
        }
        
    } catch {
        Write-Host "    ⚠ Auto-provisioning encountered errors: $($_.Exception.Message)" -ForegroundColor Yellow
        $provisioningFailed = $true
    }
    
    # Optional: Start mobile app
    Write-Host ""
    $startMobile = Read-Host "  Do you want to start the mobile app (Expo dev server)? (y/N)"
    if ($startMobile -eq "y" -or $startMobile -eq "Y") {
        docker compose --profile frappe up -d mobile-app
        Write-Host "    ✓ Mobile app started" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "  Frappe Access Control Services:" -ForegroundColor Cyan
    Write-Host "    - Frappe:          http://localhost:8000 (Administrator/admin)" -ForegroundColor White
    Write-Host "    - Access Gateway:  http://localhost:3001/health" -ForegroundColor White
    Write-Host "    - Web App:         http://localhost:3002" -ForegroundColor White
    Write-Host "    - Grafana (direct): http://localhost:3000 (admin/admin)" -ForegroundColor White
    Write-Host "    - Grafana (proxy): http://localhost:3200 (token required)" -ForegroundColor White
    Write-Host "    - Docs:            http://localhost:8002" -ForegroundColor White
    if ($startMobile -eq "y" -or $startMobile -eq "Y") {
        Write-Host "    - Mobile (Expo):   http://localhost:19000" -ForegroundColor White
    }
    
    if ($provisioningFailed) {
        Write-Host ""
        Write-Host "  ⚠ Some provisioning steps failed. You may need to:" -ForegroundColor Yellow
        Write-Host "    - Wait for services to fully initialize" -ForegroundColor White
        Write-Host "    - Run: docker compose --profile frappe restart" -ForegroundColor White
        Write-Host "    - Check logs: docker compose logs -f frappe access-gateway" -ForegroundColor White
    } else {
        Write-Host ""
        Write-Host "  ✓ Auto-provisioning complete! API keys saved to .env" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  CLEAN RESTART COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Core Services:" -ForegroundColor Cyan
Write-Host "  1. Monitor logs: docker compose logs -f" -ForegroundColor White
Write-Host "  2. Check specific service: docker logs <container-name>" -ForegroundColor White
Write-Host "  3. View all containers: docker compose ps" -ForegroundColor White
Write-Host "  4. RabbitMQ Management: http://localhost:15672 (tracking_user/tracking_password)" -ForegroundColor White
Write-Host "  5. Monitoring Dashboard: http://localhost:8888" -ForegroundColor White
Write-Host "  6. Prometheus: http://localhost:9090" -ForegroundColor White
Write-Host "  7. Grafana: http://localhost:3000 (admin/admin)" -ForegroundColor White
Write-Host "  8. Alertmanager: http://localhost:9093" -ForegroundColor White
Write-Host "  9. Operations Service UI: http://localhost:13000" -ForegroundColor White
Write-Host " 10. Operations Service API: http://localhost:18000/health" -ForegroundColor White
Write-Host ""
Write-Host "To start Frappe layer later:" -ForegroundColor Cyan
Write-Host "  docker compose --profile frappe up -d" -ForegroundColor White
Write-Host ""
Write-Host "If you see any issues, check:" -ForegroundColor Yellow
Write-Host "  - docs/ folder for documentation (http://localhost:8002 if docs started)" -ForegroundColor White
Write-Host "  - docker compose logs <service-name>" -ForegroundColor White
Write-Host ""
