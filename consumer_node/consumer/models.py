"""
Database models for Megatechtrackers Fleet Tracking using SQLAlchemy 2.0 async Core
All operations use SQLAlchemy Core for optimal performance
"""
import asyncio
import socket
from sqlalchemy import Column, BigInteger, DateTime, Float, Integer, String, Text, Time, JSON, Boolean, func, text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB, insert as pg_insert
from typing import Dict, Any, Optional, List
from datetime import datetime, time, timezone
import json
import logging

from .sqlalchemy_base import Base, get_session, get_resilient_session, is_connection_error, record_failure, record_success
from sqlalchemy.ext.asyncio import AsyncSession
from .circuit_breaker import get_db_write_circuit_breaker, CircuitBreakerOpenError

logger = logging.getLogger(__name__)

# Constants for GPS validity
INVALID_GPS_LATITUDE = 0.0
INVALID_GPS_LONGITUDE = 0.0
IS_VALID_TRUE = 1
IS_VALID_FALSE = 0
DEFAULT_STATUS = 'Normal'


def _ensure_utc(dt: datetime) -> datetime:
    """Ensure datetime is timezone-aware UTC. Naive datetimes are treated as UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _to_naive_utc(dt: datetime) -> datetime:
    """
    Convert datetime to naive UTC for binding to TIMESTAMP WITHOUT TIME ZONE.
    AsyncPG rejects offset-aware datetimes for TIMESTAMP WITHOUT TIME ZONE columns.
    """
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def parse_datetime_field(record: Dict[str, Any], field: str, default: Optional[datetime] = None) -> datetime:
    """
    Parse datetime field from record dictionary with fallback handling.
    Returns UTC datetime. Naive datetimes from parser are treated as UTC.
    
    Args:
        record: Dictionary containing the field to parse
        field: Field name to extract from record
        default: Default datetime to use if parsing fails (defaults to datetime.now(timezone.utc))
        
    Returns:
        Parsed datetime object (UTC)
    """
    from dateutil import parser
    
    if default is None:
        default = datetime.now(timezone.utc)
    
    field_value = record.get(field, '')
    
    if isinstance(field_value, str):
        try:
            parsed = parser.parse(field_value)
            return _ensure_utc(parsed)
        except (ValueError, TypeError, AttributeError):
            return default
    elif isinstance(field_value, datetime):
        return _ensure_utc(field_value)
    else:
        return default


def _to_optional_float(v: Any) -> Optional[float]:
    """Coerce value to float for DB. Parser may send strings (e.g. '0.500'). Returns None for None/empty."""
    if v is None or v == '':
        return None
    if isinstance(v, float):
        return v
    if isinstance(v, int):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v.strip()) if v.strip() else None
        except (ValueError, TypeError):
            return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _to_optional_int(v: Any) -> Optional[int]:
    """Coerce value to int for DB. Parser may send strings. Returns None for None/empty."""
    if v is None or v == '':
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return int(v)
    if isinstance(v, str):
        try:
            return int(float(v.strip())) if v.strip() else None
        except (ValueError, TypeError):
            return None
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return None


def _parse_bool_field(record: Dict[str, Any], field: str) -> Optional[bool]:
    """Parse boolean field from record (supports bool, int 0/1, str true/false)."""
    val = record.get(field)
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    if isinstance(val, int):
        return bool(val)
    if isinstance(val, str):
        return val.lower() in ('true', '1', 'yes', 'on')
    return None


def parse_numeric_field(record: Dict[str, Any], field: str, field_type: type = float, default: Optional[Any] = None) -> Optional[Any]:
    """
    Parse numeric field from record dictionary with fallback handling.
    
    Args:
        record: Dictionary containing the field to parse
        field: Field name to extract from record
        field_type: Type to parse as (int or float)
        default: Default value to use if parsing fails (defaults to None)
        
    Returns:
        Parsed numeric value or None if parsing fails
    """
    field_value = record.get(field, '')
    
    # Return None if empty string or None
    if field_value == '' or field_value is None:
        return default
    
    # If already the correct type, return as-is
    if isinstance(field_value, field_type):
        return field_value
    
    # Try to parse from string
    if isinstance(field_value, str):
        # Remove whitespace
        field_value = field_value.strip()
        if field_value == '':
            return default
        try:
            if field_type == int:
                return int(float(field_value))  # Convert via float first to handle "12.0" -> 12
            else:
                return float(field_value)
        except (ValueError, TypeError):
            return default
    
    # Try to convert other numeric types
    try:
        if field_type == int:
            return int(field_value)
        else:
            return float(field_value)
    except (ValueError, TypeError):
        return default


class TrackData(Base):
    """Main tracking data table with composite primary key (imei, gps_time)"""
    __tablename__ = "trackdata"
    
    # Composite primary key
    imei: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    gps_time: Mapped[datetime] = mapped_column(DateTime, primary_key=True)
    
    # Other fields
    server_time: Mapped[datetime] = mapped_column(DateTime)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    altitude: Mapped[int] = mapped_column(Integer, default=0)
    angle: Mapped[int] = mapped_column(Integer, default=0)
    satellites: Mapped[int] = mapped_column(Integer, default=0)
    speed: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(100), default='Normal')
    vendor: Mapped[str] = mapped_column(String(50), default='teltonika')
    ignition: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    driver_seatbelt: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    passenger_seatbelt: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    door_status: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    passenger_seat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    main_battery: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    battery_voltage: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fuel: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dallas_temperature_1: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dallas_temperature_2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dallas_temperature_3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dallas_temperature_4: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ble_humidity_1: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ble_humidity_2: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ble_humidity_3: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ble_humidity_4: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ble_temperature_1: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ble_temperature_2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ble_temperature_3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ble_temperature_4: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    green_driving_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dynamic_io: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_valid: Mapped[int] = mapped_column(Integer, default=1)
    reference_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    distance: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    @classmethod
    def _parse_record_data(cls, record: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Helper method to parse record data into imei, gps_time, and defaults dict.
        Returns None if record is invalid, otherwise returns dict with 'imei', 'gps_time', 'defaults'.
        """
        try:
            imei_str = record.get('imei', 'UNKNOWN')
            try:
                imei_int = int(imei_str) if imei_str != 'UNKNOWN' else 0
            except (ValueError, TypeError):
                logger.warning(f"Invalid IMEI format in record: {imei_str}")
                return None

            # Parse datetime fields using shared utility
            server_time = parse_datetime_field(record, 'server_time')
            gps_time = parse_datetime_field(record, 'gps_time', default=server_time)
            # Bind naive UTC for TIMESTAMP WITHOUT TIME ZONE (asyncpg rejects aware datetimes)
            server_time_naive = _to_naive_utc(server_time)
            gps_time_naive = _to_naive_utc(gps_time)

            # Parse dynamic_io
            dynamic_io = record.get('dynamic_io', '{}')
            if isinstance(dynamic_io, str):
                try:
                    dynamic_io = json.loads(dynamic_io)
                except (json.JSONDecodeError, TypeError, ValueError) as e:
                    logger.debug(f"Could not parse dynamic_io JSON, using empty dict: {e}")
                    dynamic_io = {}
            elif not isinstance(dynamic_io, dict):
                dynamic_io = {}

            defaults = {
                'server_time': server_time_naive,
                'latitude': record.get('latitude', 0.0),
                'longitude': record.get('longitude', 0.0),
                'altitude': record.get('altitude', 0),
                'angle': record.get('angle', 0),
                'satellites': record.get('satellites', 0),
                'speed': record.get('speed', 0),
                'status': record.get('status', DEFAULT_STATUS),
                'vendor': record.get('vendor', 'teltonika'),
                'ignition': _parse_bool_field(record, 'ignition'),
                'driver_seatbelt': _parse_bool_field(record, 'driver_seatbelt'),
                'passenger_seatbelt': _parse_bool_field(record, 'passenger_seatbelt'),
                'door_status': _parse_bool_field(record, 'door_status'),
                'passenger_seat': parse_numeric_field(record, 'passenger_seat', float),
                'main_battery': parse_numeric_field(record, 'main_battery', float),
                'battery_voltage': parse_numeric_field(record, 'battery_voltage', float),
                'fuel': parse_numeric_field(record, 'fuel', float),
                'dallas_temperature_1': parse_numeric_field(record, 'dallas_temperature_1', float),
                'dallas_temperature_2': parse_numeric_field(record, 'dallas_temperature_2', float),
                'dallas_temperature_3': parse_numeric_field(record, 'dallas_temperature_3', float),
                'dallas_temperature_4': parse_numeric_field(record, 'dallas_temperature_4', float),
                'ble_humidity_1': parse_numeric_field(record, 'ble_humidity_1', int),
                'ble_humidity_2': parse_numeric_field(record, 'ble_humidity_2', int),
                'ble_humidity_3': parse_numeric_field(record, 'ble_humidity_3', int),
                'ble_humidity_4': parse_numeric_field(record, 'ble_humidity_4', int),
                'ble_temperature_1': parse_numeric_field(record, 'ble_temperature_1', float),
                'ble_temperature_2': parse_numeric_field(record, 'ble_temperature_2', float),
                'ble_temperature_3': parse_numeric_field(record, 'ble_temperature_3', float),
                'ble_temperature_4': parse_numeric_field(record, 'ble_temperature_4', float),
                'green_driving_value': parse_numeric_field(record, 'green_driving_value', float),
                'dynamic_io': dynamic_io,
                'is_valid': record.get('is_valid', IS_VALID_TRUE),
                'reference_id': parse_numeric_field(record, 'reference_id', int),
                'distance': parse_numeric_field(record, 'distance', float)
            }

            return {
                'imei': imei_int,
                'gps_time': gps_time_naive,
                'defaults': defaults
            }
        except Exception as e:
            imei_str = record.get('imei', 'UNKNOWN')
            logger.error(
                f"Error parsing record data: imei={imei_str}, "
                f"gps_time={record.get('gps_time', 'N/A')}, error={e}",
                exc_info=True
            )
            return None

    @classmethod
    async def create_from_record(cls, record: Dict[str, Any]) -> Optional['TrackData']:
        """
        Create or update TrackData instance from record dictionary using SQLAlchemy Core.
        Uses INSERT ... ON CONFLICT DO UPDATE for efficient upsert.
        """
        try:
            # Parse record data using helper method
            parsed = cls._parse_record_data(record)
            if parsed is None:
                return None

            imei_int = parsed['imei']
            gps_time = parsed['gps_time']
            defaults = parsed['defaults']

            # Build values dict for Core insert
            values = {
                'imei': imei_int,
                'gps_time': gps_time,
                **defaults
            }

            # Use PostgreSQL-specific insert with ON CONFLICT DO UPDATE
            table = cls.__table__
            async with get_session() as session:
                try:
                    stmt = pg_insert(table).values(values)
                    
                    update_dict = {
                        col.name: text(f'EXCLUDED.{col.name}')
                        for col in table.columns
                        if col.name not in ('imei', 'gps_time')
                    }
                    
                    stmt = stmt.on_conflict_do_update(
                        index_elements=['imei', 'gps_time'],
                        set_=update_dict
                    )
                    
                    await session.execute(stmt)
                    await session.commit()
                    
                    # Return minimal object for compatibility
                    class DummyTrackData:
                        def __init__(self):
                            self.imei = imei_int
                            self.gps_time = gps_time
                    
                    return DummyTrackData()
                except Exception as db_error:
                    await session.rollback()
                    raise db_error
                
        except Exception as e:
            imei_str = record.get('imei', 'UNKNOWN')
            logger.error(
                f"Error creating TrackData from record: imei={imei_str}, "
                f"gps_time={record.get('gps_time', 'N/A')}, error={e}",
                exc_info=True
            )
            return None

    @classmethod
    async def create_from_records_batch(
        cls, 
        records: List[Dict[str, Any]], 
        batch_size: int = 200  
    ) -> Dict[str, int]:
        """
        Process multiple records in batches using SQLAlchemy Core for optimal performance.
        Uses bulk INSERT ... ON CONFLICT DO UPDATE for efficient upserts.
        Protected by circuit breaker for fault tolerance.
        
        Args:
            records: List of record dictionaries to process
            batch_size: Number of records to process per batch
            
        Returns:
            Dict with 'success', 'failed' statistics
            
        Raises:
            CircuitBreakerOpenError: If circuit breaker is open
        """
        # Get circuit breaker for write operations
        circuit_breaker = get_db_write_circuit_breaker()
        
        # Wrap batch processing with circuit breaker
        async def _process_batch():
            stats = {
                'success': 0,
                'failed': 0
            }
            
            if not records:
                return stats

            # Get table reference for Core operations
            table = cls.__table__
            
            # Process records in batches
            for i in range(0, len(records), batch_size):
                batch = records[i:i + batch_size]
                batch_values = []
                
                # Parse all records in batch
                for record in batch:
                    try:
                        parsed = cls._parse_record_data(record)
                        if parsed is None:
                            stats['failed'] += 1
                            continue
                        
                        imei_int = parsed['imei']
                        gps_time = parsed['gps_time']
                        defaults = parsed['defaults']
                        
                        # Build values dict for Core insert
                        values = {
                            'imei': imei_int,
                            'gps_time': gps_time,
                            **defaults
                        }
                        batch_values.append(values)
                        
                    except Exception as e:
                        logger.warning(
                            f"Error parsing record in batch: imei={record.get('imei', 'UNKNOWN')}, error={e}"
                        )
                        stats['failed'] += 1
                
                # Bulk insert/update using Core with retry on connection errors
                if batch_values:
                    # IMPORTANT: Deduplicate records within batch to avoid
                    # "ON CONFLICT DO UPDATE command cannot affect row a second time"
                    seen_keys = {}
                    for values in batch_values:
                        key = (values['imei'], values['gps_time'])
                        seen_keys[key] = values  # Overwrites duplicates, keeping last
                    
                    deduplicated_values = list(seen_keys.values())
                    duplicates_removed = len(batch_values) - len(deduplicated_values)
                    
                    if duplicates_removed > 0:
                        logger.debug(f"Removed {duplicates_removed} duplicate records from batch (same imei+gps_time)")
                    
                    # Retry logic for transient connection errors
                    max_retries = 3
                    last_error = None
                    
                    for attempt in range(max_retries + 1):
                        try:
                            async with get_resilient_session() as session:
                                try:
                                    stmt = pg_insert(table).values(deduplicated_values)
                                    
                                    update_dict = {
                                        col.name: text(f'EXCLUDED.{col.name}')
                                        for col in table.columns
                                        if col.name not in ('imei', 'gps_time')
                                    }
                                    
                                    stmt = stmt.on_conflict_do_update(
                                        index_elements=['imei', 'gps_time'],
                                        set_=update_dict
                                    )
                                    
                                    await session.execute(stmt)
                                    await session.commit()
                                    
                                    stats['success'] += len(deduplicated_values)
                                    record_success()  # Track successful operation
                                    break  # Success - exit retry loop
                                except Exception as db_error:
                                    await session.rollback()
                                    raise db_error
                        except Exception as e:
                            last_error = e
                            
                            if is_connection_error(e):
                                record_failure()  # Track failure for engine reconnection
                                
                                if attempt < max_retries:
                                    delay = 1.0 * (2 ** attempt)  # Exponential backoff
                                    logger.warning(
                                        f"Database connection error in batch (attempt {attempt + 1}/{max_retries + 1}): {e}. "
                                        f"Retrying in {delay:.1f}s..."
                                    )
                                    await asyncio.sleep(delay)
                                    continue
                            
                            # Either not a connection error, or all retries exhausted
                            logger.error(f"Error processing batch: {e}", exc_info=True)
                            stats['failed'] += len(batch_values)
                            break

            return stats
        
        # Execute with circuit breaker protection
        return await circuit_breaker.call(_process_batch)


