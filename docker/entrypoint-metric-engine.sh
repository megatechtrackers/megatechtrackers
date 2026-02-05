#!/bin/bash
set -e

# Metric engine config is static JSON for Docker - no env substitution needed
# Config is at /app/metric_engine_node/config.json (copied by Dockerfile)

# Execute the main command
exec "$@"
