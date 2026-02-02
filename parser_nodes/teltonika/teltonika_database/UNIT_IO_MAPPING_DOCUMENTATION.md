# Unit IO Mapping Documentation

## Overview

The Unit IO mapping system defines how Teltonika device I/O (Input/Output) elements are processed and mapped to database columns, CSV output columns, status events, alarms, and JSONB data. This mapping system allows flexible configuration of how raw I/O values from trackers are transformed and stored.

The system supports two modes:
- **Database Mode**: Unit IO mappings are stored in the `unit_io_mapping` database table
- **Logs Mode**: Unit IO mappings are loaded from `io_mapping.csv` file

Both modes use the same mapping structure and provide the same functionality.

## Unit IO Mapping Structure

### CSV File Columns / Database Table Columns

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `imei` | BIGINT/string | Device IMEI | `357544375602980` |
| `io_id` | integer | Teltonika I/O element ID | `1`, `66`, `72` |
| `io_multiplier` | float | Multiplier to convert raw value to actual value (only for `io_type=3` analog) | `1`, `0.001`, `0.1` |
| `io_type` | integer | I/O type: `2`=Digital, `3`=Analog | `2` or `3` |
| `io_name` | string | Human-readable I/O name | `Ignition`, `Main Battery` |
| `value_name` | string | Value state name (for digital IOs) | `On`, `Off`, `NA` |
| `value` | float/NA | Expected value for digital IOs (NA for analog) | `0`, `1`, `NA` |
| `target` | integer | Processing target: `0`=column, `1`=status, `2`=both, `3`=jsonb | `0`, `1`, `2`, `3` |
| `column_name` | string | Column name(s), pipe-separated for multiple | `status`, `main_battery`, `status\|main_battery` |
| `start_time` | time | Start time for time-based filtering (HH:MM:SS format) | `00:00:00` |
| `end_time` | time | End time for time-based filtering (HH:MM:SS format) | `23:59:59` |
| `is_alarm` | integer | Whether this mapping triggers an alarm (`1`=yes, `0`=no) | `0`, `1` |
| `is_sms` | integer | Send SMS for alarm (`1`=yes, `0`=no) | `0`, `1` |
| `is_email` | integer | Send email for alarm (`1`=yes, `0`=no) | `0`, `1` |
| `is_call` | integer | Make call for alarm (`1`=yes, `0`=no) | `0`, `1` |

**Note**: Column names in `unit_io_mapping.csv` and `unit_io_mapping` table use lowercase with underscores (e.g., `is_sms`, `is_email`, `is_call`). These values are then used to populate the `alarms` table columns which also use lowercase with underscores (e.g., `is_sms`, `is_email`, `is_call`).

### Target Values

- **`0` (column)**: Value goes to a database/CSV column only
- **`1` (status)**: Value is used for status/event detection only
- **`2` (both)**: Value is used for both status and column
- **`3` (jsonb)**: Value goes to `dynamic_io` JSONB column

### IO Type Values

- **`2` (Digital)**: Binary I/O (0 or 1), used for events like Ignition, Panic, Seatbelt
  - Creates status events based on value comparison
  - `io_multiplier` is not used (always `1`)
- **`3` (Analog)**: Continuous numeric I/O, used for sensors like Temperature, Battery Voltage
  - `io_multiplier` is applied: `calculated_value = raw_value * io_multiplier`
  - Decimal precision is calculated from `io_multiplier`

## Architecture

### Database Mode

In Database mode, Unit IO mappings are stored in the `unit_io_mapping` PostgreSQL table:

```sql
CREATE TABLE unit_io_mapping (
    id BIGSERIAL PRIMARY KEY,
    imei BIGINT NOT NULL,
    io_id INTEGER NOT NULL,
    io_multiplier DOUBLE PRECISION DEFAULT 1.0,
    io_type INTEGER NOT NULL,
    io_name VARCHAR(100),
    value_name VARCHAR(50),
    value DOUBLE PRECISION,
    target INTEGER DEFAULT 0,
    column_name VARCHAR(100),
    start_time TIME,
    end_time TIME,
    is_alarm INTEGER DEFAULT 0,
    is_sms INTEGER DEFAULT 0,
    is_email INTEGER DEFAULT 0,
    is_call INTEGER DEFAULT 0,
    createddate TIMESTAMP DEFAULT NOW(),
    updateddate TIMESTAMP DEFAULT NOW()
);
```

