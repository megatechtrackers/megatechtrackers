# Fix Line Endings for All Shell Scripts
# Converts CRLF (Windows) to LF (Unix) line endings

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Fixing Line Endings for Shell Scripts" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Stop containers first
Write-Host "Stopping Docker containers..." -ForegroundColor Yellow
docker compose down 2>&1 | Out-Null
Start-Sleep -Seconds 2

# Get all .sh files
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$files = Get-ChildItem -Path $projectRoot -Filter "*.sh" -Recurse -File

Write-Host "Found $($files.Count) shell script files" -ForegroundColor Cyan
Write-Host ""

$fixed = 0
$failed = 0
$skipped = 0

foreach ($file in $files) {
    $relativePath = $file.FullName.Replace($projectRoot + "\", "")
    
    try {
        # Read file content as bytes
        $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
        
        # Check if file has CRLF
        $hasCRLF = $false
        for ($i = 0; $i -lt $bytes.Length - 1; $i++) {
            if ($bytes[$i] -eq 13 -and $bytes[$i + 1] -eq 10) {  # \r\n
                $hasCRLF = $true
                break
            }
        }
        
        if ($hasCRLF) {
            # Convert CRLF to LF
            $content = [System.IO.File]::ReadAllText($file.FullName)
            $content = $content -replace "`r`n", "`n"
            $content = $content -replace "`r", "`n"  # Also fix any stray \r
            
            # Write back with UTF-8 encoding (no BOM)
            $utf8NoBom = New-Object System.Text.UTF8Encoding $false
            [System.IO.File]::WriteAllText($file.FullName, $content, $utf8NoBom)
            
            Write-Host "✓ Fixed: $relativePath" -ForegroundColor Green
            $fixed++
        } else {
            Write-Host "○ Already LF: $relativePath" -ForegroundColor Gray
            $skipped++
        }
    }
    catch {
        Write-Host "✗ Failed: $relativePath - $($_.Exception.Message)" -ForegroundColor Red
        $failed++
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  Fixed: $fixed files" -ForegroundColor Green
Write-Host "  Already correct: $skipped files" -ForegroundColor Gray
if ($failed -gt 0) {
    Write-Host "  Failed: $failed files" -ForegroundColor Red
}
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($fixed -gt 0) {
    Write-Host "✓ All shell scripts now have Unix (LF) line endings!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Start containers: docker compose up -d" -ForegroundColor White
    Write-Host "  2. Check logs: docker logs postgres-primary --tail 50" -ForegroundColor White
} else {
    Write-Host "All files already have correct line endings." -ForegroundColor Green
}

Write-Host ""
