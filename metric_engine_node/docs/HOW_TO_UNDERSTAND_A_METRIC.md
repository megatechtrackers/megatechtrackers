# How to Understand a Metric: Metric Node vs Materialized Views

This guide explains how to trace **one metric** through the system so you can see what happens in the **metric node** (real-time) and what ends up in **materialized views** (aggregations).

---

## 1. Two layers: real-time vs aggregated

| Layer | What it does | Where it lives |
|-------|----------------|-----------------|
| **Metric node** | Runs **per trackdata message**: validates record, runs calculators, updates **laststatus** state and inserts **metric_events** (and trip/stoppage when applicable). | `metric_engine_node/engine/` (pipeline, calculators, db) |
| **Materialized views (MVs)** | **Aggregate** trackdata + metric_events + trip + laststatus etc. by day/hour/client. Refreshed by recalculation worker or cron, **not** on every message. | `database/schema.sql` (CREATE MATERIALIZED VIEW ...) |

So for a given metric you have to answer:

1. **Where is it computed in the metric node?** (which calculator, which state/events)
2. **Where does it show up in MVs?** (which MV, which column)
3. **What raw data feeds the MV?** (trackdata, metric_events, trip, laststatus)

---

## 2. Step-by-step: trace one metric

### Step 1 — Pick the metric and find the spec

- Open **metrics_analysis/METRICS_SPEC.md** and find the metric (e.g. “Speed Violation”, “Daily Mileage”, “Temperature Compliance”).
- Note the **formula** and **required data** (which tables/columns).

### Step 2 — Find the calculator (metric node)

- **Registry**: `metric_engine_node/engine/calculators/registry.py` lists all calculators (core, sensor, violations, trip, geofence).
- **By category**:
  - **Core**: distance, speed, duration, vehicle_state → `engine/calculators/core/`
  - **Violations**: speed_violation, idle_violation, seatbelt, harsh, driving_time → `engine/calculators/violations/`
  - **Sensor**: temperature, fuel, humidity → `engine/calculators/sensor/`
  - **Trip**: ignition_trip, stoppage, fence_wise_trip, round_trip, route_trip → `engine/calculators/trip/`
  - **Geofence**: fence → `engine/calculators/geofence/`
- Open the calculator file (e.g. `speed_violation.py`, `temperature.py`). Check:
  - **Input**: `ctx.record`, `ctx.previous_state`, `ctx.config`
  - **Output**: `CalculatorResult(state_updates=..., events=...)`
  - **State** goes to **laststatus**; **events** go to **metric_events**.

So for “Speed Violation”:

- Calculator: **SpeedViolationCalculator** in `engine/calculators/violations/speed_violation.py`.
- It reads speed, config (limits, MIN_DURATION_SPEED), optional road type from DB.
- When speed > limit for ≥ MIN_DURATION, it emits an **event** with `event_category=Speed`, `event_type=Overspeed`.
- That event is written to **metric_events** by the pipeline (`engine/db.py` → `insert_metric_events`).

### Step 3 — Find where events/state are written (metric node)

- **Pipeline**: `metric_engine_node/engine/pipeline.py` → `process_record()`.
  - Loads config and previous state (laststatus).
  - Runs calculators via `run_calculators()`.
  - Writes **state** with `update_laststatus_state()`.
  - Writes **events** with `insert_metric_events()`.
  - Optionally updates trip accumulation, stoppage log, and publishes to alarm.
- **DB layer**: `metric_engine_node/engine/db.py` — `STATE_COLUMNS`, `update_laststatus_state_impl`, `_insert_metric_events_impl`.

So for a **violation** metric:

- “Is it working?” = calculators emit events → pipeline calls `insert_metric_events` → rows appear in **metric_events** with the right `event_category` and `event_type`.

### Step 4 — Find the materialized view(s)

- **List of MVs**: `database/schema.sql` (search for `CREATE MATERIALIZED VIEW`) or `metric_engine_node/engine/recalculation_catalog.json` → `materialized_views`.
- **Which MV uses this metric?** Search the schema for the metric name or the table/column that backs it, e.g.:
  - Violations → **mv_daily_violations**, **mv_weekly_driver_scores**, **mv_hourly_violations**, etc.
  - Mileage/duration → **mv_daily_mileage**, **mv_hourly_vehicle_stats**
  - Temperature → **mv_daily_temperature_compliance**
  - Fuel → **mv_daily_fuel_consumption**
- Open the MV definition in `database/schema.sql` and see:
  - **FROM**: which tables (trackdata, metric_events, trip, laststatus, other MVs).
  - **GROUP BY**: date, imei, client_id, etc.
  - **Columns**: how the metric is aggregated (COUNT, SUM, AVG, CASE, etc.).

So for “Speed Violation”:

- **mv_daily_violations**: groups **metric_events** by date, imei, client_id, **event_category**; has `violation_count`, `critical_count`, `total_duration_sec`. So “daily speed violation count” = rows where `event_category = 'Speed'`.
- **mv_weekly_driver_scores**: joins metric_events → vehicle (driver_id), sums violation points; so driver-level speed violations show up there too.

### Step 5 — Connect node → MV