**Loader**: `DatabaseUnitIOMappingLoader` (`teltonika_database/unit_io_mapping_loader.py`)
- Queries `unit_io_mapping` table by IMEI when device registers
- Caches mappings in memory by IMEI
- Automatically loads mappings when `load_mappings_for_imei(imei)` is called

### Logs Mode

In Logs mode, Unit IO mappings are loaded from a CSV file:

**File Location**: `teltonika_database/unit_io_mapping.csv`

**Loader**: `CSVUnitIOMappingLoader` (`teltonika_database/csv_unit_io_mapping_loader.py`)
- Reads CSV file once on first access
- Caches mappings in memory by IMEI
- Provides same interface as database loader

## Code Flow

### 1. Initialization Phase

**Location**: `AsyncPacketParser._get_unit_io_mapping_loader()` (`teltonika_parser/async_packet_parser.py`)

```python
from teltonika_database.unit_io_mapping_loader import get_unit_io_mapping_loader

loader = await get_unit_io_mapping_loader()
await loader.load_mappings_for_imei(imei)
```

The `get_unit_io_mapping_loader()` function automatically selects the appropriate loader based on `data_transfer_mode`:
- **Database mode**: Returns `DatabaseUnitIOMappingLoader`
- **Logs mode**: Returns `CSVUnitIOMappingLoader`

### 2. Mapping Loading Phase

**Database Mode**:
1. Queries `unit_io_mapping` table: `SELECT * FROM unit_io_mapping WHERE imei = ?`
2. Parses rows into `UnitIOMapping` dataclass objects
3. Caches by IMEI: `_mappings_cache[imei][io_id] = [list of mappings]`

**Logs Mode**:
1. Reads `unit_io_mapping.csv` file (once, on first access)
2. Parses CSV rows (handles scientific notation for IMEI)
3. Handles pipe-separated `column_name` values
4. Creates multiple `UnitIOMapping` objects based on `target` value
5. Caches by IMEI: `_mappings_cache[imei][io_id] = [list of mappings]`

### 3. AVL Record Processing Phase

**Location**: `AsyncPacketParser._format_avl_record_to_dict()` (`teltonika_parser/async_packet_parser.py`)

When processing an AVL record from a device packet:

#### Step 3.1: Status Event Detection

**Flow**:
1. **Get Event ID**: Extracts `event_id` from `io_element.event_id` (the I/O that triggered this AVL record)
2. **Find Matching IO Property**: Searches through `io_element.properties` to find the property with `prop.id == event_id`
3. **Get Raw Value**: Extracts numeric value using `_get_io_value()` (handles multi-byte values)
4. **Load Mappings**: Calls `loader.get_mappings_for_io(event_id, imei)` to get all mappings for this IO ID
5. **Match Status**: For each mapping:
   - Checks if `target in [1, 2]` (status or both)
   - Checks if `io_type == 2` (Digital)
   - Compares `raw_value` with `mapping.value` (exact match for digital IOs)
   - If match found: Sets `event_status = f"{mapping.io_name} {mapping.value_name}"`
   - If `mapping.is_alarm == 1`: Creates alarm record
6. **Default**: If no match found, `event_status = "Normal"`

**Example**: 
- `event_id = 1`, `raw_value = 1`
- Finds mapping: `io_id=1, value=1, io_name="Ignition", value_name="On", is_alarm=0`
- Result: `status = "Ignition On"`

#### Step 3.2: Column Value Processing

**Flow**:
1. **Iterate All IO Properties**: Loops through all properties in `io_element.properties`
2. **Extract Values**: For each property:
   - Gets `io_id` and `raw_value`
   - Loads mappings: `loader.get_mappings_for_io(io_id, imei)`
3. **Process Each Mapping**: For each mapping:
   - **Column Values (target 0 or 2)**:
     - For analog (`io_type=3`): Calculates `calculated_value = raw_value * io_multiplier`
     - For digital (`io_type=2`): Uses `raw_value` directly (no multiplier)
     - Determines decimal precision from `io_multiplier` (e.g., `0.1` → 1 decimal, `0.01` → 2 decimals)
     - Checks for temperature error codes (Dallas: 850, 2000-5000; BLE: 2000-4000)
     - Formats value based on `io_type`, `io_multiplier`, and `io_name`
     - Populates `base_record[column_name]` dynamically
   - **JSONB Values (target 3)**:
     - Calculates: `calculated_value = raw_value * io_multiplier` (if analog)
     - Stores in `dynamic_io` dictionary: `dynamic_io[column_name] = calculated_value`

