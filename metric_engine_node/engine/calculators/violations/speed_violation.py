"""
Speed violation calculator (METRICS_SPEC, plan § 4).
Overspeed when speed > limit for MIN_DURATION. By road type (road table) or config fallback.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from ...event_types import (
    EVENT_CATEGORY_SPEED,
    EVENT_TYPE_OVERSPEED,
)
from ..base import BaseCalculator, CalculatorContext, CalculatorResult

logger = logging.getLogger(__name__)

ROAD_TYPE_TO_CONFIG = {
    "Intracity": "SPEED_LIMIT_CITY",
    "Highway": "SPEED_LIMIT_HIGHWAY",
    "Motorway": "SPEED_LIMIT_MOTORWAY",
}


def _get_speed_limit_from_config(config: Dict[str, str], road_type: Optional[str]) -> int:
    """Limit by road_type (Intracity/Highway/Motorway) or max of all config limits."""
    key = ROAD_TYPE_TO_CONFIG.get(road_type) if road_type else None
    if key and key in config:
        try:
            return int(config[key])
        except (ValueError, TypeError):
            pass
    city = int(config.get("SPEED_LIMIT_CITY", "60"))
    highway = int(config.get("SPEED_LIMIT_HIGHWAY", "100"))
    motorway = int(config.get("SPEED_LIMIT_MOTORWAY", "120"))
    return max(city, highway, motorway)


class SpeedViolationCalculator(BaseCalculator):
    """Overspeed: speed > limit for MIN_DURATION -> metric_events."""

    name = "speed_violation"
    category = "violation"
    requires_config = ["SPEED_LIMIT_CITY", "MIN_DURATION_SPEED"]

    async def calculate(self, ctx: CalculatorContext) -> CalculatorResult:
        record = ctx.record
        prev = ctx.previous_state
        config = ctx.config
        lat = record.get("latitude")
        lon = record.get("longitude")
        road_info = None
        if lat is not None and lon is not None:
            try:
                from engine.db import get_road_speed_limit
                road_info = await get_road_speed_limit(float(lat), float(lon))
            except (TypeError, ValueError):
                pass
        road_type = str(road_info["road_type"]) if road_info and road_info.get("road_type") is not None else None
        if road_info and road_info.get("speed_limit") is not None:
            limit = int(road_info["speed_limit"])
        else:
            limit = _get_speed_limit_from_config(config, road_type)
        min_duration_sec = int(config.get("MIN_DURATION_SPEED", "30"))
        speed = int(record.get("speed") or 0)
        gps_time = ctx.gps_time
        state_updates = {}
        events = []
        if speed > limit:
            prev_start = prev.get("speeding_start_time")
            prev_max = int(prev.get("speeding_max_speed") or 0)
            if prev_start is None:
                state_updates["speeding_start_time"] = gps_time
                state_updates["speeding_max_speed"] = speed
            else:
                if isinstance(prev_start, str):
                    from dateutil import parser
                    prev_start = parser.parse(prev_start)
                if prev_start.tzinfo is None:
                    prev_start = prev_start.replace(tzinfo=timezone.utc)
                if gps_time.tzinfo is None:
                    gps_time = gps_time.replace(tzinfo=timezone.utc)
                duration_sec = int((gps_time - prev_start).total_seconds())
                state_updates["speeding_max_speed"] = max(prev_max, speed)
                if duration_sec >= min_duration_sec:
                    ev = {
                        "imei": ctx.imei,
                        "gps_time": gps_time,
                        "event_category": EVENT_CATEGORY_SPEED,
                        "event_type": EVENT_TYPE_OVERSPEED,
                        "event_value": float(speed),
                        "threshold_value": float(limit),
                        "duration_sec": duration_sec,
                        "severity": "Medium",
                        "latitude": float(lat) if lat is not None else None,
                        "longitude": float(lon) if lon is not None else None,
                    }
                    if road_type:
                        ev["metadata"] = {"road_type": str(road_type)}
                    events.append(ev)
                    state_updates["last_violation_time"] = gps_time
                    state_updates["last_violation_type"] = EVENT_TYPE_OVERSPEED
        else:
            if prev.get("speeding_start_time"):
                state_updates["speeding_start_time"] = None
                state_updates["speeding_max_speed"] = None
        return CalculatorResult(state_updates=state_updates, events=events)
