"""
Config resolution: tracker_config → client_config → system_config (system default).
Resolution order: per IMEI override → client config → system default → emergency default.
Plan § 2.6: cache config (refresh every 5 min). Batch resolution to avoid N+1 queries.
Plan § 2.5B: config key set derived from DB (system_config); fallback to CONFIG_KEYS when DB unavailable.
"""
import asyncio
import logging
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Plan § 2.6: config cache TTL 5 minutes
CONFIG_CACHE_TTL_SEC = 300
_config_cache: Dict[int, tuple] = {}  # imei -> (config_dict, timestamp)
_config_cache_lock = asyncio.Lock()

# Plan § 2.5B: key list cache (loaded from system_config; refreshed every CONFIG_CACHE_TTL_SEC)
_config_keys_list: Optional[List[str]] = None
_config_keys_timestamp: float = 0.0
_config_keys_lock = asyncio.Lock()

# Plan § 2.5B: fallback when DB unavailable or system_config empty
CONFIG_KEYS: List[str] = [
    "SPEED_LIMIT_CITY", "SPEED_LIMIT_HIGHWAY", "SPEED_LIMIT_MOTORWAY",
    "MIN_DURATION_SPEED", "IDLE_THRESHOLD", "NR_THRESHOLD", "IDLE_MAX",
    "MAX_SPEED_FILTER", "TEMP_MIN", "TEMP_MAX", "FILL_THRESHOLD", "THEFT_THRESHOLD",
    "HUMIDITY_MIN", "HUMIDITY_MAX", "SENSOR_DURATION_THRESHOLD",
    "SEATBELT_SPEED_THRESHOLD", "SEATBELT_MIN_DURATION", "SEATBELT_MIN_DISTANCE", "SEATBELT_DELAY_THRESHOLD",
    "HARSH_SPEED_DROP_THRESHOLD", "HARSH_SPEED_INCREASE_THRESHOLD", "HARSH_TIME_WINDOW", "HARSH_HEADING_THRESHOLD",
    "MAX_DRIVING_HOURS", "MAX_DRIVING_DISTANCE", "REST_DURATION", "MIN_REST_DURATION",
    "NIGHT_START", "NIGHT_END", "LATE_NIGHT_START", "LATE_NIGHT_END",
    "STOP_THRESHOLD", "UNUSUAL_STOPPAGE_THRESHOLD", "STOP_COUNT_THRESHOLD",
    "TIME_COMPLIANCE_THRESHOLD", "TRIP_END_DELAY",
    "DEVIATION_THRESHOLD", "ENTRY_THRESHOLD", "WAYPOINT_RADIUS",
]

# Hardcoded safety net when config is missing at all levels (plan § 2.6, Appendix B)
EMERGENCY_DEFAULTS = {
    # Speed (plan § 2.6)
    "SPEED_LIMIT_CITY": "80",
    "SPEED_LIMIT_HIGHWAY": "120",
    "SPEED_LIMIT_MOTORWAY": "120",
    "MIN_DURATION_SPEED": "30",
    "MAX_SPEED_FILTER": "200",
    # Duration / idle
    "IDLE_THRESHOLD": "300",
    "NR_THRESHOLD": "86400",
    "CAMERA_NR_THRESHOLD": "86400",
    "IDLE_MAX": "3600",
    # Seatbelt (Appendix B)
    "SEATBELT_SPEED_THRESHOLD": "20",
    "SEATBELT_MIN_DURATION": "5",
    "SEATBELT_MIN_DISTANCE": "0.1",
    "SEATBELT_DELAY_THRESHOLD": "10",
    # Harsh driving
    "HARSH_SPEED_DROP_THRESHOLD": "25",
    "HARSH_SPEED_INCREASE_THRESHOLD": "15",
    "HARSH_TIME_WINDOW": "5",
    "HARSH_HEADING_THRESHOLD": "45",
    # Sensors
    "TEMP_MIN": "-30",
    "TEMP_MAX": "30",
    "HUMIDITY_MIN": "0",
    "HUMIDITY_MAX": "100",
    "SENSOR_DURATION_THRESHOLD": "300",
    "FILL_THRESHOLD": "20",
    "THEFT_THRESHOLD": "15",
    # Stoppage
    "UNUSUAL_STOPPAGE_THRESHOLD": "1800",
    "STOP_COUNT_THRESHOLD": "10",
    "STOP_THRESHOLD": "60",
    # Driving (continuous / rest)
    "MAX_DRIVING_HOURS": "9",
    "MAX_DRIVING_DISTANCE": "800",
    "REST_DURATION": "45",
    "MIN_REST_DURATION": "30",
    # Night
    "NIGHT_START": "22:00",
    "NIGHT_END": "05:00",
    "LATE_NIGHT_START": "00:00",
    "LATE_NIGHT_END": "05:00",
    # Route
    "DEVIATION_THRESHOLD": "500",
    "ENTRY_THRESHOLD": "100",
    "WAYPOINT_RADIUS": "50",
    # Trip / compliance
    "TIME_COMPLIANCE_THRESHOLD": "900",
    "TRIP_END_DELAY": "300",
}