**Example**:
- `io_id = 67`, `raw_value = 12345`, mapping: `io_multiplier=0.001, column_name="battery_voltage", io_type=3`
- Calculates: `12345 * 0.001 = 12.345`
- Formats: `"12.3"` (1 decimal from `0.001` multiplier)
- Result: `base_record['battery_voltage'] = "12.3"`

#### Step 3.3: Temperature Error Code Handling

**Special Processing** for temperature columns:

1. **Check Error Codes**: Before applying multiplier, checks if `raw_value` is an error code:
   - **Dallas Temperature**: `850`, `2000`, `3000`, `4000`, `5000`
   - **BLE Temperature**: `2000`, `3000`, `4000`
2. **Handle Errors**: If error code detected:
   - Sets column value to empty string `""` (null in database/CSV)
   - Skips multiplier calculation
3. **Normal Values**: If not error code:
   - Applies multiplier and formats normally

**Example**:
- `io_id = 72`, `raw_value = 850` (Dallas Temperature error)
- Error detected: `base_record['dallas_temperature_1'] = ""`
- Normal: `raw_value = 216`, `216 * 0.1 = 21.6` → `"21.6"`

#### Step 3.4: Alarm Record Creation

**Flow**:
1. After status detection, if `event_status != 'Normal'` and `status_mapping.is_alarm == 1`:
2. **Time Window Check**: Checks if GPS time (UTC) is within the `start_time`/`end_time` window:
   - Uses `_is_time_in_window(gps_time, status_mapping.start_time, status_mapping.end_time)`
   - GPS time from device is UTC; `start_time`/`end_time` are stored in UTC (user configures in Ops UI with working timezone, converted to UTC for storage)
   - Compares only the time component (hour, minute, second) with the window
   - Supports windows that span midnight (e.g., `22:00:00` to `6:00:00`)
   - If GPS time is **not** within the window, alarm is **not** created
3. If time window check passes, creates alarm record with:
   - All GPS/location data from `base_record`
   - `status` = event status
   - `is_sms` = `1` if `status_mapping.is_sms == 1`, else `0`
   - `is_email` = `1` if `status_mapping.is_email == 1`, else `0`
   - `is_call` = `1` if `status_mapping.is_call == 1`, else `0`
4. Alarm record is saved to `alarms` table (Database mode) or `alarms.csv` (Logs mode)

**Time Window Examples**:
- `start_time=3:00:00`, `end_time=6:00:00`: Alarm only triggers between 3 AM and 6 AM UTC
- `start_time=22:00:00`, `end_time=6:00:00`: Alarm triggers between 10 PM and 6 AM UTC (spans midnight)
- `start_time=0:00:00`, `end_time=23:59:59`: Alarm triggers at any time (24-hour window)

### 4. Final Output Phase

**Location**: `AsyncPacketParser._format_avl_record_to_dict()` (end of method)

**Steps**:
1. **JSONB Serialization**: Converts `dynamic_io` dictionary to JSON string
2. **Status Assignment**: Sets `base_record['status'] = event_status`
3. **Record Creation**: Creates records list:
   - `base_record` (always) → saved to `trackdata` table/CSV/queue
   - `event_record` (if `status != 'Normal'`) → saved to `events` table/CSV/queue
   - `alarm_record` (if `is_alarm=1`) → saved to `alarms` table/CSV/queue AND `events` table/CSV/queue
   - **Note**: Alarms are also events (since `is_alarm=1` implies `status != 'Normal'`), so they go to BOTH `alarms` and `events` tables/queues
4. **Return**: Returns list of records

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Device Registers / Packet Received                       │
│    └─> AsyncPacketParser._format_avl_record_to_dict()     │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Get Unit IO Mapping Loader                                    │
│    ├─> get_unit_io_mapping_loader()                              │
│    │   ├─> Database mode: DatabaseUnitIOMappingLoader         │
│    │   └─> Logs mode: CSVUnitIOMappingLoader                    │
│    └─> load_mappings_for_imei(imei)                        │
└─────────────────────────────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
┌───────────────────────┐   ┌───────────────────────┐
│ Database Mode         │   │ Logs Mode             │
│                       │   │                       │
│ • Query unit_io_mapping   │   │ • Read unit_io_mapping.csv │
│ • Cache by IMEI       │   │ • Parse CSV rows      │
│ • Return mappings     │   │ • Cache by IMEI        │
└───────────────────────┘   └───────────────────────┘
        │                               │
        └───────────────┬───────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Process AVL Record                                       │
