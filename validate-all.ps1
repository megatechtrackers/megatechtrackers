#!/usr/bin/env pwsh
# =============================================================================
# Megatechtrackers - Full Project Validation Script
# Compiles all Python files and builds all TypeScript/Node projects
# =============================================================================

$ErrorActionPreference = "Continue"
$ProjectRoot = $PSScriptRoot

Write-Host "`n" -NoNewline
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host "  Megatechtrackers - Full Project Validation" -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host ""

$startTime = Get-Date
$errors = @()

# =============================================================================
# Python Compilation
# =============================================================================
Write-Host "`n[1/2] PYTHON COMPILATION" -ForegroundColor Yellow
Write-Host ("-" * 50)

$pythonDirs = @(
    "consumer_node",
    "ops_node/backend",
    "ops_node/migration",
    "monitoring_node",
    "parser_nodes/teltonika",
    "parser_nodes/camera",
    "sms_gateway_node",
    "frappe_apps/megatechtrackers",
    "fleet-monitor",
    "tools",
    "tools/mock_sms_server",
    "tools/mock_tracker",
    "docker/frappe"
)

$pySuccess = 0
$pyFailed = 0
$totalPyFiles = 0

foreach ($dir in $pythonDirs) {
    $fullPath = Join-Path $ProjectRoot $dir
    if (Test-Path $fullPath) {
        Write-Host "  Compiling: $dir ... " -NoNewline
        
        # Find all .py files and compile them (exclude common non-source dirs)
        $pyFiles = Get-ChildItem -Path $fullPath -Filter "*.py" -Recurse -ErrorAction SilentlyContinue | 
                   Where-Object { $_.FullName -notmatch "__pycache__|\.venv|venv|node_modules|dist|\.git" }
        
        if ($pyFiles.Count -eq 0) {
            Write-Host "SKIP (no .py files)" -ForegroundColor DarkGray
            continue
        }
        
        $hasError = $false
        $errorDetails = @()
        foreach ($file in $pyFiles) {
            $result = python -m py_compile $file.FullName 2>&1
            if ($LASTEXITCODE -ne 0) {
                $hasError = $true
                $errorDetails += "$($file.Name): $result"
            }
        }
        
        if ($hasError) {
            Write-Host "FAILED" -ForegroundColor Red
            $pyFailed++
            foreach ($err in $errorDetails) {
                $errors += "Python [$dir]: $err"
            }
        } else {
            Write-Host "OK ($($pyFiles.Count) files)" -ForegroundColor Green
            $pySuccess++
            $totalPyFiles += $pyFiles.Count
        }
    } else {
        Write-Host "  Skipping: $dir (not found)" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "  Python Summary: $pySuccess dirs passed ($totalPyFiles files), $pyFailed failed" -ForegroundColor $(if ($pyFailed -gt 0) { "Red" } else { "Green" })

# =============================================================================
# TypeScript/Node Builds
# =============================================================================
Write-Host "`n[2/2] TYPESCRIPT/NODE BUILDS" -ForegroundColor Yellow
Write-Host ("-" * 50)

# Resilient npm (retry/timeout for flaky networks)
npm config set fetch-retries 5 2>$null; npm config set fetch-retry-mintimeout 20000 2>$null; npm config set fetch-timeout 300000 2>$null

# LegacyPeerDeps = $true only for projects that need it (keeps others' package-lock in sync for npm ci)
$nodeProjects = @(
    @{ Path = "ops_node/frontend"; Name = "Operations Service Frontend (Next.js)"; Cmd = "npm run build"; LegacyPeerDeps = $false },
    @{ Path = "alarm_node"; Name = "Alarm Service (TypeScript)"; Cmd = "npm run build"; LegacyPeerDeps = $false },
    @{ Path = "access_control_node"; Name = "Access Gateway (TypeScript)"; Cmd = "npm run build"; LegacyPeerDeps = $false },
    @{ Path = "web_app_node"; Name = "Web App (Next.js)"; Cmd = "npm run build"; LegacyPeerDeps = $false },
    @{ Path = "mobile_app_node"; Name = "Mobile App (Expo)"; Cmd = "npx expo export --platform web"; LegacyPeerDeps = $true }
)

$nodeSuccess = 0
$nodeFailed = 0
$nodeSkipped = 0

foreach ($project in $nodeProjects) {
    $fullPath = Join-Path $ProjectRoot $project.Path
    $packageJson = Join-Path $fullPath "package.json"
    
    if (Test-Path $packageJson) {
        Push-Location $fullPath
        try {
            $nodeModules = Join-Path $fullPath "node_modules"
            if (-not (Test-Path $nodeModules)) {
                $useLegacy = $project.LegacyPeerDeps -eq $true
                $installArgs = if ($useLegacy) { "npm install --legacy-peer-deps" } else { "npm install" }
                Write-Host "  Installing: $($project.Name) ($installArgs) ... " -NoNewline
                $installOutput = if ($useLegacy) { npm install --legacy-peer-deps 2>&1 | Out-String } else { npm install 2>&1 | Out-String }
                if ($LASTEXITCODE -ne 0) {
                    Write-Host "FAILED" -ForegroundColor Red
                    $nodeFailed++
                    $errorLine = ($installOutput -split "`n" | Where-Object { $_ -match "error|Error|ERROR" } | Select-Object -First 1)
                    $errors += "Node [$($project.Path)]: npm install failed - $(if ($errorLine) { $errorLine.Trim() } else { 'check output' })"
                    Pop-Location
                    continue
                }
                Write-Host "OK" -ForegroundColor Green
            }
            
            Write-Host "  Building: $($project.Name) ... " -NoNewline
            # Capture output and errors
            $output = Invoke-Expression "$($project.Cmd) 2>&1" | Out-String
            if ($LASTEXITCODE -eq 0) {
                Write-Host "OK" -ForegroundColor Green
                $nodeSuccess++
            } else {
                Write-Host "FAILED" -ForegroundColor Red
                $nodeFailed++
                # Extract first meaningful error line
                $errorLine = ($output -split "`n" | Where-Object { $_ -match "error|Error|ERROR" } | Select-Object -First 1)
                if ($errorLine) {
                    $errors += "Node [$($project.Path)]: $($errorLine.Trim())"
                } else {
                    $errors += "Node [$($project.Path)]: Build failed (check manually)"
                }
            }
        } catch {
            Write-Host "ERROR" -ForegroundColor Red
            $nodeFailed++
            $errors += "Node [$($project.Path)]: $_"
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "  Skipping: $($project.Name) (no package.json)" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "  Node Summary: $nodeSuccess passed, $nodeFailed failed, $nodeSkipped skipped" -ForegroundColor $(if ($nodeFailed -gt 0) { "Red" } else { "Green" })

# =============================================================================
# Final Summary
# =============================================================================
$endTime = Get-Date
$duration = $endTime - $startTime

Write-Host "`n"
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host "  VALIDATION COMPLETE" -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host ""
Write-Host "  Duration: $($duration.TotalSeconds.ToString('F1')) seconds"
Write-Host "  Python:   $pySuccess dirs passed ($totalPyFiles files), $pyFailed failed"
Write-Host "  Node:     $nodeSuccess passed, $nodeFailed failed, $nodeSkipped skipped"
Write-Host ""

if ($errors.Count -gt 0) {
    Write-Host "  ERRORS FOUND:" -ForegroundColor Red
    Write-Host ""
    foreach ($err in $errors) {
        Write-Host "    - $err" -ForegroundColor Red
    }
    Write-Host ""
    exit 1
} else {
    Write-Host "  ALL VALIDATIONS PASSED!" -ForegroundColor Green
    Write-Host ""
    exit 0
}
