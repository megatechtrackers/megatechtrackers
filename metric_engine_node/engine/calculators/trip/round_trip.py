"""
Round trip from upload_sheet (plan § 8.5).
Create trip when start_date+start_time reached; monitor destination fence; complete with time_compliance.
"""
import logging
from datetime import timezone
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


class RoundTripCalculator(BaseCalculator):
    """Create Round-Trip from upload_sheet when start time reached; monitor destination; complete with time_compliance."""

    name = "round_trip"
    category = "trip"
    requires_config = ["TIME_COMPLIANCE_THRESHOLD", "TRIP_END_DELAY"]

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
            get_pending_upload_sheet_trip,
            create_round_trip_from_upload,
            get_active_round_trips,
            point_in_fence_simple,
            update_round_trip,
            complete_trip,
        )

        vehicle_id = await _get_vehicle_id(ctx.imei)
        state_updates = {}

        # 1) Pending upload_sheet: create trip (Round-Trip) + extension
        if vehicle_id and not prev.get("current_trip_id"):
            pending = await get_pending_upload_sheet_trip(vehicle_id)
            if pending and pending.get("destination_fence_id"):
                trip_id = await create_round_trip_from_upload(
                    vehicle_id=vehicle_id,
                    upload_id=pending["upload_id"],
                    planned_fence_id=pending["destination_fence_id"],
                    start_ts=pending["start_ts"],
                    start_lat=lat,
                    start_lon=lon,
                )
                if trip_id:
                    state_updates["trip_in_progress"] = True
                    state_updates["current_trip_id"] = trip_id
                    return CalculatorResult(state_updates=state_updates)

        # 2) Active round trips: monitor destination fence
        trips = await get_active_round_trips(vehicle_id) if vehicle_id else []
        prev_fence_ids = set()
        for x in (prev.get("current_fence_ids") or []) or []:
            if x is not None:
                prev_fence_ids.add(int(x))

        for tr in trips:
            trip_id = tr.get("trip_id")
            planned_fence_id = tr.get("planned_fence_id")
            dest_arrival = tr.get("destination_arrival_time")
            dest_exit = tr.get("destination_exit_time")
            if not planned_fence_id:
                continue
            in_dest = await point_in_fence_simple(planned_fence_id, lat, lon)
            was_in_dest = planned_fence_id in prev_fence_ids

            if dest_arrival is None and in_dest:
                await update_round_trip(trip_id, destination_arrival_time=gps_time)
            elif dest_arrival is not None and was_in_dest and not in_dest:
                time_compliance_threshold_sec = int(config.get("TIME_COMPLIANCE_THRESHOLD", "3600"))
                from dateutil import parser as date_parser
                arr = dest_arrival
                arr = date_parser.parse(str(arr)) if isinstance(arr, str) else arr
                if arr.tzinfo is None:
                    arr = arr.replace(tzinfo=timezone.utc)
                gps_utc = gps_time if gps_time.tzinfo else gps_time.replace(tzinfo=timezone.utc)
                time_inside_sec = int((gps_utc - arr).total_seconds())
                compliance = "Compliant" if time_inside_sec >= time_compliance_threshold_sec else "Non-Compliant"
                await update_round_trip(
                    trip_id,
                    destination_exit_time=gps_time,
                    deviation_status="Non-Deviated",
                    time_compliance=compliance,
                )
                await complete_trip(trip_id, gps_time, lat, lon)
                if prev.get("current_trip_id") == trip_id:
                    state_updates["trip_in_progress"] = False
                    state_updates["current_trip_id"] = None

        return CalculatorResult(state_updates=state_updates)