│    ├─> Status Detection (event_id)                          │
│    ├─> Column Processing (all IOs)                          │
│    ├─> Temperature Error Checks                             │
│    └─> Alarm Detection (is_alarm=1)                         │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Create Records                                           │
│    ├─> base_record (trackdata)                              │
│    ├─> event_record (if status != 'Normal')                 │
│    └─> alarm_record (if is_alarm=1)                         │
└─────────────────────────────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
┌───────────────────────┐   ┌───────────────────────┐
│ Database Mode         │   │ Logs Mode             │
│                       │   │                       │
│ • Save to trackdata   │   │ • Save to trackdata   │
│ • Save to events      │   │   .csv                │
│ • Save to alarms      │   │ • Save to events.csv  │
│   tables              │   │ • Save to alarms.csv  │
└───────────────────────┘   └───────────────────────┘
```

## Key Methods

### `get_unit_io_mapping_loader() -> UnitIOMappingLoader`

Returns the appropriate Unit IO mapping loader based on `data_transfer_mode`.

**Returns**: `DatabaseUnitIOMappingLoader` (Database mode) or `CSVUnitIOMappingLoader` (Logs mode)

### `UnitIOMappingLoader.load_mappings_for_imei(imei: str) -> bool`

Loads and caches Unit IO mappings for a specific IMEI.

**Parameters**:
- `imei`: IMEI string

**Returns**: `True` if mappings were loaded successfully, `False` otherwise

### `UnitIOMappingLoader.get_mappings_for_io(io_id: int, imei: str) -> List[UnitIOMapping]`

Returns all mappings for a given IO ID, filtered by IMEI.

**Parameters**:
- `io_id`: The Teltonika I/O element ID
- `imei`: IMEI string (must be loaded first)

**Returns**: List of `UnitIOMapping` objects (can be empty if no mappings found)

**Example**:
```python
mappings = loader.get_mappings_for_io(66, imei)
# Returns: [UnitIOMapping(io_id=66, target=2, column_name="main_battery", ...), 
#           UnitIOMapping(io_id=66, target=2, column_name="", ...)]
```

### `AsyncPacketParser._get_io_value(prop) -> Optional[float]`

Extracts numeric value from an IO property, handling different data types (1-byte, 2-byte, 4-byte, 8-byte).

**Parameters**:
- `prop`: IO property object from decoded packet

**Returns**: Numeric value (float) or None if extraction fails

### `AsyncPacketParser._check_temperature_error_code(raw_value: float, io_name: str) -> bool`

Checks if a raw temperature value is an error code.

**Parameters**:
- `raw_value`: Raw value from sensor (before multiplier)
- `io_name`: IO name (used to determine sensor type: "Dallas" or "BLE")

**Returns**: `True` if error code detected, `False` otherwise

### `AsyncPacketParser._calculate_decimal_places(multiplier: float) -> int`

Calculates the number of decimal places based on `io_multiplier`.

**Parameters**:
- `multiplier`: IO multiplier value

**Returns**: Number of decimal places (0-3)

**Example**:
- `multiplier=1.0` → `0` decimals
- `multiplier=0.1` → `1` decimal
- `multiplier=0.01` → `2` decimals
- `multiplier=0.001` → `3` decimals

### `AsyncPacketParser._is_time_in_window(gps_datetime: datetime, start_time_str: str, end_time_str: str) -> bool`

Checks if GPS datetime time component is within the start_time and end_time window.

**Parameters**:
- `gps_datetime`: GPS datetime (UTC from device)
- `start_time_str`: Start time in HH:MM:SS format (e.g., "3:00:00") — stored in UTC
- `end_time_str`: End time in HH:MM:SS format (e.g., "6:00:00") — stored in UTC

**Returns**: `True` if GPS time is within the window, `False` otherwise

**Features**:
- Compares only the time component (hour, minute, second)
- Supports windows that span midnight (e.g., `22:00:00` to `6:00:00`)
- Handles both `HH:MM:SS` and `H:MM:SS` formats
- Returns `False` on parsing errors (no alarms created if time check fails)

**Example**:
- GPS time: `2026-01-05 04:30:00` (UTC)
- Window: `start_time=3:00:00`, `end_time=6:00:00`
- Result: `True` (4:30 AM UTC is between 3 AM and 6 AM UTC)

## Examples

### Example 1: Ignition Status Event

**Mapping**:
```csv
357544375602980,1,1,2,Ignition,On,1,1,status,0:00:00,23:59:59,0,0,0,0
```

**Processing**:
- Device sends: `event_id=1, raw_value=1`
- Mapping found: `io_id=1, value=1, io_name="Ignition", value_name="On", is_alarm=0`
- Result: `status = "Ignition On"`, no alarm record

### Example 2: Battery Voltage Column

**Mapping**:
```csv
357544375602980,67,0.001,3,Battery Voltage,NA,NA,0,battery_voltage,0:00:00,23:59:59,0,0,0,0
```

**Processing**:
- Device sends: `io_id=67, raw_value=12345`
- Mapping found: `io_multiplier=0.001, column_name="battery_voltage", io_type=3`
- Calculation: `12345 * 0.001 = 12.345`
- Formatting: `"12.3"` (1 decimal from `0.001`)
- Result: `base_record['battery_voltage'] = "12.3"`

### Example 3: Main Battery (Both Status and Column, with Alarm)

**Mapping**:
```csv
357544375602980,66,0.001,2,Main Battery,NA,NA,2,status|main_battery,0:00:00,23:59:59,1,1,1,1
```

**Processing**:
- Creates 2 mappings:
  1. Status mapping: `target=2, column_name="", is_alarm=1, is_sms=1, is_email=1, is_call=1`
  2. Column mapping: `target=2, column_name="main_battery"`
- Device sends: `io_id=66, raw_value=11837`
- **For Status**: No status match (value=NA, so no match), `status = "Normal"`
- **For Column**: `11837 * 0.001 = 11.837` → `"11.8"`
- Result: `base_record['main_battery'] = "11.8"`, `status = "Normal"`, no alarm

### Example 4: Panic Alarm Event

**Mapping**:
```csv
357544375602980,3,1,2,Panic,On,1,1,status,0:00:00,23:59:59,1,1,1,1
```

**Processing**:
- Device sends: `event_id=3, raw_value=1`
- Mapping found: `io_id=3, value=1, io_name="Panic", value_name="On", is_alarm=1, is_sms=1, is_email=1, is_call=1, start_time=0:00:00, end_time=23:59:59`
- Result: 
  - `status = "Panic On"`
  - Time window check: GPS time (UTC) is within `0:00:00` to `23:59:59` → `True`
  - Alarm record created with `is_sms=1, is_email=1, is_call=1`
  - Saved to `trackdata` table/CSV (always)
  - Saved to `events` table/CSV (because `status != 'Normal'`)
  - Saved to `alarms` table/CSV (because `is_alarm=1`)

### Example 4b: Panic Alarm with Time Window

**Mapping**:
```csv
357544375602980,3,1,2,Panic,On,1,1,status,3:00:00,6:00:00,1,1,1,1
```

**Processing**:
- Device sends: `event_id=3, raw_value=1` at GPS time `2026-01-05 04:30:00` (UTC)
- Mapping found: `io_id=3, value=1, io_name="Panic", value_name="On", is_alarm=1, start_time=3:00:00, end_time=6:00:00`
- Result: 
  - `status = "Panic On"`
  - Time window check: GPS time `04:30:00` is within `3:00:00` to `6:00:00` → `True`
  - Alarm record created

**Alternative Scenario**:
- Device sends: `event_id=3, raw_value=1` at GPS time `2026-01-05 10:30:00` (UTC)
- Result: 
  - `status = "Panic On"`
  - Time window check: GPS time `10:30:00` is **not** within `3:00:00` to `6:00:00` → `False`
  - **No alarm record created** (time window check failed)

### Example 5: JSONB Storage

**Mapping**:
```csv
357544375602980,10,0.001,3,Ain 2,NA,NA,3,ain2,0:00:00,23:59:59,0,0,0,0
```

**Processing**:
- Device sends: `io_id=10, raw_value=5000`
- Mapping found: `target=3, column_name="ain2", io_multiplier=0.001`
- Calculation: `5000 * 0.001 = 5.0`
- Result: `dynamic_io = {"ain2": 5.0}` → JSON: `'{"ain2":5.0}'`

### Example 6: Temperature with Error Code

**Mapping**:
```csv
357544375602980,72,0.1,3,Dallas Temperature 1,NA,NA,0,dallas_temperature_1,0:00:00,23:59:59,0,0,0,0
```

**Processing**:
- Device sends: `io_id=72, raw_value=850` (error code)
- Error detected: `base_record['dallas_temperature_1'] = ""`
- Normal: `raw_value = 216`, `216 * 0.1 = 21.6` → `"21.6"`

## Notes

1. **Multiple Mappings per IO ID**: A single IO ID can have multiple mappings (e.g., one for status, one for column)
2. **Pipe Separator**: Use `|` to specify multiple column names (e.g., `"status|main_battery"`)
3. **IMEI Handling**: IMEI can be in scientific notation (e.g., `3.57544E+14`) and will be converted
4. **NA Values**: Use `NA` in CSV for `None` values (typically for analog IOs or when value doesn't matter)
5. **Digital IO Matching**: For status events, digital IOs require exact value match (0 or 1)
6. **Analog IO Multiplier**: `io_multiplier` is only applied to `io_type=3` (analog) IOs
7. **Digital IO Multiplier**: `io_multiplier` is ignored for `io_type=2` (digital) IOs
8. **Error Codes**: Temperature sensors have special error code handling before multiplier is applied
9. **Empty Values**: Columns are set to empty string `""` if calculated value is 0 or error detected
10. **Decimal Precision**: Automatically calculated from `io_multiplier` (e.g., `0.1` → 1 decimal, `0.01` → 2 decimals)
11. **Alarm Detection**: Alarms are created when `status != 'Normal'` AND `is_alarm=1` in the mapping AND GPS time (UTC) is within `start_time`/`end_time` window
12. **Time Window Check**: GPS time (UTC from device) is compared with `start_time`/`end_time` (stored in UTC). Only the time component (hour, minute, second) is compared. Supports windows that span midnight (e.g., `22:00:00` to `6:00:00`)
13. **Event Records**: Events are created when `status != 'Normal'` (all non-normal statuses, no time window check)
14. **Digital IO Multiplier**: Multiplier is **not** applied to digital IOs (`io_type=2`), only to analog IOs (`io_type=3`)

## File Locations

### Database Mode

Unit IO mappings are stored in the `unit_io_mapping` PostgreSQL table. The table is queried by IMEI when a device registers.

### Logs Mode

The `unit_io_mapping.csv` file should be located in the `teltonika_database/` directory:

```
Teltonika-Data-Parser-Python/
└── teltonika_database/
    ├── unit_io_mapping.csv
    ├── unit_io_mapping_loader.py
    └── csv_unit_io_mapping_loader.py
