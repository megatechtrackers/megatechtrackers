# Metric Engine – Production Checklist

Plan § 9 Production Hardening: performance, limits, alerting, and deployment.

Use this checklist before go-live and when validating a new deployment. Tick each item when verified.

---

## 1. Before Go-Live

### 1.1 Database

- [ ] PostgreSQL (and TimescaleDB if used) is sized for expected load (e.g. 50K devices × 30 samples/min).
- [ ] Schema applied: `database/schema.sql` run once (includes metric_engine_message_retries, calibration, metric_events, laststatus, config tables, triggers, MVs).
- [ ] Connection pool limits set in config: `metric_engine_node` default min 1, max 5 in `db.py`; increase to 5–20 for production.
- [ ] Indexes on `laststatus`, `metric_events`, `trackdata` (imei, gps_time) are present and maintained.
- [ ] `system_config` seeded with all required config keys (see NON_LIVE_TABLE_CATALOG); seed script in `schema.sql` Section 7.

### 1.2 RabbitMQ

- [ ] `metrics_queue` and `dlq_metrics` exist with bindings to `tracking_data_exchange` (routing_key `tracking.*.trackdata`).
- [ ] Queue limits in `docker/rabbitmq/definitions.json`: `x-max-length`, `x-message-ttl`, `x-dead-letter-exchange`, `x-dead-letter-routing-key` for metrics_queue → dlq_metrics.
- [ ] Monitor queue depth; alert if `metrics_queue` or `dlq_metrics` grows beyond threshold (e.g. 10K warning, 100K critical).

### 1.3 Config & seed data

- [ ] At least one customer, vehicle, tracker for dev/test; production hierarchy and tracker_config/client_config as needed.
- [ ] Optional: metrics_alarm_config rows per IMEI/event_type if you want to disable or tune alarms (default: no row = publish).

### 1.4 calibration (Phase 3 – fuel liters)

- [ ] If using fuel consumption in liters: calibration table populated per vehicle (raw_value_min, raw_value_max, calibrated_liters, sequence). Fuel calculator adds `fuel_liters` and `delta_liters` to Fuel event metadata when calibration exists.
- [ ] If not using calibration: fill/theft detection still works via raw level deltas and FILL_THRESHOLD/THEFT_THRESHOLD.

### 1.5 Resilience

- [ ] Circuit breaker: DB and RabbitMQ (default 5 failures, 60s recovery in `circuit_breaker.py`).
- [ ] Graceful shutdown: SIGTERM/SIGINT handled; in-flight work completes before exit; consumer/worker/scheduler/listener cancelled and disconnected.
- [ ] Health: `/health` (liveness) and `/health/ready` (readiness: DB + RabbitMQ) on port 9091.
- [ ] Bounded message retries: 3 attempts then DLQ; retry count persisted in `metric_engine_message_retries` (plan § 2.6).

---

## 2. Deployment

- [ ] Config: `config.json` (or env override) has correct database and RabbitMQ settings.
- [ ] Env (optional): `METRIC_ENGINE_METRICS_PORT`, `LOG_LEVEL`.
- [ ] Run: `pip install -r requirements.txt` then `python run.py` (or use Docker/entrypoint).
- [ ] Prometheus scrapes metric engine: `job_name: metric_engine`, target `metric-engine-service:9091` (or host:9091).
- [ ] Alert rules loaded: `docker/prometheus/alerts-metric-engine.yml` in Prometheus `rule_files`.

---

## 3. Performance & Limits

| Item | Suggested | Notes |
|------|-----------|--------|
| DB pool size | 5–20 | Increase if many concurrent messages. |
| Message retries (then DLQ) | 3 | `MAX_MESSAGE_RETRIES` in `rabbitmq_consumer.py`. |
| Recalculation batch size | 500 | `_reprocess_trackdata_for_imei` batch_size. |
| Recalculation poll interval | 60s | `run_worker_loop(poll_interval_sec=60)`. |
| Scheduled REFRESH_VIEWS | 24h | `run_scheduled_refresh_loop(interval_sec=86400, initial_delay_sec=300)`. |
| Retry table cleanup | 7 days | `cleanup_old_message_retries(max_age_days=7)` runs daily with scheduled refresh. |
| DLQ max length | 100K | Avoid unbounded growth; alert and drain. |
| Config change debounce | 5s | Plan 9B.9: rapid config changes; worker picks latest. |

