# Complete Metrics Audit – All Services / Nodes

This document lists every component that exposes Prometheus metrics, the metric names they emit, where those metrics are scraped and used (Grafana, alerts), and components that do **not** expose metrics.

---

## 1. Prometheus scrape targets (who gets scraped)

| Job name | Target | Path | Source |
|----------|--------|------|--------|
| prometheus | localhost:9090 | (self) | Prometheus |
| postgres-primary | postgres-exporter:9187 | default | postgres-exporter (PostgreSQL) |
| postgres-replica | postgres-exporter-replica:9187 | default | postgres-exporter |
| pgbouncer | pgbouncer-exporter:9127 | default | pgbouncer-exporter |
| rabbitmq | rabbitmq-exporter:9419 | default | rabbitmq-exporter |
| node-exporter | node-exporter:9100 | default | node-exporter (host metrics) |
| **monitoring-service** | monitoring-service:8080 | /metrics/prometheus | monitoring_node |
| **alarm-service** | alarm-service:3200 | /metrics | alarm_node |
| **alarm-service-test** | alarm-service-test:3100 | /metrics | alarm_node (test profile) |
| **ops-service-backend** | ops-service-backend:8000 | /metrics | ops_node/backend |
| **sms-gateway-service** | sms-gateway-service:8080 | /metrics | sms_gateway_node |
| **access-gateway** | access-gateway:3001 | /metrics | access_control_node |
| **consumer-service-database** | consumer-service-database:9090 | /metrics | consumer_node |
| **consumer-service-alarm** | consumer-service-alarm:9090 | /metrics | consumer_node |
| **web-app** | web-app:3002 | /api/metrics | web_app_node (Next.js) |
| **ops-service-frontend** | ops-service-frontend:3000 | /api/metrics | ops_node/frontend (Next.js) |

**Not scraped by Prometheus:** mobile-app (Expo dev server; optional push-based later). Parser nodes push to monitoring-service instead of exposing HTTP metrics.

---

## 1b. Components without metrics or dashboard

| Component | Container(s) | Metrics? | Dashboard? | Notes |
|-----------|--------------|----------|------------|--------|
| **web-app** | web-app | Yes | Yes | Next.js; `/api/metrics` (prom-client), scrape job `web-app`, dashboard **frontends-status** + system-health. |
| **mobile-app** | mobile-app | No | No | Expo dev server; no HTTP scrape. Optional: push metrics to backend or health endpoint. |
| **ops-service-frontend** | ops-service-frontend | Yes | Yes | Next.js; `/api/metrics` (prom-client), scrape job `ops-service-frontend`, dashboard **frontends-status** + system-health. |
| **Frappe** | frappe, frappe-nginx | No | No | ERP backend (frappe profile); not in Prometheus scrape list. Optional: add metrics + scrape + dashboard. |
| **docs** | docs | No | No | MkDocs static site; no metrics needed. |
| **Parser services** | parser-service-1..8 | No direct HTTP | Yes (fleet) | Parsers push to monitoring-service; visibility via **fleet-service-status** (parser_service_*, fleet_*). |
| **mock-sms-server, mock-tracker, mailhog** | (testing) | No | No | Test/support only; not core app nodes. |

**Summary:** All backend *nodes* and Next.js frontends (web-app, ops-service-frontend) that expose metrics have a dashboard. Without metrics/dashboard: **mobile-app** (Expo), **Frappe** (optional to add).

---

## 2. Alarm Service (alarm_node)

**Endpoint:** `GET /metrics` (port 3200 prod, 3100 test)  
**Scrape job:** `alarm-service`, `alarm-service-test`

