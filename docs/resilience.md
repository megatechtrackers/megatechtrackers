# System Resilience & Self-Healing

This document confirms that **all retention and cleanup run automatically** and **reconnect/retry logic is in place** across services, so the system is **self-healing with no manual intervention** under normal operation.

---

## 1. Database tables – retention & cleanup (all automatic)

| Table / data | Retention | Who runs it | Manual? |
|--------------|-----------|-------------|---------|
| **trackdata** | 12 months | TimescaleDB retention policy | No |
| **alarms** (device alarms) | 24 months | TimescaleDB retention policy | No |
| **events** | 12 months | TimescaleDB retention policy | No |
| **command_history** | 90 days | ops_node backend (hourly task) | No |
| **command_inbox** | 90 days | ops_node backend (hourly task) | No |
| **alarms_history** | 365 days | alarm_node (daily task) | No |
| **alarms_dlq** (reprocessed rows) | 90 days | alarm_node (daily task) | No |
| **alarms_sms_modem_usage** | 730 days | alarm_node (daily task) | No |
| **processed_message_ids** | TTL-based | consumer_node dedup (every 5 min) | No |
| **alarms_dedup** | Expired entries | consumer_node dedup cleanup | No |
| **alarms_workers** (stale) | Heartbeat-based | alarm_node worker registry (interval) | No |
| **command_outbox / command_sent** | Timeout-based | ops_node + sms_gateway (periodic cleanup) | No |
| WAL / PG logs / Prometheus / RabbitMQ | See cleanup-quick-reference | Cron / built-in / app | No |

**Conclusion:** No append-only or time-series table grows unbounded; all cleanups run inside the stack without manual steps.

---

## 2. Self-healing per service (reconnect, retry, circuit breaker)

| Service / area | Mechanism | Where |
|----------------|-----------|--------|
| **alarm_node** | RabbitMQ: startup retries + auto-reconnect on disconnect | `index.ts`, `rabbitmqConsumer.ts` |
| **alarm_node** | DB: session timezone UTC; columns TIMESTAMPTZ | `db/index.ts` |
| **alarm_node** | Circuit breakers (email/SMS/voice): auto reset + periodic reprocess | `circuitBreaker.ts`, `alarmProcessor.ts`, `index.ts` |
| **alarm_node** | DLQ: automatic reprocessing (periodic + on startup) | `dlqReprocessor.ts`, `index.ts` |
| **alarm_node** | Worker registry: stale workers removed periodically | `workerRegistry.ts` |
| **alarm_node** | LISTEN/NOTIFY: reconnect on error/end | `notificationListener.ts` |
| **consumer_node** | RabbitMQ: reconnect on connection loss | `rabbitmq_consumer.py` |
| **consumer_node** | Retry handler + circuit breaker for failures | `retry_handler.py`, `circuit_breaker.py` |
| **consumer_node** | Dedup: DB + in-memory cleanup task | `message_deduplicator.py`, `run.py` |
| **ops_node backend** | Command timeout + history/inbox cleanup (hourly) | `main.py` |
| **sms_gateway_node** | Command timeout cleanup (periodic) | `sms_service.py` |
| **parser_nodes (Teltonika)** | Connection retry (RabbitMQ, DB) | `connection_retry.py`, `rabbitmq_producer.py` |
| **parser_nodes (camera)** | Connection retry, health check, cleanup loop | `connection_retry.py`, `health_check.py`, `cms_poller.py` |
| **PostgreSQL** | WAL + log cleanup (cron in container) | `cleanup-wal-archives.sh`, `cleanup-postgres-logs.sh` |
| **Prometheus** | Retention (30d in docker-compose) | `--storage.tsdb.retention.time` |

---

## 3. Full SQL cleanup functions (schema)

All are in `database/schema.sql` and are **invoked only by application code or cron** (no manual ad-hoc runs required for normal operation):

| Function | Purpose | Invoked by |
|----------|---------|------------|
| `cleanup_old_command_history(days)` | command_history | ops_node (hourly) |
| `cleanup_old_history(days)` | Alias for above | ops_node |
| `cleanup_old_command_inbox(days)` | command_inbox | ops_node (hourly) |
| `cleanup_old_alarms_history(days)` | alarms_history | alarm_node (daily) |
| `cleanup_old_alarms_dlq(days)` | alarms_dlq (reprocessed) | alarm_node (daily) |
| `cleanup_old_alarms_sms_modem_usage(days)` | alarms_sms_modem_usage | alarm_node (daily) |
| TimescaleDB `add_retention_policy` | trackdata, alarms, events | Built-in (continuous) |

---

## 4. Checklist: no manual intervention

- [x] **DB growth:** Every growing table has retention or cleanup; all run automatically (TimescaleDB, ops_node, alarm_node, consumer_node).
- [x] **alarms_history / alarms_dlq / modem_usage:** alarm_node runs daily cleanup (1 min after startup, then every 24 h).
- [x] **command_history / command_inbox:** ops_node runs hourly cleanup.
- [x] **processed_message_ids / alarms_dedup:** consumer_node runs dedup cleanup every 5 minutes.
- [x] **RabbitMQ:** Services reconnect on connection loss; alarm_node has startup retries.
- [x] **Circuit breakers / DLQ:** alarm_node resets breakers and reprocesses pending/DLQ on startup and periodically.
- [x] **Workers:** alarm_node removes stale workers on an interval.
- [x] **Disk (WAL, logs, Prometheus, etc.):** Covered by cron, retention, and scripts (see cleanup-quick-reference.md).

**Result:** The system is designed to run and self-heal without manual intervention. Only exceptional cases (e.g. prolonged full outage, or one-off migrations) may require operator action.

---

## 5. Related docs

- **cleanup-quick-reference.md** – Cleanup schedule and manual commands.
- **automatic-cleanup-implementation.md** – Disk and cleanup implementation details.
- **metrics-audit.md** – §13 Long-term resilience (metrics/counts).
- **disk-management.md** – Disk usage and alerts.
