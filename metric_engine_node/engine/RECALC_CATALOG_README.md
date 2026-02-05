# Recalculation catalog (Plan § 7.7)

**File**: `recalculation_catalog.json` (same directory as this README)

**Purpose**: Single source for config→affected metrics and refreshable view names. Adding a new config key or materialized view = edit this JSON; no code change in `recalculation_worker.py`.

- **config_key_affected**: For each config key, `event_categories` (metric_events rows to delete on config change) and `view_names` (MVs to refresh). Keys not listed use “delete all / refresh all” when that config changes.
- **materialized_views**: Ordered list of view names allowed for `REFRESH MATERIALIZED VIEW` (security whitelist and default list for REFRESH_VIEWS).

**Override path**: Set `METRIC_ENGINE_RECALC_CATALOG_PATH` to load a different JSON file (e.g. from metrics_analysis or a mounted config volume).

**Reload without restart (Plan § 7.8)**: Send SIGHUP to the metric engine process to invalidate the in-memory catalog; the next recalculation job will load the JSON again. On Windows, SIGHUP is not available; restart the process to pick up catalog changes.

**Event types**: Use constants from `event_types.py` in calculators so new event types are added in one place and stay aligned with METRIC_CATALOG.md.
