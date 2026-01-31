#!/bin/bash
# Script to generate PgBouncer userlist.txt with proper MD5 hashes
# Usage: ./generate-userlist.sh

echo "Generating PgBouncer userlist.txt..."

# Default passwords (change these for production!)
POSTGRES_PASS="${POSTGRES_PASSWORD:-postgres}"
WRITER_PASS="${WRITER_PASSWORD:-writer_password}"
READONLY_PASS="${READONLY_PASSWORD:-readonly_password}"

# Generate MD5 hashes (format: md5(password + username))
POSTGRES_HASH=$(echo -n "${POSTGRES_PASS}postgres" | md5sum | cut -d' ' -f1)
WRITER_HASH=$(echo -n "${WRITER_PASS}tracking_writer" | md5sum | cut -d' ' -f1)
READONLY_HASH=$(echo -n "${READONLY_PASS}parser_readonly" | md5sum | cut -d' ' -f1)

# Create userlist.txt
cat > userlist.txt <<EOF
"postgres" "md5${POSTGRES_HASH}"
"tracking_writer" "md5${WRITER_HASH}"
"parser_readonly" "md5${READONLY_HASH}"
EOF

echo "Generated userlist.txt:"
cat userlist.txt
echo ""
echo "Copy this file to docker/pgbouncer/userlist.txt"
