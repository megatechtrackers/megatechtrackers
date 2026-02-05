"""
Route-based trip (plan § 8.1). When vehicle has route_assignment and position on route, create trip (Route-Based).
When position leaves route, complete trip with deviation_status.
"""
import logging
from typing import Any, Dict

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


class RouteTripCalculator(BaseCalculator):
    """Create Route-Based trip when vehicle on assigned route; complete when off route."""

    name = "route_trip"
    category = "trip"
    requires_config = ["DEVIATION_THRESHOLD"]

    async def calculate(self, ctx: CalculatorContext) -> CalculatorResult:
        record = ctx.record
        prev = ctx.previous_state
        config = ctx.config
        gps_time = ctx.gps_time
        lat = record.get("latitude")
        lon = record.get("longitude")
        if lat is None or lon is None:
            return CalculatorResult()
        try:
            lat, lon = float(lat), float(lon)
        except (TypeError, ValueError):
            return CalculatorResult()

        from engine.db import (
            get_route_assignment_for_vehicle,
            point_on_route,
            create_route_trip,
            get_active_route_trip,
            complete_trip,
            update_route_trip_deviation,
        )

        vehicle_id = await _get_vehicle_id(ctx.imei)
        state_updates = {}
        threshold_km = float(config.get("DEVIATION_THRESHOLD", "3.5"))

        assignment = await get_route_assignment_for_vehicle(vehicle_id) if vehicle_id else None
        if not assignment:
            return CalculatorResult()

        route_id = assignment.get("route_id")
        if not route_id:
            return CalculatorResult()

        on_route = await point_on_route(route_id, lat, lon, threshold_km)
        current_route_trip = await get_active_route_trip(vehicle_id) if vehicle_id else None

        if on_route:
            if not current_route_trip:
                trip_id = await create_route_trip(vehicle_id, route_id, gps_time, lat, lon)
                if trip_id:
                    state_updates["trip_in_progress"] = True
                    state_updates["current_trip_id"] = trip_id
            else:
                pass
        else:
            if current_route_trip:
                trip_id = current_route_trip["trip_id"]
                deviation_count = int(current_route_trip.get("deviation_count") or 0) + 1
                await update_route_trip_deviation(trip_id, deviation_count, "Deviated")
                await complete_trip(trip_id, gps_time, lat, lon)
                if prev.get("current_trip_id") == trip_id:
                    state_updates["trip_in_progress"] = False
                    state_updates["current_trip_id"] = None

        return CalculatorResult(state_updates=state_updates)
