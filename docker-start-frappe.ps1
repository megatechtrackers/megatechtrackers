# PowerShell script to start Docker environment

Write-Host "Starting Megatechtrackers Docker Environment" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Check Docker
Write-Host "Checking prerequisites..." -ForegroundColor Cyan
try {
    docker info | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
        Write-Host "   Download: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "ERROR: Docker is not installed or not running." -ForegroundColor Red
    Write-Host "   Please install Docker Desktop: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    Write-Host "   Make sure WSL 2 is enabled (required by Docker Desktop on Windows)" -ForegroundColor Yellow
    exit 1
}

# Check Docker Compose version (v2 syntax)
try {
    $composeVersion = docker compose version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARNING: 'docker compose' (v2) not found. Trying 'docker-compose' (v1)..." -ForegroundColor Yellow
        $composeCheck = docker-compose version 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Docker Compose is not available." -ForegroundColor Red
            Write-Host "   Please update Docker Desktop to the latest version." -ForegroundColor Yellow
            exit 1
        } else {
            Write-Host "   Using docker-compose (v1) - consider updating to Docker Desktop with Compose v2" -ForegroundColor Yellow
            # Note: Script uses 'docker compose' throughout, so this will fail if v1 is used
        }
    }
} catch {
    Write-Host "WARNING: Could not verify Docker Compose version" -ForegroundColor Yellow
}

Write-Host "   ✓ Docker is running" -ForegroundColor Green

Write-Host "Building and starting Docker containers..." -ForegroundColor Cyan
Write-Host "   (Starting full stack with frappe profile)" -ForegroundColor Gray

# Remove any conflicting containers that might exist from previous runs
Write-Host "Cleaning up any conflicting containers..." -ForegroundColor Gray
$containerNames = @("docs", "web-app", "mobile-app", "frappe", "grafana", "grafana-proxy", "access-gateway", "mariadb", "redis")
foreach ($name in $containerNames) {
    $existing = docker ps -a --filter "name=$name" --format "{{.Names}}" 2>$null
    if ($existing -eq $name) {
        Write-Host "   Removing existing container: $name" -ForegroundColor Yellow
        docker rm -f $name 2>$null | Out-Null
    }
}

docker compose --profile frappe up --build -d

# --- Auto-provision keys (Grafana + Frappe) ---

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

function Wait-HttpOk {
    param(
        [Parameter(Mandatory=$true)][string]$Url,
        [int]$TimeoutSeconds = 300
    )
    Write-Host "   Waiting for $Url ..." -ForegroundColor Gray -NoNewline
    $start = Get-Date
    $dots = 0
    while ($true) {
        try {
            # Use curl.exe for faster, more reliable HTTP checks on Windows
            $result = curl.exe -s -o NUL -w "%{http_code}" --connect-timeout 5 --max-time 10 $Url 2>$null
            if ($result -match "^[23]\d\d$") {
                Write-Host " OK" -ForegroundColor Green
                return
            }
        } catch { }

        $elapsed = ((Get-Date) - $start).TotalSeconds
        if ($elapsed -ge $TimeoutSeconds) {
            Write-Host " TIMEOUT" -ForegroundColor Red
            throw "Timed out waiting for $Url"
        }
        
        # Progress indicator
        $dots++
        if ($dots % 10 -eq 0) {
            Write-Host "." -NoNewline
        }
        Start-Sleep -Seconds 3
    }
}

function Wait-FrappeAppInstalled {
    param(
        [int]$TimeoutSeconds = 600
    )
    Write-Host "   Waiting for megatechtrackers app to be installed ..." -ForegroundColor Gray -NoNewline
    $start = Get-Date
    $dots = 0
    while ($true) {
        try {
            $out = docker exec frappe bash -lc "cd /home/frappe/frappe-bench && bench --site site1.localhost list-apps" 2>$null
            if ($out -match "megatechtrackers") {
                Write-Host " OK" -ForegroundColor Green
                return
            }
        } catch { }

        $elapsed = ((Get-Date) - $start).TotalSeconds
        if ($elapsed -ge $TimeoutSeconds) {
            Write-Host " TIMEOUT" -ForegroundColor Red
            throw "Timed out waiting for megatechtrackers app to be installed in Frappe"
        }
        
        # Progress indicator
        $dots++
        if ($dots % 6 -eq 0) {
            Write-Host "." -NoNewline
        }
        Start-Sleep -Seconds 5
    }
}

# Ensure local dev CORS origins are configured for Access Gateway and Frappe
function Merge-Origins {
    param(
        [string]$ExistingCsv,
        [string[]]$Required
    )
    $set = @{}
    foreach ($o in ($ExistingCsv -split ',')) {
        $t = $o.Trim()
        if ($t) { $set[$t] = $true }
    }
    foreach ($r in $Required) {
        $t = ($r ?? "").Trim()
        if ($t) { $set[$t] = $true }
    }
    return ($set.Keys | Sort-Object) -join ','
}

