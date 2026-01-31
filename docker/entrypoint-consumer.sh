#!/bin/bash
set -e

# Process config.json with environment variable substitution
CONFIG_FILE="/app/consumer_node/config.json"

if [ -f "$CONFIG_FILE" ]; then
    echo "Processing config.json with environment variables..."
    
    # Use Python to process the config file
    python3 << 'PYTHON_SCRIPT'
import json
import os
import re
import sys

config_file = "/app/consumer_node/config.json"

# Read the config file as text
with open(config_file, 'r') as f:
    config_text = f.read()

# Replace ${VAR:-default} with actual values
def replace_env_var(match):
    var_name = match.group(1)
    default_value = match.group(2)
    env_value = os.getenv(var_name, default_value)
    # If it's a number (integer), return as-is without quotes
    # For strings, return the value (quotes are already in JSON)
    try:
        int(env_value)
        return env_value  # Integer, no quotes needed
    except ValueError:
        # String value - return as-is (JSON already has quotes around the placeholder)
        return env_value

# Pattern to match ${VAR:-default}
pattern = r'\$\{([^:]+):-([^}]+)\}'
config_text = re.sub(pattern, replace_env_var, config_text)

# Write processed config
with open(config_file, 'w') as f:
    f.write(config_text)

print("Config file processed successfully")
PYTHON_SCRIPT

    echo "Config file processed successfully"
else
    echo "Warning: Config file not found at $CONFIG_FILE"
fi

# Execute the main command
exec "$@"