### Counters
| Metric | Labels | Description |
|--------|--------|-------------|
| alarms_processed_total | - | Alarms processed |
| email_sent_total | - | Emails sent successfully |
| sms_sent_total | modem, status | SMS sent (success/failed/error) |
| email_send_error | - | Email send errors |
| sms_send_error | - | SMS send errors |
| email_send_failed_permanent | - | Permanently failed emails |
| sms_send_failed_permanent | - | Permanently failed SMS |
| email_send_retry, sms_send_retry | - | Retries |
| sms_sent_dedicated | service, tier | SMS via dedicated modem |
| sms_sent_fallback | service | SMS via fallback modem |
| sms_device_modem_not_found | service | Device modem not found |
| sms_service_pool_exhausted | service | Service pool exhausted |
| sms_all_modems_exhausted | service | All modems exhausted |
| alarm_batch_error, alarm_batch_cancelled | - | Batch processing |
| alarm_processing_error | - | Processing errors |
| rabbitmq_message_received, rabbitmq_message_acknowledged | - | RabbitMQ |
| rabbitmq_message_requeued, rabbitmq_message_dlq | - | Requeue / DLQ |
| rabbitmq_connection_error, rabbitmq_reconnect | - | Connection |
| listen_notify_alarm_received | - | LISTEN/NOTIFY |
| email_circuit_breaker_open, sms_circuit_breaker_open, voice_circuit_breaker_open | - | Circuit breakers |
| voice_sent_total, voice_send_error, voice_send_* | - | Voice channel |
| email_send_skipped_duplicate, sms_send_skipped_duplicate, voice_send_skipped_duplicate | - | Dedup |
| sms_api_health_check_failed, voice_api_health_check_failed | - | API health |
| alarm_backpressure_applied | - | Backpressure |
| dlq_reprocessed_total, dlq_reprocess_error, dlq_batch_* | - | DLQ reprocessing |
| notification_cost_total_email/sms/voice | - | Cost totals |
| notification_count_by_channel_email/sms/voice | - | Notification counts |
| db_pool_connect, db_pool_remove, db_pool_error | - | DB pool |
| push_notifications_sent_total | status | Push sent |
| push_device_token_registered/unregistered, push_invalid_token_removed | - | Push tokens |
| sms_modem_health_check_failed, sms_modem_failover | - | Modem health |
| system_pause_count, system_resume_count | - | System pause |
| rabbitmq_message_requeued_paused | - | Requeue while paused |
| worker_heartbeat, dead_workers_removed | - | Workers |

### Gauges
| Metric | Labels | Description |
|--------|--------|-------------|
| alarm_queue_size | - | Queue depth (alias) |
| pending_sms_count, pending_email_count | - | Pending notifications |
| rabbitmq_queue_depth, rabbitmq_queue_messages_ready, rabbitmq_queue_consumer_count | - | RabbitMQ queue |
| rabbitmq_connection_status | - | 1=connected, 0=disconnected |
| rabbitmq_consumer_lag_ms, rabbitmq_messages_processed_rate | - | Consumer lag / rate |
| rabbitmq_paused_requeue_count | - | Requeued while paused |
| active_workers_count, stale_workers_count, worker_registered | - | Workers |
| email_channel_available, sms_channel_available, voice_channel_available | - | Channel availability |
| dlq_size, dlq_total_items, dlq_average_age_ms, dlq_max_attempts | - | DLQ |
| db_pool_total, db_pool_idle, db_pool_waiting, db_pool_healthy | - | DB pool |
| notification_success_rate_email/sms/voice | - | Success rate (0–1) |
| notification_sla_compliance_email/sms/voice | - | SLA compliance (0–1) |
| notification_cost_per_message_email/sms/voice | - | Cost per message |
| sms_modem_pool_size, sms_modem_healthy_count, sms_modem_degraded_count | - | Modem pool |
| sms_modem_unhealthy_count, sms_modem_quota_exhausted_count | - | Modem pool |
| sms_modem_usage_count, sms_modem_usage_limit | modem_name | Per-modem usage |
| system_paused, system_mock_mode_sms, system_mock_mode_email | - | System state |
| push_channel_available, alarms_push_tokens_active | - | Push |

### Histograms
| Metric | Description |
|--------|-------------|
| alarm_processing_duration_ms | Per-alarm processing time |
| alarm_batch_duration_ms | Batch processing time |
| email_send_duration_ms, sms_send_duration_ms, voice_send_duration_ms | Channel send time |
| rabbitmq_processing_duration_ms | Message processing time |
| listen_notify_delay_ms | LISTEN/NOTIFY delay |
| notification_delivery_time_ms_email/sms/voice | Delivery time (SLA) |
| rabbitmq_message_priority | Message priority |

**Used in:** Grafana (alarm-service-* dashboards), alerts (alerts.yml, alerts-alarm-service.yml, alerts-sms-quota.yml), system-health dashboard.

---

## 3. Monitoring Service (monitoring_node)

**Endpoint:** `GET /metrics/prometheus` (port 8080)  
**Scrape job:** `monitoring-service`  
**Data source:** Aggregates from parser services (POST /api/parser-nodes/metrics) plus local system.

### Fleet-level (aggregate)
| Metric | Type | Description |
|--------|------|-------------|
| fleet_trackers_online | gauge | Connected trackers (all parser services) |
| fleet_connection_attempts | counter | Total connection attempts |
| fleet_connections_rejected | counter | Rejected connections |
| fleet_connections_capacity | gauge | Total capacity |
| fleet_parser_services_total | gauge | Number of parser services reporting |
| fleet_packets_processed | counter | Packets processed |
| fleet_records_saved | counter | Records saved |
| fleet_errors_total | counter | Processing errors |
| fleet_messages_total | counter | Messages processed |
| fleet_messages_per_second | gauge | Message throughput |

