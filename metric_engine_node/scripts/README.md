# Metric Engine Scripts

## verify_production.py (PRODUCTION_CHECKLIST § 6)

Runs health, readiness, and metrics checks against the running metric engine. Exit 0 if all pass, 1 otherwise.

```bash
# Default: http://localhost:9091
python scripts/verify_production.py

# Fail if /health/ready returns 503 (e.g. in CI after deploy)
python scripts/verify_production.py --require-ready

# Custom base URL and timeout
python scripts/verify_production.py --base-url http://metric-engine:9091 --timeout 10
```

| Option | Description |
|--------|-------------|
| `--base-url` | Base URL (default: http://localhost:9091) |
| `--require-ready` | Exit 1 if readiness is not OK |
| `--timeout` | Request timeout in seconds (default: 5) |

---

## enqueue_recalc.py (Phase 9 recalculation tooling)

Enqueue manual recalculation jobs into `recalculation_queue`. The metric engine worker processes PENDING jobs.

**Run from `metric_engine_node` directory** (or set `PYTHONPATH`):

```bash
# Refresh all scoring MVs (e.g. after deployment)
python scripts/enqueue_recalc.py --job-type REFRESH_VIEWS --reason all

# Recalculate violations for one IMEI
python scripts/enqueue_recalc.py --job-type RECALC_VIOLATIONS --scope-imei 123456789

# Recalculate for a client and date range
python scripts/enqueue_recalc.py --job-type RECALC_VIOLATIONS --scope-client-id 1 --scope-date-from 2025-01-01 --scope-date-to 2025-02-01

# Refresh a single materialized view
python scripts/enqueue_recalc.py --job-type REFRESH_VIEW --reason mv_daily_violations
```

**Options:**

| Option | Description |
|--------|-------------|
| `--job-type` | `RECALC_VIOLATIONS`, `REFRESH_VIEW`, or `REFRESH_VIEWS` |
| `--scope-imei` | Limit RECALC_VIOLATIONS to this IMEI |
| `--scope-client-id` | Limit RECALC_VIOLATIONS to this client |
| `--scope-date-from` | Start date (YYYY-MM-DD) for RECALC_VIOLATIONS |
| `--scope-date-to` | End date (YYYY-MM-DD) for RECALC_VIOLATIONS |
| `--reason` | For REFRESH_VIEW: view name. For REFRESH_VIEWS: `all` or comma list |
| `--priority` | Queue priority (default 2; lower = higher priority) |

Uses the same DB config as the metric engine (`config.json`).
