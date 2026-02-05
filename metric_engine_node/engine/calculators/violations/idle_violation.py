"""
Idle violation: idle duration > IDLE_MAX (plan, METRICS_SPEC).
Emit Idle_Violation when idle period exceeds threshold.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict

from ..base import BaseCalculator, CalculatorContext, CalculatorResult
from ..core.vehicle_state import _parse_ignition

logger = logging.getLogger(__name__)


class IdleViolationCalculator(BaseCalculator):
    """Idle violation when idle duration >= IDLE_MAX."""

    name = "idle_violation"
    category = "violation"
    requires_config = ["IDLE_THRESHOLD", "IDLE_MAX"]

    async def calculate(self, ctx: CalculatorContext) -> CalculatorResult:
        record = ctx.record
        prev = ctx.previous_state
        config = ctx.config
        idle_max_sec = int(config.get("IDLE_MAX", "600"))
        ignition = _parse_ignition(record)
        speed = int(record.get("speed") or 0)
        gps_time = ctx.gps_time
        lat = record.get("latitude")
        lon = record.get("longitude")
        state_updates = {}
        events = []
        idle_start = prev.get("idle_start_time")
        if ignition and speed == 0 and idle_start:
            if isinstance(idle_start, str):
                from dateutil import parser
                idle_start = parser.parse(idle_start)
            if idle_start.tzinfo is None:
                idle_start = idle_start.replace(tzinfo=timezone.utc)
            if gps_time.tzinfo is None:
                gps_time = gps_time.replace(tzinfo=timezone.utc)
            duration_sec = int((gps_time - idle_start).total_seconds())
            if duration_sec >= idle_max_sec:
                events.append({
                    "imei": ctx.imei,
                    "gps_time": gps_time,
                    "event_category": "Idle",
                    "event_type": "Idle_Violation",
                    "event_value": float(duration_sec),
                    "threshold_value": float(idle_max_sec),
                    "duration_sec": duration_sec,
                    "severity": "Low",
                    "latitude": float(lat) if lat is not None else None,
                    "longitude": float(lon) if lon is not None else None,
                })
                state_updates["last_violation_time"] = gps_time
                state_updates["last_violation_type"] = "Idle_Violation"
        return CalculatorResult(state_updates=state_updates, events=events)
