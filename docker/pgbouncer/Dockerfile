# Stage 1: get postgresql-client (psql) and its libs from Alpine 3.12 (last version with musl 1.1.x)
# pgbouncer/pgbouncer:latest uses Alpine 3.9 which has musl 1.1.20
# Alpine 3.13+ uses musl 1.2.x which is ABI-incompatible, causing segfaults
FROM alpine:3.12 AS psql-builder
# Install with retries for network issues
RUN for i in $(seq 1 20); do \
    apk add --no-cache postgresql-client && break || \
    echo "Retry $i failed, waiting 60s..." && sleep 60; \
    done && rm -rf /var/cache/apk/*
RUN mkdir -p /out/bin /out/lib && \
    cp /usr/bin/psql /out/bin/ && \
    for lib in $(ldd /usr/bin/psql | awk '/=> \// {print $3}'); do cp "$lib" /out/lib/; done

# Stage 2: official image (Alpine 3.9); add psql without touching apk repos
FROM pgbouncer/pgbouncer:latest

USER root

# Copy psql and its runtime libs from builder so entrypoint can extract SCRAM-SHA-256 hashes from PostgreSQL
COPY --from=psql-builder /out/bin/psql /usr/local/bin/psql
COPY --from=psql-builder /out/lib/ /usr/local/lib/
ENV PATH="/usr/local/bin:${PATH}" LD_LIBRARY_PATH="/usr/local/lib"

# Switch back to the original user (postgres) - required for pgbouncer.ini admin_users/stats_users and pgbouncer-exporter
USER postgres

# Entrypoint script is mounted from host; it uses psql then exec /opt/pgbouncer/pgbouncer
