"""
Temperature calculator (METRICS_SPEC § 2.1). Violation when outside TEMP_MIN/TEMP_MAX for SENSOR_DURATION_THRESHOLD.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from ..base import BaseCalculator, CalculatorContext, CalculatorResult

logger = logging.getLogger(__name__)


def _get_temp(record: Dict[str, Any]) -> Optional[float]:
    """COALESCE dallas_temperature_1..4, ble_temperature_1..4."""
    for key in (
        "dallas_temperature_1", "dallas_temperature_2", "dallas_temperature_3", "dallas_temperature_4",
        "ble_temperature_1", "ble_temperature_2", "ble_temperature_3", "ble_temperature_4",
    ):
        v = record.get(key)
        if v is not None:
            try:
                return float(v)
            except (TypeError, ValueError):
                pass
    return None


class TemperatureCalculator(BaseCalculator):
    """Temperature violation: outside range for min duration -> metric_events."""

    name = "temperature"
    category = "sensor"
    requires_sensors = ["has_temp_sensor"]
    requires_config = ["TEMP_MIN", "TEMP_MAX", "SENSOR_DURATION_THRESHOLD"]

    def applies_to(self, tracker: Optional[Dict], config: Dict[str, str]) -> bool:
        if tracker and not tracker.get("has_temp_sensor", False):
            return False
        return True

    async def calculate(self, ctx: CalculatorContext) -> CalculatorResult:
        record = ctx.record
        prev = ctx.previous_state
        config = ctx.config
        temp = _get_temp(record)
        if temp is None:
            return CalculatorResult()
        temp_min = float(config.get("TEMP_MIN", "-25"))
        temp_max = float(config.get("TEMP_MAX", "25"))
        min_duration_sec = int(config.get("SENSOR_DURATION_THRESHOLD", "300"))
        gps_time = ctx.gps_time
        lat = record.get("latitude")
        lon = record.get("longitude")
        state_updates = {}
        events = []
        in_range = temp_min <= temp <= temp_max
        prev_start = prev.get("temp_violation_start")
        if not in_range:
            if prev_start is None:
                state_updates["temp_violation_start"] = gps_time
            else:
                if isinstance(prev_start, str):
                    from dateutil import parser
                    prev_start = parser.parse(prev_start)
                if prev_start.tzinfo is None:
                    prev_start = prev_start.replace(tzinfo=timezone.utc)
                if gps_time.tzinfo is None:
                    gps_time = gps_time.replace(tzinfo=timezone.utc)
                duration_sec = int((gps_time - prev_start).total_seconds())
                if duration_sec >= min_duration_sec:
                    event_type = "Temp_High" if temp > temp_max else "Temp_Low"
                    events.append({
                        "imei": ctx.imei,
                        "gps_time": gps_time,
                        "event_category": "Sensor",
                        "event_type": event_type,
                        "event_value": temp,
                        "threshold_value": temp_max if temp > temp_max else temp_min,
                        "duration_sec": duration_sec,
                        "severity": "Medium",
                        "latitude": float(lat) if lat is not None else None,
                        "longitude": float(lon) if lon is not None else None,
                    })
                    state_updates["last_violation_time"] = gps_time
                    state_updates["last_violation_type"] = event_type
        else:
            if prev.get("temp_violation_start"):
                state_updates["temp_violation_start"] = None
        state_updates["prev_temp_value"] = temp
        return CalculatorResult(state_updates=state_updates, events=events)
