"""
Location reference lookup service using PostGIS
Finds nearest location reference and calculates distance for GPS coordinates
"""
import logging
from typing import Optional, Dict, Any
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .sqlalchemy_base import get_session

logger = logging.getLogger(__name__)


async def find_nearest_location_reference(
    latitude: float,
    longitude: float,
    max_distance_km: Optional[float] = None 
) -> Optional[Dict[str, Any]]:
    """
    Find the nearest location reference using PostGIS KNN operator.
    
    Args:
        latitude: GPS latitude coordinate
        longitude: GPS longitude coordinate
        max_distance_km: Optional maximum distance in kilometers (if None, finds nearest regardless of distance)
        
    Returns:
        Dict with 'reference_id', 'distance' (in meters), and 'reference' (text), or None if not found
    """
    try:
        # Validate coordinates
        if latitude == 0.0 and longitude == 0.0:
            return None
        
        if not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
            logger.warning(f"Invalid GPS coordinates: lat={latitude}, lon={longitude}")
            return None
        
        async with get_session() as session:
            # Create point geometry for the GPS coordinate using parameters
            # PostGIS uses (longitude, latitude) order, SRID 4326 (WGS84)
            # Use ST_SetSRID(ST_MakePoint(:lon, :lat), 4326) with parameters to avoid SQL injection
            
            # Build query with KNN operator (<->) for nearest neighbor search
            if max_distance_km:
                # Filter by distance first, then find nearest
                max_distance_m = max_distance_km * 1000
                query = text("""
                    SELECT 
                        id as reference_id,
                        ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)) as distance,
                        reference
                    FROM location_reference
                    WHERE geom IS NOT NULL
                        AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326), :max_distance)
                    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)
                    LIMIT 1
                """)
                result = await session.execute(query, {
                    "longitude": longitude,
                    "latitude": latitude,
                    "max_distance": max_distance_m
                })
            else:
                # Find nearest regardless of distance
                query = text("""
                    SELECT 
                        id as reference_id,
                        ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)) as distance,
                        reference
                    FROM location_reference
                    WHERE geom IS NOT NULL
                    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)
                    LIMIT 1
                """)
                result = await session.execute(query, {
                    "longitude": longitude,
                    "latitude": latitude
                })
            
            row = result.fetchone()
            
            if row:
                return {
                    'reference_id': row.reference_id,
                    'distance': row.distance,  # Distance in meters
                    'reference': row.reference
                }
            else:
                return None
                
    except Exception as e:
        # Check if this is a connection error (pgbouncer cannot connect, etc.)
        error_str = str(e).lower()
        is_connection_error = (
            "pgbouncer cannot connect" in error_str or
            "connection" in error_str or
            "cannot connect" in error_str or
            "connection refused" in error_str or
            "connection timeout" in error_str
        )
        
        # Check for asyncpg exceptions
        try:
            import asyncpg
            if isinstance(e, (asyncpg.exceptions.ProtocolViolationError,
                            asyncpg.exceptions.ConnectionDoesNotExistError,
                            asyncpg.exceptions.InvalidPasswordError,
                            asyncpg.exceptions.InvalidCatalogNameError)):
                is_connection_error = True
        except (ImportError, AttributeError):
            pass
        
        if is_connection_error:
            # Connection errors are expected - don't log full traceback
            logger.debug(f"Error finding nearest location reference (connection error): lat={latitude}, lon={longitude}, error={e}")
        else:
            # Other errors (query issues, etc.) - log with traceback
            logger.warning(
                f"Error finding nearest location reference: lat={latitude}, lon={longitude}, error={e}",
                exc_info=True
            )
        return None


async def find_nearest_location_reference_cached(
    latitude: float,
    longitude: float,
    cache: Optional[Dict] = None,
    max_distance_km: Optional[float] = None
) -> Optional[Dict[str, Any]]:
    """
    Find nearest location reference with optional caching support.
    Cache structure: {(lat, lon): result_dict}
    
    Args:
        latitude: GPS latitude coordinate
        longitude: GPS longitude coordinate
        cache: Optional cache dictionary to store results
        max_distance_km: Optional maximum distance in kilometers
        
    Returns:
        Dict with 'reference_id', 'distance', and 'reference', or None if not found
    """
    # Check cache first if provided
    if cache is not None:
        cache_key = (round(latitude, 6), round(longitude, 6))  # Round to ~10cm precision
        if cache_key in cache:
            return cache[cache_key]
    
    # Query database
    result = await find_nearest_location_reference(latitude, longitude, max_distance_km)
    
    # Store in cache if provided
    if cache is not None and result:
        cache_key = (round(latitude, 6), round(longitude, 6))
        cache[cache_key] = result
    
    return result
