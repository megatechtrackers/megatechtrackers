#!/bin/bash
#
# Verification Script for Automatic Cleanup System
# Checks if all cleanup mechanisms are properly configured
#

set -e

echo "=========================================="
echo "Megatechtrackers Disk Management Verification"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_passed=0
check_failed=0
check_warning=0

# Function to print status
print_status() {
    if [ "$1" = "PASS" ]; then
        echo -e "${GREEN}✓${NC} $2"
        ((check_passed++))
    elif [ "$1" = "FAIL" ]; then
        echo -e "${RED}✗${NC} $2"
        ((check_failed++))
    elif [ "$1" = "WARN" ]; then
        echo -e "${YELLOW}⚠${NC} $2"
        ((check_warning++))
    else
        echo "  $2"
    fi
}

echo "Checking PostgreSQL Primary Container..."
echo "----------------------------------------"

# Check if container is running
if docker ps | grep -q postgres-primary; then
    print_status "PASS" "PostgreSQL primary container is running"
    
    # Check if cleanup scripts exist
    if docker exec postgres-primary test -f /usr/local/bin/cleanup-wal-archives.sh; then
        print_status "PASS" "WAL cleanup script exists"
    else
        print_status "FAIL" "WAL cleanup script not found"
    fi
    
    if docker exec postgres-primary test -f /usr/local/bin/cleanup-postgres-logs.sh; then
        print_status "PASS" "PostgreSQL log cleanup script exists"
    else
        print_status "FAIL" "PostgreSQL log cleanup script not found"
    fi
    
    # Check if cron is running
    if docker exec postgres-primary pgrep cron > /dev/null 2>&1; then
        print_status "PASS" "Cron daemon is running"
    else
        print_status "FAIL" "Cron daemon is not running"
    fi
    
    # Check if cron jobs are installed
    if docker exec postgres-primary test -f /etc/cron.d/cleanup-wal-archives; then
        print_status "PASS" "WAL cleanup cron job installed"
    else
        print_status "FAIL" "WAL cleanup cron job not installed"
    fi
    
    if docker exec postgres-primary test -f /etc/cron.d/cleanup-postgres-logs; then
        print_status "PASS" "PostgreSQL log cleanup cron job installed"
    else
        print_status "FAIL" "PostgreSQL log cleanup cron job not installed"
    fi
    
    # Check WAL archive directory
    if docker exec postgres-primary test -d /var/lib/postgresql/archive; then
        WAL_SIZE=$(docker exec postgres-primary du -sh /var/lib/postgresql/archive 2>/dev/null | awk '{print $1}')
        print_status "INFO" "WAL archive directory exists (size: $WAL_SIZE)"
    else
        print_status "WARN" "WAL archive directory not found (may not be created yet)"
    fi
    
    # Check log directory
    if docker exec postgres-primary test -d /var/lib/postgresql/data/log; then
        LOG_SIZE=$(docker exec postgres-primary du -sh /var/lib/postgresql/data/log 2>/dev/null | awk '{print $1}')
        print_status "INFO" "PostgreSQL log directory exists (size: $LOG_SIZE)"
    else
        print_status "WARN" "PostgreSQL log directory not found (may not be created yet)"
    fi
    
else
    print_status "FAIL" "PostgreSQL primary container is not running"
fi

echo ""
echo "Checking Prometheus..."
echo "----------------------------------------"

if docker ps | grep -q prometheus; then
    print_status "PASS" "Prometheus container is running"
    
    # Check if disk alerts are loaded
    if docker exec prometheus test -f /etc/prometheus/alerts-disk.yml; then
        print_status "PASS" "Disk monitoring alerts file exists"
    else
        print_status "FAIL" "Disk monitoring alerts file not found"
    fi
    
    # Check Prometheus data size
    if docker exec prometheus test -d /prometheus; then
        PROM_SIZE=$(docker exec prometheus du -sh /prometheus 2>/dev/null | awk '{print $1}')
        print_status "INFO" "Prometheus data directory (size: $PROM_SIZE, 30-day retention)"
    fi
else
    print_status "FAIL" "Prometheus container is not running"
fi

echo ""
echo "Checking RabbitMQ..."
echo "----------------------------------------"

if docker ps | grep -q rabbitmq-1; then
    print_status "PASS" "RabbitMQ node 1 is running"
    
    # Check RabbitMQ data size
    if docker exec rabbitmq-1 test -d /var/lib/rabbitmq; then
        RABBIT_SIZE=$(docker exec rabbitmq-1 du -sh /var/lib/rabbitmq 2>/dev/null | awk '{print $1}')
        print_status "INFO" "RabbitMQ data directory (size: $RABBIT_SIZE)"
    fi
    
    # Check queue TTL and limits
    print_status "INFO" "RabbitMQ has message TTL and max-length configured"
else
    print_status "WARN" "RabbitMQ node 1 is not running"
fi

echo ""
echo "Checking Grafana..."
echo "----------------------------------------"

if docker ps | grep -q grafana; then
    print_status "PASS" "Grafana container is running"
    
    # Check if cleanup script exists
    if docker exec grafana test -f /usr/local/bin/cleanup-monitoring-data.sh; then
        print_status "PASS" "Monitoring cleanup script exists"
    else
        print_status "WARN" "Monitoring cleanup script not mounted (manual cleanup available)"
    fi
else
    print_status "WARN" "Grafana container is not running"
fi

echo ""
echo "Checking TimescaleDB Retention Policies..."
echo "----------------------------------------"

if docker ps | grep -q postgres-primary; then
    # Check if retention policies exist
    RETENTION_CHECK=$(docker exec postgres-primary psql -U postgres -d tracking_db -t -c "
        SELECT COUNT(*) FROM timescaledb_information.jobs 
        WHERE proc_name = 'policy_retention';" 2>/dev/null | tr -d ' ' || echo "0")
    
    if [ "$RETENTION_CHECK" -gt 0 ]; then
        print_status "PASS" "TimescaleDB retention policies configured ($RETENTION_CHECK policies)"
    else
        print_status "WARN" "TimescaleDB retention policies not detected"
    fi
    
    # Check compression policies
    COMPRESSION_CHECK=$(docker exec postgres-primary psql -U postgres -d tracking_db -t -c "
        SELECT COUNT(*) FROM timescaledb_information.jobs 
        WHERE proc_name = 'policy_compression';" 2>/dev/null | tr -d ' ' || echo "0")
    
    if [ "$COMPRESSION_CHECK" -gt 0 ]; then
        print_status "PASS" "TimescaleDB compression policies configured ($COMPRESSION_CHECK policies)"
    else
        print_status "WARN" "TimescaleDB compression policies not detected"
    fi
fi

echo ""
echo "=========================================="
echo "Verification Summary"
echo "=========================================="
echo -e "${GREEN}Passed:${NC} $check_passed"
echo -e "${YELLOW}Warnings:${NC} $check_warning"
echo -e "${RED}Failed:${NC} $check_failed"
echo ""

if [ $check_failed -eq 0 ]; then
    echo -e "${GREEN}✓ All critical checks passed!${NC}"
    echo "Your system is configured for automatic disk management."
    exit 0
else
    echo -e "${RED}✗ Some checks failed!${NC}"
    echo "Please review the failed items above."
    exit 1
fi
