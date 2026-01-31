#!/bin/bash
#
# Setup Cron Jobs for PostgreSQL Maintenance
# Installs and configures cron jobs for automatic cleanup
#

set -e

echo "Setting up automatic cleanup cron jobs..."

# Check if cron is installed (should be pre-installed in Dockerfile)
if ! command -v cron &> /dev/null; then
    echo "ERROR: cron is not installed!"
    echo "This should have been installed in the Dockerfile."
    exit 1
fi

# Create cron directory if it doesn't exist
mkdir -p /etc/cron.d

# Create log directory
mkdir -p /var/log/postgresql
chown -R postgres:postgres /var/log/postgresql

# Create cron job for WAL archive cleanup (runs daily at 2 AM)
# NOTE: Using 'bash /script.sh' for Windows compatibility (NTFS doesn't support +x)
# In production Linux systems, use '/usr/local/bin/cleanup-wal-archives.sh' directly
cat > /etc/cron.d/cleanup-wal-archives << 'EOF'
# WAL Archive Cleanup - Runs daily at 2 AM
# Removes WAL archives older than retention period
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

0 2 * * * postgres bash /usr/local/bin/cleanup-wal-archives.sh >> /var/log/postgresql/wal-cleanup-cron.log 2>&1
EOF

# Create cron job for PostgreSQL log cleanup (runs daily at 3 AM)
# NOTE: Using 'bash /script.sh' for Windows compatibility (NTFS doesn't support +x)
# In production Linux systems, use '/usr/local/bin/cleanup-postgres-logs.sh' directly
cat > /etc/cron.d/cleanup-postgres-logs << 'EOF'
# PostgreSQL Log Cleanup - Runs daily at 3 AM
# Removes old PostgreSQL server logs
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
PGDATA=/var/lib/postgresql/data

0 3 * * * postgres bash /usr/local/bin/cleanup-postgres-logs.sh >> /var/log/postgresql/log-cleanup-cron.log 2>&1
EOF

# Set proper permissions
chmod 0644 /etc/cron.d/cleanup-wal-archives
chmod 0644 /etc/cron.d/cleanup-postgres-logs

echo "Cron jobs installed successfully:"
echo "  - WAL archive cleanup: Daily at 2 AM"
echo "  - PostgreSQL log cleanup: Daily at 3 AM"

# Start cron daemon
if pgrep cron > /dev/null; then
    echo "Cron daemon already running"
else
    echo "Starting cron daemon..."
    cron
    echo "Cron daemon started"
fi

# Show installed cron jobs
echo ""
echo "Installed cron jobs:"
crontab -l -u postgres 2>/dev/null || echo "(Using /etc/cron.d/ for cron jobs)"
ls -la /etc/cron.d/cleanup-* 2>/dev/null || true

exit 0
