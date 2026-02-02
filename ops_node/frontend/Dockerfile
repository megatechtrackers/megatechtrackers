# Next.js Frontend (custom server for request metrics)
FROM node:20-alpine AS base

FROM base AS deps
# Install system dependencies (with retries for network issues)
RUN for i in $(seq 1 20); do \
    apk add --no-cache libc6-compat && break || \
    echo "Retry $i failed, waiting 60s..." && sleep 60; \
    done
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm config set fetch-retries 20 && npm config set fetch-retry-mintimeout 60000 && npm config set fetch-retry-maxtimeout 300000 && npm config set fetch-timeout 1200000 && npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/server.js ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

USER nextjs
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"
CMD ["node", "server.js"]