- **Metric node** produces **rows in metric_events** (and updates in laststatus/trip).
- **MV** reads those tables and aggregates. So:
  - If the calculator does **not** emit an event, the MV will not see that “violation” or “event”.
  - If the MV formula (e.g. compliance = 1 - violation_count/COUNT(*)) differs from the spec, the **number** will differ even when events are correct.

To “understand what’s going on” for a metric:

1. **In the metric node**: Run with logs; check that the right calculator runs and that it emits the expected **state_updates** and **events** for the test record (see “Checking the metric node” below).
2. **In the DB**: Query **metric_events** (and laststatus/trip if relevant) for that imei/date to see the raw rows the MV will read.
3. **In the MV**: Query the MV for that imei/date and compare the column value to the spec formula and to the raw rows.

---

## 3. Checking the metric node (is the calculator running?)

- **Logs**: Metric engine logs calculator runs and errors (e.g. “Calculator X failed”). Prometheus metrics: `metric_engine_calculator_invocations_total`, `metric_engine_calculator_errors_total`, `metric_engine_calculator_events_emitted_total` (see `metric_engine_node/metrics.py` and registry).
- **Applicability**: A calculator only runs if `applies_to(tracker, config)` is true. For example, TemperatureCalculator checks `has_temp_sensor`; FuelCalculator checks `has_fuel_sensor`. So if the tracker has no sensor, that calculator won’t run and no events will be emitted.
- **Config**: Many formulas use config keys (e.g. TEMP_MIN, TEMP_MAX, MIN_DURATION_SPEED). Resolution is in `engine/config_resolution.py` (tracker_config → client_config → default). Wrong config → wrong thresholds → wrong events.

So for “Temperature Violation”:

- Ensure the tracker has `has_temp_sensor = true` and that TEMP_MIN/TEMP_MAX/SENSOR_DURATION_THRESHOLD are set.
- Send a record with temp outside range for longer than SENSOR_DURATION_THRESHOLD; you should see a Temp_High or Temp_Low event in metric_events and in logs.

---

## 4. Checking materialized views (is the number correct?)

- **Refresh**: MVs are not updated on every message. They must be refreshed (e.g. `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_violations`) or via the recalculation worker. If you only check the MV, ensure it has been refreshed after the test data was written.
- **Query the base tables**: For the same imei/date, query **metric_events** (and trackdata/trip if the MV uses them). Manually apply the MV’s aggregation (e.g. COUNT(*) WHERE event_category = 'Speed') and compare to the MV column.
- **Spec vs MV**: Compare the MV’s SQL to **METRICS_SPEC.md**. Discrepancies (e.g. moving = speed > 5 vs speed > 0, or compliance = count-based vs time-based) are documented in **metrics_analysis/METRICS_IMPLEMENTATION_ANALYSIS.md**.

---

## 5. Example: “Daily speed violation count” for one vehicle

1. **Spec**: METRICS_SPEC § 3.1 — Speed Violation = speed > limit for MIN_DURATION; limit by road type.
2. **Calculator**: `SpeedViolationCalculator` in `engine/calculators/violations/speed_violation.py`; emits event_type `Overspeed`, event_category `Speed`.
3. **Pipeline**: Writes these events to **metric_events** (imei, gps_time, event_category, event_type, ...).
4. **MV**: **mv_daily_violations** groups metric_events by date, imei, client_id, event_category; `violation_count` = COUNT(*). So for event_category = 'Speed', violation_count is the daily speed violation count.
5. **Check**:
   - DB: `SELECT * FROM metric_events WHERE imei = ? AND (gps_time AT TIME ZONE 'UTC')::DATE = ? AND event_category = 'Speed'`.
   - MV: `SELECT * FROM mv_daily_violations WHERE imei = ? AND date = ? AND event_category = 'Speed'`.
   - Count of rows in metric_events should match violation_count in the MV after refresh.

---

## 6. Quick reference: where things live

| You want to… | Look at |
|--------------|---------|
| Formula for a metric | metrics_analysis/METRICS_SPEC.md |
| Real-time logic (per message) | metric_engine_node/engine/calculators/ (and pipeline.py) |
| Which config keys affect which MVs | metric_engine_node/engine/recalculation_catalog.json |
| Event categories/types | metric_engine_node/engine/event_types.py |
| Where events are written | metric_engine_node/engine/db.py → insert_metric_events |
| Aggregated metrics (daily/hourly) | database/schema.sql → CREATE MATERIALIZED VIEW |
| Spec vs implementation mismatches | metrics_analysis/METRICS_IMPLEMENTATION_ANALYSIS.md |

---

## 7. Summary

- **Metric node**: “What happens when one trackdata message is processed?” → pipeline loads state/config, runs calculators, writes state to laststatus and events to metric_events (and trip/stoppage when applicable).
- **Materialized views**: “Where does the daily/hourly number come from?” → MVs aggregate trackdata, metric_events, trip, laststatus, etc.; refresh is separate from message processing.
- To understand **one metric**: (1) find its formula in the spec, (2) find the calculator that produces the state/events for it, (3) find the MV that reads those tables and aggregates, (4) verify with DB queries and, if needed, METRICS_IMPLEMENTATION_ANALYSIS.md for known formula differences.
