"""
Fence-wise trip monitoring (plan § 8.4).
Trip created manually with origin_fence_id, destination_fence_id. Metric engine records source_exit_time,
destination_arrival_time and marks trip Completed when vehicle enters destination.
"""
import logging
from typing import Any, Dict, List

from ..base import BaseCalculator, CalculatorContext, CalculatorResult

logger = logging.getLogger(__name__)


async def _get_vehicle_id(imei: int):
    try:
        from engine.db import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT vehicle_id FROM tracker WHERE imei = $1", imei)
            return row["vehicle_id"] if row else None
    except Exception:
        return None


class FenceWiseTripCalculator(BaseCalculator):
    """Monitor Fence-Wise trips: exit origin -> enter destination -> complete."""

    name = "fence_wise_trip"
    category = "trip"
    requires_config = []

    async def calculate(self, ctx: CalculatorContext) -> CalculatorResult:
        record = ctx.record
        prev = ctx.previous_state
        lat = record.get("latitude")
        lon = record.get("longitude")
        if lat is None or lon is None:
            return CalculatorResult()
        try:
            lat, lon = float(lat), float(lon)
        except (TypeError, ValueError):
            return CalculatorResult()
        gps_time = ctx.gps_time
        prev_fence_ids = prev.get("current_fence_ids") or []
        if isinstance(prev_fence_ids, (list, tuple)):
            prev_set = set(int(x) for x in prev_fence_ids if x is not None)
        else:
            prev_set = set()
        from engine.db import get_active_fence_wise_trips, point_in_fence_simple, update_fence_wise_trip, complete_trip
        vehicle_id = await _get_vehicle_id(ctx.imei)
        trips = await get_active_fence_wise_trips(vehicle_id) if vehicle_id else []
        state_updates = {}
        for tr in trips:
            trip_id = tr.get("trip_id")
            origin_id = tr.get("origin_fence_id")
            dest_id = tr.get("destination_fence_id")
            source_exit = tr.get("source_exit_time")
            dest_arrival = tr.get("destination_arrival_time")
            if not origin_id or not dest_id:
                continue
            was_in_origin = origin_id in prev_set
            is_in_origin = await point_in_fence_simple(origin_id, lat, lon)
            is_in_dest = await point_in_fence_simple(dest_id, lat, lon)
            if source_exit is None and was_in_origin and not is_in_origin:
                await update_fence_wise_trip(trip_id, source_exit_time=gps_time)
            if dest_arrival is None and is_in_dest:
                await update_fence_wise_trip(trip_id, destination_arrival_time=gps_time)
                await complete_trip(trip_id, gps_time, lat, lon)
                if prev.get("current_trip_id") == trip_id:
                    state_updates["trip_in_progress"] = False
                    state_updates["current_trip_id"] = None
        return CalculatorResult(state_updates=state_updates)
