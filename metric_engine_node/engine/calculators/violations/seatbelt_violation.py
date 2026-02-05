"""
Seatbelt violation calculator (plan § Phase 4).
Driver/Passenger seatbelt unbuckled while speed > SEATBELT_SPEED_THRESHOLD for SEATBELT_MIN_DURATION or SEATBELT_MIN_DISTANCE.
State: seatbelt_unbuckled_start, seatbelt_unbuckled_distance.
"""
import logging
from datetime import timezone
from typing import Any, Dict, Optional

from ..base import BaseCalculator, CalculatorContext, CalculatorResult
from ..core.vehicle_state import _parse_ignition

logger = logging.getLogger(__name__)


def _status_contains(record: Dict[str, Any], text: str) -> bool:
    s = (record.get("status") or "").lower()
    return text.lower() in s


def _get_speed(record: Dict[str, Any]) -> int:
    v = record.get("speed")
    if v is None:
        return 0
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


class SeatbeltViolationCalculator(BaseCalculator):
    """Seatbelt violation: unbuckled above speed threshold for min duration/distance -> Seatbelt_Violation."""

    name = "seatbelt_violation"
    category = "violation"
    requires_sensors = ["has_seatbelt_sensor"]
    requires_config = [
        "SEATBELT_SPEED_THRESHOLD", "SEATBELT_MIN_DURATION", "SEATBELT_MIN_DISTANCE", "SEATBELT_DELAY_THRESHOLD"
    ]

    def applies_to(self, tracker: Optional[Dict], config: Dict[str, str]) -> bool:
        if tracker and not tracker.get("has_seatbelt_sensor", False):
            return False
        return True

    async def calculate(self, ctx: CalculatorContext) -> CalculatorResult:
        record = ctx.record
        prev = ctx.previous_state
        config = ctx.config
        gps_time = ctx.gps_time
        lat = record.get("latitude")
        lon = record.get("longitude")
        speed = _get_speed(record)
        speed_threshold = int(config.get("SEATBELT_SPEED_THRESHOLD", "10"))
        min_duration_sec = int(config.get("SEATBELT_MIN_DURATION", "120"))
        min_distance_km = float(config.get("SEATBELT_MIN_DISTANCE", "1"))
        delay_threshold_sec = int(config.get("SEATBELT_DELAY_THRESHOLD", "120"))

        driver_buckled = record.get("driver_seatbelt")
        if driver_buckled is None:
            driver_buckled = not _status_contains(record, "Driver Seatbelt Open")
        passenger_buckled = record.get("passenger_seatbelt")
        if passenger_buckled is None:
            passenger_buckled = not _status_contains(record, "Passenger Seatbelt Open")

        state_updates = {}
        events = []

        if speed <= speed_threshold:
            if prev.get("seatbelt_unbuckled_start"):
                state_updates["seatbelt_unbuckled_start"] = None
                state_updates["seatbelt_unbuckled_distance"] = None
            return CalculatorResult(state_updates=state_updates)

        for seat, buckled in [("driver", driver_buckled), ("passenger", passenger_buckled)]:
            if buckled:
                continue
            unbuckled_start = prev.get("seatbelt_unbuckled_start")
            unbuckled_distance = float(prev.get("seatbelt_unbuckled_distance") or 0)
            dist_delta = float(record.get("distance") or 0) / 1000.0
            if dist_delta > 0:
                unbuckled_distance += dist_delta
            if unbuckled_start is None:
                state_updates["seatbelt_unbuckled_start"] = gps_time
                state_updates["seatbelt_unbuckled_distance"] = unbuckled_distance
                continue
            if isinstance(unbuckled_start, str):
                from dateutil import parser
                unbuckled_start = parser.parse(unbuckled_start)
            if unbuckled_start.tzinfo is None:
                unbuckled_start = unbuckled_start.replace(tzinfo=timezone.utc)
            gps_utc = gps_time if gps_time.tzinfo else gps_time.replace(tzinfo=timezone.utc)
            duration_sec = int((gps_utc - unbuckled_start).total_seconds())
            if duration_sec >= min_duration_sec or unbuckled_distance >= min_distance_km:
                events.append({
                    "imei": ctx.imei,
                    "gps_time": gps_time,
                    "event_category": "Seatbelt",
                    "event_type": "Seatbelt_Violation",
                    "event_value": unbuckled_distance,
                    "threshold_value": min_distance_km,
                    "duration_sec": duration_sec,
                    "severity": "Medium",
                    "latitude": float(lat) if lat is not None else None,
                    "longitude": float(lon) if lon is not None else None,
                    "metadata": {"seat": seat},
                })
                state_updates["last_violation_time"] = gps_time
                state_updates["last_violation_type"] = "Seatbelt_Violation"
                state_updates["seatbelt_unbuckled_start"] = None
                state_updates["seatbelt_unbuckled_distance"] = None
            else:
                state_updates["seatbelt_unbuckled_distance"] = unbuckled_distance

        return CalculatorResult(state_updates=state_updates, events=events)