class Alarm(Base):
    """Alarms table with id and composite primary key (imei, gps_time)"""
    __tablename__ = "alarms"
    
    # Auto-increment ID for easy reference
    # Note: Cannot use unique=True with TimescaleDB hypertable (must include partitioning column)
    # id is still unique in practice due to auto-increment, but constraint is not enforced
    id: Mapped[int] = mapped_column(BigInteger, autoincrement=True)
    
    # Composite primary key (required for TimescaleDB)
    imei: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    gps_time: Mapped[datetime] = mapped_column(DateTime, primary_key=True)
    
    # Other fields
    server_time: Mapped[datetime] = mapped_column(DateTime)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    altitude: Mapped[int] = mapped_column(Integer, default=0)
    angle: Mapped[int] = mapped_column(Integer, default=0)
    satellites: Mapped[int] = mapped_column(Integer, default=0)
    speed: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(100), default='Normal')
    vendor: Mapped[str] = mapped_column(String(50), default='teltonika')
    photo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    video_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_sms: Mapped[int] = mapped_column(Integer, default=0)
    is_email: Mapped[int] = mapped_column(Integer, default=0)
    is_call: Mapped[int] = mapped_column(Integer, default=0)
    is_valid: Mapped[int] = mapped_column(Integer, default=1)
    reference_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    distance: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sms_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    sms_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    email_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    email_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    call_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    call_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    priority: Mapped[int] = mapped_column(Integer, default=5)  # 1=highest, 10=lowest
    state: Mapped[dict] = mapped_column(JSONB, default=dict)
    category: Mapped[str] = mapped_column(String(50), default='general')
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    @classmethod
    async def create_from_record(cls, record: Dict[str, Any]) -> Optional['Alarm']:
        """Create or update Alarm instance from record dictionary using SQLAlchemy Core"""
        try:
            imei_str = record.get('imei', 'UNKNOWN')
            try:
                imei_int = int(imei_str) if imei_str != 'UNKNOWN' else 0
            except (ValueError, TypeError):
                logger.warning(f"Invalid IMEI format in record: {imei_str}")
                return None

            # Parse datetime fields using shared utility
            server_time = parse_datetime_field(record, 'server_time')
            gps_time = parse_datetime_field(record, 'gps_time', default=server_time)
            # Bind naive UTC for TIMESTAMP WITHOUT TIME ZONE (asyncpg rejects aware datetimes)
            server_time_naive = _to_naive_utc(server_time)
            gps_time_naive = _to_naive_utc(gps_time)

            defaults = {
                'server_time': server_time_naive,
                'latitude': record.get('latitude', 0.0),
                'longitude': record.get('longitude', 0.0),
                'altitude': record.get('altitude', 0),
                'angle': record.get('angle', 0),
                'satellites': record.get('satellites', 0),
                'speed': record.get('speed', 0),
                'status': record.get('status', DEFAULT_STATUS),
                'vendor': record.get('vendor', 'teltonika'),
                'photo_url': record.get('photo_url'),
                'video_url': record.get('video_url'),
                'is_sms': record.get('is_sms', 0),
                'is_email': record.get('is_email', 0),
                'is_call': record.get('is_call', 0),
                'is_valid': record.get('is_valid', IS_VALID_TRUE),
                'reference_id': parse_numeric_field(record, 'reference_id', int),
                'distance': parse_numeric_field(record, 'distance', float)
            }

            # Build values dict for Core insert
            values = {
                'imei': imei_int,
                'gps_time': gps_time_naive,
                **defaults
            }

            # Use PostgreSQL-specific insert with ON CONFLICT DO UPDATE
            # Use resilient session with automatic retry on connection errors
            table = cls.__table__
            async with get_resilient_session(max_retries=3) as session:
                try:
                    stmt = pg_insert(table).values(values)
                    
                    # Exclude id (auto-generated), imei, gps_time, locking columns, and created_at from updates
                    update_dict = {
                        col.name: text(f'EXCLUDED.{col.name}')
                        for col in table.columns
                        if col.name not in ('id', 'imei', 'gps_time', 'created_at')
                    }
                    
                    stmt = stmt.on_conflict_do_update(
                        index_elements=['imei', 'gps_time'],
                        set_=update_dict
                    )
                    
                    # Use RETURNING to reliably get the alarm ID (works for both INSERT and UPDATE)
                    stmt = stmt.returning(table.c.id)
                    result = await session.execute(stmt)
                    await session.commit()
                    
                    # Get the inserted/updated alarm ID from RETURNING clause
                    row = result.fetchone()
                    alarm_id = row[0] if row else None
                    
                    # Publish to alarm_exchange for Alarm Service processing (non-blocking)
                    # Only send if we have a valid alarm_id (required by Alarm Service validation)
                    if alarm_id is not None:
                        try:
                            from .alarm_notifier import notify_alarm_saved
                            # Schedule notification in background (non-blocking, fire-and-forget)
                            asyncio.create_task(notify_alarm_saved(record, alarm_id))
                        except Exception as notify_error:
                            # Log but don't raise - notification is non-critical
                            logger.debug(f"Failed to schedule alarm notification (non-critical): {notify_error}")
                    else:
                        logger.warning(f"Alarm created but could not get ID for notification: imei={imei_int}")
                    
                    # Return minimal object for compatibility
                    class DummyAlarm:
                        def __init__(self, alarm_id):
                            self.id = alarm_id
                            self.imei = imei_int
                            self.gps_time = gps_time
                    
                    return DummyAlarm(alarm_id)
                except Exception as db_error:
                    await session.rollback()
                    raise db_error
                
        except Exception as e:
            imei_str = record.get('imei', 'UNKNOWN')
            logger.error(
                f"Error creating Alarm from record: imei={imei_str}, "
                f"gps_time={record.get('gps_time', 'N/A')}, error={e}",
                exc_info=True
            )
            return None


