"""
Soft fence calculator (plan § 5): PostGIS containment, fence entry/exit -> metric_events.
Requires fence table with polygon (geometry). Updates current_fence_ids in laststatus.
"""
import logging
from typing import Any, Dict, List, Optional, Set

from ..base import BaseCalculator, CalculatorContext, CalculatorResult

logger = logging.getLogger(__name__)


async def _get_fences_for_imei(imei: int) -> List[Dict[str, Any]]:
    """Load active fences for client (via tracker -> vehicle -> client_id), with buffer_distance for hysteresis."""
    try:
        from engine.db import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT f.fence_id, COALESCE(f.buffer_distance, 50) AS buffer_distance
                FROM fence f
                JOIN vehicle v ON v.client_id = f.client_id
                JOIN tracker t ON t.vehicle_id = v.vehicle_id
                WHERE t.imei = $1 AND f.polygon IS NOT NULL
                """,
                imei,
            )
            return [dict(r) for r in rows]
    except Exception as e:
        logger.debug("_get_fences_for_imei failed: %s", e)
        return []


async def _point_in_fence_with_hysteresis(
    conn, fence_id: int, lat: float, lon: float, buffer_m: int, was_inside: bool
) -> bool:
    """Inside = ST_Contains(polygon, point) OR (was_inside AND within buffer_m of boundary)."""
    try:
        row = await conn.fetchrow(
            """
            SELECT
                ST_Contains(polygon, ST_SetSRID(ST_MakePoint($1, $2), 4326)) AS inside,
                ($4 AND ST_DWithin(ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, polygon::geography, $3)) AS in_buffer
            FROM fence WHERE fence_id = $5
            """,
            lon,
            lat,
            buffer_m,
            was_inside,
            fence_id,
        )
        if not row:
            return False
        return row["inside"] or (row["in_buffer"] or False)
    except Exception as e:
        logger.debug("_point_in_fence_with_hysteresis failed: %s", e)
        return False


class FenceCalculator(BaseCalculator):
    """Fence entry/exit: update current_fence_ids, emit Fence_Enter/Fence_Exit events."""

    name = "fence"
    category = "geofence"
    requires_config = []

    async def calculate(self, ctx: CalculatorContext) -> CalculatorResult:
        record = ctx.record
        prev = ctx.previous_state
        lat = record.get("latitude")
        lon = record.get("longitude")
        if lat is None or lon is None:
            return CalculatorResult()
        try:
            lat, lon = float(lat), float(lon)
        except (TypeError, ValueError):
            return CalculatorResult()
        prev_fence_ids = prev.get("current_fence_ids") or []
        if isinstance(prev_fence_ids, str):
            prev_fence_ids = []
        prev_set = set(prev_fence_ids) if isinstance(prev_fence_ids, (list, tuple)) else set()
        fences = await _get_fences_for_imei(ctx.imei)
        if not fences:
            return CalculatorResult()
        try:
            from engine.db import get_pool
            pool = await get_pool()
            async with pool.acquire() as conn:
                inside_now = set()
                for f in fences:
                    fid = f.get("fence_id")
                    if fid is None:
                        continue
                    buffer_m = int(f.get("buffer_distance") or 50)
                    was_inside = fid in prev_set
                    if await _point_in_fence_with_hysteresis(conn, fid, lat, lon, buffer_m, was_inside):
                        inside_now.add(fid)
                entered = inside_now - prev_set
                exited = prev_set - inside_now
                state_updates = {"current_fence_ids": list(inside_now) if inside_now else None}
                events = []
                gps_time = ctx.gps_time
                for fid in entered:
                    events.append({
                        "imei": ctx.imei,
                        "gps_time": gps_time,
                        "event_category": "Fence",
                        "event_type": "Fence_Enter",
                        "fence_id": fid,
                        "latitude": lat,
                        "longitude": lon,
                    })
                for fid in exited:
                    events.append({
                        "imei": ctx.imei,
                        "gps_time": gps_time,
                        "event_category": "Fence",
                        "event_type": "Fence_Exit",
                        "fence_id": fid,
                        "latitude": lat,
                        "longitude": lon,
                    })
                return CalculatorResult(state_updates=state_updates, events=events)
        except Exception as e:
            logger.warning("FenceCalculator failed: %s", e)
            return CalculatorResult()
