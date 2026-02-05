"""
Speed calculator (METRICS_SPEC § 2). Current record speed; max filter.
No state/events for core speed; used by violation calculator.
"""
import logging
from ..base import BaseCalculator, CalculatorContext, CalculatorResult

logger = logging.getLogger(__name__)


class SpeedCalculator(BaseCalculator):
    """Speed metric; violation logic in violation calculator."""

    name = "speed"
    category = "core"
    requires_config = ["MAX_SPEED_FILTER"]

    async def calculate(self, ctx: CalculatorContext) -> CalculatorResult:
        return CalculatorResult()
