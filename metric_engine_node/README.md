# Metric Engine Node

Python service that consumes trackdata from RabbitMQ (`metrics_queue`), calculates metrics, updates `laststatus` state, writes `metric_events` and trip records, and publishes metric-based alarms to `alarm_exchange`.

## Implemented Phases (Plan Complete)

| Phase | Deliverables |
|-------|--------------|
| **1. Foundation** | Project structure, config resolution, resilience (/health, /health/ready, circuit breaker, graceful shutdown), DB migration (trackdata/laststatus columns, customer hierarchy, system_config, metric_events, fence, etc.), RabbitMQ metrics_queue/dlq_metrics, consumer that processes messages. |
| **2. Core Calculators** | Calculator plugin architecture (base, context, registry), vehicle_state (moving/idle/stopped/not_responding), distance (Haversine), speed, duration (idle_start_time), laststatus state updates, metric_events inserts. |
| **3. Sensor Calculators** | Temperature (TEMP_MIN/TEMP_MAX, SENSOR_DURATION_THRESHOLD → Temp_High/Temp_Low), Fuel (FILL_THRESHOLD/THEFT_THRESHOLD → Fuel_Fill/Fuel_Theft). |
| **4. Violation Calculators** | Speed violation (Overspeed with MIN_DURATION_SPEED), Idle violation (IDLE_MAX). |
| **5. Geofencing** | Fence calculator: PostGIS containment, current_fence_ids, Fence_Enter/Fence_Exit → metric_events. |
| **6. Trip System** | trip table + extensions migration, ignition-based trip (start on Ignition On, end on Ignition Off), laststatus trip_in_progress/current_trip_id. |
| **7. Scoring** | violation_points and score_weights tables; driver/vehicle scores via MVs (`mv_weekly_driver_scores`, `mv_daily_vehicle_scores`) refreshed by recalculation worker job type `REFRESH_VIEWS` (after RECALC_VIOLATIONS or on schedule). |
| **8. Integration** | Publish metric_events to `alarm_exchange` (routing key `alarm.notification`) for Alarm Service. |
| **9. Hardening** | Health/metrics server, config resolution, graceful shutdown, README, [Production checklist](docs/PRODUCTION_CHECKLIST.md), [Prometheus runbook](docs/PROMETHEUS_RUNBOOK.md), **recalculation tooling** ([scripts/enqueue_recalc.py](scripts/README.md)). |

**Phase 3 Calibration:** Fuel calculator uses the `calibration` table (raw fuel → liters per vehicle) when available; `fuel_liters` and `delta_liters` are added to Fuel event metadata for consumption reporting.

## Project Layout

```
metric_engine_node/
├── config.py           # Config from config.json
├── config.json
├── run.py              # Entry: health server, register calculators, consumer with pipeline
├── metrics.py          # /health, /health/ready, /metrics (Prometheus)
├── requirements.txt
├── README.md
├── scripts/
│   ├── README.md
│   └── enqueue_recalc.py   # Manual recalculation tooling (Phase 9): enqueue RECALC_VIOLATIONS / REFRESH_VIEW(S)
└── engine/
    ├── __init__.py
    ├── config_resolution.py   # tracker_config → client_config → system_config
    ├── circuit_breaker.py
    ├── db.py                  # read_laststatus_state, update_laststatus_state, insert_metric_events, handle_trip_actions
    ├── pipeline.py            # process_record: load state/config → run calculators → write state + events + alarm publish
    ├── alarm_publisher.py     # Publish metric_events to alarm_exchange
    ├── rabbitmq_consumer.py   # Consumes metrics_queue
    └── calculators/
        ├── base.py, registry.py
        ├── core/              # vehicle_state, distance, speed, duration
        ├── sensor/            # temperature, fuel
        ├── violations/        # speed_violation, idle_violation
        ├── trip/              # ignition_trip
        └── geofence/          # fence (entry/exit)
```

## Database (clean slate – single schema)

The project is new (no existing data). **Single source of truth:** `database/schema.sql` (includes all metric engine tables, columns, triggers, and seed in Section 2B and Section 7).

```bash
psql -U postgres -d megatechtrackers -f database/schema.sql
```

## Run

```bash
cd metric_engine_node
pip install -r requirements.txt
python run.py
```

- **METRIC_ENGINE_METRICS_PORT** (default `9091`): Health and metrics server.
- **LOG_LEVEL**: e.g. `INFO`, `DEBUG`.

## Config

`config.json`: RabbitMQ (host, vhost, queue), database, metric_engine (prefetch, batch), logging.

## Adding a Calculator

1. Create a class in `engine/calculators/` (e.g. `violations/seatbelt.py`) extending `BaseCalculator`.
2. Implement `applies_to()` and `calculate()`; return `CalculatorResult(state_updates=..., events=...)`.
3. Register in `engine/calculators/registry.py` inside `register_all()`.

## Production

- **[PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md)** — Go-live checklist, performance limits, alerting thresholds.
- **[PROMETHEUS_RUNBOOK.md](docs/PROMETHEUS_RUNBOOK.md)** — Prometheus metrics and alert runbooks.

## References

- **METRIC_ENGINE_IMPLEMENTATION_PLAN.md** — Full plan and phases.
- **METRICS_SPEC.md** — Metric formulas.
- **METRIC_CATALOG.md** — Live tables, Trip, MVs.
- **NON_LIVE_TABLE_CATALOG.md** — Config and master tables, config keys.
