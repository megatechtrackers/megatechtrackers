"""
Driving time violation calculator (plan § Phase 4, § 4.4).
Continuous driving: driving_session_start + elapsed > MAX_DRIVING_HOURS or distance > MAX_DRIVING_DISTANCE.
Rest time: REST_DURATION, MIN_REST_DURATION -> Rest_Time_Violation.
Night driving: NIGHT_START, NIGHT_END -> Night_Driving (optional).
"""
import logging
from datetime import timezone
from typing import Any, Dict, Optional

from ..base import BaseCalculator, CalculatorContext, CalculatorResult

logger = logging.getLogger(__name__)


def _parse_time(s: str) -> Optional[int]:
    """Parse HH or HH:MM to minutes since midnight."""
    if not s:
        return None
    s = str(s).strip()
    try:
        if ":" in s:
            parts = s.split(":")
            h, m = int(parts[0]), int(parts[1]) if len(parts) > 1 else 0
        else:
            h, m = int(s), 0
        return h * 60 + m
    except (ValueError, TypeError):
        return None


class DrivingTimeViolationCalculator(BaseCalculator):
    """Continuous driving and rest time violations -> metric_events (Driving category)."""

    name = "driving_time_violation"
    category = "violation"
    requires_config = [
        "MAX_DRIVING_HOURS", "MAX_DRIVING_DISTANCE", "REST_DURATION", "MIN_REST_DURATION",
        "NIGHT_START", "NIGHT_END",
    ]

    async def calculate(self, ctx: CalculatorContext) -> CalculatorResult:
        record = ctx.record
        prev = ctx.previous_state
        config = ctx.config
        gps_time = ctx.gps_time
        lat = record.get("latitude")
        lon = record.get("longitude")
        state_updates = {}
        events = []

        max_driving_sec = int(config.get("MAX_DRIVING_HOURS", "28800"))  # 8h in seconds if key is in seconds
        if max_driving_sec < 1000:
            max_driving_sec *= 3600
        max_driving_km = float(config.get("MAX_DRIVING_DISTANCE", "800"))
        rest_duration_sec = int(config.get("REST_DURATION", "2700"))
        if rest_duration_sec < 1000:
            rest_duration_sec = rest_duration_sec if rest_duration_sec > 60 else 2700
        min_rest_sec = int(config.get("MIN_REST_DURATION", "1800"))
        if min_rest_sec < 100:
            min_rest_sec = min_rest_sec * 60 if min_rest_sec > 0 else 1800

        driving_start = prev.get("driving_session_start")
        driving_distance = float(prev.get("driving_session_distance") or 0)
        rest_start = prev.get("rest_start_time")
        dist_delta = float(record.get("distance") or 0) / 1000.0
        speed = int(record.get("speed") or 0)
        gps_utc = gps_time if gps_time.tzinfo else gps_time.replace(tzinfo=timezone.utc)

        # Rest time violation: was resting, now driving — check if rest was too short (plan Phase 4)
        if speed > 0 and rest_start is not None:
            if isinstance(rest_start, str):
                from dateutil import parser
                rest_start = parser.parse(rest_start)
            if rest_start.tzinfo is None:
                rest_start = rest_start.replace(tzinfo=timezone.utc)
            rest_elapsed_sec = int((gps_utc - rest_start).total_seconds())
            if rest_elapsed_sec < min_rest_sec:
                events.append({
                    "imei": ctx.imei,
                    "gps_time": gps_time,
                    "event_category": "Driving",
                    "event_type": "Rest_Time_Violation",
                    "event_value": rest_elapsed_sec / 60.0,
                    "threshold_value": min_rest_sec / 60.0,
                    "duration_sec": rest_elapsed_sec,
                    "severity": "High",
                    "latitude": float(lat) if lat is not None else None,
                    "longitude": float(lon) if lon is not None else None,
                })
            state_updates["rest_start_time"] = None
        elif speed == 0:
            # Vehicle stopped: if was driving, start rest; if already resting, clear when rest complete
            if driving_start is not None:
                state_updates["rest_start_time"] = gps_time
            elif rest_start is not None:
                if isinstance(rest_start, str):
                    from dateutil import parser
                    rest_start = parser.parse(rest_start)
                if rest_start.tzinfo is None:
                    rest_start = rest_start.replace(tzinfo=timezone.utc)
                if (gps_utc - rest_start).total_seconds() >= rest_duration_sec:
                    state_updates["rest_start_time"] = None

        if speed > 0 and dist_delta > 0:
            if driving_start is None:
                state_updates["driving_session_start"] = gps_time
                state_updates["driving_session_distance"] = dist_delta
            else:
                driving_distance += dist_delta
                state_updates["driving_session_distance"] = driving_distance
                if isinstance(driving_start, str):
                    from dateutil import parser
                    driving_start = parser.parse(driving_start)
                if driving_start.tzinfo is None:
                    driving_start = driving_start.replace(tzinfo=timezone.utc)
                gps_utc = gps_time if gps_time.tzinfo else gps_time.replace(tzinfo=timezone.utc)
                elapsed_sec = int((gps_utc - driving_start).total_seconds())
                if elapsed_sec >= max_driving_sec:
                    events.append({
                        "imei": ctx.imei,
                        "gps_time": gps_time,
                        "event_category": "Driving",
                        "event_type": "Continuous_Driving_Violation",
                        "event_value": elapsed_sec / 3600.0,
                        "threshold_value": max_driving_sec / 3600.0,
                        "duration_sec": elapsed_sec,
                        "severity": "High",
                        "latitude": float(lat) if lat is not None else None,
                        "longitude": float(lon) if lon is not None else None,
                    })
                    state_updates["driving_session_start"] = None
                    state_updates["driving_session_distance"] = None
                elif driving_distance >= max_driving_km:
                    events.append({
                        "imei": ctx.imei,
                        "gps_time": gps_time,
                        "event_category": "Driving",
                        "event_type": "Continuous_Driving_Violation",
                        "event_value": driving_distance,
                        "threshold_value": max_driving_km,
                        "duration_sec": None,
                        "severity": "High",
                        "latitude": float(lat) if lat is not None else None,
                        "longitude": float(lon) if lon is not None else None,
                        "metadata": {"by_distance": True},
                    })
                    state_updates["driving_session_start"] = None
                    state_updates["driving_session_distance"] = None
        else:
            if driving_start is not None:
                state_updates["driving_session_start"] = None
                state_updates["driving_session_distance"] = None

        night_start = _parse_time(config.get("NIGHT_START", "22"))
        night_end = _parse_time(config.get("NIGHT_END", "5"))
        if night_start is not None and night_end is not None:
            gps_utc = gps_time if gps_time.tzinfo else gps_time.replace(tzinfo=timezone.utc)
            minute_of_day = gps_utc.hour * 60 + gps_utc.minute
            in_night = (night_start <= minute_of_day <= 24 * 60) or (0 <= minute_of_day < night_end)
            if in_night and speed > 0:
                events.append({
                    "imei": ctx.imei,
                    "gps_time": gps_time,
                    "event_category": "Driving",
                    "event_type": "Night_Driving",
                    "event_value": speed,
                    "threshold_value": None,
                    "severity": "Low",
                    "latitude": float(lat) if lat is not None else None,
                    "longitude": float(lon) if lon is not None else None,
                })

        return CalculatorResult(state_updates=state_updates, events=events)
