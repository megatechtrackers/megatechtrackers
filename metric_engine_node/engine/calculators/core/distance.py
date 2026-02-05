"""
Distance calculator: Haversine between consecutive points (METRICS_SPEC § 1).
Filter: speed < MAX_SPEED_FILTER, point_distance < 10 km, speed > 0.
"""
import math
import logging
from typing import Any, Dict

from ..base import BaseCalculator, CalculatorContext, CalculatorResult

logger = logging.getLogger(__name__)

EARTH_RADIUS_KM = 6371.0
MAX_POINT_DISTANCE_KM = 10.0


def haversine_km(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> float:
    """Haversine distance in km."""
    lat1, lon1, lat2, lon2 = map(math.radians, (lat1, lon1, lat2, lon2))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    c = 2 * math.asin(math.sqrt(min(1.0, a)))
    return EARTH_RADIUS_KM * c


class DistanceCalculator(BaseCalculator):
    """Point-to-point distance; filter GPS errors."""

    name = "distance"
    category = "core"
    requires_config = ["MAX_SPEED_FILTER"]

    async def calculate(self, ctx: CalculatorContext) -> CalculatorResult:
        record = ctx.record
        prev = ctx.previous_state
        max_speed = int(ctx.config.get("MAX_SPEED_FILTER", "150"))
        lat = float(record.get("latitude") or 0)
        lon = float(record.get("longitude") or 0)
        speed = int(record.get("speed") or 0)
        prev_lat = prev.get("latitude")
        prev_lon = prev.get("longitude")
        if prev_lat is None or prev_lon is None:
            return CalculatorResult()
        dist_km = haversine_km(prev_lat, prev_lon, lat, lon)
        if speed <= 0 or speed >= max_speed or dist_km >= MAX_POINT_DISTANCE_KM:
            return CalculatorResult()
        return CalculatorResult(state_updates={"last_distance_km": dist_km})