class ConfigNotFoundError(Exception):
    """Raised when config_key is not found at any level (optional; we fall back to emergency default)."""
    pass


async def _load_config_keys_from_db(pool) -> List[str]:
    """Load distinct config_key from system_config. Plan § 2.5B. Returns CONFIG_KEYS on failure or empty table."""
    if pool is None:
        return list(CONFIG_KEYS)
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT DISTINCT config_key FROM system_config ORDER BY config_key"
            )
            keys = [r["config_key"] for r in rows]
            if not keys:
                logger.debug("system_config has no keys; using built-in CONFIG_KEYS")
                return list(CONFIG_KEYS)
            return keys
    except Exception as e:
        logger.warning("Failed to load config keys from DB: %s; using built-in list", e)
        return list(CONFIG_KEYS)


async def get_config_keys_cached(pool) -> List[str]:
    """
    Return the list of config keys to resolve. Plan § 2.5B: from DB (system_config) with TTL cache;
    fallback to CONFIG_KEYS when DB unavailable or empty.
    """
    global _config_keys_list, _config_keys_timestamp
    now = time.monotonic()
    async with _config_keys_lock:
        if _config_keys_list is not None and (now - _config_keys_timestamp) < CONFIG_CACHE_TTL_SEC:
            return list(_config_keys_list)
    keys = await _load_config_keys_from_db(pool)
    async with _config_keys_lock:
        _config_keys_list = keys
        _config_keys_timestamp = time.monotonic()
    return keys


async def get_config(imei: int, config_key: str, pool=None) -> str:
    """
    Resolve config value for a tracker.
    Order: tracker_config (imei) → client_config (client_id from tracker→vehicle) → system_config → EMERGENCY_DEFAULTS.

    Args:
        imei: Device IMEI.
        config_key: Config key (e.g. SPEED_LIMIT_CITY, IDLE_THRESHOLD).
        pool: AsyncPG connection pool (optional). If None, returns emergency default.

    Returns:
        config_value as string. Never raises; uses emergency default if DB unavailable or key missing.
    """
    if pool is None:
        val = EMERGENCY_DEFAULTS.get(config_key)
        if val is not None:
            logger.debug("No DB pool; using emergency default for %s: %s", config_key, val)
            return val
        logger.warning("Config %s not found and no emergency default; using empty string", config_key)
        return ""

    try:
        async with pool.acquire() as conn:
            # 1. tracker_config (per IMEI)
            row = await conn.fetchrow(
                "SELECT config_value FROM tracker_config WHERE imei = $1 AND config_key = $2",
                imei,
                config_key,
            )
            if row is not None:
                return row["config_value"]

            # 2. client_config (resolve client_id via tracker → vehicle)
            client_row = await conn.fetchrow(
                """
                SELECT v.client_id
                FROM tracker t
                JOIN vehicle v ON v.vehicle_id = t.vehicle_id
                WHERE t.imei = $1
                """,
                imei,
            )
            if client_row is not None:
                client_id = client_row["client_id"]
                row = await conn.fetchrow(
                    "SELECT config_value FROM client_config WHERE client_id = $1 AND config_key = $2",
                    client_id,
                    config_key,
                )
                if row is not None:
                    return row["config_value"]

            # 3. system_config (system default)
            row = await conn.fetchrow(
                "SELECT config_value FROM system_config WHERE config_key = $1",
                config_key,
            )
            if row is not None:
                return row["config_value"]
    except Exception as e:
        logger.warning("Config resolution failed for imei=%s config_key=%s: %s", imei, config_key, e)

    # 4. Emergency default
    val = EMERGENCY_DEFAULTS.get(config_key)
    if val is not None:
        logger.debug("Using emergency default for %s: %s", config_key, val)
        return val
    logger.warning("Config %s not found at any level; no emergency default", config_key)
    return ""


