# Metric Engine – Prometheus Alerts Runbook

Plan § 9 Production Hardening: monitoring and alerting.

## Metrics Endpoint

- **URL**: `http://<host>:9091/metrics` (default port from `METRIC_ENGINE_METRICS_PORT`)
- **Format**: Prometheus text exposition

## Suggested Alert Rules

Add to Prometheus (e.g. `prometheus.yml` rule_files or Alertmanager).

### 1. Metric engine down

```yaml
- alert: MetricEngineDown
  expr: up{job="metric_engine"} == 0
  for: 1m
  labels: { severity: critical }
  annotations:
    summary: "Metric engine is down"
    runbook: "docs/PROMETHEUS_RUNBOOK.md#metric-engine-down"
```

**Runbook**: Check process and logs. Restart service. If DB or RabbitMQ unreachable, fix connectivity; circuit breaker may have opened.

### 2. Metric engine not ready

```yaml
- alert: MetricEngineNotReady
  expr: metric_engine_ready == 0
  for: 2m
  labels: { severity: warning }
  annotations:
    summary: "Metric engine readiness failed (DB or RabbitMQ)"
    runbook: "docs/PROMETHEUS_RUNBOOK.md#metric-engine-not-ready"
```

**Runbook**: Readiness is 0 when DB or RabbitMQ is unreachable. Check DB and RabbitMQ health; ensure connectivity and credentials.

### 3. Calculator errors high

```yaml
- alert: MetricEngineCalculatorErrorsHigh
  expr: rate(metric_engine_calculator_errors_total[5m]) > 0.1
  for: 5m
  labels: { severity: warning }
  annotations:
    summary: "High calculator error rate"
    runbook: "docs/PROMETHEUS_RUNBOOK.md#calculator-errors-high"
```

**Runbook**: Inspect logs for calculator exceptions (e.g. speed_violation, fence). Fix bad data or calculator logic; check config resolution.

### 4. DLQ growth

```yaml
- alert: MetricEngineDLQGrowth
  expr: rabbitmq_queue_messages{queue="dlq_metrics"} > 100
  for: 10m
  labels: { severity: warning }
  annotations:
    summary: "Metric engine DLQ has > 100 messages"
    runbook: "docs/PROMETHEUS_RUNBOOK.md#dlq-growth"
```

**Runbook**: Failed messages are in `dlq_metrics`. Inspect messages, fix cause (e.g. schema, validation), then replay or discard.

### 5. Recalculation queue backed up

```yaml
- alert: RecalculationQueueBackedUp
  expr: metric_engine_recalculation_pending > 50
  for: 15m
  labels: { severity: warning }
  annotations:
    summary: "Recalculation queue has many pending jobs"
    runbook: "docs/PROMETHEUS_RUNBOOK.md#recalculation-backlog"
```

**Runbook**: Poll `recalculation_queue` for status = PENDING. Scale worker or fix failing jobs (check error_message).

## Calculator metrics (visibility)

The following metrics give per-calculator visibility on `/metrics`:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `metric_engine_calculator_invocations_total` | Counter | `calculator` | Number of times each calculator was run (per message). |
| `metric_engine_calculator_duration_seconds` | Histogram | `calculator` | Duration of each calculator run (buckets: 1ms–5s). |
| `metric_engine_calculator_events_emitted_total` | Counter | `calculator` | Total metric events emitted by each calculator. |
| `metric_engine_calculator_errors_total` | Counter | `calculator` | Total errors (exceptions) per calculator. |

**Example queries**

- Invocations per second by calculator: `sum(rate(metric_engine_calculator_invocations_total[5m])) by (calculator)`
- P95 duration by calculator: `histogram_quantile(0.95, sum(rate(metric_engine_calculator_duration_seconds_bucket[5m])) by (le, calculator))`
- Events emitted per second by calculator: `sum(rate(metric_engine_calculator_events_emitted_total[5m])) by (calculator)`

## Health Endpoints

| Endpoint    | Purpose                          |
|------------|-----------------------------------|
| GET /health | Liveness (process up)            |
| GET /health/ready | Readiness (DB + RabbitMQ reachable) |
| GET /metrics | Prometheus metrics               |

## Performance (Plan § 9)

- **Circuit breaker**: DB and RabbitMQ; open after 5 failures, 60s recovery.
- **Bounded retries**: Message processing; after max retries send to DLQ.
- **Graceful shutdown**: SIGTERM/SIGINT; finish in-flight, then exit.