### Monitoring server (host)
| Metric | Type | Description |
|--------|------|-------------|
| monitoring_server_cpu_percent | gauge | CPU usage |
| monitoring_server_memory_percent | gauge | Memory usage |
| monitoring_server_memory_bytes | gauge | Memory used (bytes) |
| monitoring_server_disk_percent | gauge | Disk usage |
| monitoring_server_uptime_seconds | gauge | Uptime |

### Per–parser-service (label: node, vendor)
| Metric | Type | Description |
|--------|------|-------------|
| parser_service_trackers_online | gauge | Trackers per parser service |
| parser_service_connection_attempts | counter | Connection attempts per service |
| parser_service_connections_rejected | counter | Rejected per service |
| parser_service_capacity | gauge | Max connections per service |
| parser_service_cpu_percent | gauge | CPU per service |
| parser_service_memory_percent | gauge | Memory per service |
| parser_service_memory_mb | gauge | Memory MB per service |
| parser_service_messages_per_second | gauge | Throughput per service |
| parser_service_capacity | gauge | Capacity per service |
| parser_service_publish_success_rate | gauge | RabbitMQ publish success rate |
| parser_service_error_rate | gauge | Error rate per service |

**Used in:** Grafana (fleet-service-status, system-health, system-metrics), alerts (alerts.yml: FleetCapacityWarning, MonitoringServiceDown, ParserServiceHighConnections).

---

## 4. SMS Gateway Service (sms_gateway_node)

**Endpoint:** `GET /metrics` (port 8080)  
**Scrape job:** `sms-gateway-service`

### Info
| Metric | Description |
|--------|-------------|
| sms_gateway_service_info | version, service, description |

### Counters
| Metric | Labels | Description |
|--------|--------|-------------|
| sms_gateway_service_sms_sent_total | modem, status | SMS sent |
| sms_gateway_service_sms_received_total | modem | SMS received |
| sms_gateway_service_outbox_processed_total | status | Outbox processed |
| sms_gateway_service_inbox_processed_total | status | Inbox processed |
| sms_gateway_service_modem_api_errors_total | modem, error_type | Modem API errors |
| sms_gateway_service_polling_cycles_total | type | Polling cycles |
| sms_gateway_service_polling_errors_total | type, error_type | Polling errors |
| sms_gateway_service_command_matched_total | - | Commands matched |
| sms_gateway_service_command_timeout_total | - | Command timeouts |
| sms_gateway_service_command_retry_total | - | Command retries |
| sms_gateway_service_db_errors_total | operation, error_type | DB errors |

### Gauges
| Metric | Labels | Description |
|--------|--------|-------------|
| sms_gateway_service_outbox_depth | - | Outbox queue depth |
| sms_gateway_service_inbox_depth | - | Inbox depth |
| sms_gateway_service_sent_pending_count | - | Sent awaiting reply |
| sms_gateway_service_modem_pool_size | - | Modems in pool |
| sms_gateway_service_modem_healthy_count | - | Healthy modems |
| sms_gateway_service_modem_unhealthy_count | - | Unhealthy modems |
| sms_gateway_service_modem_status | modem_name | 1=healthy, 0=unhealthy |
| sms_gateway_service_modem_signal_strength | modem_name | Signal strength |

### Histograms
| Metric | Labels | Description |
|--------|--------|-------------|
| sms_gateway_service_sms_send_duration_seconds | modem | Send duration |
| sms_gateway_service_modem_api_latency_seconds | modem, operation | Modem API latency |
| sms_gateway_service_polling_duration_seconds | type | Polling duration |
| sms_gateway_service_db_query_duration_seconds | operation | DB query duration |

**Used in:** Grafana (sms-gateway-service-status, sms-gateway-service-modem-usage with sms_modem_* from Alarm Service), alerts (alerts-sms-gateway-service.yml).

---

## 5. Operations Service Backend (ops_node/backend)

**Endpoint:** `GET /metrics` (port 8000)  
**Scrape job:** `ops-service-backend`

### Info
| Metric | Description |
|--------|-------------|
| ops_service_info | version, service, description |

