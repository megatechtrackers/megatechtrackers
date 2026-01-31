FROM pgbouncer/pgbouncer:latest

# Switch to root to install packages
USER root

# Install postgresql-client to enable hash extraction from PostgreSQL
RUN apk update && apk add --no-cache postgresql-client && rm -rf /var/cache/apk/*

# Switch back to the original user (postgres)
USER postgres

# Keep the original entrypoint
# The entrypoint script will be mounted from host
