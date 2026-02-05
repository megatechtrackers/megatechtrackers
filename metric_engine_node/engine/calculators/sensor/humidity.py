"""
Humidity calculator (plan § Phase 3). Violation when outside HUMIDITY_MIN/HUMIDITY_MAX for SENSOR_DURATION_THRESHOLD.
Uses ble_humidity_1-4 from trackdata/laststatus.
"""
import logging
from datetime import timezone
from typing import Any, Dict, Optional

from ..base import BaseCalculator, CalculatorContext, CalculatorResult

logger = logging.getLogger(__name__)


def _get_humidity(record: Dict[str, Any]) -> Optional[float]:
    """COALESCE ble_humidity_1..4."""
    for key in ("ble_humidity_1", "ble_humidity_2", "ble_humidity_3", "ble_humidity_4"):
        v = record.get(key)
        if v is not None:
            try:
                return float(v)
            except (TypeError, ValueError):
                pass
    return None


class HumidityCalculator(BaseCalculator):
    """Humidity violation: outside range for min duration -> metric_events (event_category=Sensor, event_type=Humidity_High/Low)."""

    name = "humidity"
    category = "sensor"
    requires_sensors = ["has_humidity_sensor"]
    requires_config = ["HUMIDITY_MIN", "HUMIDITY_MAX", "SENSOR_DURATION_THRESHOLD"]

    def applies_to(self, tracker: Optional[Dict], config: Dict[str, str]) -> bool:
        if tracker and not tracker.get("has_humidity_sensor", False):
            return False
        return True

    async def calculate(self, ctx: CalculatorContext) -> CalculatorResult:
        record = ctx.record
        prev = ctx.previous_state
        config = ctx.config
        humidity = _get_humidity(record)
        if humidity is None:
            return CalculatorResult()
        h_min = float(config.get("HUMIDITY_MIN", "0"))
        h_max = float(config.get("HUMIDITY_MAX", "100"))
        min_duration_sec = int(config.get("SENSOR_DURATION_THRESHOLD", "300"))
        gps_time = ctx.gps_time
        lat = record.get("latitude")
        lon = record.get("longitude")
        state_updates = {}
        events = []
        in_range = h_min <= humidity <= h_max
        prev_start = prev.get("humidity_violation_start")
        if not in_range:
            if prev_start is None:
                state_updates["humidity_violation_start"] = gps_time
            else:
                if isinstance(prev_start, str):
                    from dateutil import parser
                    prev_start = parser.parse(prev_start)
                if prev_start.tzinfo is None:
                    prev_start = prev_start.replace(tzinfo=timezone.utc)
                gps_utc = gps_time if gps_time.tzinfo else gps_time.replace(tzinfo=timezone.utc)
                duration_sec = int((gps_utc - prev_start).total_seconds())
                if duration_sec >= min_duration_sec:
                    event_type = "Humidity_High" if humidity > h_max else "Humidity_Low"
                    events.append({
                        "imei": ctx.imei,
                        "gps_time": gps_time,
                        "event_category": "Sensor",
                        "event_type": event_type,
                        "event_value": humidity,
                        "threshold_value": h_max if humidity > h_max else h_min,
                        "duration_sec": duration_sec,
                        "severity": "Medium",
                        "latitude": float(lat) if lat is not None else None,
                        "longitude": float(lon) if lon is not None else None,
                    })
                    state_updates["last_violation_time"] = gps_time
                    state_updates["last_violation_type"] = event_type
        else:
            if prev.get("humidity_violation_start"):
                state_updates["humidity_violation_start"] = None
        return CalculatorResult(state_updates=state_updates, events=events)
