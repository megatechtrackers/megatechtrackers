"""
Harsh driving violation calculator (plan § Phase 4).
Detects Harsh_Brake, Harsh_Accel, Harsh_Corner from trackdata.status or green_driving_value.
"""
import logging
from typing import Any, Dict, Optional

from ..base import BaseCalculator, CalculatorContext, CalculatorResult

logger = logging.getLogger(__name__)


def _status_contains(record: Dict[str, Any], text: str) -> bool:
    s = (record.get("status") or "").lower()
    return text.lower() in s


class HarshViolationCalculator(BaseCalculator):
    """Harsh driving: status event or green_driving_value above threshold -> Harsh_Brake / Harsh_Accel / Harsh_Corner."""

    name = "harsh_violation"
    category = "violation"
    requires_config = ["HARSH_SPEED_DROP_THRESHOLD", "HARSH_SPEED_INCREASE_THRESHOLD", "HARSH_TIME_WINDOW"]

    async def calculate(self, ctx: CalculatorContext) -> CalculatorResult:
        record = ctx.record
        config = ctx.config
        gps_time = ctx.gps_time
        lat = record.get("latitude")
        lon = record.get("longitude")
        events = []

        if _status_contains(record, "Harsh Braking"):
            events.append({
                "imei": ctx.imei,
                "gps_time": gps_time,
                "event_category": "Harsh",
                "event_type": "Harsh_Brake",
                "event_value": None,
                "threshold_value": float(config.get("HARSH_SPEED_DROP_THRESHOLD", "20")),
                "severity": "Medium",
                "latitude": float(lat) if lat is not None else None,
                "longitude": float(lon) if lon is not None else None,
            })
        if _status_contains(record, "Harsh Acceleration"):
            events.append({
                "imei": ctx.imei,
                "gps_time": gps_time,
                "event_category": "Harsh",
                "event_type": "Harsh_Accel",
                "event_value": None,
                "threshold_value": float(config.get("HARSH_SPEED_INCREASE_THRESHOLD", "15")),
                "severity": "Medium",
                "latitude": float(lat) if lat is not None else None,
                "longitude": float(lon) if lon is not None else None,
            })
        if _status_contains(record, "Harsh Cornering"):
            events.append({
                "imei": ctx.imei,
                "gps_time": gps_time,
                "event_category": "Harsh",
                "event_type": "Harsh_Corner",
                "event_value": None,
                "threshold_value": None,
                "severity": "Medium",
                "latitude": float(lat) if lat is not None else None,
                "longitude": float(lon) if lon is not None else None,
            })

        green_val = record.get("green_driving_value")
        if green_val is not None and events:
            try:
                v = float(green_val)
                for ev in events:
                    ev["event_value"] = v
            except (TypeError, ValueError):
                pass

        return CalculatorResult(events=events)