### Counters
| Metric | Labels | Description |
|--------|--------|-------------|
| ops_service_commands_sent_total | send_method, device_name, status | Commands sent |
| ops_service_commands_queued_total | send_method | Commands queued |
| ops_service_http_requests_total | method, endpoint, status_code | HTTP requests |
| ops_service_db_queries_total | operation, table | DB queries |
| ops_service_db_errors_total | operation, error_type | DB errors |
| ops_service_unit_operations_total | operation | Unit operations |
| ops_service_device_config_operations_total | operation, device_name | Device config ops |
| ops_service_io_mapping_operations_total | operation, level | IO mapping ops |
| ops_service_cleanup_commands_expired_total | type | Commands expired |
| ops_service_cleanup_history_deleted_total | - | History deleted |

### Gauges
| Metric | Labels | Description |
|--------|--------|-------------|
| ops_service_command_outbox_depth | - | Outbox depth |
| ops_service_command_sent_pending | - | Sent awaiting reply |
| ops_service_http_requests_in_progress | - | In-flight requests |
| ops_service_units_registered_total | - | Registered units |
| ops_service_device_types_total | - | Device types |
| ops_service_configs_total | config_type | Configs count |

### Histograms
| Metric | Labels | Description |
|--------|--------|-------------|
| ops_service_http_request_duration_seconds | method, endpoint | Request duration |
| ops_service_db_query_duration_seconds | operation | Query duration |

**Used in:** Grafana (ops-service-status), alerts (alerts-ops-service.yml).

---

## 6. Access Gateway (access_control_node)

**Endpoint:** `GET /metrics` (port 3001).  
**Scrape job:** `access-gateway` (prometheus.yml).

### Metrics (generic names, no service prefix)
| Metric | Labels | Description |
|--------|--------|-------------|
| http_request_duration_seconds | method, route, status_code | Request duration |
| http_requests_total | method, route, status_code | Request count |
| embed_url_generation_total | status, user | Embed URL generations |
| embed_url_generation_duration_seconds | status | Embed URL duration |
| cache_hits_total | cache_type | Cache hits |
| cache_misses_total | cache_type | Cache misses |
| active_connections | - | Active connections |
| errors_total | error_type, route | Errors |

**Used in:** Prometheus scrape job `access-gateway`; Grafana access-gateway-status, system-health.

---

## 6b. Web App (web_app_node) & Ops Service Frontend (ops_node/frontend)

**Endpoint:** `GET /api/metrics` (web-app:3002, ops-service-frontend:3000).  
**Scrape jobs:** `web-app`, `ops-service-frontend` (prometheus.yml).

### Metrics (prom-client default + custom)
| Prefix | Metrics | Description |
|--------|---------|-------------|
| **web_app_** | web_app_process_*, web_app_http_requests_total, web_app_http_request_duration_seconds | Default Node metrics (memory, CPU, etc.) + HTTP counters/histograms (when wired from middleware). |
| **ops_frontend_** | ops_frontend_process_*, ops_frontend_http_requests_total, ops_frontend_http_request_duration_seconds | Same for ops frontend. |

**Used in:** Grafana **frontends-status**, system-health (up panels).

---

## 7. Consumer Node (consumer_node)

**Endpoint:** `GET /metrics` (port 9090, configurable via `CONSUMER_METRICS_PORT`).  
**Scrape jobs:** `consumer-service-database`, `consumer-service-alarm` (prometheus.yml).

### Metrics (consumer_service_* prefix)
| Metric | Labels | Description |
|--------|--------|-------------|
| consumer_service_info | consumer_type, service | Constant 1 (metadata) |
| consumer_service_messages_processed_total | consumer_type, queue | Messages processed successfully |
| consumer_service_messages_failed_total | consumer_type, queue | Messages that failed processing |

**Role:** Consumes from RabbitMQ, writes to DB, publishes to alarm_exchange. Metrics server runs alongside the consumer process.

---

## 8. Parser Nodes (parser_nodes)

**Metrics endpoint:** Parsers do not expose a Prometheus HTTP endpoint. They **push** JSON to monitoring-service at `POST /api/parser-nodes/metrics`.  
**Exposed as:** monitoring-service exposes them as `parser_service_*` and fleet-level `fleet_*` metrics (see §3).

---

## 9. Third-party / exporters (standard names)

| Job | Metrics prefix | Source |
|-----|----------------|--------|
| postgres-primary, postgres-replica | pg_* | postgres-exporter |
| pgbouncer | pgbouncer_* | pgbouncer-exporter |
| rabbitmq | rabbitmq_* (e.g. rabbitmq_node_mem_used) | rabbitmq-exporter |
| node-exporter | node_* (node_cpu_seconds_total, node_memory_*, etc.) | node-exporter |
| prometheus | process_*, go_* | Prometheus self |

These are standard exporter metric names; do not rename.

---

## 10. Grafana dashboards ↔ metrics

