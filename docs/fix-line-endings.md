# Fix Line Endings Issue

## Problem
Bash scripts have Windows line endings (CRLF - `\r\n`) instead of Unix line endings (LF - `\n`).

Error: `$'\r': command not found`

## Solution

### Option 1: Using VS Code (Recommended)
1. **Close all containers** first:
   ```powershell
   docker-compose down
   ```

2. **Open each `.sh` file** in VS Code
3. **Look at bottom-right corner** of VS Code - it shows "CRLF" or "LF"
4. **Click on "CRLF"** → Select **"LF"** from dropdown
5. **Save the file** (Ctrl+S)

**Files to fix:**
- `docker/postgres/setup-cleanup-cron.sh`
- `docker/postgres/cleanup-wal-archives.sh`
- `docker/postgres/cleanup-postgres-logs.sh`
- `docker/postgres/postgres-entrypoint.sh`
- `docker/postgres/replica-entrypoint.sh`
- `docker/postgres/ensure-users.sh`
- `docker/postgres/setup-replication-user.sh`
- `docker/postgres/init-replica.sh`
- `docker/postgres/load-unit-io-mapping.sh`
- `docker/postgres/load-location-reference-data.sh`
- `docker/scripts/cleanup-monitoring-data.sh`
- `docker/scripts/monitor-rabbitmq-disk.sh`
- `docker/scripts/verify-cleanup-setup.sh`
- `docker/entrypoint-consumer.sh`
- `docker/entrypoint-parser.sh`

### Option 2: Using PowerShell Script

Run this PowerShell script to fix all files at once:

```powershell
# Fix all .sh files in the project
$files = Get-ChildItem -Path "c:\hdd\.mov\myapps\megatechtrackers" -Filter "*.sh" -Recurse

foreach ($file in $files) {
    Write-Host "Fixing: $($file.FullName)"
    $content = Get-Content $file.FullName -Raw
    $content = $content -replace "`r`n", "`n"
    [System.IO.File]::WriteAllText($file.FullName, $content)
}

Write-Host "Done! All .sh files now have Unix (LF) line endings"
```

### Option 3: Using Git Bash
```bash
# Fix all .sh files
find . -name "*.sh" -type f -exec dos2unix {} \;
```

---

## Prevention (.gitattributes)

A `.gitattributes` file has been created to ensure:
- All `.sh` files always use LF (Unix) line endings
- All `.ps1` files use CRLF (Windows) line endings
- Git handles this automatically on checkout/commit

## After Fixing

1. Verify the fix:
   ```powershell
   docker-compose restart postgres-primary
   docker logs postgres-primary --tail 50
   ```

2. You should see:
   ```
   ✓ WAL archive cleanup script found
   ✓ PostgreSQL log cleanup script found
   Cron jobs installed successfully:
     - WAL archive cleanup: Daily at 2 AM
     - PostgreSQL log cleanup: Daily at 3 AM
   ✓ Automatic cleanup cron jobs configured
   ```

3. No more `$'\r': command not found` errors!

---

## Why This Happens

Windows uses **CRLF** (`\r\n`) for line endings
Linux/Unix uses **LF** (`\n`) for line endings

When you edit files on Windows, they get CRLF line endings.
Bash in Docker (Linux) can't handle CRLF - it interprets `\r` as a command.

The `.gitattributes` file ensures Git converts line endings automatically.
