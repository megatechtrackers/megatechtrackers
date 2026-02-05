"""
Duration calculator: idle start time when ignition on + speed=0 (METRICS_SPEC § 3).
Updates idle_start_time in laststatus when entering idle.
"""
import logging
from typing import Any, Dict

from ..base import BaseCalculator, CalculatorContext, CalculatorResult
from ..core.vehicle_state import _parse_ignition

logger = logging.getLogger(__name__)


class DurationCalculator(BaseCalculator):
    """Track idle_start_time for idle duration metrics."""

    name = "duration"
    category = "core"
    requires_config = ["IDLE_THRESHOLD"]

    async def calculate(self, ctx: CalculatorContext) -> CalculatorResult:
        record = ctx.record
        prev = ctx.previous_state
        ignition = _parse_ignition(record)
        speed = int(record.get("speed") or 0)
        gps_time = ctx.gps_time
        state_updates = {}
        if ignition and speed == 0:
            if not prev.get("idle_start_time"):
                state_updates["idle_start_time"] = gps_time
        else:
            if prev.get("idle_start_time"):
                state_updates["idle_start_time"] = None
        return CalculatorResult(state_updates=state_updates)