| Dashboard | Primary metrics |
|-----------|-----------------|
| alarm-service-status | rabbitmq_*, email_*, sms_*, dlq_*, notification_* |
| alarm-service-channels | email_channel_available, sms_channel_available, etc. |
| alarm-service-circuit-breakers | *_circuit_breaker_open |
| alarm-service-costs | notification_cost_* |
| alarm-service-dlq | dlq_* |
| alarm-service-processing | alarms_processed_total, rabbitmq_* |
| alarm-service-sla | notification_sla_compliance_*, notification_success_rate_* |
| fleet-service-status | fleet_*, parser_service_*, monitoring_server_* |
| ops-service-status | ops_service_* |
| sms-gateway-service-status | sms_gateway_service_* |
| sms-gateway-service-modem-usage | sms_modem_* (from Alarm Service) |
| system-health | rabbitmq_connection_status, pg_up, email_channel_available, sms_channel_available, fleet_trackers_online, **up{job="access-gateway"}**, **up{job="consumer-service-database"}**, **up{job="consumer-service-alarm"}**, **up{job="web-app"}**, **up{job="ops-service-frontend"}**, etc. |
| system-metrics | node_cpu_*, node_memory_*, etc. |
| system-alerts | (alerts overview) |
| **access-gateway-status** | up{job="access-gateway"}, http_requests_total, http_request_duration_seconds, embed_url_generation_total, cache_hits_total, cache_misses_total, active_connections, errors_total |
| **consumer-service-status** | up{job=~"consumer-service.*"}, consumer_service_messages_processed_total, consumer_service_messages_failed_total |
| **frontends-status** | up{job="web-app"}, up{job="ops-service-frontend"}, web_app_*, ops_frontend_* (process memory, request rate when wired) |
| infra-postgresql | pg_* |
| infra-pgbouncer | pgbouncer_* |
| infra-prometheus | process_*, go_* |
| infra-rabbitmq | rabbitmq_* |

---

## 11. Alert rule files ↔ metrics

| File | Metrics used |
|------|--------------|
| alerts.yml | pg_*, pgbouncer_*, rabbitmq_*, fleet_*, parser_service_trackers_online, node_*, up, alarm-service metrics (dlq_size, etc.) |
| alerts-alarm-service.yml | dlq_size, *_circuit_breaker_open, *_send_error, notification_success_rate_*, notification_sla_compliance_*, up{job=~"alarm-service.*"} |
| alerts-ops-service.yml | up{job="ops-service-backend"}, ops_service_* |
| alerts-sms-gateway-service.yml | up{job="sms-gateway-service"}, sms_gateway_service_* |
| alerts-sms-quota.yml | (SMS quota – alarm-service labels) |
| alerts-disk.yml | (disk usage) |
| (access-gateway) | up{job="access-gateway"}, http_* (add rules as needed) |
| (consumer) | up{job=~"consumer-service.*"}, consumer_service_* (add rules as needed) |

---

## 12. Naming consistency summary

| Component | Metric prefix | Scrape job | Status |
|-----------|---------------|------------|--------|
| alarm_node | (no prefix) | alarm-service, alarm-service-test | OK |
| monitoring_node | fleet_*, parser_service_*, monitoring_server_* | monitoring-service | OK (service naming) |
| sms_gateway_node | sms_gateway_service_* | sms-gateway-service | OK |
| ops_node/backend | ops_service_* | ops-service-backend | OK |
| access_control_node | (generic) | access-gateway | OK |
| consumer_node | consumer_service_* | consumer-service-database, consumer-service-alarm | OK |
| web_app_node | web_app_* | web-app | OK |
| ops_node/frontend | ops_frontend_* | ops-service-frontend | OK |
| parser_nodes | — (pushed → parser_service_*) | via monitoring-service | OK |
| Exporters | pg_*, pgbouncer_*, rabbitmq_*, node_*, process_* | per job | Standard, do not change |

---

## 13. Optional improvements

1. **Access Gateway:** ✅ Implemented. Prometheus scrape job `access-gateway` added; gateway metrics are scraped from `access-gateway:3001/metrics`. Optionally add a metric prefix (e.g. `access_gateway_*`) for clarity in the future.
2. **Alarm Service prefix:** Alarm metrics have no prefix. If desired, consider a prefix like `alarm_service_` for new metrics only (existing names are widely used in dashboards/alerts).
3. **Consumer:** ✅ Implemented. Consumer node exposes `/metrics` on port 9090; scrape jobs `consumer-service-database` and `consumer-service-alarm` added. Metrics: `consumer_service_info`, `consumer_service_messages_processed_total`, `consumer_service_messages_failed_total`.