class Event(Base):
    """Events table with composite primary key (imei, gps_time)"""
    __tablename__ = "events"
    
    # Composite primary key
    imei: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    gps_time: Mapped[datetime] = mapped_column(DateTime, primary_key=True)
    
    # Other fields
    server_time: Mapped[datetime] = mapped_column(DateTime)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    altitude: Mapped[int] = mapped_column(Integer, default=0)
    angle: Mapped[int] = mapped_column(Integer, default=0)
    satellites: Mapped[int] = mapped_column(Integer, default=0)
    speed: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(100), default='Normal')
    vendor: Mapped[str] = mapped_column(String(50), default='teltonika')
    photo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    video_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_valid: Mapped[int] = mapped_column(Integer, default=1)
    reference_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    distance: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    @classmethod
    async def create_from_record(cls, record: Dict[str, Any]) -> Optional['Event']:
        """Create or update Event instance from record dictionary"""
        try:
            imei_str = record.get('imei', 'UNKNOWN')
            try:
                imei_int = int(imei_str) if imei_str != 'UNKNOWN' else 0
            except (ValueError, TypeError):
                logger.warning(f"Invalid IMEI format in record: {imei_str}")
                return None

            # Parse datetime fields using shared utility
            server_time = parse_datetime_field(record, 'server_time')
            gps_time = parse_datetime_field(record, 'gps_time', default=server_time)
            # Bind naive UTC for TIMESTAMP WITHOUT TIME ZONE (asyncpg rejects aware datetimes)
            server_time_naive = _to_naive_utc(server_time)
            gps_time_naive = _to_naive_utc(gps_time)

            defaults = {
                'server_time': server_time_naive,
                'latitude': record.get('latitude', 0.0),
                'longitude': record.get('longitude', 0.0),
                'altitude': record.get('altitude', 0),
                'angle': record.get('angle', 0),
                'satellites': record.get('satellites', 0),
                'speed': record.get('speed', 0),
                'status': record.get('status', DEFAULT_STATUS),
                'vendor': record.get('vendor', 'teltonika'),
                'photo_url': record.get('photo_url'),
                'video_url': record.get('video_url'),
                'is_valid': record.get('is_valid', IS_VALID_TRUE),
                'reference_id': parse_numeric_field(record, 'reference_id', int),
                'distance': parse_numeric_field(record, 'distance', float)
            }

            # Build values dict for Core insert
            values = {
                'imei': imei_int,
                'gps_time': gps_time_naive,
                **defaults
            }

            # Use PostgreSQL-specific insert with ON CONFLICT DO UPDATE
            table = cls.__table__
            async with get_session() as session:
                try:
                    stmt = pg_insert(table).values(values)
                    
                    update_dict = {
                        col.name: text(f'EXCLUDED.{col.name}')
                        for col in table.columns
                        if col.name not in ('imei', 'gps_time')
                    }
                    
                    stmt = stmt.on_conflict_do_update(
                        index_elements=['imei', 'gps_time'],
                        set_=update_dict
                    )
                    
                    await session.execute(stmt)
                    await session.commit()
                    
                    # Return minimal object for compatibility
                    class DummyEvent:
                        def __init__(self):
                            self.imei = imei_int
                            self.gps_time = gps_time_naive
                    
                    return DummyEvent()
                except Exception as db_error:
                    await session.rollback()
                    raise db_error
                
        except Exception as e:
            imei_str = record.get('imei', 'UNKNOWN')
            logger.error(
                f"Error creating Event from record: imei={imei_str}, "
                f"gps_time={record.get('gps_time', 'N/A')}, error={e}",
                exc_info=True
            )
            return None


