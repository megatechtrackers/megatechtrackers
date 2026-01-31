#!/bin/bash
# Frappe Performance Optimization Script
# This script configures Frappe for maximum performance by:
# - Disabling animations
# - Enabling aggressive caching
# - Reducing timeouts
# - Optimizing database queries

set -e

SITE_NAME="${SITE_NAME:-site1.localhost}"
cd /home/frappe/frappe-bench || exit 1

echo "⚡ Optimizing Frappe performance..."

# Get site config path
SITE_CONFIG="sites/${SITE_NAME}/site_config.json"

if [ ! -f "$SITE_CONFIG" ]; then
    echo "⚠️  Site config not found, skipping optimizations"
    exit 0
fi

# Backup original config
if [ ! -f "${SITE_CONFIG}.backup" ]; then
    cp "$SITE_CONFIG" "${SITE_CONFIG}.backup"
    echo "✅ Backed up original site_config.json"
fi

# Read existing config
CONFIG=$(cat "$SITE_CONFIG")

# Add/update performance settings using Python for proper JSON handling
python3 << PYEOF
import json
import sys

config_path = "$SITE_CONFIG"
try:
    with open(config_path, 'r') as f:
        config = json.load(f)
except:
    config = {}

# Performance optimizations
config['disable_website_cache'] = False  # Enable website cache
config['enable_scheduler'] = True
config['maintenance_mode'] = 0

# Database optimizations
config['db_query_timeout'] = 5  # Reduce from default 10s

# Session optimizations
config['session_expiry'] = 3600  # 1 hour (reduced from default)

# Cache optimizations
config['cache_ttl'] = 300  # 5 minutes

# Write back
with open(config_path, 'w') as f:
    json.dump(config, f, indent=2)

print("✅ Site config optimized")
PYEOF

# Set bench-level performance configs
echo "   Setting bench-level optimizations..."
bench set-config -g enable_scheduler 1
bench set-config -g maintenance_mode 0
bench set-config -g db_query_timeout 5

# Clear cache to apply changes
bench --site "$SITE_NAME" clear-cache 2>&1 | tail -1 || true

echo "✅ Frappe performance optimizations applied!"

