"""
Geocode cache: read/write reverse geocoding results (plan § 6.3 Group 8, METRIC_CATALOG).
Used for location labels in reports; optional integration with external reverse-geocode API.
"""
import logging
from typing import Any, Awaitable, Callable, Dict, Optional

logger = logging.getLogger(__name__)

# Default rounding precision: ~11 m (4 decimal places), or use 3 for ~111 m
DEFAULT_LAT_LON_PRECISION = 4


def _round_coord(coord: float, precision: int = DEFAULT_LAT_LON_PRECISION) -> float:
    """Round lat or lon for cache key."""
    if coord is None:
        return 0.0
    return round(float(coord), precision)


async def get_geocode(
    lat: float,
    lon: float,
    precision: int = DEFAULT_LAT_LON_PRECISION,
    pool=None,
) -> Optional[Dict[str, Any]]:
    """
    Look up cached reverse-geocode result for (lat, lon).
    Returns dict with city, address, country, cached_at or None if not found.
    """
    if pool is None:
        try:
            from .db import get_pool
            pool = await get_pool()
        except Exception as e:
            logger.debug("get_geocode: no pool: %s", e)
            return None
    lat_r = _round_coord(lat, precision)
    lon_r = _round_coord(lon, precision)
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT city, address, country, cached_at
                FROM geocode_cache
                WHERE lat_rounded = $1 AND lng_rounded = $2
                """,
                lat_r,
                lon_r,
            )
            if row is None:
                return None
            return {
                "city": row["city"],
                "address": row["address"],
                "country": row["country"],
                "cached_at": row["cached_at"],
            }
    except Exception as e:
        logger.debug("get_geocode failed: %s", e)
        return None


async def set_geocode(
    lat: float,
    lon: float,
    city: Optional[str] = None,
    address: Optional[str] = None,
    country: Optional[str] = None,
    precision: int = DEFAULT_LAT_LON_PRECISION,
    pool=None,
) -> None:
    """
    Upsert a reverse-geocode result into geocode_cache.
    Call after resolving (lat, lon) via external API.
    """
    if pool is None:
        try:
            from .db import get_pool
            pool = await get_pool()
        except Exception as e:
            logger.debug("set_geocode: no pool: %s", e)
            return
    lat_r = _round_coord(lat, precision)
    lon_r = _round_coord(lon, precision)
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO geocode_cache (lat_rounded, lng_rounded, city, address, country, cached_at)
                VALUES ($1, $2, $3, $4, $5, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
                ON CONFLICT (lat_rounded, lng_rounded)
                DO UPDATE SET city = EXCLUDED.city, address = EXCLUDED.address,
                              country = EXCLUDED.country, cached_at = EXCLUDED.cached_at
                """,
                lat_r,
                lon_r,
                city or None,
                address or None,
                country or None,
            )
    except Exception as e:
        logger.warning("set_geocode failed: %s", e)


async def get_or_fetch_geocode(
    lat: float,
    lon: float,
    fetch_callback: Callable[[float, float], Awaitable[Optional[Dict[str, Any]]]],
    precision: int = DEFAULT_LAT_LON_PRECISION,
    pool=None,
) -> Optional[Dict[str, Any]]:
    """
    Get reverse-geocode from cache; on miss, call fetch_callback(lat, lon) and cache the result.
    fetch_callback should return dict with city, address, country (or None on failure).
    Use for external reverse-geocode API integration.
    """
    cached = await get_geocode(lat, lon, precision=precision, pool=pool)
    if cached is not None:
        return cached
    try:
        result = await fetch_callback(lat, lon)
        if result and isinstance(result, dict):
            await set_geocode(
                lat,
                lon,
                city=result.get("city"),
                address=result.get("address"),
                country=result.get("country"),
                precision=precision,
                pool=pool,
            )
            return result
    except Exception as e:
        logger.warning("get_or_fetch_geocode fetch_callback failed: %s", e)
    return None