```

The CSV file is automatically loaded when the first device registers in Logs mode.

## Database Schema

The `unit_io_mapping` table structure matches the CSV file columns:

```sql
CREATE TABLE unit_io_mapping (
    id BIGSERIAL PRIMARY KEY,
    imei BIGINT NOT NULL,
    io_id INTEGER NOT NULL,
    io_multiplier DOUBLE PRECISION DEFAULT 1.0,
    io_type INTEGER NOT NULL,
    io_name VARCHAR(100),
    value_name VARCHAR(50),
    value DOUBLE PRECISION,
    target INTEGER DEFAULT 0,
    column_name VARCHAR(100),
    start_time TIME,
    end_time TIME,
    is_alarm INTEGER DEFAULT 0,
    is_sms INTEGER DEFAULT 0,
    is_email INTEGER DEFAULT 0,
    is_call INTEGER DEFAULT 0,
    createddate TIMESTAMP DEFAULT NOW(),
    updateddate TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_unit_io_mapping_imei ON unit_io_mapping(imei);
CREATE INDEX idx_unit_io_mapping_imei_io_id ON unit_io_mapping(imei, io_id);
CREATE INDEX idx_unit_io_mapping_target ON unit_io_mapping(target);
CREATE INDEX idx_unit_io_mapping_is_alarm ON unit_io_mapping(is_alarm);
```

## Migration from CSV to Database

To migrate Unit IO mappings from CSV to database:

1. Load the CSV file
2. Insert rows into `unit_io_mapping` table
3. Ensure IMEI values are converted to BIGINT
4. Set `data_transfer_mode` to "Database" in `config.json`

The system will automatically use the database table instead of the CSV file.
