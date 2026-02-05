"""
Plan § 7.7: Data-driven recalculation catalog.
Load config_key → affected event_categories/view_names and refreshable view list from JSON.
Add new config keys or MVs in recalculation_catalog.json; no code change in recalculation_worker.
"""
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

_CATALOG: Optional[Dict[str, Any]] = None
_CATALOG_PATH: Optional[str] = None


def _default_config_key_affected() -> Dict[str, Tuple[List[str], List[str]]]:
    """Built-in fallback when catalog file is missing (plan § 7.7)."""
    return {
        "SPEED_LIMIT_CITY": (["Speed"], ["mv_daily_violations", "mv_weekly_driver_scores"]),
        "SPEED_LIMIT_HIGHWAY": (["Speed"], ["mv_daily_violations", "mv_weekly_driver_scores"]),
        "SPEED_LIMIT_MOTORWAY": (["Speed"], ["mv_daily_violations", "mv_weekly_driver_scores"]),
        "MIN_DURATION_SPEED": (["Speed"], ["mv_daily_violations", "mv_weekly_driver_scores"]),
        "TEMP_MIN": (["Sensor"], ["mv_daily_temperature_compliance", "mv_daily_violations"]),
        "TEMP_MAX": (["Sensor"], ["mv_daily_temperature_compliance", "mv_daily_violations"]),
        "HUMIDITY_MIN": (["Sensor"], ["mv_daily_humidity_compliance", "mv_daily_violations"]),
        "HUMIDITY_MAX": (["Sensor"], ["mv_daily_humidity_compliance", "mv_daily_violations"]),
        "SENSOR_DURATION_THRESHOLD": (["Sensor"], ["mv_daily_temperature_compliance", "mv_daily_humidity_compliance"]),
        "SEATBELT_SPEED_THRESHOLD": (["Seatbelt"], ["mv_daily_violations", "mv_daily_compliance"]),
        "SEATBELT_MIN_DURATION": (["Seatbelt"], ["mv_daily_violations", "mv_daily_compliance"]),
        "SEATBELT_MIN_DISTANCE": (["Seatbelt"], ["mv_daily_violations", "mv_daily_compliance"]),
        "SEATBELT_DELAY_THRESHOLD": (["Seatbelt"], ["mv_daily_violations", "mv_daily_compliance"]),
        "HARSH_SPEED_DROP_THRESHOLD": (["Harsh"], ["mv_daily_harsh_events", "mv_weekly_driver_scores"]),
        "HARSH_SPEED_INCREASE_THRESHOLD": (["Harsh"], ["mv_daily_harsh_events", "mv_weekly_driver_scores"]),
        "HARSH_TIME_WINDOW": (["Harsh"], ["mv_daily_harsh_events", "mv_weekly_driver_scores"]),
        "HARSH_HEADING_THRESHOLD": (["Harsh"], ["mv_daily_harsh_events", "mv_weekly_driver_scores"]),
        "FILL_THRESHOLD": (["Fuel"], ["mv_daily_fuel_consumption"]),
        "THEFT_THRESHOLD": (["Fuel"], ["mv_daily_fuel_consumption"]),
        "IDLE_THRESHOLD": (["Idle"], ["mv_hourly_vehicle_stats", "mv_daily_stoppage_stats"]),
        "IDLE_MAX": (["Idle"], ["mv_hourly_vehicle_stats"]),
        "NIGHT_START": ([], ["mv_daily_trip_patterns"]),
        "NIGHT_END": ([], ["mv_daily_trip_patterns"]),
        "LATE_NIGHT_START": ([], ["mv_daily_trip_patterns"]),
        "LATE_NIGHT_END": ([], ["mv_daily_trip_patterns"]),
        "MAX_DRIVING_HOURS": (["Driving"], ["mv_weekly_driver_scores"]),
        "MAX_DRIVING_DISTANCE": (["Driving"], ["mv_weekly_driver_scores"]),
        "REST_DURATION": (["Driving"], ["mv_weekly_driver_scores"]),
        "MIN_REST_DURATION": (["Driving"], ["mv_weekly_driver_scores"]),
        "DEVIATION_THRESHOLD": (["Route"], ["mv_trip_violations"]),
        "ENTRY_THRESHOLD": (["Route"], ["mv_trip_violations"]),
        "WAYPOINT_RADIUS": (["Route"], ["mv_trip_violations"]),
    }