class UnitIOMapping(Base):
    """Unit IO Mapping table"""
    __tablename__ = "unit_io_mapping"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    imei: Mapped[int] = mapped_column(BigInteger)
    io_id: Mapped[int] = mapped_column(Integer)
    io_multiplier: Mapped[float] = mapped_column(Float)
    io_type: Mapped[int] = mapped_column(Integer)
    io_name: Mapped[str] = mapped_column(String(255))
    value_name: Mapped[str] = mapped_column(String(255), default='')
    value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    target: Mapped[int] = mapped_column(Integer)
    column_name: Mapped[str] = mapped_column(String(255), default='')
    start_time: Mapped[time] = mapped_column(Time, default=time(0, 0, 0))
    end_time: Mapped[time] = mapped_column(Time, default=time(23, 59, 59))
    is_alarm: Mapped[int] = mapped_column(Integer, default=0)
    is_sms: Mapped[int] = mapped_column(Integer, default=0)
    is_email: Mapped[int] = mapped_column(Integer, default=0)
    is_call: Mapped[int] = mapped_column(Integer, default=0)
    createddate: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updateddate: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class LastStatus(Base):
    """laststatus table - stores latest status/position for each device.
    Consumer owns: position + trackdata mirror columns. Metric engine owns state columns only."""
    __tablename__ = "laststatus"

    imei: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    gps_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    server_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    altitude: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    angle: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    satellites: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    speed: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reference_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    distance: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    vendor: Mapped[str] = mapped_column(String(50), default='teltonika')
    # Consumer-owned trackdata mirror columns (do not update metric engine state columns)
    status: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ignition: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    driver_seatbelt: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    passenger_seatbelt: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    door_status: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    passenger_seat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    main_battery: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    battery_voltage: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fuel: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dallas_temperature_1: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dallas_temperature_2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dallas_temperature_3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dallas_temperature_4: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ble_temperature_1: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ble_temperature_2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ble_temperature_3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ble_temperature_4: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ble_humidity_1: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ble_humidity_2: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ble_humidity_3: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ble_humidity_4: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    green_driving_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dynamic_io: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    is_valid: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    updateddate: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    @classmethod
    async def upsert(
        cls,
        imei: int,
        gps_time: Optional[datetime],
        server_time: Optional[datetime],
        latitude: float,
        longitude: float,
        altitude: int,
        angle: int,
        satellites: int,
        speed: int,
        reference_id: Optional[int] = None,
        distance: Optional[float] = None,
        vendor: str = 'teltonika',
        status: Optional[str] = None,
        ignition: Optional[bool] = None,
        driver_seatbelt: Optional[bool] = None,
        passenger_seatbelt: Optional[bool] = None,
        door_status: Optional[bool] = None,
        passenger_seat: Optional[float] = None,
        main_battery: Optional[float] = None,
        battery_voltage: Optional[float] = None,
        fuel: Optional[float] = None,
        dallas_temperature_1: Optional[float] = None,
        dallas_temperature_2: Optional[float] = None,
        dallas_temperature_3: Optional[float] = None,
        dallas_temperature_4: Optional[float] = None,
        ble_temperature_1: Optional[float] = None,
        ble_temperature_2: Optional[float] = None,
        ble_temperature_3: Optional[float] = None,
        ble_temperature_4: Optional[float] = None,
        ble_humidity_1: Optional[int] = None,
        ble_humidity_2: Optional[int] = None,
        ble_humidity_3: Optional[int] = None,
        ble_humidity_4: Optional[int] = None,
        green_driving_value: Optional[float] = None,
        dynamic_io: Optional[dict] = None,
        is_valid: Optional[int] = None,
    ) -> None:
        """
        Update or insert last status using SQLAlchemy Core.
        
        Args:
            imei: Device IMEI
            gps_time: GPS timestamp
            server_time: Server timestamp
            latitude: Latitude coordinate
            longitude: Longitude coordinate
            altitude: Altitude in meters
            angle: Angle in degrees
            satellites: Number of satellites
            speed: Speed in km/h
            reference_id: Optional reference location ID
            distance: Optional distance to reference in kilometers
            vendor: Vendor name (teltonika, camera)
        """
        try:
            gps_time_naive = _to_naive_utc(gps_time) if gps_time is not None else None
            server_time_naive = _to_naive_utc(server_time) if server_time is not None else None
            # Coerce numeric columns: parser may send strings (e.g. '0.500'); DB expects float/int
            passenger_seat = _to_optional_float(passenger_seat)
            main_battery = _to_optional_float(main_battery)
            battery_voltage = _to_optional_float(battery_voltage)
            fuel = _to_optional_float(fuel)
            dallas_temperature_1 = _to_optional_float(dallas_temperature_1)
            dallas_temperature_2 = _to_optional_float(dallas_temperature_2)
            dallas_temperature_3 = _to_optional_float(dallas_temperature_3)
            dallas_temperature_4 = _to_optional_float(dallas_temperature_4)
            ble_temperature_1 = _to_optional_float(ble_temperature_1)
            ble_temperature_2 = _to_optional_float(ble_temperature_2)
            ble_temperature_3 = _to_optional_float(ble_temperature_3)
            ble_temperature_4 = _to_optional_float(ble_temperature_4)
            ble_humidity_1 = _to_optional_int(ble_humidity_1)
            ble_humidity_2 = _to_optional_int(ble_humidity_2)
            ble_humidity_3 = _to_optional_int(ble_humidity_3)
            ble_humidity_4 = _to_optional_int(ble_humidity_4)
            green_driving_value = _to_optional_float(green_driving_value)
            is_valid = _to_optional_int(is_valid)
            distance = _to_optional_float(distance)
            # Consumer-owned columns only (do not overwrite metric engine state columns)
            values = {
                'imei': imei,
                'gps_time': gps_time_naive,
                'server_time': server_time_naive,
                'latitude': latitude,
                'longitude': longitude,
                'altitude': altitude,
                'angle': angle,
                'satellites': satellites,
                'speed': speed,
                'reference_id': reference_id,
                'distance': distance,
                'vendor': vendor,
                'status': status,
                'ignition': ignition,
                'driver_seatbelt': driver_seatbelt,
                'passenger_seatbelt': passenger_seatbelt,
                'door_status': door_status,
                'passenger_seat': passenger_seat,
                'main_battery': main_battery,
                'battery_voltage': battery_voltage,
                'fuel': fuel,
                'dallas_temperature_1': dallas_temperature_1,
                'dallas_temperature_2': dallas_temperature_2,
                'dallas_temperature_3': dallas_temperature_3,
                'dallas_temperature_4': dallas_temperature_4,
                'ble_temperature_1': ble_temperature_1,
                'ble_temperature_2': ble_temperature_2,
                'ble_temperature_3': ble_temperature_3,
                'ble_temperature_4': ble_temperature_4,
                'ble_humidity_1': ble_humidity_1,
                'ble_humidity_2': ble_humidity_2,
                'ble_humidity_3': ble_humidity_3,
                'ble_humidity_4': ble_humidity_4,
                'green_driving_value': green_driving_value,
                'dynamic_io': dynamic_io,
                'is_valid': is_valid,
            }
            table = cls.__table__
            # Columns to update on conflict (consumer-owned only; exclude metric engine state columns)
            consumer_columns = {
                'gps_time', 'server_time', 'latitude', 'longitude', 'altitude', 'angle',
                'satellites', 'speed', 'reference_id', 'distance', 'vendor', 'updateddate',
                'status', 'ignition', 'driver_seatbelt', 'passenger_seatbelt', 'door_status',
                'passenger_seat', 'main_battery', 'battery_voltage', 'fuel',
                'dallas_temperature_1', 'dallas_temperature_2', 'dallas_temperature_3', 'dallas_temperature_4',
                'ble_temperature_1', 'ble_temperature_2', 'ble_temperature_3', 'ble_temperature_4',
                'ble_humidity_1', 'ble_humidity_2', 'ble_humidity_3', 'ble_humidity_4',
                'green_driving_value', 'dynamic_io', 'is_valid',
            }
            async with get_session() as session:
                try:
                    stmt = pg_insert(table).values(values)
                    update_dict = {
                        col.name: text(f'EXCLUDED.{col.name}')
                        for col in table.columns
                        if col.name != 'imei' and col.name in consumer_columns
                    }
                    update_dict['updateddate'] = func.now()
                    stmt = stmt.on_conflict_do_update(index_elements=['imei'], set_=update_dict)
                    await session.execute(stmt)
                    await session.commit()
                except Exception as db_error:
                    await session.rollback()
                    raise db_error
        except (ConnectionError, OSError, TimeoutError, asyncio.TimeoutError) as e:
            # Connection errors are expected - don't log full traceback
            import socket
            if isinstance(e, (socket.gaierror, socket.herror)):
                logger.debug(f"Could not update LastStatus (DNS/host resolution): imei={imei}, error={e}")
            else:
                logger.debug(f"Could not update LastStatus (connection error): imei={imei}, error={e}")
        except Exception as e:
            # Other errors - log with traceback
            logger.warning(
                f"Could not update LastStatus: imei={imei}, "
                f"lat={latitude}, lon={longitude}, error={e}",
                exc_info=True
            )