async def get_config_bulk(imei: int, keys: Optional[List[str]] = None, pool=None) -> Dict[str, str]:
    """
    Resolve all config keys for one IMEI in a few queries (tracker_config, client_config, system_config).
    Returns dict key -> value; missing keys get emergency default or empty string.
    Plan § 2.5B: when keys is None, uses key set from DB (get_config_keys_cached); fallback to CONFIG_KEYS.
    """
    if keys is None:
        keys = await get_config_keys_cached(pool)
    else:
        keys = list(keys)
    # Start with emergency defaults; overlay system → client → tracker (tracker wins)
    out = {k: EMERGENCY_DEFAULTS.get(k, "") for k in keys}
    if pool is None:
        return out
    try:
        async with pool.acquire() as conn:
            # 1. client_id once (tracker → vehicle)
            client_row = await conn.fetchrow(
                """
                SELECT v.client_id
                FROM tracker t
                JOIN vehicle v ON v.vehicle_id = t.vehicle_id
                WHERE t.imei = $1
                """,
                imei,
            )
            client_id = client_row["client_id"] if client_row else None

            # 2. system_config (baseline over emergency)
            rows_sc = await conn.fetch(
                "SELECT config_key, config_value FROM system_config WHERE config_key = ANY($1::text[])",
                keys,
            )
            for r in rows_sc:
                out[r["config_key"]] = r["config_value"]

            # 3. client_config (overrides system)
            if client_id is not None:
                rows_cc = await conn.fetch(
                    "SELECT config_key, config_value FROM client_config WHERE client_id = $1 AND config_key = ANY($2::text[])",
                    client_id,
                    keys,
                )
                for r in rows_cc:
                    out[r["config_key"]] = r["config_value"]

            # 4. tracker_config (highest priority)
            rows_tc = await conn.fetch(
                "SELECT config_key, config_value FROM tracker_config WHERE imei = $1 AND config_key = ANY($2::text[])",
                imei,
                keys,
            )
            for r in rows_tc:
                out[r["config_key"]] = r["config_value"]

            # 5. Any key still empty gets emergency default
            for k in keys:
                if out.get(k) == "" and k in EMERGENCY_DEFAULTS:
                    out[k] = EMERGENCY_DEFAULTS[k]
    except Exception as e:
        logger.warning("get_config_bulk failed for imei=%s: %s", imei, e)
    return out


async def get_config_cached(imei: int) -> Dict[str, str]:
    """
    Resolve config for imei with in-memory cache (plan § 2.6: refresh every 5 min).
    Uses get_config_bulk for batch resolution.
    """
    now = time.monotonic()
    async with _config_cache_lock:
        entry = _config_cache.get(imei)
        if entry is not None:
            cfg, ts = entry
            if now - ts < CONFIG_CACHE_TTL_SEC:
                return dict(cfg)
    pool = None
    try:
        from .db import get_pool
        pool = await get_pool()
    except Exception:
        pass  # use pool=None -> emergency defaults only
    cfg = await get_config_bulk(imei, None, pool)
    async with _config_cache_lock:
        _config_cache[imei] = (cfg, now)
    return cfg


def get_config_int(imei: int, config_key: str, value: str, default: int = 0) -> int:
    """Parse config value as int with fallback."""
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


def get_config_float(imei: int, config_key: str, value: str, default: float = 0.0) -> float:
    """Parse config value as float with fallback."""
    try:
        return float(value)
    except (ValueError, TypeError):
        return default