---

## 4. Alerting

Prometheus rules: `docker/prometheus/alerts-metric-engine.yml`. Runbooks: `docs/PROMETHEUS_RUNBOOK.md`.

| Alert | Condition | Severity |
|-------|-----------|----------|
| MetricEngineDown | `up{job="metric_engine"} == 0` for 1m | critical |
| MetricEngineNotReady | `metric_engine_ready == 0` for 2m | warning |
| MetricEngineCalculatorErrorsHigh | `sum(rate(metric_engine_calculator_errors_total[5m])) > 0.1` | warning |
| MetricEngineMessagesFailedHigh | `sum(rate(metric_engine_messages_failed_total[5m])) > 1` | warning |
| MetricEngineDLQGrowing | `rabbitmq_queue_messages{queue=~"dlq_metrics|..."} > 100` | warning |
| MetricEngineDLQCritical | same > 10000 | critical |
| MetricEngineCircuitBreakerOpen | `metric_engine_circuit_breaker_state == 1` | warning |
| MetricEngineNotProcessing | no messages processed + metrics_queue > 100 | critical |

- [ ] Alertmanager configured to receive and route these alerts.
- [ ] On-call or dashboard reviews DLQ growth and circuit breaker open.

---

## 5. Post–Recalculation & manual tooling

- [ ] After config-driven recalculation (RECALC_VIOLATIONS), a REFRESH_VIEWS job is enqueued automatically (Phase 7).
- [ ] Scheduled REFRESH_VIEWS runs every 24h (initial delay 5 min) for scoring MVs (mv_weekly_driver_scores, mv_daily_vehicle_scores, etc.).
- [ ] Manual tooling: `scripts/enqueue_recalc.py` to enqueue RECALC_VIOLATIONS, REFRESH_VIEW, or REFRESH_VIEWS. See `scripts/README.md`.
  - Example: `python scripts/enqueue_recalc.py --job-type REFRESH_VIEWS --reason all`
  - Example: `python scripts/enqueue_recalc.py --job-type RECALC_VIOLATIONS --scope-client-id 1`

---

## 6. Verification (acceptance)

Run `python scripts/verify_production.py` (from `metric_engine_node`; use `--base-url` if not localhost:9091; use `--require-ready` to fail when not ready).

- [ ] Liveness: `curl http://localhost:9091/health` returns 200 and `{"status":"ok","service":"metric_engine_node"}` (or use script above).
- [ ] Readiness: `curl http://localhost:9091/health/ready` returns 200 when DB and RabbitMQ are up; 503 when either is down (or use script).
- [ ] Metrics: `curl http://localhost:9091/metrics` exposes `metric_engine_ready`, `metric_engine_circuit_breaker_state`, `metric_engine_messages_processed_total`, etc. (script checks presence).
- [ ] One message flow: publish a trackdata message to the exchange with routing key `tracking.<something>.trackdata`; confirm metric engine consumes it (logs or Prometheus counter increment); confirm no errors and optionally a metric_event row for the IMEI if calculators apply.
- [ ] Recalculation: enqueue a job via `scripts/enqueue_recalc.py`; confirm worker picks it up (logs) and `recalculation_queue.status` moves to COMPLETED.

---

## 7. Rollback

- [ ] Stop metric engine; consumer and parsers unchanged. Clear or drain `metrics_queue`/`dlq_metrics` as needed.
- [ ] To revert config: fix client_config/tracker_config and optionally enqueue RECALC_VIOLATIONS for affected scope (or wait for next config-change trigger).
- [ ] No schema rollback required for metric_engine_message_retries or Calibration; they are additive.
