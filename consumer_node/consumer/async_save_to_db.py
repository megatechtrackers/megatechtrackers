"""
Async SaveToDBDynamically for Megatechtrackers Fleet Tracking
Dynamic database saving with async operations using SQLAlchemy Core
"""
import asyncio
import json
import logging
import socket
from typing import List, Dict, Any
from datetime import datetime, timezone

from consumer.orm_init import init_orm
from consumer.models import TrackData, LastStatus, Alarm, Event
from consumer.retry_handler import retry_with_backoff

logger = logging.getLogger(__name__)


class AsyncSaveToDB:
    """
    Async database saver - saves tracking data to database
    """
    
    _initialized = False
    _static_lock = asyncio.Lock()
    
    def __init__(self, data_list: List[Dict[str, Any]]):
        """
        Initialize async database saver with data list
        
        Args:
            data_list: List of data rows to save
        """
        self.data_list = data_list
        
        # ORM initialization is handled in _save_record_to_database() when needed
        # No need to create task here - it's checked and initialized on first save
    
    @classmethod
    async def _initialize_orm(cls):
        """Initialize SQLAlchemy (async) with retry on transient failures"""
        async with cls._static_lock:
            if cls._initialized:
                return
            
            try:
                # Retry ORM initialization on transient failures
                await retry_with_backoff(
                    init_orm,
                    max_retries=3,
                    initial_delay=1.0,
                    max_delay=5.0
                )
                cls._initialized = True
                logger.info("SQLAlchemy initialized for AsyncSaveToDB")
            except Exception as e:
                logger.error(f"Error initializing SQLAlchemy after retries: {e}", exc_info=True)
    
    async def _save_record_to_database(self, record: Dict[str, Any]):
        """Save tracking record to database using ORM"""
        try:
            # Ensure ORM is initialized
            if not AsyncSaveToDB._initialized:
                await AsyncSaveToDB._initialize_orm()
            
            imei_str = record.get('imei', 'UNKNOWN')
            
            # Single record with all fields - select columns when saving
            # - ALL records -> trackdata (with all columns)
            # - If status != 'Normal' -> ALSO events (select event columns only)
            # - If is_alarm = 1 -> ALSO alarms (select alarm columns only)
            is_alarm = record.get('is_alarm', 0) == 1
            is_event = record.get('status', 'Normal') != 'Normal'
            
            # ALL records go to trackdata (with all columns) - with retry on transient failures
            async def _create_trackdata():
                return await TrackData.create_from_record(record)
            
            track_data = await retry_with_backoff(
                _create_trackdata,
                max_retries=2,
                initial_delay=0.5,
                max_delay=2.0
            )
            if not track_data:
                logger.warning(f"Failed to create TrackData from record: imei={imei_str}")
                return
            logger.debug(f"Saved record to trackdata: imei={imei_str}, lat={record.get('latitude')}, lon={record.get('longitude')}")
            
            # If status != 'Normal' -> ALSO events (select event columns) - with retry
            if is_event:
                async def _create_event():
                    return await Event.create_from_record(record)
                
                event_data = await retry_with_backoff(
                    _create_event,
                    max_retries=2,
                    initial_delay=0.5,
                    max_delay=2.0
                )
                if event_data:
                    logger.debug(f"Saved event record: imei={imei_str}, status={record.get('status', 'Normal')}")
                else:
                    logger.warning(f"Failed to create Event from record: imei={imei_str}")
            
            # If is_alarm = 1 -> ALSO alarms (select alarm columns) - with retry
            if is_alarm:
                async def _create_alarm():
                    return await Alarm.create_from_record(record)
                
                alarm_data = await retry_with_backoff(
                    _create_alarm,
                    max_retries=2,
                    initial_delay=0.5,
                    max_delay=2.0
                )
                if alarm_data:
                    logger.debug(f"Saved alarm record: imei={imei_str}, status={record.get('status', 'Normal')}")
                else:
                    logger.warning(f"Failed to create Alarm from record: imei={imei_str}")
            
            # Update LastStatus using ORM (consumer-owned columns only: position + trackdata mirror; plan § 3.5)
            try:
                imei_int = int(imei_str) if imei_str != 'UNKNOWN' else 0
                from dateutil import parser

                def _ensure_utc(dt):
                    if dt.tzinfo is None:
                        return dt.replace(tzinfo=timezone.utc)
                    return dt.astimezone(timezone.utc)

                def _opt_bool(r, key):
                    v = r.get(key)
                    if v is None:
                        return None
                    if isinstance(v, bool):
                        return v
                    if isinstance(v, (int, float)):
                        return bool(v)
                    if isinstance(v, str):
                        return v.strip().lower() in ('1', 'true', 'yes')
                    return None

                gps_time_str = record.get('gps_time', '')
                if isinstance(gps_time_str, str):
                    try:
                        gps_time = _ensure_utc(parser.parse(gps_time_str))
                    except (ValueError, TypeError, AttributeError) as e:
                        logger.debug(f"Could not parse gps_time '{gps_time_str}', using current time: {e}")
                        gps_time = datetime.now(timezone.utc)
                elif isinstance(gps_time_str, datetime):
                    gps_time = _ensure_utc(gps_time_str)
                else:
                    gps_time = datetime.now(timezone.utc)

                server_time_str = record.get('server_time', '')
                if isinstance(server_time_str, str):
                    try:
                        server_time = _ensure_utc(parser.parse(server_time_str))
                    except (ValueError, TypeError, AttributeError) as e:
                        logger.debug(f"Could not parse server_time '{server_time_str}', using current time: {e}")
                        server_time = datetime.now(timezone.utc)
                elif isinstance(server_time_str, datetime):
                    server_time = _ensure_utc(server_time_str)
                else:
                    server_time = datetime.now(timezone.utc)

                dio = record.get('dynamic_io')
                if isinstance(dio, str):
                    try:
                        dio = json.loads(dio) if dio else {}
                    except (json.JSONDecodeError, TypeError):
                        dio = {}
                elif not isinstance(dio, dict):
                    dio = {}

                await LastStatus.upsert(
                    imei=imei_int,
                    gps_time=gps_time,
                    server_time=server_time,
                    latitude=record.get('latitude', 0.0),
                    longitude=record.get('longitude', 0.0),
                    altitude=record.get('altitude', 0),
                    angle=record.get('angle', 0),
                    satellites=record.get('satellites', 0),
                    speed=record.get('speed', 0),
                    reference_id=record.get('reference_id'),
                    distance=record.get('distance'),
                    vendor=record.get('vendor', 'teltonika'),
                    status=record.get('status'),
                    ignition=_opt_bool(record, 'ignition'),
                    driver_seatbelt=_opt_bool(record, 'driver_seatbelt'),
                    passenger_seatbelt=_opt_bool(record, 'passenger_seatbelt'),
                    door_status=_opt_bool(record, 'door_status'),
                    passenger_seat=record.get('passenger_seat'),
                    main_battery=record.get('main_battery'),
                    battery_voltage=record.get('battery_voltage'),
                    fuel=record.get('fuel'),
                    dallas_temperature_1=record.get('dallas_temperature_1'),
                    dallas_temperature_2=record.get('dallas_temperature_2'),
                    dallas_temperature_3=record.get('dallas_temperature_3'),
                    dallas_temperature_4=record.get('dallas_temperature_4'),
                    ble_temperature_1=record.get('ble_temperature_1'),
                    ble_temperature_2=record.get('ble_temperature_2'),
                    ble_temperature_3=record.get('ble_temperature_3'),
                    ble_temperature_4=record.get('ble_temperature_4'),
                    ble_humidity_1=record.get('ble_humidity_1'),
                    ble_humidity_2=record.get('ble_humidity_2'),
                    ble_humidity_3=record.get('ble_humidity_3'),
                    ble_humidity_4=record.get('ble_humidity_4'),
                    green_driving_value=record.get('green_driving_value'),
                    dynamic_io=dio,
                    is_valid=record.get('is_valid'),
                )
                logger.debug(f"Updated LastStatus: imei={imei_str}")
            except (ConnectionError, OSError, TimeoutError, asyncio.TimeoutError) as e:
                # Connection errors are expected - LastStatus.upsert() handles its own logging
                # This catch is for any unexpected errors during datetime parsing
                if isinstance(e, (socket.gaierror, socket.herror)):
                    logger.debug(f"Error preparing LastStatus update (DNS/host resolution): imei={imei_str}, error={e}")
                else:
                    logger.debug(f"Error preparing LastStatus update (connection error): imei={imei_str}, error={e}")
            except Exception as e:
                # Other unexpected errors during datetime parsing - log with traceback
                logger.warning(
                    f"Error preparing LastStatus update: imei={imei_str}, error={e}",
                    exc_info=True
                )
        
        except (ConnectionError, OSError, TimeoutError, asyncio.TimeoutError) as e:
            # Connection errors are expected - don't log full traceback
            imei_str = record.get('imei', 'UNKNOWN')
            if isinstance(e, (socket.gaierror, socket.herror)):
                logger.debug(
                    f"Error saving record to database (DNS/host resolution): imei={imei_str}, "
                    f"gps_time={record.get('gps_time', 'N/A')}, error={e}"
                )
            else:
                logger.debug(
                    f"Error saving record to database (connection error): imei={imei_str}, "
                    f"gps_time={record.get('gps_time', 'N/A')}, error={e}"
                )
            raise  # Re-raise so retry handler can catch it
        except Exception as e:
            # Other errors - log with traceback
            imei_str = record.get('imei', 'UNKNOWN')
            logger.error(
                f"Error saving record to database: imei={imei_str}, "
                f"gps_time={record.get('gps_time', 'N/A')}, error={e}",
                exc_info=True
            )
            raise  # Re-raise so caller knows it failed
    
    async def save(self, batch_size: int = 100):
        """
        Save all records to database (async) with batching for better performance
        
        Args:
            batch_size: Number of records to process in each batch (default: 100)
        """
        try:
            if not self.data_list or len(self.data_list) == 0:
                logger.debug("No data to save")
                return
            
            total_records = len(self.data_list)
            logger.info(f"Saving {total_records} records to database (async) in batches of {batch_size}...")
            
            # Process records in batches for better performance
            for i in range(0, total_records, batch_size):
                batch = self.data_list[i:i + batch_size]
                batch_num = (i // batch_size) + 1
                total_batches = (total_records + batch_size - 1) // batch_size
                
                logger.debug(f"Processing batch {batch_num}/{total_batches} ({len(batch)} records)")
                
                # Save batch records concurrently (with limit to avoid overwhelming DB)
                tasks = [self._save_record_to_database(record) for record in batch]
                await asyncio.gather(*tasks, return_exceptions=True)
                
                logger.debug(f"Completed batch {batch_num}/{total_batches}")
            
            logger.info(f"Saved {total_records} records to database (async) in {total_batches} batch(es)")
        
        except Exception as e:
            logger.error(f"Error in save() (async): {e}", exc_info=True)
