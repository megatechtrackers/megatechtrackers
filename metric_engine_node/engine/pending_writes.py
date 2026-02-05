"""
Plan § 2.6 Scenario 3: When DB is down, queue metric results in memory (max 1000).
On success flush queue; when full drop oldest and log.
Plan § 1.2: flush also runs trip accumulation when distance_km and trip_id present.
"""
import asyncio
import logging
from collections import deque
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

MAX_PENDING = 1000
_pending: deque = deque(maxlen=MAX_PENDING)
_lock = asyncio.Lock()


async def push(
    imei: int,
    state_updates: Dict[str, Any],
    events: List[Dict[str, Any]],
    gps_time,
    distance_km: Optional[float] = None,
    trip_id: Optional[int] = None,
    insert_if_missing: Optional[Dict[str, Any]] = None,
) -> None:
    """Append one record's pending writes. If at capacity, drop oldest and log."""
    async with _lock:
        if len(_pending) >= MAX_PENDING:
            dropped = _pending.popleft()
            logger.warning(
                "Pending writes queue full (max=%s); dropped oldest imei=%s gps_time=%s",
                MAX_PENDING,
                dropped.get("imei"),
                dropped.get("gps_time"),
            )
        _pending.append({
            "imei": imei,
            "state_updates": dict(state_updates) if state_updates else {},
            "events": list(events) if events else [],
            "gps_time": gps_time,
            "distance_km": distance_km,
            "trip_id": trip_id,
            "insert_if_missing": dict(insert_if_missing) if insert_if_missing else None,
        })


# Plan § 5.1: drain up to this many items per flush for faster recovery
FLUSH_BATCH_SIZE = 100


async def flush(max_items: Optional[int] = None) -> None:
    """Drain pending writes (up to max_items per call): update_laststatus_state, update_trip_accumulation, insert_metric_events. Stop on first failure."""
    from .db import update_laststatus_state, insert_metric_events, update_trip_accumulation
    from .circuit_breaker import CircuitBreakerOpenError

    limit = max_items if max_items is not None else FLUSH_BATCH_SIZE
    processed = 0
    while processed < limit:
        async with _lock:
            if not _pending:
                return
            item = _pending.popleft()
        imei = item["imei"]
        state_updates = item["state_updates"]
        events = item["events"]
        gps_time = item["gps_time"]
        distance_km = item.get("distance_km")
        trip_id = item.get("trip_id")
        insert_if_missing = item.get("insert_if_missing")
        try:
            if state_updates:
                await update_laststatus_state(
                    imei, state_updates, gps_time=gps_time, insert_if_missing=insert_if_missing
                )
            if trip_id is not None and distance_km is not None and distance_km > 0:
                await update_trip_accumulation(trip_id, distance_km, gps_time)
            if events:
                await insert_metric_events(events)
            processed += 1
        except CircuitBreakerOpenError:
            async with _lock:
                _pending.appendleft(item)
            logger.debug("Flush stopped: circuit breaker open")
            return
        except Exception as e:
            logger.warning("Flush failed for imei=%s: %s; moving to end of queue so others can flush", imei, e)
            async with _lock:
                _pending.append(item)
            return


def size() -> int:
    return len(_pending)
