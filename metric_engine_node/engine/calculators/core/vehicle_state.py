"""
Vehicle status state machine (plan § 4.2, METRICS_SPEC § 4).
States: moving | idle | stopped | not_responding.
Transitions from status text (Ignition On/Off) and speed; NR_THRESHOLD for not_responding.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict

from ..base import BaseCalculator, CalculatorContext, CalculatorResult

logger = logging.getLogger(__name__)


def _parse_ignition(record: Dict[str, Any]) -> bool:
    """Derive ignition from record: boolean column or status text."""
    val = record.get("ignition")
    if val is not None:
        if isinstance(val, bool):
            return val
        if isinstance(val, int):
            return bool(val)
        if isinstance(val, str):
            return val.lower() in ("true", "1", "yes", "on")
    status = (record.get("status") or "").lower()
    if "ignition on" in status or "ignition on" in status.replace(" ", ""):
        return True
    if "ignition off" in status or "ignition off" in status.replace(" ", ""):
        return False
    # No event: use previous state or infer from speed
    return False


class VehicleStateCalculator(BaseCalculator):
    """State machine: moving / idle / stopped / not_responding."""

    name = "vehicle_state"
    category = "core"
    requires_config = ["NR_THRESHOLD", "IDLE_THRESHOLD"]

    async def calculate(self, ctx: CalculatorContext) -> CalculatorResult:
        record = ctx.record
        prev = ctx.previous_state
        nr_sec = int(ctx.config.get("NR_THRESHOLD", "86400"))
        idle_sec = int(ctx.config.get("IDLE_THRESHOLD", "180"))

        ignition = _parse_ignition(record)
        speed = int(record.get("speed") or 0)
        gps_time = ctx.gps_time
        server_time = record.get("server_time") or gps_time
        if isinstance(server_time, str):
            from dateutil import parser
            server_time = parser.parse(server_time)
        if server_time.tzinfo is None:
            server_time = server_time.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        last_update = prev.get("server_time") or prev.get("gps_time")
        if last_update:
            if isinstance(last_update, str):
                from dateutil import parser
                last_update = parser.parse(last_update)
            if last_update.tzinfo is None:
                last_update = last_update.replace(tzinfo=timezone.utc)
            sec_since = (now - last_update).total_seconds()
        else:
            sec_since = 0

        prev_state = prev.get("vehicle_state") or "stopped"

        if sec_since > nr_sec:
            new_state = "not_responding"
        elif not ignition:
            new_state = "stopped"
        elif speed > 0:
            new_state = "moving"
        else:
            new_state = "idle"

        return CalculatorResult(state_updates={"vehicle_state": new_state})