class LocationReference(Base):
    """Location reference table (POI/landmarks)"""
    __tablename__ = "location_reference"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    reference: Mapped[str] = mapped_column(Text)


class CameraAlarmConfig(Base):
    """Camera alarm configuration - per-device config for camera events"""
    __tablename__ = "camera_alarm_config"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    imei: Mapped[int] = mapped_column(BigInteger, nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    is_sms: Mapped[int] = mapped_column(Integer, default=0)
    is_email: Mapped[int] = mapped_column(Integer, default=0)
    is_call: Mapped[int] = mapped_column(Integer, default=0)
    priority: Mapped[int] = mapped_column(Integer, default=5)
    start_time: Mapped[time] = mapped_column(Time, default=time(0, 0, 0))
    end_time: Mapped[time] = mapped_column(Time, default=time(23, 59, 59))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    
    @classmethod
    async def get_config(cls, imei: int, event_type: str) -> Optional['CameraAlarmConfig']:
        """
        Get camera alarm config for a specific device and event type.
        Returns None if no config found.
        """
        try:
            async with get_session() as session:
                result = await session.execute(
                    text("""
                        SELECT id, imei, event_type, is_sms, is_email, is_call, priority,
                               start_time, end_time, enabled
                        FROM camera_alarm_config
                        WHERE imei = :imei AND event_type = :event_type AND enabled = TRUE
                    """),
                    {'imei': imei, 'event_type': event_type}
                )
                row = result.fetchone()
                
                if row:
                    # Return a simple object with the config
                    class ConfigResult:
                        def __init__(self, row):
                            self.id = row[0]
                            self.imei = row[1]
                            self.event_type = row[2]
                            self.is_sms = row[3]
                            self.is_email = row[4]
                            self.is_call = row[5]
                            self.priority = row[6]
                            self.start_time = row[7]
                            self.end_time = row[8]
                            self.enabled = row[9]
                    
                    return ConfigResult(row)
                return None
        except Exception as e:
            logger.error(f"Error getting camera alarm config: {e}")
            return None