def _default_materialized_views() -> List[str]:
    """Built-in fallback list of refreshable views (plan § 6.4)."""
    return [
        "mv_daily_mileage",
        "mv_daily_violations",
        "mv_hourly_vehicle_stats",
        "mv_daily_fuel_consumption",
        "mv_daily_temperature_compliance",
        "mv_daily_humidity_compliance",
        "mv_hourly_violations",
        "mv_daily_harsh_events",
        "mv_daily_compliance",
        "mv_daily_fence_stats",
        "mv_daily_stoppage_stats",
        "mv_daily_trip_patterns",
        "mv_daily_road_distance",
        "mv_maintenance_status",
        "mv_daily_fleet_status",
        "mv_weekly_driver_scores",
        "mv_daily_vehicle_scores",
        "mv_daily_camera_events",
        "mv_monthly_fleet_summary",
        "mv_transporter_summary",
        "mv_trip_violations",
        "mv_daily_fuel_summary",
        "mv_daily_client_analytics",
        "mv_daily_trends",
        "mv_trip_summary",
        "mv_hourly_violations_summary",
    ]


def _load_catalog() -> None:
    global _CATALOG, _CATALOG_PATH
    if _CATALOG is not None:
        return
    path = os.environ.get("METRIC_ENGINE_RECALC_CATALOG_PATH")
    if not path:
        path = str(Path(__file__).parent / "recalculation_catalog.json")
    _CATALOG_PATH = path
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        # Normalize: drop keys that are comments
        _CATALOG = {k: v for k, v in data.items() if not k.startswith("_")}
        logger.info("Loaded recalculation catalog from %s", path)
    except FileNotFoundError:
        logger.warning("Recalculation catalog not found at %s; using built-in default", path)
        _CATALOG = {}
    except Exception as e:
        logger.warning("Failed to load recalculation catalog from %s: %s; using built-in default", path, e)
        _CATALOG = {}


def reload_catalog() -> None:
    """Force reload of recalculation_catalog.json on next use. Plan § 7.8: call on SIGHUP to pick up catalog changes without restart."""
    global _CATALOG
    _CATALOG = None
    logger.info("Recalculation catalog invalidated; will reload on next use")


def get_config_affected(config_key: Optional[str]) -> Tuple[Optional[List[str]], Optional[List[str]]]:
    """
    Return (event_categories to delete, view_names to refresh) for config_key.
    None means delete all categories / refresh all views.
    Plan § 7.7: loaded from catalog; fallback to built-in default.
    """
    _load_catalog()
    if not config_key or not (config_key := (config_key or "").strip()):
        return None, None
    m = _CATALOG.get("config_key_affected") if _CATALOG else None
    if m and config_key in m:
        entry = m[config_key]
        if isinstance(entry, dict):
            cats = entry.get("event_categories")
            views = entry.get("view_names")
            return (list(cats) if cats else None, list(views) if views else None)
        if isinstance(entry, (list, tuple)) and len(entry) >= 2:
            return (list(entry[0]) if entry[0] else None, list(entry[1]) if entry[1] else None)
    fallback = _default_config_key_affected()
    if config_key in fallback:
        return fallback[config_key]
    return None, None


def get_refreshable_views() -> List[str]:
    """Return ordered list of materialized view names for REFRESH_VIEWS. Plan § 7.7."""
    _load_catalog()
    if _CATALOG and "materialized_views" in _CATALOG:
        return list(_CATALOG["materialized_views"])
    return _default_materialized_views()


def get_allowed_view_names() -> frozenset:
    """Return frozenset of allowed view names (security whitelist for REFRESH MATERIALIZED VIEW)."""
    return frozenset(get_refreshable_views())


def validate_view_name(view_name: str) -> Optional[str]:
    """Return view_name if it is in the whitelist, else None. Plan § 7.7."""
    if not view_name or not (v := view_name.strip()):
        return None
    if v in get_allowed_view_names():
        return v
    logger.warning("View name not in catalog whitelist, skipping: %r", v)
    return None


def filter_view_names(names: List[str]) -> List[str]:
    """Return only names that are in the whitelist, in order."""
    out = []
    for n in names:
        v = validate_view_name(n)
        if v is not None:
            out.append(v)
    return out
