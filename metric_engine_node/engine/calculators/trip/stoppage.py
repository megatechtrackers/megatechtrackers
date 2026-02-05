"""
Stoppage detection during trip (plan § 6, § 8.2).
When trip in progress and speed=0 for >= STOP_THRESHOLD, record stoppage; when speed>0, close and insert trip_stoppage_log.
"""
import logging
from datetime import timezone
from typing import Any, Dict, Optional

from ..base import BaseCalculator, CalculatorContext, CalculatorResult

logger = logging.getLogger(__name__)


class StoppageCalculator(BaseCalculator):
    """Detect stoppages during trip: speed=0 for STOP_THRESHOLD -> log to trip_stoppage_log."""

    name = "stoppage"
    category = "trip"
    requires_config = ["STOP_THRESHOLD"]

    async def calculate(self, ctx: CalculatorContext) -> CalculatorResult:
        record = ctx.record
        prev = ctx.previous_state
        config = ctx.config
        gps_time = ctx.gps_time
        speed = int(record.get("speed") or 0)
        lat = record.get("latitude")
        lon = record.get("longitude")
        trip_id = prev.get("current_trip_id")
        stop_threshold_sec = int(config.get("STOP_THRESHOLD", "300"))
        state_updates = {}
        stoppage_log_entries = []

        if not trip_id:
            if prev.get("stoppage_start_time"):
                state_updates["stoppage_start_time"] = None
                state_updates["stoppage_start_lat"] = None
                state_updates["stoppage_start_lon"] = None
            return CalculatorResult(state_updates=state_updates)

        if speed == 0:
            start_time = prev.get("stoppage_start_time")
            if start_time is None:
                state_updates["stoppage_start_time"] = gps_time
                state_updates["stoppage_start_lat"] = float(lat) if lat is not None else None
                state_updates["stoppage_start_lon"] = float(lon) if lon is not None else None
        else:
            start_time = prev.get("stoppage_start_time")
            if start_time is not None:
                if isinstance(start_time, str):
                    from dateutil import parser
                    start_time = parser.parse(start_time)
                if start_time.tzinfo is None:
                    start_time = start_time.replace(tzinfo=timezone.utc)
                gps_utc = gps_time if gps_time.tzinfo else gps_time.replace(tzinfo=timezone.utc)
                duration_sec = int((gps_utc - start_time).total_seconds())
                if duration_sec >= stop_threshold_sec:
                    stoppage_log_entries.append({
                        "trip_id": trip_id,
                        "stoppage_type": "Stop",
                        "start_time": start_time,
                        "end_time": gps_time,
                        "latitude": prev.get("stoppage_start_lat"),
                        "longitude": prev.get("stoppage_start_lon"),
                        "inside_fence_id": None,
                    })
                state_updates["stoppage_start_time"] = None
                state_updates["stoppage_start_lat"] = None
                state_updates["stoppage_start_lon"] = None

        return CalculatorResult(state_updates=state_updates, stoppage_log_entries=stoppage_log_entries)
