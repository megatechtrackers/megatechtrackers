"""
Database models for Teltonika Gateway using SQLAlchemy 2.0 async Core
All operations use SQLAlchemy Core for optimal performance
"""
from sqlalchemy import Column, BigInteger, DateTime, Float, Integer, String, Text, Time, Boolean, func, text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB, insert as pg_insert
from typing import Dict, Any, Optional
from datetime import datetime, time, timezone
import json
import logging

from .sqlalchemy_base import Base, get_session
from sqlalchemy.ext.asyncio import AsyncSession

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
    async def create_from_record(cls, record: Dict[str, Any]) -> Optional['TrackData']:
        """
        Create or update TrackData instance from record dictionary using SQLAlchemy Core.
        Uses INSERT ... ON CONFLICT DO UPDATE for efficient upsert.
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
                    class DummyTrackData:
                        def __init__(self):
                            self.imei = imei_int
                            self.gps_time = gps_time_naive
                    
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
                'is_sms': record.get('is_sms', 0),
                'is_email': record.get('is_email', 0),
                'is_call': record.get('is_call', 0),
                'is_valid': record.get('is_valid', IS_VALID_TRUE),
                'reference_id': parse_numeric_field(record, 'reference_id', int),
                'distance': parse_numeric_field(record, 'distance', float)
                # Note: retry_count, scheduled_at, priority, state, category, created_at
                # are NOT set here - they use database defaults and are managed by Alarm Service
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
                    
                    await session.execute(stmt)
                    await session.commit()
                    
                    # Return minimal object for compatibility
                    class DummyAlarm:
                        def __init__(self):
                            self.imei = imei_int
                            self.gps_time = gps_time_naive
                    
                    return DummyAlarm()
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
    """LastStatus table - stores latest status/position for each device"""
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
    updateddate: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    @classmethod
    async def upsert(cls, imei: int, gps_time: Optional[datetime], server_time: Optional[datetime],
                     latitude: float, longitude: float, altitude: int, angle: int,
                     satellites: int, speed: int, reference_id: Optional[int] = None,
                     distance: Optional[float] = None) -> None:
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
        """
        try:
            # Bind naive UTC for TIMESTAMP WITHOUT TIME ZONE (asyncpg rejects aware datetimes)
            gps_time_naive = _to_naive_utc(gps_time) if gps_time is not None else None
            server_time_naive = _to_naive_utc(server_time) if server_time is not None else None
            # Build values dict for Core insert
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
                'distance': distance
            }

            # Use PostgreSQL-specific insert with ON CONFLICT DO UPDATE
            table = cls.__table__
            async with get_session() as session:
                try:
                    stmt = pg_insert(table).values(values)
                    
                    update_dict = {
                        col.name: text(f'EXCLUDED.{col.name}')
                        for col in table.columns
                        if col.name != 'imei'  # imei is the primary key
                    }
                    # Explicitly update updateddate to current timestamp
                    update_dict['updateddate'] = func.now()
                    
                    stmt = stmt.on_conflict_do_update(
                        index_elements=['imei'],
                        set_=update_dict
                    )
                    
                    await session.execute(stmt)
                    await session.commit()
                except Exception as db_error:
                    await session.rollback()
                    raise db_error
        except Exception as e:
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


# ═══════════════════════════════════════════════════════════════════════════════
# COMMAND SYSTEM MODELS (from Operations Service)
# ═══════════════════════════════════════════════════════════════════════════════

class DeviceConfig(Base):
    """Device configuration - command definitions from vendors"""
    __tablename__ = "device_config"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_name: Mapped[str] = mapped_column(String(100))
    config_type: Mapped[str] = mapped_column(String(20))  # 'Setting' or 'Command'
    category_type_desc: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    profile: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    command_name: Mapped[str] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    command_seprator: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    command_syntax: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    command_type: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    command_parameters_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    parameters_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    command_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class Unit(Base):
    """Unit table - tracker registry linking IMEI to sim_no and device"""
    __tablename__ = "unit"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mega_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    imei: Mapped[str] = mapped_column(String(50), unique=True)
    ffid: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    sim_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    device_name: Mapped[str] = mapped_column(String(100))
    modem_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_date: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class UnitConfig(Base):
    """Unit Config - saved configurations per tracker"""
    __tablename__ = "unit_config"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mega_id: Mapped[str] = mapped_column(String(50))
    device_name: Mapped[str] = mapped_column(String(100))
    command_id: Mapped[int] = mapped_column(Integer)
    value: Mapped[str] = mapped_column(Text)
    modified_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    modified_date: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class CommandOutbox(Base):
    """Command outbox - queue for sending commands"""
    __tablename__ = "command_outbox"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    imei: Mapped[str] = mapped_column(String(50))
    sim_no: Mapped[str] = mapped_column(String(50))
    command_text: Mapped[str] = mapped_column(Text)
    config_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    send_method: Mapped[str] = mapped_column(String(10), default='sms')  # 'sms' or 'gprs'
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class CommandSent(Base):
    """Command sent - commands awaiting device reply"""
    __tablename__ = "command_sent"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    imei: Mapped[str] = mapped_column(String(50))
    sim_no: Mapped[str] = mapped_column(String(50))
    command_text: Mapped[str] = mapped_column(Text)
    config_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    send_method: Mapped[str] = mapped_column(String(10), default='sms')
    status: Mapped[str] = mapped_column(String(20), default='sent')  # sent, failed, successful, no_reply
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    response_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class CommandInbox(Base):
    """Command inbox - incoming SMS from devices"""
    __tablename__ = "command_inbox"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sim_no: Mapped[str] = mapped_column(String(50))
    imei: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    message_text: Mapped[str] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    processed: Mapped[bool] = mapped_column(Boolean, default=False)


class CommandHistory(Base):
    """Command history - audit trail of all commands"""
    __tablename__ = "command_history"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    imei: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    sim_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    direction: Mapped[str] = mapped_column(String(10))  # 'outgoing' or 'incoming'
    command_text: Mapped[str] = mapped_column(Text)
    config_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    send_method: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    archived_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())