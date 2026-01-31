#!/bin/bash
set -e

# Start Expo dev server with web support
# Use npx to ensure expo is found in node_modules
exec npx expo start --lan --port 19000 --web

