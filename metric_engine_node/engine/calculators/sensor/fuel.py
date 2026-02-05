"""
Fuel calculator (METRICS_SPEC): fill/theft detection via delta vs FILL_THRESHOLD/THEFT_THRESHOLD.
Phase 3: calibration table integration — raw fuel -> liters for consumption reporting (metadata).
"""
import logging
from typing import Any, Dict, Optional

from ...event_types import (
    EVENT_CATEGORY_FUEL,
    EVENT_TYPE_FUEL_FILL,
    EVENT_TYPE_FUEL_THEFT,
)
from ..base import BaseCalculator, CalculatorContext, CalculatorResult

logger = logging.getLogger(__name__)


class FuelCalculator(BaseCalculator):
    """Fuel fill/theft detection: delta vs threshold -> metric_events. Uses calibration for liters when available."""

    name = "fuel"
    category = "sensor"
    requires_sensors = ["has_fuel_sensor"]
    requires_config = ["FILL_THRESHOLD", "THEFT_THRESHOLD"]

    def applies_to(self, tracker: Optional[Dict], config: Dict[str, str]) -> bool:
        if tracker and not tracker.get("has_fuel_sensor", False):
            return False
        return True

    async def calculate(self, ctx: CalculatorContext) -> CalculatorResult:
        record = ctx.record
        prev = ctx.previous_state
        config = ctx.config
        fuel = record.get("fuel")
        if fuel is None:
            return CalculatorResult()
        try:
            fuel = float(fuel)
        except (TypeError, ValueError):
            return CalculatorResult()
        prev_fuel = prev.get("prev_fuel_level")
        if prev_fuel is not None:
            try:
                prev_fuel = float(prev_fuel)
            except (TypeError, ValueError):
                prev_fuel = None
        fill_threshold = float(config.get("FILL_THRESHOLD", "5"))
        theft_threshold = float(config.get("THEFT_THRESHOLD", "5"))
        gps_time = ctx.gps_time
        lat = record.get("latitude")
        lon = record.get("longitude")
        state_updates = {"prev_fuel_level": fuel}
        events = []

        # Phase 3: calibration integration — raw -> liters for metadata (consumption reporting)
        fuel_liters: Optional[float] = None
        prev_liters: Optional[float] = None
        vehicle_id = getattr(ctx, "vehicle_id", None)
        if vehicle_id is not None:
            try:
                from ...db import get_fuel_liters_from_calibration
                fuel_liters = await get_fuel_liters_from_calibration(vehicle_id, fuel)
                if prev_fuel is not None:
                    prev_liters = await get_fuel_liters_from_calibration(vehicle_id, prev_fuel)
            except Exception as e:
                logger.debug("calibration lookup failed: %s", e)

        def _metadata() -> Dict[str, Any]:
            m: Dict[str, Any] = {}
            if fuel_liters is not None:
                m["fuel_liters"] = round(fuel_liters, 4)
            return m

        if prev_fuel is not None:
            delta = fuel - prev_fuel
            if delta >= fill_threshold:
                ev: Dict[str, Any] = {
                    "imei": ctx.imei,
                    "gps_time": gps_time,
                    "event_category": EVENT_CATEGORY_FUEL,
                    "event_type": EVENT_TYPE_FUEL_FILL,
                    "event_value": delta,
                    "threshold_value": fill_threshold,
                    "severity": "Low",
                    "latitude": float(lat) if lat is not None else None,
                    "longitude": float(lon) if lon is not None else None,
                }
                meta = _metadata()
                if prev_liters is not None and fuel_liters is not None:
                    meta["delta_liters"] = round(fuel_liters - prev_liters, 4)
                if meta:
                    ev["metadata"] = meta
                events.append(ev)
            elif delta <= -theft_threshold:
                ev = {
                    "imei": ctx.imei,
                    "gps_time": gps_time,
                    "event_category": EVENT_CATEGORY_FUEL,
                    "event_type": EVENT_TYPE_FUEL_THEFT,
                    "event_value": -delta,
                    "threshold_value": theft_threshold,
                    "severity": "High",
                    "latitude": float(lat) if lat is not None else None,
                    "longitude": float(lon) if lon is not None else None,
                }
                meta = _metadata()
                if prev_liters is not None and fuel_liters is not None:
                    meta["delta_liters"] = round(prev_liters - fuel_liters, 4)
                if meta:
                    ev["metadata"] = meta
                events.append(ev)
        return CalculatorResult(state_updates=state_updates, events=events)