try {
    # Ensure core endpoints are up before generating keys
    Write-Host ""
    Write-Host "Waiting for services to be ready..." -ForegroundColor Cyan
    Wait-HttpOk -Url "http://localhost:3000/api/health" -TimeoutSeconds 300
    Wait-HttpOk -Url "http://localhost:8000/api/method/ping" -TimeoutSeconds 600
    Wait-FrappeAppInstalled -TimeoutSeconds 600
    Write-Host ""

    $dotEnvPath = Join-Path (Get-Location) ".env"

    # --- CORS defaults (idempotent) ---
    # access-gateway supports wildcard patterns like http://localhost:* (implemented in code).
    # This avoids chasing changing Expo web ports (19016/19018/etc).
    $requiredOrigins = @(
        "http://localhost:*",
        "http://127.0.0.1:*"
    )

    $existingAllowed = Get-DotEnvValue -Path $dotEnvPath -Name "ALLOWED_ORIGINS"
    $mergedAllowed = Merge-Origins -ExistingCsv $existingAllowed -Required $requiredOrigins
    Set-DotEnvValue -Path $dotEnvPath -Name "ALLOWED_ORIGINS" -Value $mergedAllowed

    # 1) Create Grafana API key if missing
    $existingGrafanaKeyValue = Get-DotEnvValue -Path $dotEnvPath -Name "GRAFANA_API_KEY"
    if (-not $existingGrafanaKeyValue) {
        # Grafana v12+ no longer supports /api/auth/keys; use Service Account token API
        $pair = "admin:admin"
        $token = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
        $headers = @{ Authorization = "Basic $token" }

        $saName = "fleet-service"
        $search = Invoke-RestMethod -Method Get -Uri ("http://localhost:3000/api/serviceaccounts/search?name=" + [Uri]::EscapeDataString($saName)) -Headers $headers
        $saId = $null
        if ($search.serviceAccounts -and $search.serviceAccounts.Count -gt 0) {
            $saId = $search.serviceAccounts[0].id
        } else {
            $createSaBody = @{ name = $saName; role = "Admin"; isDisabled = $false } | ConvertTo-Json
            $created = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/serviceaccounts" -Headers $headers -ContentType "application/json" -Body $createSaBody
            $saId = $created.id
        }
        if (-not $saId) { throw "Failed to create/find GrafanaServiceAccount (service account in Grafana)" }

        # Delete old tokens with our prefix to avoid unbounded growth
        try {
            $tokens = Invoke-RestMethod -Method Get -Uri ("http://localhost:3000/api/serviceaccounts/$saId/tokens") -Headers $headers
            foreach ($t in $tokens) {
                if ($t.name -like "fleet-token*") {
                    Invoke-RestMethod -Method Delete -Uri ("http://localhost:3000/api/serviceaccounts/$saId/tokens/" + $t.id) -Headers $headers | Out-Null
                }
            }
        } catch { }

        $tokenName = "fleet-token-" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        $createTokenBody = @{ name = $tokenName; secondsToLive = 0 } | ConvertTo-Json
        $tok = Invoke-RestMethod -Method Post -Uri ("http://localhost:3000/api/serviceaccounts/$saId/tokens") -Headers $headers -ContentType "application/json" -Body $createTokenBody
        if ($tok.key -and ($tok.key.ToString().Trim().Length -gt 0)) {
            Set-DotEnvValue -Path $dotEnvPath -Name "GRAFANA_API_KEY" -Value $tok.key
            Write-Host "Generated Grafana API key (service account token) and saved to .env" -ForegroundColor Green
        } else {
            throw "Grafana token creation did not return a key"
        }
    }

    # 2) Ensure Frappe API key/secret exist for Administrator and sync them to .env
    # (We do this even if .env has values to guarantee .env matches what exists in Frappe DB.)
    $json = docker exec frappe bash -lc "cd /home/frappe/frappe-bench && env FRAPPE_SITE=site1.localhost FRAPPE_SITES_PATH=/home/frappe/frappe-bench/sites env/bin/python /home/frappe/provision_frappe_keys.py"

    $fr = $json | ConvertFrom-Json
    if ($fr.frappe_api_key -and $fr.frappe_api_secret -and ($fr.frappe_api_key.ToString().Trim().Length -gt 0) -and ($fr.frappe_api_secret.ToString().Trim().Length -gt 0)) {
        Set-DotEnvValue -Path $dotEnvPath -Name "FRAPPE_API_KEY" -Value $fr.frappe_api_key
        Set-DotEnvValue -Path $dotEnvPath -Name "FRAPPE_API_SECRET" -Value $fr.frappe_api_secret
        Write-Host "Frappe API key/secret ensured and synced to .env" -ForegroundColor Green
    } else {
        throw "Frappe key provisioning returned empty values"
    }

    # Restart access-gateway to pick up newly written .env
    docker compose --profile frappe up -d --no-deps --force-recreate access-gateway | Out-Null

    # Ensure Frappe allow_cors is configured for local dev (any origin).
    docker exec frappe bash -lc "cd /home/frappe/frappe-bench && bench --site site1.localhost set-config allow_cors '*'" | Out-Null
    # Ensure Frappe CSP frame-ancestors allows localhost:* so Expo web can embed forms/reports.
    # (CSP header is set by megatechtrackers.utils.http.after_request; this config is optional extra.)
    docker exec frappe bash -lc "cd /home/frappe/frappe-bench && bench --site site1.localhost set-config frame_ancestors 'http://localhost:* https://localhost:* http://127.0.0.1:* https://127.0.0.1:*'" | Out-Null
    # Restart Frappe to ensure config is applied consistently
    docker compose restart frappe | Out-Null

    # Hard verification (fail fast): ensure keys really exist after provisioning
    $gNow = Get-DotEnvValue -Path $dotEnvPath -Name "GRAFANA_API_KEY"
    $fkNow = Get-DotEnvValue -Path $dotEnvPath -Name "FRAPPE_API_KEY"
    $fsNow = Get-DotEnvValue -Path $dotEnvPath -Name "FRAPPE_API_SECRET"
    if (-not $gNow -or -not $fkNow -or -not $fsNow) {
        throw "Key provisioning failed (missing GRAFANA_API_KEY or FRAPPE_API_KEY/FRAPPE_API_SECRET). Re-run .\\docker-start.ps1 after checking Grafana/Frappe logs."
    }
} catch {
    Write-Host "WARNING: Auto-provisioning keys failed: $($_.Exception.Message)" -ForegroundColor Yellow
    exit 1
}

