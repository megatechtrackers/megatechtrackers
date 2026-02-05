"""
Calculator registry: discover and run applicable calculators (plan § 7.4).
Auto-discovers BaseCalculator subclasses in calculators subpackages (core, sensor, violations, trip, geofence).
"""
import importlib
import logging
import pkgutil
import time
from typing import Any, Dict, List, Optional, Type

from .base import BaseCalculator, CalculatorContext, CalculatorResult

logger = logging.getLogger(__name__)

_registry: List[BaseCalculator] = []


def register(calc: BaseCalculator) -> None:
    _registry.append(calc)


def get_all() -> List[BaseCalculator]:
    return list(_registry)


def get_applicable_calculators(
    imei: int,
    tracker: Optional[Dict[str, Any]],
    config: Dict[str, str],
    category_filter: Optional[str] = None,
) -> List[BaseCalculator]:
    """Return calculators that apply to this tracker and have config."""
    applicable = []
    for calc in _registry:
        if category_filter and calc.category != category_filter:
            continue
        if calc.applies_to(tracker, config):
            applicable.append(calc)
    return applicable


async def run_calculators(
    calculators: List[BaseCalculator],
    ctx: CalculatorContext,
) -> CalculatorResult:
    """Run calculators in order; merge state updates and events. One failure skips that calc only. Plan § 9.3: tag events with formula_version."""
    try:
        from metrics import (
            metric_engine_calculator_errors_total,
            metric_engine_calculator_invocations_total,
            metric_engine_calculator_duration_seconds,
            metric_engine_calculator_events_emitted_total,
        )
    except Exception:
        metric_engine_calculator_errors_total = None
        metric_engine_calculator_invocations_total = None
        metric_engine_calculator_duration_seconds = None
        metric_engine_calculator_events_emitted_total = None

    merged = CalculatorResult()
    for calc in calculators:
        try:
            if metric_engine_calculator_invocations_total is not None:
                metric_engine_calculator_invocations_total.labels(calculator=calc.name).inc()
            t0 = time.perf_counter()
            result = await calc.calculate(ctx)
            duration = time.perf_counter() - t0
            if metric_engine_calculator_duration_seconds is not None:
                metric_engine_calculator_duration_seconds.labels(calculator=calc.name).observe(duration)
            if metric_engine_calculator_events_emitted_total is not None and result.events:
                metric_engine_calculator_events_emitted_total.labels(calculator=calc.name).inc(len(result.events))
            version = getattr(calc, "formula_version", "1.0.0")
            for ev in result.events:
                ev.setdefault("formula_version", version)
            merged.merge(result)
        except Exception as e:
            logger.warning("Calculator %s failed: %s", calc.name, e, exc_info=True)
            if metric_engine_calculator_errors_total is not None:
                try:
                    metric_engine_calculator_errors_total.labels(calculator=calc.name).inc()
                except Exception:
                    pass
    return merged


def _discover_calculator_classes() -> List[Type[BaseCalculator]]:
    """Discover BaseCalculator subclasses in engine.calculators subpackages (plan § 7.4)."""
    found: List[Type[BaseCalculator]] = []
    try:
        pkg = importlib.import_module("engine.calculators")
    except Exception:
        pkg = importlib.import_module(".calculators", package="engine")
    for importer, modname, ispkg in pkgutil.walk_packages(path=getattr(pkg, "__path__", []), prefix=pkg.__name__ + "."):
        if not modname.startswith(pkg.__name__ + "."):
            continue
        subname = modname[len(pkg.__name__) + 1 :]
        if subname.split(".")[-1] in ("base", "registry", "__init__"):
            continue
        try:
            mod = importlib.import_module(modname)
        except Exception as e:
            logger.debug("Skipping calculator module %s: %s", modname, e)
            continue
        for attr_name in dir(mod):
            if attr_name.startswith("_"):
                continue
            try:
                obj = getattr(mod, attr_name)
                if (
                    isinstance(obj, type)
                    and issubclass(obj, BaseCalculator)
                    and obj is not BaseCalculator
                ):
                    found.append(obj)
            except Exception:
                continue
    return found


def register_all() -> None:
    """Discover and register all calculator classes from calculators subpackages (plan § 7.4 auto-discovery)."""
    seen: set = set()
    for cls in _discover_calculator_classes():
        if cls in seen:
            continue
        seen.add(cls)
        try:
            calc = cls()
            register(calc)
            logger.debug("Registered calculator: %s", getattr(calc, "name", cls.__name__))
        except Exception as e:
            logger.warning("Failed to instantiate calculator %s: %s", cls.__name__, e)
    if not _registry:
        logger.warning("No calculators discovered; falling back to explicit imports")
        _register_fallback()
    else:
        logger.info("Registered %d calculators (auto-discovered)", len(_registry))


def _register_fallback() -> None:
    """Fallback: explicit imports if discovery finds nothing (e.g. running from different cwd)."""
    from .core import VehicleStateCalculator, DistanceCalculator, SpeedCalculator, DurationCalculator
    from .violations import (
        SpeedViolationCalculator,
        IdleViolationCalculator,
        SeatbeltViolationCalculator,
        HarshViolationCalculator,
        DrivingTimeViolationCalculator,
    )
    from .sensor import TemperatureCalculator, FuelCalculator, HumidityCalculator
    from .trip import (
        IgnitionTripCalculator,
        StoppageCalculator,
        FenceWiseTripCalculator,
        RoundTripCalculator,
        RouteTripCalculator,
    )
    from .geofence import FenceCalculator
    for calc in [
        VehicleStateCalculator(),
        DistanceCalculator(),
        SpeedCalculator(),
        DurationCalculator(),
        SpeedViolationCalculator(),
        IdleViolationCalculator(),
        SeatbeltViolationCalculator(),
        HarshViolationCalculator(),
        DrivingTimeViolationCalculator(),
        TemperatureCalculator(),
        FuelCalculator(),
        HumidityCalculator(),
        IgnitionTripCalculator(),
        StoppageCalculator(),
        FenceWiseTripCalculator(),
        RoundTripCalculator(),
        RouteTripCalculator(),
        FenceCalculator(),
    ]:
        register(calc)
    logger.info("Registered %d calculators (fallback)", len(_registry))
