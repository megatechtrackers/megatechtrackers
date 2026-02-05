# Complete Clean Restart Script for Megatechtrackers (TESTING MODE)
# This script performs a COMPLETE cleanup and starts ALL services INCLUDING:
# - Mock Tracker (20 simulated GPS trackers)
# - MailHog (Mock SMTP server for email testing)
# - Mock SMS Server (Mock SMS API for testing)
# - Alarm Service (Test mode - connected to mock services)

Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  COMPLETE CLEAN RESTART - TESTING MODE" -ForegroundColor Magenta
Write-Host "  WARNING: This will delete ALL data!" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Includes:" -ForegroundColor Cyan
Write-Host "    - Mock Tracker (20 GPS simulators)" -ForegroundColor Gray
Write-Host "    - MailHog (Email catcher)" -ForegroundColor Gray
Write-Host "    - Mock SMS Server (SMS API mock)" -ForegroundColor Gray
Write-Host "    - Alarm Service (Test mode)" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

$confirm = Read-Host "Are you sure you want to delete ALL Docker resources? Type 'YES' to continue"
if ($confirm -ne "YES") {
    Write-Host "Aborted." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "=== Step 1: Stopping all containers (all profiles) ===" -ForegroundColor Yellow
docker compose --profile testing --profile frappe --profile production down
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Some containers may not have stopped cleanly" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Step 2: Removing all containers ===" -ForegroundColor Yellow
# docker-compose down should have removed containers, but force remove any remaining
$containers = docker ps -a --format "{{.Names}}" | Where-Object { 
    $_ -match "parser-service|camera-parser|consumer-service-|metric-engine-service|postgres-|rabbitmq-|monitoring-service|mock-tracker|haproxy-tracker|alarm-service|mailhog|mock-sms|sms-gateway-service|ops-service|mariadb|frappe|access-gateway|web-app|mobile-app|docs" 
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
docker compose --profile testing down -v 2>&1 | Out-Null
# Also manually remove any volumes that might remain
$allVolumes = docker volume ls --format "{{.Name}}"
$projectVolumes = $allVolumes | Where-Object { 
    $_ -match "postgres-primary|postgres-replica|rabbitmq-[123]|ingestion|mariadb|redis|frappe-data|grafana-data|prometheus-data|alertmanager-data" 
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
    "mock-sms-server",
    "mock-tracker",
    "alarm-service-test",
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
docker-compose up -d pgbouncer
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: pgbouncer may have failed to start" -ForegroundColor Yellow
}
Write-Host "Core services started" -ForegroundColor Green

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
Write-Host "=== Step 10: Waiting for PostgreSQL to initialize ===" -ForegroundColor Yellow

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

Write-Host ""
Write-Host "=== Step 11: Starting remaining core services ===" -ForegroundColor Yellow
# Start parsers (Teltonika + camera), consumers, haproxy, monitoring-service, sms-gateway-service, ops-service
docker compose up -d haproxy-tracker parser-service-1 parser-service-2 parser-service-3 parser-service-4 parser-service-5 parser-service-6 parser-service-7 parser-service-8 camera-parser consumer-service-database consumer-service-alarm metric-engine-service monitoring-service sms-gateway-service ops-service-backend ops-service-frontend
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error starting core services" -ForegroundColor Red
    exit 1
}
Write-Host "Core services started" -ForegroundColor Green

# Wait a bit for services to initialize
Write-Host "Waiting for services to initialize..." -ForegroundColor Cyan
Start-Sleep -Seconds 10

Write-Host ""
Write-Host "=== Step 11b: Starting monitoring stack ===" -ForegroundColor Yellow
# Start monitoring stack (Prometheus, Grafana, exporters)
docker compose up -d prometheus alertmanager grafana postgres-exporter postgres-exporter-replica node-exporter pgbouncer-exporter rabbitmq-exporter
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Some monitoring services may have failed to start" -ForegroundColor Yellow
} else {
    Write-Host "Monitoring stack started" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Step 11c: Setting up Test Environment ===" -ForegroundColor Yellow
Write-Host "Configuring test environment (indexes, feature flags)..." -ForegroundColor Cyan

# Run test-alarm.sql to set up test environment (indexes, feature flags)
$testAlarmSqlFile = Join-Path $PSScriptRoot "alarm_node\test-alarm.sql"
if (Test-Path $testAlarmSqlFile) {
    Write-Host "  Found test setup SQL file: $testAlarmSqlFile" -ForegroundColor Gray
    docker cp $testAlarmSqlFile postgres-primary:/tmp/test-alarm.sql 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $sqlResult = docker exec postgres-primary psql -U postgres -d tracking_db -f /tmp/test-alarm.sql 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Test environment configured (indexes, feature flags)" -ForegroundColor Green
        } else {
            Write-Host "  ⚠ Warning: Some test configuration may have failed" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ⚠ Failed to copy test setup SQL file" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⚠ Test setup SQL file not found: $testAlarmSqlFile" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Step 12: Verifying PostgreSQL Setup ===" -ForegroundColor Yellow

# Verify PostgreSQL users
Write-Host "Verifying PostgreSQL users..." -ForegroundColor Cyan
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

# Verify required tables
Write-Host "Verifying required tables..." -ForegroundColor Cyan
Start-Sleep -Seconds 2

$processedTable = docker exec postgres-primary psql -U postgres -d tracking_db -t -c "SELECT 1 FROM information_schema.tables WHERE table_name = 'processed_message_ids';" 2>&1
if ($processedTable -match "1") {
    Write-Host "  ✓ processed_message_ids table exists" -ForegroundColor Green
} else {
    Write-Host "  ⚠ processed_message_ids table not found" -ForegroundColor Yellow
}

$alarmsContactsTable = docker exec postgres-primary psql -U postgres -d tracking_db -t -c "SELECT 1 FROM information_schema.tables WHERE table_name = 'alarms_contacts';" 2>&1
if ($alarmsContactsTable -match "1") {
    Write-Host "  ✓ alarms_contacts table exists" -ForegroundColor Green
} else {
    Write-Host "  ⚠ alarms_contacts table not found" -ForegroundColor Yellow
}

$alarmsHistoryTable = docker exec postgres-primary psql -U postgres -d tracking_db -t -c "SELECT 1 FROM information_schema.tables WHERE table_name = 'alarms_history';" 2>&1
if ($alarmsHistoryTable -match "1") {
    Write-Host "  ✓ alarms_history table exists" -ForegroundColor Green
} else {
    Write-Host "  ⚠ alarms_history table not found" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Step 12b: Feature Flags Configuration ===" -ForegroundColor Yellow
Write-Host "Feature flags are configured in test-alarm.sql (already executed in Step 11c)" -ForegroundColor Cyan

Write-Host ""
Write-Host "=== Step 13: Setting up Mock Tracker Contacts ===" -ForegroundColor Magenta
Write-Host "Adding device contacts for mock trackers (for alarm notifications)..." -ForegroundColor Cyan

# Wait a moment to ensure PostgreSQL is ready
Start-Sleep -Seconds 2

# Check if the SQL file exists
$contactsSqlFile = Join-Path $PSScriptRoot "tools\mock_sms_server\setup_mock_contacts.sql"
if (Test-Path $contactsSqlFile) {
    Write-Host "  Found SQL file: $contactsSqlFile" -ForegroundColor Gray
    # Copy SQL file to container and execute
    Write-Host "  Copying SQL file to container..." -ForegroundColor Gray
    docker cp $contactsSqlFile postgres-primary:/tmp/setup_mock_contacts.sql 2>&1 | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Executing SQL file..." -ForegroundColor Gray
        $sqlResult = docker exec postgres-primary psql -U postgres -d tracking_db -f /tmp/setup_mock_contacts.sql 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Mock tracker contacts created" -ForegroundColor Green
            
            # Show summary - check for both patterns to be safe
            Start-Sleep -Seconds 1
            $contactCount = docker exec postgres-primary psql -U postgres -d tracking_db -t -c "SELECT COUNT(*) FROM alarms_contacts WHERE imei::text LIKE '999%';" 2>&1
            $uniqueImeis = docker exec postgres-primary psql -U postgres -d tracking_db -t -c "SELECT COUNT(DISTINCT imei) FROM alarms_contacts WHERE imei::text LIKE '999%';" 2>&1
            
            $count = $null
            $imeis = $null
            
            # Convert to string and extract number (handles array output from docker)
            $contactCountStr = ($contactCount | Out-String).Trim()
            if ($contactCountStr -match "(\d+)") {
                $count = $Matches[1]
            }
            
            $uniqueImeisStr = ($uniqueImeis | Out-String).Trim()
            if ($uniqueImeisStr -match "(\d+)") {
                $imeis = $Matches[1]
            }
            
            if ($null -ne $count) {
                if ($null -ne $imeis) {
                    Write-Host "  ✓ Total mock tracker contacts: $count (for $imeis unique IMEIs)" -ForegroundColor Green
                    if ([int]$count -lt 20) {
                        Write-Host "  ⚠ Warning: Expected at least 20 contacts (1 per tracker), got $count" -ForegroundColor Yellow
                    }
                } else {
                    Write-Host "  ✓ Total mock tracker contacts: $count" -ForegroundColor Green
                    if ([int]$count -lt 20) {
                        Write-Host "  ⚠ Warning: Expected at least 20 contacts (1 per tracker), got $count" -ForegroundColor Yellow
                    }
                }
            } else {
                Write-Host "  ⚠ Could not verify contact count" -ForegroundColor Yellow
                Write-Host "    Contact count output: $contactCount" -ForegroundColor Gray
            }
        } else {
            Write-Host "  ⚠ Error creating mock tracker contacts (exit code: $LASTEXITCODE)" -ForegroundColor Yellow
            Write-Host "  SQL Error output:" -ForegroundColor Gray
            Write-Host $sqlResult -ForegroundColor Gray
            Write-Host "  Please check the SQL file: $contactsSqlFile" -ForegroundColor Gray
        }
    } else {
        Write-Host "  ⚠ Failed to copy SQL file to container" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ✗ SQL file not found: $contactsSqlFile" -ForegroundColor Red
    Write-Host "    Please ensure the file exists before running this script" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Step 14: Verifying Unit IO Mapping for Mock Trackers ===" -ForegroundColor Yellow
Write-Host "Checking mock tracker Unit IO Mapping..." -ForegroundColor Cyan

$mockMappings = docker exec postgres-primary psql -U postgres -d tracking_db -t -c "SELECT COUNT(*) FROM unit_io_mapping WHERE imei::text LIKE '999%';" 2>&1
$mockCount = 0
# Convert to string to handle array output from docker
$mockMappingsStr = ($mockMappings | Out-String).Trim()
if ($mockMappingsStr -match "(\d+)") {
    $mockCount = [int]$Matches[1]
} else {
    # If regex doesn't match, try to extract number from output
    $mockCount = ($mockMappingsStr -replace '[^\d]', '').Trim()
    if ($mockCount -eq '') {
        $mockCount = 0
    } else {
        $mockCount = [int]$mockCount
    }
}

if ($mockCount -gt 0) {
    Write-Host "  ✓ Mock tracker Unit IO Mapping found: $mockCount entries" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Mock tracker Unit IO Mapping not found in database" -ForegroundColor Yellow
    Write-Host "    Note: They should be loaded automatically from unit_io_mapping.csv" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== Step 15: Starting Testing Services ===" -ForegroundColor Magenta
Write-Host "Waiting for core services to be ready before starting testing services..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

Write-Host "Starting MailHog (mock email server)..." -ForegroundColor Cyan
# Start MailHog first (use docker compose v2 to avoid hangs)
docker compose --profile testing up -d mailhog
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ⚠ Error starting MailHog" -ForegroundColor Yellow
} else {
    Write-Host "  ✓ MailHog started" -ForegroundColor Green
}

# Wait for MailHog
Start-Sleep -Seconds 5
$mailhogStatus = docker ps --filter "name=mailhog" --filter "status=running" --format "{{.Names}}" 2>&1
if ($mailhogStatus -match "mailhog") {
    Write-Host "  ✓ MailHog is running (Web UI: http://localhost:8025)" -ForegroundColor Green
} else {
    Write-Host "  ⚠ MailHog may not be ready" -ForegroundColor Yellow
}

Write-Host "Starting Mock SMS Server..." -ForegroundColor Cyan
# Run with 60s timeout so script does not hang if compose blocks
$mockSmsJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    docker compose --profile testing up -d mock-sms-server 2>&1
}
$completed = Wait-Job $mockSmsJob -Timeout 60
if ($completed) {
    Receive-Job $mockSmsJob | Out-Host
    Remove-Job $mockSmsJob -Force
    Write-Host "  ✓ Mock SMS Server started" -ForegroundColor Green
} else {
    Stop-Job $mockSmsJob
    Remove-Job $mockSmsJob -Force
    Write-Host "  ⚠ Mock SMS Server start timed out after 60s (continuing anyway)" -ForegroundColor Yellow
    Write-Host "    Start manually: docker compose --profile testing up -d mock-sms-server" -ForegroundColor Gray
}

# Wait for Mock SMS Server
Start-Sleep -Seconds 5
$smsServerStatus = docker ps --filter "name=mock-sms-server" --filter "status=running" --format "{{.Names}}" 2>&1
if ($smsServerStatus -match "mock-sms-server") {
    Write-Host "  ✓ Mock SMS Server is running (Web UI: http://localhost:8786)" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Mock SMS Server may not be ready" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Step 16: Starting Alarm Service (Test Mode) ===" -ForegroundColor Magenta
Write-Host "Stopping production alarm-service (if running)..." -ForegroundColor Cyan
# Ensure production alarm-service is stopped and removed
docker compose stop alarm-service 2>&1 | Out-Null
docker compose rm -f alarm-service 2>&1 | Out-Null
# Also try to stop it if it's running as a container directly
docker stop alarm-service 2>&1 | Out-Null
docker rm -f alarm-service 2>&1 | Out-Null

Write-Host "Starting alarm-service-test (connected to mock services)..." -ForegroundColor Cyan
docker compose --profile testing up -d alarm-service-test
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ⚠ Error starting alarm-service-test" -ForegroundColor Yellow
    Write-Host "    This may be due to port 13100 being in use" -ForegroundColor Gray
    Write-Host "    Check: netstat -ano | findstr :13100" -ForegroundColor Gray
} else {
    Write-Host "  ✓ Alarm Service (Test Mode) started" -ForegroundColor Green
}

# Wait for Alarm Service
Start-Sleep -Seconds 10
$alarmServiceStatus = docker ps --filter "name=alarm-service-test" --filter "status=running" --format "{{.Names}}" 2>&1
if ($alarmServiceStatus -match "alarm-service-test") {
    Write-Host "  ✓ Alarm Service (Test Mode) is running" -ForegroundColor Green
    
    # Note: Circuit breakers and pending alarms are automatically reprocessed by the service on startup
    # No manual intervention needed - the service handles this automatically
    Write-Host "  ✓ Alarm Service will automatically reset circuit breakers and reprocess pending alarms" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Alarm Service may not be ready yet" -ForegroundColor Yellow
    Write-Host "    Check logs: docker logs alarm-service-test" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== Step 17: Starting Mock Tracker ===" -ForegroundColor Magenta
Write-Host "Starting mock tracker service (20 simulated GPS trackers)..." -ForegroundColor Cyan

# Wait for HAProxy to be ready first
Write-Host "Waiting for HAProxy load balancer..." -ForegroundColor Gray
$haproxyReady = $false
$waited = 0
while ($waited -lt 30) {
    $haproxyStatus = docker ps --filter "name=haproxy-tracker" --filter "status=running" --format "{{.Names}}" 2>&1
    if ($haproxyStatus -match "haproxy-tracker") {
        Write-Host "  ✓ HAProxy load balancer is running" -ForegroundColor Green
        $haproxyReady = $true
        break
    }
    Start-Sleep -Seconds 2
    $waited += 2
}
if (-not $haproxyReady) {
    Write-Host "  ⚠ HAProxy may not be ready yet" -ForegroundColor Yellow
}

# Start mock tracker
docker compose --profile testing up -d mock-tracker
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ⚠ Error starting mock-tracker" -ForegroundColor Yellow
} else {
    Write-Host "  ✓ Mock tracker started" -ForegroundColor Green
}

# Wait for mock tracker to connect
Write-Host "Waiting for mock trackers to connect..." -ForegroundColor Gray
Start-Sleep -Seconds 10

# Verify mock tracker is running
$mockTrackerStatus = docker ps --filter "name=mock-tracker" --filter "status=running" --format "{{.Names}}" 2>&1
if ($mockTrackerStatus -match "mock-tracker") {
    Write-Host "  ✓ Mock tracker container is running" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Mock tracker container is not running" -ForegroundColor Yellow
    Write-Host "    Check logs: docker logs mock-tracker" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== Step 18: Final Verification ===" -ForegroundColor Yellow
Write-Host ""
Write-Host "Container Status:" -ForegroundColor Cyan
docker compose --profile testing ps

Write-Host ""
Write-Host "PostgreSQL Replica Status:" -ForegroundColor Cyan
Start-Sleep -Seconds 3
$replicaStatus = docker exec postgres-replica psql -U postgres -c "SELECT pg_is_in_recovery();" 2>&1
if ($replicaStatus -match "t") {
    Write-Host "  ✓ Replica is in recovery mode (working correctly)" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Replica may still be initializing" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "RabbitMQ Connections:" -ForegroundColor Cyan
Start-Sleep -Seconds 3
$connections = docker exec rabbitmq-1 rabbitmqctl list_connections 2>&1
$connectionCount = ($connections | Select-String "tracking_user").Count
if ($connectionCount -gt 0) {
    Write-Host "  ✓ $connectionCount active connection(s) from tracking_user" -ForegroundColor Green
} else {
    Write-Host "  ⚠ No connections yet (services may still be starting)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Testing Services Status:" -ForegroundColor Magenta

# MailHog
$mailhogUp = docker ps --filter "name=mailhog" --filter "status=running" --format "{{.Names}}" 2>&1
if ($mailhogUp -match "mailhog") {
    Write-Host "  ✓ MailHog: Running (http://localhost:8025)" -ForegroundColor Green
} else {
    Write-Host "  ✗ MailHog: Not running" -ForegroundColor Red
}

# Mock SMS Server
$smsUp = docker ps --filter "name=mock-sms-server" --filter "status=running" --format "{{.Names}}" 2>&1
if ($smsUp -match "mock-sms-server") {
    Write-Host "  ✓ Mock SMS Server: Running (http://localhost:8786)" -ForegroundColor Green
} else {
    Write-Host "  ✗ Mock SMS Server: Not running" -ForegroundColor Red
}

# Alarm Service Test
$alarmUp = docker ps --filter "name=alarm-service-test" --filter "status=running" --format "{{.Names}}" 2>&1
if ($alarmUp -match "alarm-service-test") {
    Write-Host "  ✓ Alarm Service (Test): Running (http://localhost:13100)" -ForegroundColor Green
} else {
    Write-Host "  ✗ Alarm Service (Test): Not running" -ForegroundColor Red
    Write-Host "    Check logs: docker logs alarm-service-test" -ForegroundColor Gray
}

# Mock Tracker
$trackerUp = docker ps --filter "name=mock-tracker" --filter "status=running" --format "{{.Names}}" 2>&1
if ($trackerUp -match "mock-tracker") {
    Write-Host "  ✓ Mock Tracker: Running (20 simulated devices)" -ForegroundColor Green
} else {
    Write-Host "  ✗ Mock Tracker: Not running" -ForegroundColor Red
}

# SMS Gateway Service
$smsGatewayServiceUp = docker ps --filter "name=sms-gateway-service" --filter "status=running" --format "{{.Names}}" 2>&1
if ($smsGatewayServiceUp -match "sms-gateway-service") {
    Write-Host "  ✓ SMS Gateway Service: Running" -ForegroundColor Green
} else {
    Write-Host "  ✗ SMS Gateway Service: Not running" -ForegroundColor Red
}

# Operations Service Backend
$opsServiceBackendUp = docker ps --filter "name=ops-service-backend" --filter "status=running" --format "{{.Names}}" 2>&1
if ($opsServiceBackendUp -match "ops-service-backend") {
    Write-Host "  ✓ Operations Service Backend: Running (http://localhost:18000)" -ForegroundColor Green
} else {
    Write-Host "  ✗ Operations Service Backend: Not running" -ForegroundColor Red
}

# Operations Service Frontend
$opsServiceFrontendUp = docker ps --filter "name=ops-service-frontend" --filter "status=running" --format "{{.Names}}" 2>&1
if ($opsServiceFrontendUp -match "ops-service-frontend") {
    Write-Host "  ✓ Operations Service Frontend: Running (http://localhost:13000)" -ForegroundColor Green
} else {
    Write-Host "  ✗ Operations Service Frontend: Not running" -ForegroundColor Red
}

# Metric Engine Service
$metricEngineUp = docker ps --filter "name=metric-engine-service" --filter "status=running" --format "{{.Names}}" 2>&1
if ($metricEngineUp -match "metric-engine-service") {
    Write-Host "  ✓ Metric Engine Service: Running (http://localhost:9091)" -ForegroundColor Green
} else {
    Write-Host "  ✗ Metric Engine Service: Not running" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Step 17: Health Check Validation ===" -ForegroundColor Yellow
Write-Host "Validating service health endpoints..." -ForegroundColor Cyan

# Wait for services to be ready
Start-Sleep -Seconds 10

$healthChecks = @()
$allHealthy = $true

# Check Alarm Service health
try {
    $alarmHealth = Invoke-WebRequest -Uri "http://localhost:13100/health" -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    if ($alarmHealth.StatusCode -eq 200) {
        $healthChecks += "✓ Alarm Service: Healthy"
        Write-Host "  ✓ Alarm Service: Healthy" -ForegroundColor Green
    } else {
        $healthChecks += "✗ Alarm Service: Unhealthy (Status: $($alarmHealth.StatusCode))"
        Write-Host "  ✗ Alarm Service: Unhealthy" -ForegroundColor Red
        $allHealthy = $false
    }
} catch {
    $healthChecks += "✗ Alarm Service: Not responding"
    Write-Host "  ✗ Alarm Service: Not responding" -ForegroundColor Red
    $allHealthy = $false
}

# Check Mock SMS Server health
try {
    $smsHealth = Invoke-WebRequest -Uri "http://localhost:8786/health" -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    if ($smsHealth.StatusCode -eq 200) {
        Write-Host "  ✓ Mock SMS Server: Healthy" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Mock SMS Server: Unhealthy" -ForegroundColor Red
        $allHealthy = $false
    }
} catch {
    Write-Host "  ✗ Mock SMS Server: Not responding" -ForegroundColor Red
    $allHealthy = $false
}

# Check MailHog health
try {
    $mailhogHealth = Invoke-WebRequest -Uri "http://localhost:8025/api/v2/health" -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    if ($mailhogHealth.StatusCode -eq 200) {
        Write-Host "  ✓ MailHog: Healthy" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ MailHog: Status $($mailhogHealth.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ⚠ MailHog: Health check endpoint not available (service may still be working)" -ForegroundColor Yellow
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

if (-not $allHealthy) {
    Write-Host "  ⚠ Some services are not healthy. Check logs for details." -ForegroundColor Yellow
    Write-Host "    Alarm Service: docker logs alarm-service-test" -ForegroundColor Gray
    Write-Host "    Mock SMS: docker logs mock-sms-server" -ForegroundColor Gray
} else {
    Write-Host "  ✓ All critical services are healthy" -ForegroundColor Green
}

Write-Host ""
Write-Host "Service Health:" -ForegroundColor Cyan
$healthy = (docker ps --filter "name=ingestion" --filter "health=healthy" --format "{{.Names}}").Count
$total = (docker ps --filter "name=ingestion" --format "{{.Names}}").Count
Write-Host "  Healthy: $healthy / $total containers" -ForegroundColor $(if ($healthy -eq $total) { "Green" } else { "Yellow" })

Write-Host ""
Write-Host "Total Containers Running:" -ForegroundColor Cyan
$allContainers = (docker ps --format "{{.Names}}").Count
Write-Host "  Total: $allContainers containers" -ForegroundColor $(if ($allContainers -ge 35) { "Green" } else { "Yellow" })
Write-Host "  Expected: 36+ containers (20 core + 8 monitoring + 4 testing + 3 ops-service/gateway + metric-engine)" -ForegroundColor Gray

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
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  CLEAN RESTART (TEST MODE) COMPLETE!" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "🧪 TESTING ENVIRONMENT READY" -ForegroundColor Cyan
Write-Host ""
Write-Host "Services Running:" -ForegroundColor White
Write-Host "  📱 Mock Tracker: 20 simulated GPS trackers sending data" -ForegroundColor Gray
Write-Host "  📧 MailHog: Catching all emails (http://localhost:8025)" -ForegroundColor Gray
Write-Host "  💬 Mock SMS: Catching all SMS messages (http://localhost:8786)" -ForegroundColor Gray
Write-Host "  🚨 Alarm Service: Processing alarms → mock services" -ForegroundColor Gray
Write-Host ""
Write-Host "How to Test Alarms:" -ForegroundColor Yellow
Write-Host "  1. Mock tracker sends events (Ignition, Panic, GeoFence, etc.)" -ForegroundColor Gray
Write-Host "  2. Parser creates alarms in database (is_sms=1, is_email=1)" -ForegroundColor Gray
Write-Host "  3. Alarm service picks up alarms from RabbitMQ queue" -ForegroundColor Gray
Write-Host "  4. Emails appear in MailHog: http://localhost:8025" -ForegroundColor Gray
Write-Host "  5. SMS messages appear in Mock SMS: http://localhost:8086" -ForegroundColor Gray
Write-Host ""
Write-Host "Verification Commands:" -ForegroundColor Cyan
Write-Host "  # Check alarms in database" -ForegroundColor White
Write-Host "  docker exec postgres-primary psql -U postgres -d tracking_db -c `"SELECT id, imei, status, is_sms, is_email, sms_sent, email_sent FROM alarms WHERE imei::text LIKE '999%' ORDER BY id DESC LIMIT 10;`"" -ForegroundColor Gray
Write-Host ""
Write-Host "  # Check notification history" -ForegroundColor White
Write-Host "  docker exec postgres-primary psql -U postgres -d tracking_db -c `"SELECT * FROM alarms_history WHERE imei::text LIKE '999%' ORDER BY sent_at DESC LIMIT 10;`"" -ForegroundColor Gray
Write-Host ""
Write-Host "  # Check alarm service logs" -ForegroundColor White
Write-Host "  docker logs -f alarm-service-test" -ForegroundColor Gray
Write-Host ""
Write-Host "Monitoring URLs:" -ForegroundColor Cyan
Write-Host "  📧 MailHog (Emails):     http://localhost:8025" -ForegroundColor White
Write-Host "  💬 Mock SMS (SMS):       http://localhost:8786" -ForegroundColor White
Write-Host "  🚨 Alarm Service (Test): http://localhost:13100/health" -ForegroundColor White
Write-Host "  📱 Operations Service UI:        http://localhost:13000" -ForegroundColor White
Write-Host "  📱 Operations Service API:       http://localhost:18000/health" -ForegroundColor White
Write-Host "  🐰 RabbitMQ:             http://localhost:15672 (tracking_user/tracking_password)" -ForegroundColor White
Write-Host "  📊 HAProxy Stats:        http://localhost:8704/stats (admin/password)" -ForegroundColor White
Write-Host "  🖥️  Monitoring:          http://localhost:8888" -ForegroundColor White
Write-Host "  📈 Prometheus:           http://localhost:9090" -ForegroundColor White
Write-Host "  📊 Grafana:              http://localhost:3000 (admin/admin)" -ForegroundColor White
Write-Host "  🔔 Alertmanager:         http://localhost:9093" -ForegroundColor White
Write-Host ""
Write-Host "To stop all testing services:" -ForegroundColor Yellow
Write-Host "  docker compose --profile testing down" -ForegroundColor White
Write-Host ""
