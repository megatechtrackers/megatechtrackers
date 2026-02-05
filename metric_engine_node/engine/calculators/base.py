"""
Calculator base class and context (plan § 7.3).
Context: current record, previous state, config, tracker capabilities.
"""
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class CalculatorContext:
    """Input for calculator: current record, previous state, config, scope."""

    imei: int
    record: Dict[str, Any]
    gps_time: datetime
    previous_state: Dict[str, Any]
    config: Dict[str, str]
    scope: str = "global"
    trip_id: Optional[int] = None
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None
    vehicle_id: Optional[int] = None  # from tracker; used e.g. for calibration lookup (Phase 3)


@dataclass
class CalculatorResult:
    """Output: state updates for laststatus, events for metric_events, stoppage log entries."""

    state_updates: Dict[str, Any] = field(default_factory=dict)
    events: List[Dict[str, Any]] = field(default_factory=list)
    stoppage_log_entries: List[Dict[str, Any]] = field(default_factory=list)

    def merge(self, other: "CalculatorResult") -> "CalculatorResult":
        self.state_updates.update(other.state_updates)
        self.events.extend(other.events)
        self.stoppage_log_entries.extend(other.stoppage_log_entries)
        return self


class BaseCalculator(ABC):
    """Base for all calculators. Category: core | sensor | violation | geofence | trip. Plan § 9.3: formula_version for backfill/versioning."""

    name: str = ""
    category: str = "core"
    requires_sensors: List[str] = []
    requires_config: List[str] = []
    trigger: str = "realtime"
    formula_version: str = "1.0.0"

    def applies_to(self, tracker: Optional[Dict], config: Dict[str, str]) -> bool:
        """Return True if this calculator should run for this tracker."""
        if not tracker:
            return True
        for cap in self.requires_sensors:
            if not tracker.get(cap, False):
                return False
        return True

    @abstractmethod
    async def calculate(self, ctx: CalculatorContext) -> CalculatorResult:
        """Compute and return state updates + events."""
        pass
