"""
Ignition-based trip state machine (plan § 4.3, § 8.3).
Ignition On -> create trip, set trip_in_progress, current_trip_id.
Ignition Off -> finalize trip, set trip_in_progress=FALSE.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from ..base import BaseCalculator, CalculatorContext, CalculatorResult
from ..core.vehicle_state import _parse_ignition

logger = logging.getLogger(__name__)


def _status_contains(record: Dict[str, Any], text: str) -> bool:
    s = (record.get("status") or "").lower()
    return text.lower() in s


class IgnitionTripCalculator(BaseCalculator):
    """Ignition-based trip: start on Ignition On, end on Ignition Off."""

    name = "ignition_trip"
    category = "trip"
    requires_config = []

    async def calculate(self, ctx: CalculatorContext) -> CalculatorResult:
        record = ctx.record
        prev = ctx.previous_state
        ignition = _parse_ignition(record)
        ignition_on_event = _status_contains(record, "Ignition On")
        ignition_off_event = _status_contains(record, "Ignition Off")
        gps_time = ctx.gps_time
        lat = record.get("latitude")
        lon = record.get("longitude")
        state_updates = {}
        # Trip creation/update is done in pipeline via db layer (insert trip, update laststatus)
        if ignition_on_event and not prev.get("trip_in_progress"):
            state_updates["_trip_action"] = "start"
            state_updates["_trip_start_time"] = gps_time
            state_updates["_trip_start_lat"] = float(lat) if lat is not None else None
            state_updates["_trip_start_lon"] = float(lon) if lon is not None else None
        elif ignition_off_event and prev.get("trip_in_progress"):
            state_updates["_trip_action"] = "end"
            state_updates["_trip_end_time"] = gps_time
            state_updates["_trip_end_lat"] = float(lat) if lat is not None else None
            state_updates["_trip_end_lon"] = float(lon) if lon is not None else None
            state_updates["trip_in_progress"] = False
            state_updates["current_trip_id"] = None
        return CalculatorResult(state_updates=state_updates)