try {
    Write-Host ""
    Write-Host "Seeding Frappe test data (megatechtrackers)..." -ForegroundColor Cyan
    docker exec frappe bash -lc "cd /home/frappe/frappe-bench && env/bin/python /home/frappe/create_test_data.py"
    if ($LASTEXITCODE -ne 0) {
        throw "Frappe test data seed failed"
    }

    Write-Host ""
    Write-Host "Provisioning Grafana (datasource + dashboards)..." -ForegroundColor Cyan
    docker exec frappe bash -lc "cd /home/frappe/frappe-bench && env/bin/python /home/frappe/provision_grafana.py"
    if ($LASTEXITCODE -ne 0) {
        throw "Grafana provisioning failed"
    }

    Write-Host ""
    Write-Host "Syncing Grafana dashboards into Frappe and assigning to Administrator..." -ForegroundColor Cyan
    docker exec frappe bash -lc "cd /home/frappe/frappe-bench && env/bin/python /home/frappe/sync_grafana_reports_to_frappe.py"
    if ($LASTEXITCODE -ne 0) {
        throw "Grafana->Frappe sync failed"
    }
} catch {
    Write-Host "WARNING: Provisioning (test data/dashboards) failed: $($_.Exception.Message)" -ForegroundColor Yellow
}

# Smoke tests are optional - skip if service doesn't exist
$smokeTestService = docker compose --profile test config --services 2>$null | Select-String "frappe-grafana-query-tests"
if ($smokeTestService) {
    try {
        Write-Host ""
        Write-Host "Running smoke tests (Grafana query tests)..." -ForegroundColor Cyan
        docker compose --profile test run --rm frappe-grafana-query-tests
        if ($LASTEXITCODE -ne 0) {
            Write-Host "WARNING: Smoke tests failed (non-critical)." -ForegroundColor Yellow
        } else {
            Write-Host "Smoke tests passed." -ForegroundColor Green
        }
    } catch {
        Write-Host "WARNING: Smoke tests skipped: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "Skipping smoke tests (service not configured)." -ForegroundColor Gray
}

Write-Host ""
Write-Host "Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host ""
Write-Host "Service Status:" -ForegroundColor Cyan
docker compose --profile frappe ps

Write-Host ""
Write-Host "Services are starting up." -ForegroundColor Green
Write-Host ""
Write-Host "Docker Services:" -ForegroundColor Cyan
Write-Host "   - Frappe:        http://localhost:8000 (Administrator/admin)"
Write-Host "   - Grafana:       http://localhost:3000 (admin/admin)"
Write-Host "   - Access Gateway: http://localhost:3001/health"
Write-Host "   - Next.js:       http://localhost:3002"
Write-Host "   - Docs:          http://localhost:8001"
Write-Host "   - MariaDB:       localhost:3306"
Write-Host "   - Redis:         localhost:6379"
Write-Host ""
Write-Host "IMPORTANT: Frappe Initialization" -ForegroundColor Yellow
Write-Host "   Frappe takes 3-5 minutes to initialize on first startup."
Write-Host "   Check logs: docker compose logs -f frappe"
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "   1. Wait for Frappe to be ready (check logs above)"
Write-Host "   2. Keys are auto-generated into .env (Grafana + Frappe)"
Write-Host "   3. Create users in Frappe and assign permissions"
Write-Host "   4. Expo (mobile) is running in Docker (see react-native-app logs)"
Write-Host ""
