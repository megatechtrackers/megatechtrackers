-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Megatechtrackers Fleet Tracking - Unified Database Schema
-- Database: megatechtrackers (PostgreSQL with TimescaleDB + PostGIS)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 
-- This is the SINGLE SOURCE OF TRUTH for the megatechtrackers database schema.
-- All services (parser_node, consumer_node, alarm_node, ops_node, sms_gateway_node) use this file.
-- Clean slate: no structural migrations; table/column definitions are in CREATE TABLE only.
-- Project NOT launched: add any new column directly to the CREATE TABLE; do NOT use ALTER TABLE ADD COLUMN.
-- The only ALTER TABLE usages are where TimescaleDB requires them (compression on hypertables).
--
-- Usage: Each service runs this schema on startup with IF NOT EXISTS (idempotent).
-- 
-- Sections:
--   1. EXTENSIONS
--   2. TRACKING TABLES (trackdata, alarms, events, laststatus, unit_io_mapping, location_reference)
--   2B. METRIC ENGINE (trackdata/laststatus columns, customer, config, vehicle, tracker, fence, metric_events, trip, scoring)
--   3. COMMAND SYSTEM (device_config, unit, unit_config, command_outbox/sent/inbox/history)
--   4. ALARM SYSTEM (contacts, history, dlq, dedup, templates, modems, etc.)
--   5. RABBITMQ DEDUPLICATION (processed_message_ids)
--   6. FUNCTIONS & TRIGGERS
--   7. SEED DATA
-- 
-- ═══════════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 1: EXTENSIONS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Enable PostGIS extension (for geospatial queries)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Enable pg_stat_statements extension for query performance monitoring
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- DATABASE CONFIGURATION
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Set database timezone to UTC for consistency across all services.
-- All application connections also set session timezone to UTC (belt-and-suspenders).
-- Display in user local time is handled at application/frontend layer.
DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET timezone TO ''UTC''', current_database());
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not set timezone: %', SQLERRM;
END $$;

-- Set default text search configuration to avoid parallel worker errors
-- This fixes: "invalid value for parameter default_text_search_config: pg_catalog"
DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET default_text_search_config = ''pg_catalog.english''', current_database());
EXCEPTION
    WHEN OTHERS THEN
        -- Ignore errors (may not have permission in some setups)
        RAISE NOTICE 'Could not set default_text_search_config: %', SQLERRM;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 2: TRACKING TABLES
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Main tracking data table
CREATE TABLE IF NOT EXISTS trackdata (
    imei BIGINT NOT NULL,
    server_time TIMESTAMPTZ NOT NULL,
    gps_time TIMESTAMPTZ NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    altitude INTEGER DEFAULT 0,
    angle INTEGER DEFAULT 0,
    satellites INTEGER DEFAULT 0,
    speed INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Normal',
    vendor TEXT DEFAULT 'teltonika',
    ignition BOOLEAN NULL,
    driver_seatbelt BOOLEAN NULL,
    passenger_seatbelt BOOLEAN NULL,
    door_status BOOLEAN NULL,
    passenger_seat DOUBLE PRECISION NULL,
    main_battery DOUBLE PRECISION NULL,
    battery_voltage DOUBLE PRECISION NULL,
    fuel DOUBLE PRECISION NULL,
    dallas_temperature_1 DOUBLE PRECISION NULL,
    dallas_temperature_2 DOUBLE PRECISION NULL,
    dallas_temperature_3 DOUBLE PRECISION NULL,
    dallas_temperature_4 DOUBLE PRECISION NULL,
    ble_humidity_1 INTEGER NULL,
    ble_humidity_2 INTEGER NULL,
    ble_humidity_3 INTEGER NULL,
    ble_humidity_4 INTEGER NULL,
    ble_temperature_1 DOUBLE PRECISION NULL,
    ble_temperature_2 DOUBLE PRECISION NULL,
    ble_temperature_3 DOUBLE PRECISION NULL,
    ble_temperature_4 DOUBLE PRECISION NULL,
    green_driving_value DOUBLE PRECISION NULL,
    dynamic_io JSONB DEFAULT '{}'::jsonb,
    is_valid INTEGER DEFAULT 1,
    reference_id INTEGER NULL,
    distance DOUBLE PRECISION NULL,
    geohash_6 TEXT NULL,
    PRIMARY KEY (imei, gps_time)
);

-- Convert to TimescaleDB hypertable with 7-day chunks
DO $$
BEGIN
    PERFORM create_hypertable(
        'trackdata', 
        'gps_time', 
        chunk_time_interval => INTERVAL '7 days',
        if_not_exists => TRUE
    );
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to create hypertable for trackdata: %', SQLERRM;
END $$;

-- Create index for queries by imei and gps_time (main query pattern)
CREATE INDEX IF NOT EXISTS idx_trackdata_imei_time ON trackdata (imei, gps_time DESC);
-- Create index for reference_id queries
CREATE INDEX IF NOT EXISTS idx_trackdata_reference_id ON trackdata (reference_id);
-- Add server_time index for server-side queries
CREATE INDEX IF NOT EXISTS idx_trackdata_server_time ON trackdata (server_time DESC);
-- Add composite index for imei + server_time queries
CREATE INDEX IF NOT EXISTS idx_trackdata_imei_server_time ON trackdata (imei, server_time DESC);
-- Partial index for valid records (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_trackdata_valid ON trackdata (imei, gps_time DESC) WHERE is_valid = 1;
-- Index for status filtering (if frequently queried)
CREATE INDEX IF NOT EXISTS idx_trackdata_status ON trackdata (status) WHERE status != 'Normal';
-- Index for vendor filtering (camera vs teltonika)
CREATE INDEX IF NOT EXISTS idx_trackdata_vendor ON trackdata (vendor);

-- Plan § 6B.3: geohash_6 for position binning (fast geospatial queries, heatmaps)
CREATE INDEX IF NOT EXISTS idx_trackdata_geohash_6 ON trackdata (geohash_6) WHERE geohash_6 IS NOT NULL;

-- Trigger: set geohash_6 on INSERT/UPDATE using PostGIS ST_GeoHash (precision 6 ~1km)
CREATE OR REPLACE FUNCTION set_trackdata_geohash_6()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.geohash_6 := left(ST_GeoHash(ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326), 6), 6);
    ELSE
        NEW.geohash_6 := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tr_trackdata_geohash_6 ON trackdata;
CREATE TRIGGER tr_trackdata_geohash_6
    BEFORE INSERT OR UPDATE OF latitude, longitude ON trackdata
    FOR EACH ROW EXECUTE PROCEDURE set_trackdata_geohash_6();

-- Enable compression on the hypertable (TimescaleDB requires ALTER for this; not a schema migration)
DO $$
BEGIN
    ALTER TABLE trackdata SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'imei',
        timescaledb.compress_orderby = 'gps_time DESC'
    );
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to enable compression for trackdata: %', SQLERRM;
END $$;

-- Add automatic compression policy for chunks older than 7 days
DO $$
BEGIN
    PERFORM add_compression_policy('trackdata', INTERVAL '7 days', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to add compression policy for trackdata: %', SQLERRM;
END $$;

-- Plan § 6B: time-binned continuous aggregates (dashboard performance)
CREATE MATERIALIZED VIEW IF NOT EXISTS trackdata_5min
WITH (timescaledb.continuous) AS
SELECT
    time_bucket(INTERVAL '5 minutes', gps_time) AS bucket,
    imei,
    AVG(latitude)::DOUBLE PRECISION AS latitude,
    AVG(longitude)::DOUBLE PRECISION AS longitude,
    AVG(speed)::DOUBLE PRECISION AS avg_speed,
    MAX(speed) AS max_speed,
    COALESCE(SUM(distance), 0)::DOUBLE PRECISION AS distance,
    MAX(gps_time) AS last_update
FROM trackdata
GROUP BY bucket, imei;
DO $$
BEGIN
    PERFORM add_continuous_aggregate_policy('trackdata_5min',
        start_offset => INTERVAL '3 hours',
        end_offset => INTERVAL '5 minutes',
        schedule_interval => INTERVAL '5 minutes',
        if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trackdata_5min refresh policy: %', SQLERRM;
END $$;

CREATE MATERIALIZED VIEW IF NOT EXISTS trackdata_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket(INTERVAL '1 hour', gps_time) AS bucket,
    imei,
    AVG(latitude)::DOUBLE PRECISION AS latitude,
    AVG(longitude)::DOUBLE PRECISION AS longitude,
    AVG(speed)::DOUBLE PRECISION AS avg_speed,
    MAX(speed) AS max_speed,
    COALESCE(SUM(distance), 0)::DOUBLE PRECISION AS distance,
    MAX(gps_time) AS last_update
FROM trackdata
GROUP BY bucket, imei;
DO $$
BEGIN
    PERFORM add_continuous_aggregate_policy('trackdata_hourly',
        start_offset => INTERVAL '1 month',
        end_offset => INTERVAL '1 hour',
        schedule_interval => INTERVAL '1 hour',
        if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trackdata_hourly refresh policy: %', SQLERRM;
END $$;

-- Add retention policy to drop chunks older than 12 months
DO $$
BEGIN
    PERFORM add_retention_policy('trackdata', INTERVAL '12 months', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to add retention policy for trackdata: %', SQLERRM;
END $$;

-- Plan § 6B.2: time-binned continuous aggregate (5 min) for dashboard performance
DO $$
BEGIN
    CREATE MATERIALIZED VIEW IF NOT EXISTS trackdata_5min
    WITH (timescaledb.continuous) AS
    SELECT
        time_bucket('5 minutes', gps_time) AS bucket,
        imei,
        avg(latitude) AS latitude,
        avg(longitude) AS longitude,
        avg(speed) AS avg_speed,
        max(speed) AS max_speed,
        sum(COALESCE(distance, 0)) AS distance,
        last(gps_time, gps_time) AS last_update
    FROM trackdata
    GROUP BY 1, 2
    WITH NO DATA;
    PERFORM add_continuous_aggregate_policy('trackdata_5min'::regclass,
        start_offset => INTERVAL '3 hours',
        end_offset => INTERVAL '5 minutes',
        schedule_interval => INTERVAL '5 minutes',
        if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trackdata_5min continuous aggregate: %', SQLERRM;
END $$;

-- Alarms table (device-generated alarms)
CREATE TABLE IF NOT EXISTS alarms (
    id BIGSERIAL,
    imei BIGINT NOT NULL,
    server_time TIMESTAMPTZ NOT NULL,
    gps_time TIMESTAMPTZ NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    altitude INTEGER DEFAULT 0,
    angle INTEGER DEFAULT 0,
    satellites INTEGER DEFAULT 0,
    speed INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Normal',
    vendor TEXT DEFAULT 'teltonika',
    photo_url TEXT,
    video_url TEXT,
    is_sms INTEGER DEFAULT 0,
    is_email INTEGER DEFAULT 0,
    is_call INTEGER DEFAULT 0,
    is_valid INTEGER DEFAULT 1,
    reference_id INTEGER NULL,
    distance DOUBLE PRECISION NULL,
    sms_sent BOOLEAN DEFAULT FALSE,
    sms_sent_at TIMESTAMPTZ NULL,
    email_sent BOOLEAN DEFAULT FALSE,
    email_sent_at TIMESTAMPTZ NULL,
    call_sent BOOLEAN DEFAULT FALSE,
    call_sent_at TIMESTAMPTZ NULL,
    retry_count INTEGER DEFAULT 0,
    scheduled_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    priority INTEGER DEFAULT 5,  -- 1=highest, 10=lowest
    state JSONB DEFAULT '{}'::jsonb,
    category TEXT DEFAULT 'general',
    created_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    PRIMARY KEY (imei, gps_time)
);

-- Convert to TimescaleDB hypertable with 7-day chunks
DO $$
BEGIN
    PERFORM create_hypertable(
        'alarms', 
        'gps_time', 
        chunk_time_interval => INTERVAL '7 days',
        if_not_exists => TRUE
    );
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to create hypertable for alarms: %', SQLERRM;
END $$;

-- Create index for queries by imei and gps_time (main query pattern)
CREATE INDEX IF NOT EXISTS idx_alarms_imei_time ON alarms (imei, gps_time DESC);
-- Create index for reference_id queries
CREATE INDEX IF NOT EXISTS idx_alarms_reference_id ON alarms (reference_id);
-- Partial index for valid records (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_alarms_valid ON alarms (imei, gps_time DESC) WHERE is_valid = 1;
-- Partial index for unsent SMS alarms (alarm_node queries)
CREATE INDEX IF NOT EXISTS idx_alarms_unsent_sms ON alarms (id) WHERE is_valid = 1 AND is_sms = 1 AND sms_sent = FALSE;
-- Partial index for unsent email alarms (alarm_node queries)
CREATE INDEX IF NOT EXISTS idx_alarms_unsent_email ON alarms (id) WHERE is_valid = 1 AND is_email = 1 AND email_sent = FALSE;
-- Composite index for priority-based processing
CREATE INDEX IF NOT EXISTS idx_alarms_priority_scheduled ON alarms(priority, scheduled_at) 
    WHERE is_valid = 1 AND (sms_sent = FALSE OR email_sent = FALSE OR call_sent = FALSE);
-- Index for vendor filtering (camera vs teltonika)
CREATE INDEX IF NOT EXISTS idx_alarms_vendor ON alarms (vendor);

-- Enable compression on the hypertable (TimescaleDB requires ALTER for this; not a schema migration)
DO $$
BEGIN
    ALTER TABLE alarms SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'imei',
        timescaledb.compress_orderby = 'gps_time DESC'
    );
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to enable compression for alarms: %', SQLERRM;
END $$;

-- Add automatic compression policy for chunks older than 7 days
DO $$
BEGIN
    PERFORM add_compression_policy('alarms', INTERVAL '7 days', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to add compression policy for alarms: %', SQLERRM;
END $$;

-- Add retention policy to drop chunks older than 24 months (keep alarms longer)
DO $$
BEGIN
    PERFORM add_retention_policy('alarms', INTERVAL '24 months', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to add retention policy for alarms: %', SQLERRM;
END $$;

-- Events table (all events where status != 'Normal')
CREATE TABLE IF NOT EXISTS events (
    imei BIGINT NOT NULL,
    server_time TIMESTAMPTZ NOT NULL,
    gps_time TIMESTAMPTZ NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    altitude INTEGER DEFAULT 0,
    angle INTEGER DEFAULT 0,
    satellites INTEGER DEFAULT 0,
    speed INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Normal',
    vendor TEXT DEFAULT 'teltonika',
    photo_url TEXT,
    video_url TEXT,
    is_valid INTEGER DEFAULT 1,
    reference_id INTEGER NULL,
    distance DOUBLE PRECISION NULL,
    PRIMARY KEY (imei, gps_time)
);

-- Convert to TimescaleDB hypertable with 7-day chunks
DO $$
BEGIN
    PERFORM create_hypertable(
        'events', 
        'gps_time', 
        chunk_time_interval => INTERVAL '7 days',
        if_not_exists => TRUE
    );
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to create hypertable for events: %', SQLERRM;
END $$;

-- Create index for queries by imei and gps_time (main query pattern)
CREATE INDEX IF NOT EXISTS idx_events_imei_time ON events (imei, gps_time DESC);
-- Create index for reference_id queries
CREATE INDEX IF NOT EXISTS idx_events_reference_id ON events (reference_id);
-- Partial index for valid records (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_events_valid ON events (imei, gps_time DESC) WHERE is_valid = 1;
-- Index for vendor filtering (camera vs teltonika)
CREATE INDEX IF NOT EXISTS idx_events_vendor ON events (vendor);

-- Enable compression on the hypertable (TimescaleDB requires ALTER for this; not a schema migration)
DO $$
BEGIN
    ALTER TABLE events SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'imei',
        timescaledb.compress_orderby = 'gps_time DESC'
    );
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to enable compression for events: %', SQLERRM;
END $$;

-- Add automatic compression policy for chunks older than 7 days
DO $$
BEGIN
    PERFORM add_compression_policy('events', INTERVAL '7 days', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to add compression policy for events: %', SQLERRM;
END $$;

-- Add retention policy to drop chunks older than 12 months
DO $$
BEGIN
    PERFORM add_retention_policy('events', INTERVAL '12 months', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to add retention policy for events: %', SQLERRM;
END $$;

-- Unit IO Mapping table (maps device IO values to columns/statuses/alarms)
CREATE TABLE IF NOT EXISTS unit_io_mapping (
    id BIGSERIAL PRIMARY KEY,
    imei BIGINT NOT NULL,
    io_id INTEGER NOT NULL,
    io_multiplier DOUBLE PRECISION NOT NULL,
    io_type INTEGER NOT NULL,  -- 2=Digital, 3=Analog
    io_name VARCHAR(255) NOT NULL,
    value_name VARCHAR(255) DEFAULT '',
    value DOUBLE PRECISION NULL,  -- NULL for analog/NA, numeric value for digital
    target INTEGER NOT NULL,  -- 0=column, 1=status, 2=both, 3=jsonb
    column_name VARCHAR(255) DEFAULT '',
    start_time TIME DEFAULT '00:00:00',  -- HH:MM:SS format for alarm time window
    end_time TIME DEFAULT '23:59:59',  -- HH:MM:SS format for alarm time window
    is_alarm INTEGER DEFAULT 0,  -- 0 or 1
    is_sms INTEGER DEFAULT 0,  -- 0 or 1
    is_email INTEGER DEFAULT 0,  -- 0 or 1
    is_call INTEGER DEFAULT 0,  -- 0 or 1
    createddate TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    updateddate TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);

-- Create indexes for unit_io_mapping queries
CREATE INDEX IF NOT EXISTS idx_unit_io_mapping_imei ON unit_io_mapping (imei);
CREATE INDEX IF NOT EXISTS idx_unit_io_mapping_imei_io_id ON unit_io_mapping (imei, io_id);
CREATE INDEX IF NOT EXISTS idx_unit_io_mapping_target ON unit_io_mapping (target);
CREATE INDEX IF NOT EXISTS idx_unit_io_mapping_is_alarm ON unit_io_mapping (is_alarm);

-- Device IO Mapping Templates table (default IO mappings per device type)
-- When a tracker is registered, it can inherit IO mappings from its device type
CREATE TABLE IF NOT EXISTS device_io_mapping (
    id BIGSERIAL PRIMARY KEY,
    device_name VARCHAR(100) NOT NULL,  -- Device type (e.g., GT06N, JC400D) - links to device_config.device_name
    io_id INTEGER NOT NULL,
    io_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    io_type INTEGER NOT NULL,  -- 2=Digital, 3=Analog
    io_name VARCHAR(255) NOT NULL,
    value_name VARCHAR(255) DEFAULT '',
    value DOUBLE PRECISION NULL,  -- NULL for analog/NA, numeric value for digital
    target INTEGER NOT NULL,  -- 0=column, 1=status, 2=both, 3=jsonb
    column_name VARCHAR(255) DEFAULT '',
    start_time TIME DEFAULT '00:00:00',  -- HH:MM:SS format for alarm time window
    end_time TIME DEFAULT '23:59:59',  -- HH:MM:SS format for alarm time window
    is_alarm INTEGER DEFAULT 0,  -- 0 or 1
    is_sms INTEGER DEFAULT 0,  -- 0 or 1
    is_email INTEGER DEFAULT 0,  -- 0 or 1
    is_call INTEGER DEFAULT 0,  -- 0 or 1
    created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    updated_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    CONSTRAINT uq_device_io_mapping UNIQUE(device_name, io_id, value)
);

-- Create indexes for device_io_mapping queries
CREATE INDEX IF NOT EXISTS idx_device_io_mapping_device ON device_io_mapping (device_name);
CREATE INDEX IF NOT EXISTS idx_device_io_mapping_device_io_id ON device_io_mapping (device_name, io_id);
CREATE INDEX IF NOT EXISTS idx_device_io_mapping_target ON device_io_mapping (target);
CREATE INDEX IF NOT EXISTS idx_device_io_mapping_is_alarm ON device_io_mapping (is_alarm);

COMMENT ON TABLE device_io_mapping IS 'Default IO mapping templates per device type. trackers inherit these when registered.';
COMMENT ON COLUMN device_io_mapping.device_name IS 'Device type name (e.g., GT06N, JC400D) - links to device_config.device_name';
COMMENT ON COLUMN device_io_mapping.io_type IS '2=Digital, 3=Analog';
COMMENT ON COLUMN device_io_mapping.target IS '0=column, 1=status, 2=both, 3=jsonb';

-- laststatus table (Hash Partitioned by IMEI for scalability)
-- Partitioned from the start to support large fleets (100K+ trackers).
-- Clean slate: full column list (consumer position + trackdata mirror + metric engine state).
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = 'laststatus') THEN
        CREATE TABLE laststatus (
            imei BIGINT NOT NULL,
            gps_time TIMESTAMPTZ NULL,
            server_time TIMESTAMPTZ NULL,
            latitude DOUBLE PRECISION NULL,
            longitude DOUBLE PRECISION NULL,
            altitude INTEGER NULL,
            angle INTEGER NULL,
            satellites INTEGER NULL,
            speed INTEGER NULL,
            reference_id INTEGER NULL,
            distance DOUBLE PRECISION NULL,
            vendor VARCHAR(50) DEFAULT 'teltonika',
            updateddate TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
            status VARCHAR(100) NULL,
            ignition BOOLEAN NULL,
            driver_seatbelt BOOLEAN NULL,
            passenger_seatbelt BOOLEAN NULL,
            door_status BOOLEAN NULL,
            passenger_seat DOUBLE PRECISION NULL,
            main_battery DOUBLE PRECISION NULL,
            battery_voltage DOUBLE PRECISION NULL,
            fuel DOUBLE PRECISION NULL,
            dallas_temperature_1 DOUBLE PRECISION NULL,
            dallas_temperature_2 DOUBLE PRECISION NULL,
            dallas_temperature_3 DOUBLE PRECISION NULL,
            dallas_temperature_4 DOUBLE PRECISION NULL,
            ble_temperature_1 DOUBLE PRECISION NULL,
            ble_temperature_2 DOUBLE PRECISION NULL,
            ble_temperature_3 DOUBLE PRECISION NULL,
            ble_temperature_4 DOUBLE PRECISION NULL,
            ble_humidity_1 INTEGER NULL,
            ble_humidity_2 INTEGER NULL,
            ble_humidity_3 INTEGER NULL,
            ble_humidity_4 INTEGER NULL,
            green_driving_value DOUBLE PRECISION NULL,
            dynamic_io JSONB NULL,
            is_valid INTEGER NULL,
            vehicle_state TEXT NULL,
            trip_in_progress BOOLEAN NULL,
            current_trip_id INTEGER NULL,
            current_fence_ids INTEGER[] NULL,
            driving_session_start TIMESTAMPTZ NULL,
            driving_session_distance DOUBLE PRECISION NULL,
            idle_start_time TIMESTAMPTZ NULL,
            speeding_start_time TIMESTAMPTZ NULL,
            speeding_max_speed INTEGER NULL,
            seatbelt_unbuckled_start TIMESTAMPTZ NULL,
            seatbelt_unbuckled_distance DOUBLE PRECISION NULL,
            temp_violation_start TIMESTAMPTZ NULL,
            humidity_violation_start TIMESTAMPTZ NULL,
            temp_stuck_since TIMESTAMPTZ NULL,
            prev_temp_value DOUBLE PRECISION NULL,
            prev_fuel_level DOUBLE PRECISION NULL,
            last_violation_time TIMESTAMPTZ NULL,
            last_violation_type VARCHAR(100) NULL,
            stoppage_start_time TIMESTAMPTZ NULL,
            stoppage_start_lat DOUBLE PRECISION NULL,
            stoppage_start_lon DOUBLE PRECISION NULL,
            rest_start_time TIMESTAMPTZ NULL,
            last_processed_gps_time TIMESTAMPTZ NULL,
            PRIMARY KEY (imei)
        ) PARTITION BY HASH (imei);
        CREATE TABLE laststatus_p0 PARTITION OF laststatus FOR VALUES WITH (MODULUS 8, REMAINDER 0);
        CREATE TABLE laststatus_p1 PARTITION OF laststatus FOR VALUES WITH (MODULUS 8, REMAINDER 1);
        CREATE TABLE laststatus_p2 PARTITION OF laststatus FOR VALUES WITH (MODULUS 8, REMAINDER 2);
        CREATE TABLE laststatus_p3 PARTITION OF laststatus FOR VALUES WITH (MODULUS 8, REMAINDER 3);
        CREATE TABLE laststatus_p4 PARTITION OF laststatus FOR VALUES WITH (MODULUS 8, REMAINDER 4);
        CREATE TABLE laststatus_p5 PARTITION OF laststatus FOR VALUES WITH (MODULUS 8, REMAINDER 5);
        CREATE TABLE laststatus_p6 PARTITION OF laststatus FOR VALUES WITH (MODULUS 8, REMAINDER 6);
        CREATE TABLE laststatus_p7 PARTITION OF laststatus FOR VALUES WITH (MODULUS 8, REMAINDER 7);
    END IF;
END $$;

-- Indexes on partitioned table
CREATE INDEX IF NOT EXISTS idx_laststatus_imei ON laststatus (imei);
CREATE INDEX IF NOT EXISTS idx_laststatus_reference_id ON laststatus (reference_id);
CREATE INDEX IF NOT EXISTS idx_laststatus_updateddate ON laststatus (updateddate);
CREATE INDEX IF NOT EXISTS idx_laststatus_vendor ON laststatus (vendor);

-- State transition log for vehicle_state (plan § 6.3 Group 8). Populated on vehicle_state change (real-time + RECALC backfill).
CREATE TABLE IF NOT EXISTS laststatus_history (
    imei BIGINT NOT NULL,
    gps_time TIMESTAMPTZ NOT NULL,
    vehicle_state TEXT NULL,
    previous_state TEXT NULL,
    PRIMARY KEY (imei, gps_time)
);
DO $$
BEGIN
    PERFORM create_hypertable(
        'laststatus_history',
        'gps_time',
        chunk_time_interval => INTERVAL '7 days',
        if_not_exists => TRUE
    );
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to create hypertable for laststatus_history: %', SQLERRM;
END $$;
CREATE INDEX IF NOT EXISTS idx_laststatus_history_imei_gps_time ON laststatus_history (imei, gps_time DESC);

-- Location reference table (POI/landmarks)
CREATE TABLE IF NOT EXISTS location_reference (
    id INTEGER NOT NULL PRIMARY KEY,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    reference TEXT NOT NULL,
    geom geometry(Point, 4326) NULL
);

-- Create indexes for location reference queries
CREATE INDEX IF NOT EXISTS idx_location_reference_id ON location_reference (id);
CREATE INDEX IF NOT EXISTS idx_location_reference_latitude_longitude ON location_reference (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_location_reference_reference ON location_reference USING gin(to_tsvector('english', reference));
-- Create spatial index for nearest neighbor queries (GIST)
CREATE INDEX IF NOT EXISTS idx_location_reference_geom ON location_reference USING GIST(geom);


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 2B: METRIC ENGINE (clean slate - single schema; no ALTER)
-- Used by: metric_engine_node, consumer_node. Plan: METRIC_ENGINE_IMPLEMENTATION_PLAN.md
-- trackdata/laststatus columns are in CREATE TABLE (Section 2). Here: config, asset, fence, metric_events, trip, scoring.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- customer hierarchy & config
CREATE TABLE IF NOT EXISTS customer (
    customer_name VARCHAR(255) NOT NULL PRIMARY KEY,
    customer_type VARCHAR(50) NULL,
    parent_company VARCHAR(255) NULL,
    client_id INTEGER NOT NULL UNIQUE,
    has_parent_company BOOLEAN DEFAULT FALSE,
    is_parent_company BOOLEAN DEFAULT FALSE,
    relationship_type VARCHAR(50) NULL,
    billing_mode VARCHAR(50) NULL,
    created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    updated_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);
-- Plan § 6.3 Group 1: client_config FK to customer for referential integrity
CREATE TABLE IF NOT EXISTS client_config (
    client_id INTEGER NOT NULL,
    config_key VARCHAR(100) NOT NULL,
    config_value VARCHAR(500) NOT NULL,
    PRIMARY KEY (client_id, config_key),
    CONSTRAINT fk_client_config_customer FOREIGN KEY (client_id) REFERENCES customer(client_id) ON DELETE CASCADE
);
-- Plan § 6.3: tracker_config FK to tracker (added after tracker exists, see below)
CREATE TABLE IF NOT EXISTS tracker_config (
    imei BIGINT NOT NULL,
    config_key VARCHAR(100) NOT NULL,
    config_value VARCHAR(500) NOT NULL,
    PRIMARY KEY (imei, config_key)
);
CREATE TABLE IF NOT EXISTS system_config (
    config_key VARCHAR(100) NOT NULL PRIMARY KEY,
    config_value VARCHAR(500) NOT NULL,
    description TEXT NULL,
    data_type VARCHAR(20) NULL,
    min_value VARCHAR(100) NULL,
    max_value VARCHAR(100) NULL,
    updated_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    updated_by INTEGER NULL
);
-- NON_LIVE_TABLE_CATALOG § 2.4: client_feature_flags (frontend display; backend calculates all metrics)
CREATE TABLE IF NOT EXISTS client_feature_flags (
    client_id INTEGER NOT NULL PRIMARY KEY,
    feature_temperature_monitoring BOOLEAN DEFAULT TRUE,
    feature_fuel_monitoring BOOLEAN DEFAULT TRUE,
    feature_driver_scoring BOOLEAN DEFAULT TRUE,
    feature_route_tracking BOOLEAN DEFAULT TRUE,
    feature_ai_camera BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_client_feature_flags_client FOREIGN KEY (client_id) REFERENCES customer(client_id) ON DELETE CASCADE
);
-- Plan § 9B.1: client_id and imei for affected scope (queries and plan compliance)
CREATE TABLE IF NOT EXISTS config_change_log (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL,
    record_key VARCHAR(100) NOT NULL,
    config_key VARCHAR(100) NOT NULL,
    old_value VARCHAR(500) NULL,
    new_value VARCHAR(500) NULL,
    changed_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ NULL,
    client_id INTEGER NULL,
    imei BIGINT NULL
);
CREATE INDEX IF NOT EXISTS idx_config_change_log_table_record ON config_change_log (table_name, record_key);
CREATE INDEX IF NOT EXISTS idx_config_change_log_changed_at ON config_change_log (changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_config_change_log_client_imei ON config_change_log (client_id, imei);
CREATE TABLE IF NOT EXISTS recalculation_queue (
    id BIGSERIAL PRIMARY KEY,
    job_type VARCHAR(50) NULL,
    trigger_type VARCHAR(50) NULL,
    config_change_id INTEGER NULL,
    scope_client_id INTEGER NULL,
    scope_imei BIGINT NULL,
    imei BIGINT NULL,
    reason VARCHAR(255) NULL,
    scope_date_from DATE NULL,
    scope_date_to DATE NULL,
    priority INTEGER DEFAULT 2,
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    started_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    error_message TEXT NULL,
    rows_affected INTEGER NULL,
    scope_vehicle_id INTEGER NULL,
    scope_fence_id INTEGER NULL
);
CREATE INDEX IF NOT EXISTS idx_recalculation_queue_status ON recalculation_queue (status);
CREATE INDEX IF NOT EXISTS idx_recalculation_queue_imei ON recalculation_queue (imei);
CREATE INDEX IF NOT EXISTS idx_recalculation_queue_scope_client ON recalculation_queue (scope_client_id);
CREATE INDEX IF NOT EXISTS idx_recalculation_queue_created ON recalculation_queue (created_at);

-- Plan § 9.3: formula version registry (metric_name -> version) for formula-version–driven recalc
CREATE TABLE IF NOT EXISTS formula_version_registry (
    metric_name VARCHAR(100) NOT NULL PRIMARY KEY,
    version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    updated_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);

-- Plan § 6 optional: FK for integrity (config_change_id can be NULL)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_recalculation_config_change') THEN
        ALTER TABLE recalculation_queue
        ADD CONSTRAINT fk_recalculation_config_change
        FOREIGN KEY (config_change_id) REFERENCES config_change_log(id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'recalculation_queue FK config_change_log: %', SQLERRM;
END $$;

-- Metric engine message retry tracking (plan § 2.6: persist retry count so restarts do not reset; DLQ after max)
CREATE TABLE IF NOT EXISTS metric_engine_message_retries (
    message_signature VARCHAR(64) NOT NULL PRIMARY KEY,
    retry_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);
CREATE INDEX IF NOT EXISTS idx_metric_engine_message_retries_updated ON metric_engine_message_retries (updated_at);

-- Plan § 2.9: message deduplication by signature; ACK only after successful DB write; skip if already processed
CREATE TABLE IF NOT EXISTS metric_engine_processed_messages (
    message_signature VARCHAR(64) NOT NULL PRIMARY KEY,
    processed_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);
CREATE INDEX IF NOT EXISTS idx_metric_engine_processed_messages_at ON metric_engine_processed_messages (processed_at);

-- Asset registry (vehicle, tracker, driver, transporter, region, users)
CREATE TABLE IF NOT EXISTS vehicle (
    vehicle_id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL,
    registration_number VARCHAR(50) NULL,
    fuel_capacity DOUBLE PRECISION NULL,
    expected_km_per_liter DOUBLE PRECISION NULL,
    fuel_price_per_liter DOUBLE PRECISION NULL,
    driver_id INTEGER NULL,
    transporter_id INTEGER NULL,
    region_id INTEGER NULL,
    last_service_date DATE NULL,
    last_service_km DOUBLE PRECISION NULL,
    insurance_expiry DATE NULL,
    manufacture_year INTEGER NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    updated_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);
CREATE INDEX IF NOT EXISTS idx_vehicle_client_id ON vehicle (client_id);
CREATE TABLE IF NOT EXISTS tracker (
    imei BIGINT NOT NULL PRIMARY KEY,
    vehicle_id INTEGER NULL,
    tracker_type VARCHAR(50) NULL,
    has_fuel_sensor BOOLEAN DEFAULT FALSE,
    has_temp_sensor BOOLEAN DEFAULT FALSE,
    has_humidity_sensor BOOLEAN DEFAULT FALSE,
    has_mdvr BOOLEAN DEFAULT FALSE,
    has_seatbelt_sensor BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    updated_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    CONSTRAINT fk_tracker_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle(vehicle_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_tracker_vehicle_id ON tracker (vehicle_id);
-- Plan § 6.3: tracker_config FK to tracker (tracker created after tracker_config, so add FK here)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tracker_config_tracker') THEN
        ALTER TABLE tracker_config ADD CONSTRAINT fk_tracker_config_tracker FOREIGN KEY (imei) REFERENCES tracker(imei) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tracker_config FK to tracker: %', SQLERRM;
END $$;
CREATE TABLE IF NOT EXISTS driver (
    driver_id SERIAL PRIMARY KEY,
    driver_name VARCHAR(255) NULL,
    license_number VARCHAR(100) NULL,
    license_expiry DATE NULL,
    hire_date DATE NULL,
    created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    updated_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);
CREATE TABLE IF NOT EXISTS transporter (
    transporter_id SERIAL PRIMARY KEY,
    transporter_name VARCHAR(255) NULL,
    corporate_id INTEGER NULL,
    vendor_id INTEGER NULL,
    region_id INTEGER NULL,
    created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    updated_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);
CREATE TABLE IF NOT EXISTS region (
    region_id SERIAL PRIMARY KEY,
    region_name VARCHAR(255) NULL,
    region_polygon GEOMETRY NULL,
    parent_region_id INTEGER NULL,
    created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    updated_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    user_name VARCHAR(255) NULL,
    user_role VARCHAR(50) NULL,
    client_id INTEGER NULL,
    created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    updated_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);

-- fence
CREATE TABLE IF NOT EXISTS fence (
    fence_id SERIAL PRIMARY KEY,
    fence_name VARCHAR(255) NULL,
    client_id INTEGER NULL,
    fence_type VARCHAR(50) NULL,
    polygon GEOMETRY NULL,
    center_point GEOMETRY(POINT, 4326) NULL,
    buffer_distance INTEGER DEFAULT 50,
    restricted_hours TSTZRANGE NULL,
    created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    updated_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);
CREATE INDEX IF NOT EXISTS idx_fence_client_id ON fence (client_id);

-- fence_trip_config (origin-destination pairs for fence-wise trips; NON_LIVE_TABLE_CATALOG § 5.2)
CREATE TABLE IF NOT EXISTS fence_trip_config (
    config_id SERIAL PRIMARY KEY,
    config_name VARCHAR(255) NULL,
    client_id INTEGER NULL,
    origin_fence_id INTEGER NULL,
    destination_fence_id INTEGER NULL,
    expected_duration_min INTEGER NULL,
    expected_distance_km DOUBLE PRECISION NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    CONSTRAINT fk_fence_trip_config_client FOREIGN KEY (client_id) REFERENCES customer(client_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_fence_trip_config_client ON fence_trip_config (client_id);

-- Metric engine output
CREATE TABLE IF NOT EXISTS metric_events (
    id BIGSERIAL PRIMARY KEY,
    imei BIGINT NOT NULL,
    gps_time TIMESTAMPTZ NOT NULL,
    event_category TEXT NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_value DOUBLE PRECISION NULL,
    threshold_value DOUBLE PRECISION NULL,
    duration_sec INTEGER NULL,
    severity VARCHAR(20) NULL,
    fence_id INTEGER NULL,
    trip_id INTEGER NULL,
    trackdata_id BIGINT NULL,
    latitude DOUBLE PRECISION NULL,
    longitude DOUBLE PRECISION NULL,
    metadata JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    formula_version VARCHAR(20) NULL DEFAULT '1.0.0'
);
CREATE INDEX IF NOT EXISTS idx_metric_events_imei_gps_time ON metric_events (imei, gps_time DESC);
CREATE INDEX IF NOT EXISTS idx_metric_events_event_category ON metric_events (event_category);
CREATE INDEX IF NOT EXISTS idx_metric_events_trip_id ON metric_events (trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_metric_events_fence_id ON metric_events (fence_id) WHERE fence_id IS NOT NULL;

-- geocode_cache (plan § 6.3 Group 8; METRIC_CATALOG — reverse geocoding cache)
CREATE TABLE IF NOT EXISTS geocode_cache (
    lat_rounded DOUBLE PRECISION NOT NULL,
    lng_rounded DOUBLE PRECISION NOT NULL,
    city VARCHAR(255) NULL,
    address TEXT NULL,
    country VARCHAR(100) NULL,
    cached_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    PRIMARY KEY (lat_rounded, lng_rounded)
);
CREATE INDEX IF NOT EXISTS idx_geocode_cache_cached_at ON geocode_cache (cached_at);

-- trip system
CREATE TABLE IF NOT EXISTS trip (
    trip_id SERIAL PRIMARY KEY,
    trip_name VARCHAR(255) NULL,
    vehicle_id INTEGER NULL,
    driver_id INTEGER NULL,
    trip_type VARCHAR(50) NULL,
    trip_status VARCHAR(20) DEFAULT 'Ongoing',
    creation_mode VARCHAR(20) DEFAULT 'Automatic',
    trip_start_time TIMESTAMPTZ NULL,
    trip_end_time TIMESTAMPTZ NULL,
    start_latitude DOUBLE PRECISION NULL,
    start_longitude DOUBLE PRECISION NULL,
    end_latitude DOUBLE PRECISION NULL,
    end_longitude DOUBLE PRECISION NULL,
    total_distance_km DOUBLE PRECISION NULL,
    total_duration_sec INTEGER NULL,
    fuel_consumed DOUBLE PRECISION NULL,
    created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    updated_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    CONSTRAINT fk_trip_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle(vehicle_id) ON DELETE SET NULL,
    CONSTRAINT fk_trip_driver FOREIGN KEY (driver_id) REFERENCES driver(driver_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_trip_vehicle_id ON trip (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_trip_status ON trip (trip_status);
CREATE INDEX IF NOT EXISTS idx_trip_start_time ON trip (trip_start_time DESC);
CREATE TABLE IF NOT EXISTS trip_fence_wise_extension (
    trip_id INTEGER NOT NULL PRIMARY KEY,
    origin_fence_id INTEGER NULL,
    destination_fence_id INTEGER NULL,
    source_exit_time TIMESTAMPTZ NULL,
    destination_arrival_time TIMESTAMPTZ NULL,
    CONSTRAINT fk_trip_fence_wise_trip FOREIGN KEY (trip_id) REFERENCES trip(trip_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS trip_round_extension (
    trip_id INTEGER NOT NULL PRIMARY KEY,
    origin_fence_id INTEGER NULL,
    planned_fence_id INTEGER NULL,
    upload_id INTEGER NULL,
    destination_arrival_time TIMESTAMPTZ NULL,
    destination_exit_time TIMESTAMPTZ NULL,
    deviation_status VARCHAR(50) NULL,
    time_compliance VARCHAR(50) NULL,
    CONSTRAINT fk_trip_round_trip FOREIGN KEY (trip_id) REFERENCES trip(trip_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS trip_route_extension (
    trip_id INTEGER NOT NULL PRIMARY KEY,
    route_id INTEGER NULL,
    deviation_status VARCHAR(50) NULL,
    deviation_count INTEGER NULL,
    CONSTRAINT fk_trip_route_trip FOREIGN KEY (trip_id) REFERENCES trip(trip_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS trip_stoppage_log (
    stoppage_id SERIAL PRIMARY KEY,
    trip_id INTEGER NULL,
    stoppage_type VARCHAR(50) NULL,
    start_time TIMESTAMPTZ NULL,
    end_time TIMESTAMPTZ NULL,
    duration_sec INTEGER NULL,
    latitude DOUBLE PRECISION NULL,
    longitude DOUBLE PRECISION NULL,
    inside_fence_id INTEGER NULL,
    CONSTRAINT fk_stoppage_trip FOREIGN KEY (trip_id) REFERENCES trip(trip_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_trip_stoppage_trip_id ON trip_stoppage_log (trip_id);

-- Scoring tables
CREATE TABLE IF NOT EXISTS violation_points (
    client_id INTEGER NOT NULL,
    violation_type VARCHAR(100) NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    severity VARCHAR(20) NULL,
    PRIMARY KEY (client_id, violation_type),
    CONSTRAINT fk_violation_points_client FOREIGN KEY (client_id) REFERENCES customer(client_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_violation_points_client ON violation_points (client_id);
CREATE TABLE IF NOT EXISTS score_weights (
    client_id INTEGER NOT NULL,
    weight_key VARCHAR(100) NOT NULL,
    weight_value DOUBLE PRECISION NOT NULL DEFAULT 0,
    PRIMARY KEY (client_id, weight_key),
    CONSTRAINT fk_score_weights_client FOREIGN KEY (client_id) REFERENCES customer(client_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_score_weights_client ON score_weights (client_id);

-- calibration (raw fuel sensor -> liters per vehicle; NON_LIVE_TABLE_CATALOG)
CREATE TABLE IF NOT EXISTS calibration (
    id SERIAL PRIMARY KEY,
    vehicle_id INTEGER NOT NULL,
    raw_value_min DOUBLE PRECISION NOT NULL,
    raw_value_max DOUBLE PRECISION NOT NULL,
    calibrated_liters DOUBLE PRECISION NOT NULL,
    sequence INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    CONSTRAINT fk_calibration_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle(vehicle_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_calibration_vehicle_id ON calibration (vehicle_id);

-- road (road-type speed limits; NON_LIVE_TABLE_CATALOG)
CREATE TABLE IF NOT EXISTS road (
    road_id SERIAL PRIMARY KEY,
    road_name VARCHAR(255) NULL,
    road_type VARCHAR(50) NOT NULL,
    road_linestring GEOMETRY(LineString, 4326) NULL,
    road_width INTEGER DEFAULT 20,
    speed_limit INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);
CREATE INDEX IF NOT EXISTS idx_road_road_type ON road (road_type);

-- route (route-based trips; NON_LIVE_TABLE_CATALOG)
CREATE TABLE IF NOT EXISTS route (
    route_id SERIAL PRIMARY KEY,
    route_name VARCHAR(255) NULL,
    client_id INTEGER NULL,
    polyline GEOMETRY(LineString, 4326) NULL,
    waypoints JSONB NULL,
    distance_km DOUBLE PRECISION NULL,
    eta_seconds INTEGER NULL,
    created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    CONSTRAINT fk_route_client FOREIGN KEY (client_id) REFERENCES customer(client_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_route_client_id ON route (client_id);

-- route_assignment (NON_LIVE_TABLE_CATALOG)
CREATE TABLE IF NOT EXISTS route_assignment (
    assignment_id SERIAL PRIMARY KEY,
    client_id INTEGER NULL,
    route_id INTEGER NOT NULL,
    vehicle_id INTEGER NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    CONSTRAINT fk_route_assignment_route FOREIGN KEY (route_id) REFERENCES route(route_id) ON DELETE CASCADE,
    CONSTRAINT fk_route_assignment_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle(vehicle_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_route_assignment_route ON route_assignment (route_id);
CREATE INDEX IF NOT EXISTS idx_route_assignment_vehicle ON route_assignment (vehicle_id);

-- upload_sheet (round trip; NON_LIVE_TABLE_CATALOG)
CREATE TABLE IF NOT EXISTS upload_sheet (
    upload_id SERIAL PRIMARY KEY,
    client_id INTEGER NULL,
    vehicle_number VARCHAR(100) NULL,
    vehicle_id INTEGER NULL,
    driver_name VARCHAR(255) NULL,
    helper_name VARCHAR(255) NULL,
    start_date DATE NULL,
    start_time TIME NULL,
    destination_fence_id INTEGER NULL,
    expected_duration_min INTEGER NULL,
    expected_mileage_km DOUBLE PRECISION NULL,
    project_id VARCHAR(100) NULL,
    remarks TEXT NULL,
    created_by INTEGER NULL,
    created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    CONSTRAINT fk_upload_sheet_client FOREIGN KEY (client_id) REFERENCES customer(client_id) ON DELETE SET NULL,
    CONSTRAINT fk_upload_sheet_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle(vehicle_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_upload_sheet_vehicle_id ON upload_sheet (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_upload_sheet_start_date ON upload_sheet (start_date);

-- metrics_alarm_config (per-IMEI alarm settings for metric events; NON_LIVE_TABLE_CATALOG § 8.2)
CREATE TABLE IF NOT EXISTS metrics_alarm_config (
    id SERIAL PRIMARY KEY,
    imei BIGINT NOT NULL DEFAULT 0,
    event_type VARCHAR(100) NOT NULL,
    is_alarm INTEGER DEFAULT 1,
    is_sms INTEGER DEFAULT 0,
    is_email INTEGER DEFAULT 0,
    is_call INTEGER DEFAULT 0,
    priority INTEGER DEFAULT 5,
    start_time TIME NULL,
    end_time TIME NULL,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    updated_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);
CREATE INDEX IF NOT EXISTS idx_metrics_alarm_config_imei ON metrics_alarm_config (imei);

-- Materialized views (plan § 6.4; METRIC_CATALOG). Refresh via recalculation worker or cron.
-- mv_daily_mileage: duration from consecutive rows (speed>5 moving, speed<=5&ignition idle, else stopped); trip_count from trip.
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_mileage AS
SELECT
    grp.date,
    grp.imei,
    grp.client_id,
    grp.total_distance_km,
    grp.record_count,
    (SELECT COUNT(*)::INTEGER FROM trip tp JOIN tracker tr2 ON tr2.vehicle_id = tp.vehicle_id WHERE tr2.imei = grp.imei AND (tp.trip_start_time AT TIME ZONE 'UTC')::DATE = grp.date) AS trip_count,
    grp.moving_duration_sec,
    grp.idle_duration_sec,
    grp.stopped_duration_sec,
    grp.total_duration_sec,
    grp.idle_rate_percent,
    grp.moving_rate_percent,
    grp.avg_speed_kmh
FROM (
    WITH with_dur AS (
        SELECT
            t.imei,
            t.gps_time,
            t.distance,
            t.speed,
            t.ignition,
            v.client_id,
            EXTRACT(EPOCH FROM (LEAD(t.gps_time) OVER (PARTITION BY t.imei ORDER BY t.gps_time) - t.gps_time))::INTEGER AS duration_sec
        FROM trackdata t
        LEFT JOIN tracker tr ON tr.imei = t.imei
        LEFT JOIN vehicle v ON v.vehicle_id = tr.vehicle_id
        WHERE t.distance IS NOT NULL AND t.distance > 0
    )
    SELECT
        (gps_time AT TIME ZONE 'UTC')::DATE AS date,
        imei,
        client_id,
        COALESCE(SUM(distance), 0) / 1000.0 AS total_distance_km,
        COUNT(*)::INTEGER AS record_count,
        COALESCE(SUM(duration_sec) FILTER (WHERE duration_sec IS NOT NULL AND speed > 5), 0)::INTEGER AS moving_duration_sec,
        COALESCE(SUM(duration_sec) FILTER (WHERE duration_sec IS NOT NULL AND speed <= 5 AND speed >= 0 AND ignition = TRUE), 0)::INTEGER AS idle_duration_sec,
        COALESCE(SUM(duration_sec) FILTER (WHERE duration_sec IS NOT NULL AND (speed = 0 OR (speed <= 5 AND (ignition = FALSE OR ignition IS NULL)))), 0)::INTEGER AS stopped_duration_sec,
        (COALESCE(SUM(duration_sec) FILTER (WHERE duration_sec IS NOT NULL), 0)::BIGINT)::INTEGER AS total_duration_sec,
        CASE WHEN COALESCE(SUM(duration_sec) FILTER (WHERE duration_sec IS NOT NULL), 0) > 0
            THEN 100.0 * COALESCE(SUM(duration_sec) FILTER (WHERE duration_sec IS NOT NULL AND speed <= 5 AND speed >= 0 AND ignition = TRUE), 0) / NULLIF(SUM(duration_sec) FILTER (WHERE duration_sec IS NOT NULL), 0)
            ELSE NULL END::DOUBLE PRECISION AS idle_rate_percent,
        CASE WHEN COALESCE(SUM(duration_sec) FILTER (WHERE duration_sec IS NOT NULL), 0) > 0
            THEN 100.0 * COALESCE(SUM(duration_sec) FILTER (WHERE duration_sec IS NOT NULL AND speed > 5), 0) / NULLIF(SUM(duration_sec) FILTER (WHERE duration_sec IS NOT NULL), 0)
            ELSE NULL END::DOUBLE PRECISION AS moving_rate_percent,
        CASE WHEN COALESCE(SUM(duration_sec) FILTER (WHERE duration_sec IS NOT NULL AND speed > 5), 0) > 0
            THEN (COALESCE(SUM(distance), 0) / 1000.0) / (COALESCE(SUM(duration_sec) FILTER (WHERE duration_sec IS NOT NULL AND speed > 5), 0) / 3600.0)
            ELSE NULL END::DOUBLE PRECISION AS avg_speed_kmh
    FROM with_dur
    GROUP BY (gps_time AT TIME ZONE 'UTC')::DATE, imei, client_id
) grp;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_mileage_pk ON mv_daily_mileage (date, imei);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_violations AS
SELECT
    (gps_time AT TIME ZONE 'UTC')::DATE AS date,
    me.imei,
    v.client_id,
    me.event_category,
    COUNT(*)::INTEGER AS violation_count,
    COUNT(*) FILTER (WHERE me.severity = 'Critical')::INTEGER AS critical_count,
    COALESCE(SUM(me.duration_sec), 0)::INTEGER AS total_duration_sec,
    MAX(me.severity) AS max_severity
FROM metric_events me
LEFT JOIN tracker tr ON tr.imei = me.imei
LEFT JOIN vehicle v ON v.vehicle_id = tr.vehicle_id
GROUP BY (gps_time AT TIME ZONE 'UTC')::DATE, me.imei, v.client_id, me.event_category;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_violations_pk ON mv_daily_violations (date, imei, event_category);

-- mv_weekly_driver_scores (plan § 6.4; scores, rankings, driver_experience_days)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_weekly_driver_scores AS
SELECT
    week_start,
    driver_id,
    client_id,
    violation_count,
    base.total_points,
    total_points AS violation_points,
    (SELECT COUNT(*)::INTEGER FROM trip tp WHERE tp.vehicle_id IN (SELECT vehicle_id FROM vehicle v2 WHERE v2.driver_id = base.driver_id) AND date_trunc('week', tp.trip_start_time AT TIME ZONE 'UTC') = base.week_start) AS total_trips,
    (SELECT COALESCE(SUM(m.total_distance_km), 0) FROM mv_daily_mileage m JOIN tracker tr ON tr.imei = m.imei JOIN vehicle v2 ON v2.vehicle_id = tr.vehicle_id WHERE v2.driver_id = base.driver_id AND m.date >= base.week_start AND m.date < base.week_start + 7)::DOUBLE PRECISION AS total_distance_km,
    GREATEST(0, 100 - COALESCE(total_points, 0))::DOUBLE PRECISION AS safety_score,
    GREATEST(0, 100 - COALESCE(total_points, 0))::DOUBLE PRECISION AS efficiency_score,
    GREATEST(0, 100 - COALESCE(total_points, 0))::DOUBLE PRECISION AS compliance_score,
    GREATEST(0, 100 - COALESCE(total_points, 0))::DOUBLE PRECISION AS performance_score,
    GREATEST(0, 100 - COALESCE(total_points, 0))::DOUBLE PRECISION AS overall_score,
    RANK() OVER (PARTITION BY client_id, week_start ORDER BY total_points ASC NULLS LAST)::INTEGER AS ranking_safety,
    RANK() OVER (PARTITION BY client_id, week_start ORDER BY total_points ASC NULLS LAST)::INTEGER AS ranking_performance,
    NULL::DOUBLE PRECISION AS driver_retention_rate,
    (SELECT (CURRENT_DATE - d.hire_date)::INTEGER FROM driver d WHERE d.driver_id = base.driver_id) AS driver_experience_days
FROM (
    SELECT
        (date_trunc('week', me.gps_time AT TIME ZONE 'UTC'))::DATE AS week_start,
        v.driver_id,
        v.client_id,
        COUNT(*)::INTEGER AS violation_count,
        COALESCE(SUM(vp.points), 0)::INTEGER AS total_points
    FROM metric_events me
    JOIN tracker tr ON tr.imei = me.imei
    JOIN vehicle v ON v.vehicle_id = tr.vehicle_id
    LEFT JOIN violation_points vp ON vp.client_id = v.client_id AND vp.violation_type = me.event_type
    WHERE v.driver_id IS NOT NULL
    GROUP BY (date_trunc('week', me.gps_time AT TIME ZONE 'UTC'))::DATE, v.driver_id, v.client_id
) base;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_weekly_driver_scores_pk ON mv_weekly_driver_scores (week_start, driver_id);

-- mv_daily_vehicle_scores (plan § 7; performance_score, utilization_percent, efficiency_score, rankings)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_vehicle_scores AS
SELECT
    date,
    vehicle_id,
    client_id,
    violation_count,
    total_points,
    GREATEST(0, 100 - COALESCE(total_points, 0))::DOUBLE PRECISION AS performance_score,
    NULL::DOUBLE PRECISION AS utilization_percent,
    GREATEST(0, 100 - COALESCE(total_points, 0))::DOUBLE PRECISION AS efficiency_score,
    RANK() OVER (PARTITION BY client_id, date ORDER BY total_points ASC NULLS LAST)::INTEGER AS ranking_efficiency,
    RANK() OVER (PARTITION BY client_id, date ORDER BY total_points ASC NULLS LAST)::INTEGER AS ranking_utilization
FROM (
    SELECT
        (me.gps_time AT TIME ZONE 'UTC')::DATE AS date,
        v.vehicle_id,
        v.client_id,
        COUNT(*)::INTEGER AS violation_count,
        COALESCE(SUM(vp.points), 0)::INTEGER AS total_points
    FROM metric_events me
    JOIN tracker tr ON tr.imei = me.imei
    JOIN vehicle v ON v.vehicle_id = tr.vehicle_id
    LEFT JOIN violation_points vp ON vp.client_id = v.client_id AND vp.violation_type = me.event_type
    GROUP BY (me.gps_time AT TIME ZONE 'UTC')::DATE, v.vehicle_id, v.client_id
) base;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_vehicle_scores_pk ON mv_daily_vehicle_scores (date, vehicle_id);

-- mv_daily_camera_events (plan § 7; camera_online_percent, ai_violation_rate, fatigue_alert_count)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_camera_events AS
SELECT
    grp.date,
    grp.imei,
    grp.client_id,
    (SELECT CASE WHEN cnt > 0 THEN 100.0 * cnt / (24.0 * 60.0) ELSE NULL END FROM (SELECT COUNT(DISTINCT date_trunc('minute', td.gps_time))::INTEGER AS cnt FROM trackdata td WHERE td.imei = grp.imei AND (td.gps_time AT TIME ZONE 'UTC')::DATE = grp.date) x)::DOUBLE PRECISION AS camera_online_percent,
    grp.ai_violation_count,
    grp.fatigue_alert_count,
    CASE WHEN COALESCE(grp.max_total_distance_km, 0) > 0 THEN (grp.ai_violation_count::FLOAT / grp.max_total_distance_km) * 100.0 ELSE NULL END::DOUBLE PRECISION AS ai_violation_rate,
    grp.black_points
FROM (
    SELECT
        (a.gps_time AT TIME ZONE 'UTC')::DATE AS date,
        a.imei,
        v.client_id,
        COUNT(*)::INTEGER AS ai_violation_count,
        COUNT(*) FILTER (WHERE a.status = 'Fatigue')::INTEGER AS fatigue_alert_count,
        MAX(m.total_distance_km) AS max_total_distance_km,
        COALESCE(SUM(vp.points), 0)::INTEGER AS black_points
    FROM alarms a
    LEFT JOIN tracker tr ON tr.imei = a.imei
    LEFT JOIN vehicle v ON v.vehicle_id = tr.vehicle_id
    LEFT JOIN violation_points vp ON vp.client_id = v.client_id AND vp.violation_type = a.status
    LEFT JOIN mv_daily_mileage m ON m.imei = a.imei AND m.date = (a.gps_time AT TIME ZONE 'UTC')::DATE
    WHERE a.vendor = 'camera'
    GROUP BY (a.gps_time AT TIME ZONE 'UTC')::DATE, a.imei, v.client_id
) grp;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_camera_events_pk ON mv_daily_camera_events (date, imei);

-- mv_hourly_vehicle_stats (plan § 6.4; with moving/idle/stopped minutes from consecutive rows)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_hourly_vehicle_stats AS
WITH hourly_dur AS (
    SELECT
        date_trunc('hour', t.gps_time AT TIME ZONE 'UTC') AS hour,
        t.imei,
        t.speed,
        t.ignition,
        v.client_id,
        EXTRACT(EPOCH FROM (LEAD(t.gps_time) OVER (PARTITION BY t.imei ORDER BY t.gps_time) - t.gps_time)) / 60.0 AS duration_min
    FROM trackdata t
    LEFT JOIN tracker tr ON tr.imei = t.imei
    LEFT JOIN vehicle v ON v.vehicle_id = tr.vehicle_id
    WHERE t.speed IS NOT NULL
)
SELECT
    hour,
    imei,
    client_id,
    AVG(speed)::DOUBLE PRECISION AS avg_speed,
    MAX(speed)::INTEGER AS max_speed,
    COALESCE(SUM(duration_min) FILTER (WHERE duration_min IS NOT NULL AND speed > 5), 0)::INTEGER AS moving_minutes,
    COALESCE(SUM(duration_min) FILTER (WHERE duration_min IS NOT NULL AND speed <= 5 AND speed >= 0 AND ignition = TRUE), 0)::INTEGER AS idle_minutes,
    COALESCE(SUM(duration_min) FILTER (WHERE duration_min IS NOT NULL AND (speed = 0 OR (speed <= 5 AND (ignition = FALSE OR ignition IS NULL)))), 0)::INTEGER AS stopped_minutes,
    (SELECT COALESCE(SUM(t.distance), 0) / 1000.0 FROM trackdata t
     LEFT JOIN tracker tr ON tr.imei = t.imei
     WHERE tr.imei = hourly_dur.imei AND date_trunc('hour', t.gps_time AT TIME ZONE 'UTC') = hourly_dur.hour)::DOUBLE PRECISION AS distance_km
FROM hourly_dur
GROUP BY hour, imei, client_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_hourly_vehicle_stats_pk ON mv_hourly_vehicle_stats (hour, imei);

-- mv_trip_summary (plan § 7f)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_trip_summary AS
SELECT
    (t.trip_start_time AT TIME ZONE 'UTC')::DATE AS date,
    v.client_id,
    COUNT(*) FILTER (WHERE t.trip_type = 'Ignition-Based')::INTEGER AS ignition_trip_count,
    COUNT(*) FILTER (WHERE t.trip_type = 'fence-Wise')::INTEGER AS fence_trip_count,
    COUNT(*) FILTER (WHERE t.trip_type = 'Round-trip')::INTEGER AS round_trip_count,
    COUNT(*) FILTER (WHERE t.trip_type = 'route-Based')::INTEGER AS route_trip_count
FROM trip t
LEFT JOIN vehicle v ON v.vehicle_id = t.vehicle_id
WHERE t.trip_start_time IS NOT NULL
GROUP BY (t.trip_start_time AT TIME ZONE 'UTC')::DATE, v.client_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_trip_summary_pk ON mv_trip_summary (date, client_id);

-- Remaining materialized views (plan § 6.4; METRIC_CATALOG) — 19 MVs to reach 26 total
-- mv_daily_fuel_consumption (plan § 6.4; consumed_liters, km_per_liter, fuel_cost, cost_per_km, avg_fuel_level)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_fuel_consumption AS
SELECT
    (t.gps_time AT TIME ZONE 'UTC')::DATE AS date,
    t.imei,
    v.client_id,
    MIN(t.fuel) FILTER (WHERE t.fuel IS NOT NULL) AS start_fuel,
    MAX(t.fuel) FILTER (WHERE t.fuel IS NOT NULL) AS end_fuel,
    COALESCE(SUM(t.distance), 0) / 1000.0 AS distance_km,
    COUNT(*) FILTER (WHERE me.event_type IN ('Fuel_Fill', 'Fuel_Fill_Detected'))::INTEGER AS fill_count,
    COUNT(*) FILTER (WHERE me.event_type IN ('Fuel_Theft', 'Fuel_Theft_Detected'))::INTEGER AS theft_count,
    GREATEST(0, (MAX(t.fuel) FILTER (WHERE t.fuel IS NOT NULL) - MIN(t.fuel) FILTER (WHERE t.fuel IS NOT NULL)))::DOUBLE PRECISION AS consumed_liters,
    CASE WHEN GREATEST(0, (MAX(t.fuel) FILTER (WHERE t.fuel IS NOT NULL) - MIN(t.fuel) FILTER (WHERE t.fuel IS NOT NULL))) > 0
        THEN (COALESCE(SUM(t.distance), 0) / 1000.0) / GREATEST(0, (MAX(t.fuel) FILTER (WHERE t.fuel IS NOT NULL) - MIN(t.fuel) FILTER (WHERE t.fuel IS NOT NULL)))
        ELSE NULL END::DOUBLE PRECISION AS km_per_liter,
    (GREATEST(0, (MAX(t.fuel) FILTER (WHERE t.fuel IS NOT NULL) - MIN(t.fuel) FILTER (WHERE t.fuel IS NOT NULL))) * COALESCE(v.fuel_price_per_liter, 0))::DOUBLE PRECISION AS fuel_cost,
    CASE WHEN COALESCE(SUM(t.distance), 0) > 0 THEN (GREATEST(0, (MAX(t.fuel) FILTER (WHERE t.fuel IS NOT NULL) - MIN(t.fuel) FILTER (WHERE t.fuel IS NOT NULL))) * COALESCE(v.fuel_price_per_liter, 0)) / (COALESCE(SUM(t.distance), 0) / 1000.0) ELSE NULL END::DOUBLE PRECISION AS cost_per_km,
    ((MIN(t.fuel) FILTER (WHERE t.fuel IS NOT NULL) + MAX(t.fuel) FILTER (WHERE t.fuel IS NOT NULL)) / 2.0)::DOUBLE PRECISION AS avg_fuel_level
FROM trackdata t
LEFT JOIN tracker tr ON tr.imei = t.imei
LEFT JOIN vehicle v ON v.vehicle_id = tr.vehicle_id
LEFT JOIN metric_events me ON me.imei = t.imei AND (me.gps_time AT TIME ZONE 'UTC')::DATE = (t.gps_time AT TIME ZONE 'UTC')::DATE AND me.event_category = 'Fuel'
WHERE t.fuel IS NOT NULL
GROUP BY (t.gps_time AT TIME ZONE 'UTC')::DATE, t.imei, v.client_id, v.fuel_price_per_liter;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_fuel_consumption_pk ON mv_daily_fuel_consumption (date, imei);

-- mv_daily_temperature_compliance (plan § 6.4; compliance_percent, temp_deviation_avg, stationary_temp_avg)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_temperature_compliance AS
SELECT
    (t.gps_time AT TIME ZONE 'UTC')::DATE AS date,
    t.imei,
    v.client_id,
    1 AS sensor_id,
    MIN(COALESCE(t.dallas_temperature_1, t.ble_temperature_1))::DOUBLE PRECISION AS min_temp,
    MAX(COALESCE(t.dallas_temperature_1, t.ble_temperature_1))::DOUBLE PRECISION AS max_temp,
    AVG(COALESCE(t.dallas_temperature_1, t.ble_temperature_1))::DOUBLE PRECISION AS avg_temp,
    COUNT(*) FILTER (WHERE me.event_type IN ('Temp_High', 'Temp_Low'))::INTEGER AS violation_count,
    (100.0 * (1.0 - (COUNT(*) FILTER (WHERE me.event_type IN ('Temp_High', 'Temp_Low'))::FLOAT / NULLIF(COUNT(*), 0))))::DOUBLE PRECISION AS compliance_percent,
    NULL::DOUBLE PRECISION AS temp_deviation_avg,
    AVG(COALESCE(t.dallas_temperature_1, t.ble_temperature_1)) FILTER (WHERE t.speed = 0 OR t.speed IS NULL)::DOUBLE PRECISION AS stationary_temp_avg
FROM trackdata t
LEFT JOIN tracker tr ON tr.imei = t.imei
LEFT JOIN vehicle v ON v.vehicle_id = tr.vehicle_id
LEFT JOIN metric_events me ON me.imei = t.imei AND (me.gps_time AT TIME ZONE 'UTC')::DATE = (t.gps_time AT TIME ZONE 'UTC')::DATE AND me.event_category = 'Sensor'
WHERE t.dallas_temperature_1 IS NOT NULL OR t.ble_temperature_1 IS NOT NULL
GROUP BY (t.gps_time AT TIME ZONE 'UTC')::DATE, t.imei, v.client_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_temperature_compliance_pk ON mv_daily_temperature_compliance (date, imei, sensor_id);

-- mv_daily_humidity_compliance (plan § 6.4; compliance_percent)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_humidity_compliance AS
SELECT
    (t.gps_time AT TIME ZONE 'UTC')::DATE AS date,
    t.imei,
    v.client_id,
    AVG(COALESCE(t.ble_humidity_1, t.ble_humidity_2, t.ble_humidity_3, t.ble_humidity_4))::DOUBLE PRECISION AS avg_humidity,
    MIN(COALESCE(t.ble_humidity_1, t.ble_humidity_2, t.ble_humidity_3, t.ble_humidity_4))::DOUBLE PRECISION AS min_humidity,
    MAX(COALESCE(t.ble_humidity_1, t.ble_humidity_2, t.ble_humidity_3, t.ble_humidity_4))::DOUBLE PRECISION AS max_humidity,
    COUNT(*) FILTER (WHERE me.event_type IN ('Humidity_High', 'Humidity_Low'))::INTEGER AS violation_count,
    (100.0 * (1.0 - (COUNT(*) FILTER (WHERE me.event_type IN ('Humidity_High', 'Humidity_Low'))::FLOAT / NULLIF(COUNT(*), 0))))::DOUBLE PRECISION AS compliance_percent
FROM trackdata t
LEFT JOIN tracker tr ON tr.imei = t.imei
LEFT JOIN vehicle v ON v.vehicle_id = tr.vehicle_id
LEFT JOIN metric_events me ON me.imei = t.imei AND (me.gps_time AT TIME ZONE 'UTC')::DATE = (t.gps_time AT TIME ZONE 'UTC')::DATE AND me.event_category = 'Sensor'
WHERE t.ble_humidity_1 IS NOT NULL OR t.ble_humidity_2 IS NOT NULL OR t.ble_humidity_3 IS NOT NULL OR t.ble_humidity_4 IS NOT NULL
GROUP BY (t.gps_time AT TIME ZONE 'UTC')::DATE, t.imei, v.client_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_humidity_compliance_pk ON mv_daily_humidity_compliance (date, imei);

-- mv_hourly_violations (plan § 6.4)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_hourly_violations AS
SELECT
    date_trunc('hour', me.gps_time AT TIME ZONE 'UTC') AS hour,
    me.imei,
    v.client_id,
    me.event_category,
    COUNT(*)::INTEGER AS violation_count,
    EXTRACT(DOW FROM me.gps_time AT TIME ZONE 'UTC')::INTEGER AS day_of_week,
    CASE
        WHEN EXTRACT(HOUR FROM me.gps_time AT TIME ZONE 'UTC') BETWEEN 6 AND 11 THEN 'Morning'
        WHEN EXTRACT(HOUR FROM me.gps_time AT TIME ZONE 'UTC') BETWEEN 12 AND 17 THEN 'Afternoon'
        WHEN EXTRACT(HOUR FROM me.gps_time AT TIME ZONE 'UTC') BETWEEN 18 AND 22 THEN 'Evening'
        ELSE 'Night'
    END AS time_slot
FROM metric_events me
LEFT JOIN tracker tr ON tr.imei = me.imei
LEFT JOIN vehicle v ON v.vehicle_id = tr.vehicle_id
GROUP BY date_trunc('hour', me.gps_time AT TIME ZONE 'UTC'), me.imei, v.client_id, me.event_category, EXTRACT(DOW FROM me.gps_time AT TIME ZONE 'UTC'), CASE WHEN EXTRACT(HOUR FROM me.gps_time AT TIME ZONE 'UTC') BETWEEN 6 AND 11 THEN 'Morning' WHEN EXTRACT(HOUR FROM me.gps_time AT TIME ZONE 'UTC') BETWEEN 12 AND 17 THEN 'Afternoon' WHEN EXTRACT(HOUR FROM me.gps_time AT TIME ZONE 'UTC') BETWEEN 18 AND 22 THEN 'Evening' ELSE 'Night' END;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_hourly_violations_pk ON mv_hourly_violations (hour, imei, event_category);

-- mv_daily_harsh_events (plan § 6.4; harsh_score weighted)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_harsh_events AS
SELECT
    (me.gps_time AT TIME ZONE 'UTC')::DATE AS date,
    me.imei,
    v.client_id,
    COUNT(*) FILTER (WHERE me.event_type = 'Harsh_Brake')::INTEGER AS harsh_brake_count,
    COUNT(*) FILTER (WHERE me.event_type = 'Harsh_Accel')::INTEGER AS harsh_accel_count,
    COUNT(*) FILTER (WHERE me.event_type = 'Harsh_Corner')::INTEGER AS harsh_corner_count,
    COUNT(*)::INTEGER AS total_harsh_events,
    GREATEST(0, 100 - (COALESCE(COUNT(*) FILTER (WHERE me.event_type = 'Harsh_Brake'), 0) * 2 + COALESCE(COUNT(*) FILTER (WHERE me.event_type = 'Harsh_Accel'), 0) * 2 + COALESCE(COUNT(*) FILTER (WHERE me.event_type = 'Harsh_Corner'), 0) * 1))::DOUBLE PRECISION AS harsh_score,
    'Metric'::VARCHAR(20) AS source
FROM metric_events me
LEFT JOIN tracker tr ON tr.imei = me.imei
LEFT JOIN vehicle v ON v.vehicle_id = tr.vehicle_id
WHERE me.event_category = 'Harsh'
GROUP BY (me.gps_time AT TIME ZONE 'UTC')::DATE, me.imei, v.client_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_harsh_events_pk ON mv_daily_harsh_events (date, imei);

-- mv_daily_compliance (plan § 6.4; overall_compliance, on_time_delivery_rate, seatbelt/speed/route)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_compliance AS
SELECT
    (t.trip_start_time AT TIME ZONE 'UTC')::DATE AS date,
    tr.imei,
    v.client_id,
    COUNT(DISTINCT t.trip_id)::INTEGER AS total_trips,
    COUNT(DISTINCT t.trip_id) FILTER (WHERE NOT EXISTS (SELECT 1 FROM metric_events m WHERE m.trip_id = t.trip_id))::INTEGER AS compliant_trips,
    (100.0 * COUNT(DISTINCT t.trip_id) FILTER (WHERE NOT EXISTS (SELECT 1 FROM metric_events m WHERE m.trip_id = t.trip_id)) / NULLIF(COUNT(DISTINCT t.trip_id), 0))::DOUBLE PRECISION AS overall_compliance,
    (100.0 * COUNT(DISTINCT t.trip_id) FILTER (WHERE NOT EXISTS (SELECT 1 FROM metric_events m WHERE m.trip_id = t.trip_id)) / NULLIF(COUNT(DISTINCT t.trip_id), 0))::DOUBLE PRECISION AS on_time_delivery_rate,
    NULL::DOUBLE PRECISION AS seatbelt_compliance,
    NULL::DOUBLE PRECISION AS speed_compliance,
    NULL::DOUBLE PRECISION AS route_adherence
FROM trip t
LEFT JOIN vehicle v ON v.vehicle_id = t.vehicle_id
LEFT JOIN tracker tr ON tr.vehicle_id = t.vehicle_id
WHERE t.trip_start_time IS NOT NULL
GROUP BY (t.trip_start_time AT TIME ZONE 'UTC')::DATE, tr.imei, v.client_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_compliance_pk ON mv_daily_compliance (date, imei);

-- mv_daily_fence_stats (plan § 6.4; time_inside_sec, time_outside_sec, distance_inside/outside_km, first_entry_time, last_exit_time)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_fence_stats AS
SELECT
    (me.gps_time AT TIME ZONE 'UTC')::DATE AS date,
    me.imei,
    me.fence_id,
    f.client_id,
    COUNT(*) FILTER (WHERE me.event_type = 'fence_Enter' OR me.event_type LIKE 'fence%Enter')::INTEGER AS entry_count,
    COUNT(*) FILTER (WHERE me.event_type = 'fence_Exit' OR me.event_type LIKE 'fence%Exit')::INTEGER AS exit_count,
    NULL::INTEGER AS time_inside_sec,
    NULL::INTEGER AS time_outside_sec,
    NULL::DOUBLE PRECISION AS distance_inside_km,
    NULL::DOUBLE PRECISION AS distance_outside_km,
    MIN(me.gps_time) FILTER (WHERE me.event_type = 'fence_Enter' OR me.event_type LIKE 'fence%Enter') AS first_entry_time,
    MAX(me.gps_time) FILTER (WHERE me.event_type = 'fence_Exit' OR me.event_type LIKE 'fence%Exit') AS last_exit_time
FROM metric_events me
LEFT JOIN fence f ON f.fence_id = me.fence_id
WHERE me.event_category = 'fence' AND me.fence_id IS NOT NULL
GROUP BY (me.gps_time AT TIME ZONE 'UTC')::DATE, me.imei, me.fence_id, f.client_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_fence_stats_pk ON mv_daily_fence_stats (date, imei, fence_id);

-- mv_daily_stoppage_stats (plan § 6.4; normal/unusual_stoppage_count, in_fence/out_fence_stoppage_count)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_stoppage_stats AS
SELECT
    (s.start_time AT TIME ZONE 'UTC')::DATE AS date,
    tr.imei,
    v.client_id,
    COUNT(*)::INTEGER AS stoppage_count,
    COALESCE(SUM(s.duration_sec), 0)::INTEGER AS total_stoppage_sec,
    AVG(s.duration_sec)::INTEGER AS avg_stoppage_sec,
    MAX(s.duration_sec)::INTEGER AS longest_stoppage_sec,
    COUNT(*) FILTER (WHERE s.stoppage_type IS NULL OR s.stoppage_type != 'Unusual')::INTEGER AS normal_stoppage_count,
    COUNT(*) FILTER (WHERE s.stoppage_type = 'Unusual')::INTEGER AS unusual_stoppage_count,
    COUNT(*) FILTER (WHERE s.inside_fence_id IS NOT NULL)::INTEGER AS in_fence_stoppage_count,
    COUNT(*) FILTER (WHERE s.inside_fence_id IS NULL)::INTEGER AS out_fence_stoppage_count
FROM trip_stoppage_log s
JOIN trip t ON t.trip_id = s.trip_id
LEFT JOIN tracker tr ON tr.vehicle_id = t.vehicle_id
LEFT JOIN vehicle v ON v.vehicle_id = t.vehicle_id
WHERE s.start_time IS NOT NULL
GROUP BY (s.start_time AT TIME ZONE 'UTC')::DATE, tr.imei, v.client_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_stoppage_stats_pk ON mv_daily_stoppage_stats (date, imei);

-- mv_daily_trip_patterns (plan § 6.4; night/weekend %, peak_hour_trips, first/last_trip_time)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_trip_patterns AS
SELECT
    (t.trip_start_time AT TIME ZONE 'UTC')::DATE AS date,
    tr.imei,
    v.client_id,
    COUNT(*)::INTEGER AS trips_per_day,
    AVG(t.total_distance_km)::DOUBLE PRECISION AS avg_trip_length_km,
    COALESCE(SUM(t.total_duration_sec), 0) / 3600.0 AS active_hours,
    COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM t.trip_start_time AT TIME ZONE 'UTC') >= 22 OR EXTRACT(HOUR FROM t.trip_start_time AT TIME ZONE 'UTC') < 6)::INTEGER AS night_trips_count,
    (100.0 * COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM t.trip_start_time AT TIME ZONE 'UTC') >= 22 OR EXTRACT(HOUR FROM t.trip_start_time AT TIME ZONE 'UTC') < 6) / NULLIF(COUNT(*), 0))::DOUBLE PRECISION AS night_trips_percent,
    COUNT(*) FILTER (WHERE EXTRACT(DOW FROM t.trip_start_time AT TIME ZONE 'UTC') IN (0, 6))::INTEGER AS weekend_trips_count,
    (100.0 * COUNT(*) FILTER (WHERE EXTRACT(DOW FROM t.trip_start_time AT TIME ZONE 'UTC') IN (0, 6)) / NULLIF(COUNT(*), 0))::DOUBLE PRECISION AS weekend_trips_percent,
    NULL::INTEGER AS peak_hour_trips,
    (MIN(t.trip_start_time AT TIME ZONE 'UTC'))::TIME AS first_trip_time,
    (MAX(t.trip_start_time AT TIME ZONE 'UTC'))::TIME AS last_trip_time
FROM trip t
LEFT JOIN vehicle v ON v.vehicle_id = t.vehicle_id
LEFT JOIN tracker tr ON tr.vehicle_id = t.vehicle_id
WHERE t.trip_start_time IS NOT NULL
GROUP BY (t.trip_start_time AT TIME ZONE 'UTC')::DATE, tr.imei, v.client_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_trip_patterns_pk ON mv_daily_trip_patterns (date, imei);

-- mv_daily_road_distance (plan § 6.4; simplified: date/imei/client_id, road_type 'Unknown' until road join)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_road_distance AS
SELECT
    (t.gps_time AT TIME ZONE 'UTC')::DATE AS date,
    t.imei,
    v.client_id,
    'Unknown'::VARCHAR(20) AS road_type,
    COALESCE(SUM(t.distance), 0) / 1000.0 AS distance_km,
    AVG(t.speed)::DOUBLE PRECISION AS avg_speed,
    COUNT(*) FILTER (WHERE me.event_category = 'Speed')::INTEGER AS violation_count
FROM trackdata t
LEFT JOIN tracker tr ON tr.imei = t.imei
LEFT JOIN vehicle v ON v.vehicle_id = tr.vehicle_id
LEFT JOIN metric_events me ON me.imei = t.imei AND (me.gps_time AT TIME ZONE 'UTC')::DATE = (t.gps_time AT TIME ZONE 'UTC')::DATE AND me.event_category = 'Speed'
GROUP BY (t.gps_time AT TIME ZONE 'UTC')::DATE, t.imei, v.client_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_road_distance_pk ON mv_daily_road_distance (date, imei, road_type);

-- mv_maintenance_status (plan § 6.4; service_due_alert, km_since_service from vehicle)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_maintenance_status AS
SELECT
    (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::DATE AS date,
    tr.imei,
    v.client_id,
    (CURRENT_DATE - v.last_service_date)::INTEGER AS days_since_service,
    v.last_service_km::DOUBLE PRECISION AS km_since_service,
    (v.insurance_expiry - CURRENT_DATE)::INTEGER AS insurance_expiry_days,
    (d.license_expiry - CURRENT_DATE)::INTEGER AS license_expiry_days,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, (v.manufacture_year::TEXT || '-01-01')::DATE))::INTEGER AS vehicle_age_years,
    (CURRENT_DATE - v.last_service_date >= 90)::BOOLEAN AS service_due_alert
FROM vehicle v
JOIN tracker tr ON tr.vehicle_id = v.vehicle_id
LEFT JOIN driver d ON d.driver_id = v.driver_id
WHERE v.is_active = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_maintenance_status_pk ON mv_maintenance_status (date, imei);

-- mv_daily_fleet_status (plan § 6.4; not_responding, inactive, stopped, camera, fleet_health_percent)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_fleet_status AS
SELECT
    (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::DATE AS date,
    v.client_id,
    COUNT(DISTINCT v.vehicle_id) FILTER (WHERE v.is_active = TRUE)::INTEGER AS fleet_size,
    COUNT(DISTINCT tr.imei) FILTER (WHERE v.is_active = TRUE AND ls.updateddate IS NOT NULL AND (CURRENT_TIMESTAMP - ls.updateddate) < INTERVAL '24 hours')::INTEGER AS active_vehicles,
    COUNT(DISTINCT tr.imei) FILTER (WHERE v.is_active = TRUE AND (ls.updateddate IS NULL OR (CURRENT_TIMESTAMP - ls.updateddate) >= INTERVAL '24 hours'))::INTEGER AS not_responding_vehicles,
    COUNT(DISTINCT v.vehicle_id) FILTER (WHERE v.is_active = FALSE)::INTEGER AS inactive_vehicles,
    COUNT(DISTINCT tr.imei) FILTER (WHERE v.is_active = TRUE AND ls.speed = 0 AND (ls.ignition = FALSE OR ls.ignition IS NULL))::INTEGER AS stopped_vehicles,
    0::INTEGER AS active_camera_vehicles,
    0::INTEGER AS not_responding_camera_vehicles,
    CASE WHEN COUNT(DISTINCT v.vehicle_id) FILTER (WHERE v.is_active = TRUE) > 0 THEN (100.0 * COUNT(DISTINCT tr.imei) FILTER (WHERE v.is_active = TRUE AND ls.updateddate IS NOT NULL AND (CURRENT_TIMESTAMP - ls.updateddate) < INTERVAL '24 hours') / COUNT(DISTINCT v.vehicle_id) FILTER (WHERE v.is_active = TRUE)) ELSE NULL END::DOUBLE PRECISION AS fleet_health_percent
FROM vehicle v
LEFT JOIN tracker tr ON tr.vehicle_id = v.vehicle_id
LEFT JOIN laststatus ls ON ls.imei = tr.imei
GROUP BY v.client_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_fleet_status_pk ON mv_daily_fleet_status (date, client_id);

-- mv_monthly_fleet_summary (plan § 6.4; fuel_consumed_liters, avg_km_per_liter, fleet_avg_speed_kmh, avg_safety_score, utilization_percent, compliance_rate)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_monthly_fleet_summary AS
SELECT
    base.month,
    base.client_id,
    base.active_vehicles,
    base.total_distance_km,
    (SELECT COUNT(*)::INTEGER FROM trip tp JOIN vehicle v2 ON v2.vehicle_id = tp.vehicle_id WHERE v2.client_id = base.client_id AND (tp.trip_start_time AT TIME ZONE 'UTC')::DATE >= base.month AND (tp.trip_start_time AT TIME ZONE 'UTC')::DATE < (base.month + INTERVAL '1 month')::DATE) AS total_trips,
    base.total_violations,
    COALESCE(fuel_agg.fuel_consumed_liters, 0)::DOUBLE PRECISION AS fuel_consumed_liters,
    CASE WHEN COALESCE(fuel_agg.fuel_consumed_liters, 0) > 0 THEN base.total_distance_km / fuel_agg.fuel_consumed_liters ELSE NULL END::DOUBLE PRECISION AS avg_km_per_liter,
    CASE WHEN COALESCE(base.total_moving_sec, 0) > 0 THEN (base.total_distance_km * 3600.0) / base.total_moving_sec ELSE NULL END::DOUBLE PRECISION AS fleet_avg_speed_kmh,
    NULL::DOUBLE PRECISION AS avg_safety_score,
    NULL::DOUBLE PRECISION AS utilization_percent,
    NULL::DOUBLE PRECISION AS compliance_rate
FROM (
    SELECT
        date_trunc('month', (t.gps_time AT TIME ZONE 'UTC'))::DATE AS month,
        v.client_id,
        COUNT(DISTINCT tr.imei)::INTEGER AS active_vehicles,
        COALESCE(SUM(m.total_distance_km), 0)::DOUBLE PRECISION AS total_distance_km,
        COALESCE(SUM(dv.violation_count), 0)::INTEGER AS total_violations,
        COALESCE(SUM(m.moving_duration_sec), 0)::BIGINT AS total_moving_sec
    FROM trackdata t
    LEFT JOIN tracker tr ON tr.imei = t.imei
    LEFT JOIN vehicle v ON v.vehicle_id = tr.vehicle_id
    LEFT JOIN mv_daily_mileage m ON m.imei = t.imei AND m.date = (t.gps_time AT TIME ZONE 'UTC')::DATE AND m.client_id = v.client_id
    LEFT JOIN mv_daily_violations dv ON dv.imei = t.imei AND dv.date = (t.gps_time AT TIME ZONE 'UTC')::DATE AND dv.client_id = v.client_id
    GROUP BY date_trunc('month', t.gps_time AT TIME ZONE 'UTC'), v.client_id
) base
LEFT JOIN (
    SELECT client_id, date_trunc('month', date::TIMESTAMP)::DATE AS month, SUM(consumed_liters) AS fuel_consumed_liters
    FROM mv_daily_fuel_consumption
    WHERE client_id IS NOT NULL
    GROUP BY client_id, date_trunc('month', date::TIMESTAMP)
) fuel_agg ON fuel_agg.client_id = base.client_id AND fuel_agg.month = base.month;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_monthly_fleet_summary_pk ON mv_monthly_fleet_summary (month, client_id);

-- mv_transporter_summary (plan § 6.4; transporter_score, ranking)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_transporter_summary AS
SELECT
    date,
    transporter_id,
    client_id,
    vehicle_count,
    total_distance_km,
    total_violations,
    GREATEST(0, 100 - COALESCE(total_violations, 0))::DOUBLE PRECISION AS transporter_score,
    RANK() OVER (PARTITION BY client_id, date ORDER BY total_violations ASC NULLS LAST)::INTEGER AS ranking
FROM (
    SELECT
        (t.gps_time AT TIME ZONE 'UTC')::DATE AS date,
        v.transporter_id,
        v.client_id,
        COUNT(DISTINCT v.vehicle_id)::INTEGER AS vehicle_count,
        COALESCE(SUM(m.total_distance_km), 0)::DOUBLE PRECISION AS total_distance_km,
        COALESCE(SUM(dv.violation_count), 0)::INTEGER AS total_violations
    FROM vehicle v
    LEFT JOIN trackdata t ON t.imei IN (SELECT imei FROM tracker WHERE vehicle_id = v.vehicle_id)
    LEFT JOIN mv_daily_mileage m ON m.client_id = v.client_id AND m.date = (t.gps_time AT TIME ZONE 'UTC')::DATE
    LEFT JOIN mv_daily_violations dv ON dv.client_id = v.client_id AND dv.date = (t.gps_time AT TIME ZONE 'UTC')::DATE
    WHERE v.transporter_id IS NOT NULL
    GROUP BY (t.gps_time AT TIME ZONE 'UTC')::DATE, v.transporter_id, v.client_id
) base;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_transporter_summary_pk ON mv_transporter_summary (date, transporter_id, client_id);

-- mv_trip_violations (plan § 6.4; safety_score, efficiency_score, max_speed, moving_duration_sec, stopped_duration_sec)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_trip_violations AS
SELECT
    t.trip_id,
    tr.imei,
    v.client_id,
    COUNT(me.imei)::INTEGER AS total_violations,
    COUNT(me.imei) FILTER (WHERE me.event_category = 'Harsh')::INTEGER AS harsh_events,
    COUNT(me.imei) FILTER (WHERE me.event_category = 'Seatbelt')::INTEGER AS seatbelt_violations,
    COUNT(me.imei) FILTER (WHERE me.event_category = 'Speed')::INTEGER AS speed_violations,
    GREATEST(0, 100 - COALESCE(COUNT(me.imei), 0) * 2)::DOUBLE PRECISION AS safety_score,
    GREATEST(0, 100 - COALESCE(COUNT(me.imei), 0))::DOUBLE PRECISION AS efficiency_score,
    (SELECT MAX(td.speed)::DOUBLE PRECISION FROM trackdata td JOIN tracker tr2 ON tr2.imei = td.imei WHERE tr2.vehicle_id = t.vehicle_id AND td.gps_time >= t.trip_start_time AND td.gps_time <= COALESCE(t.trip_end_time, t.trip_start_time)) AS max_speed,
    t.total_duration_sec::INTEGER AS moving_duration_sec,
    NULL::INTEGER AS stopped_duration_sec
FROM trip t
LEFT JOIN vehicle v ON v.vehicle_id = t.vehicle_id
LEFT JOIN tracker tr ON tr.vehicle_id = t.vehicle_id
LEFT JOIN metric_events me ON me.trip_id = t.trip_id
GROUP BY t.trip_id, tr.imei, v.client_id, t.vehicle_id, t.trip_start_time, t.trip_end_time, t.total_duration_sec;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_trip_violations_pk ON mv_trip_violations (trip_id);

-- mv_daily_fuel_summary (plan § 6.4; avg_fuel_per_trip, avg_fuel_consumption_period, fuel_savings_liters)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_fuel_summary AS
SELECT
    f.date,
    f.client_id,
    COALESCE(SUM(f.consumed_liters), 0)::DOUBLE PRECISION AS total_consumed_liters,
    (SELECT COUNT(*)::INTEGER FROM trip tp JOIN vehicle vv ON vv.vehicle_id = tp.vehicle_id WHERE vv.client_id = f.client_id AND (tp.trip_start_time AT TIME ZONE 'UTC')::DATE = f.date) AS total_trip_count,
    CASE WHEN (SELECT COUNT(*) FROM trip tp JOIN vehicle vv ON vv.vehicle_id = tp.vehicle_id WHERE vv.client_id = f.client_id AND (tp.trip_start_time AT TIME ZONE 'UTC')::DATE = f.date) > 0 THEN COALESCE(SUM(f.consumed_liters), 0) / (SELECT COUNT(*)::FLOAT FROM trip tp JOIN vehicle vv ON vv.vehicle_id = tp.vehicle_id WHERE vv.client_id = f.client_id AND (tp.trip_start_time AT TIME ZONE 'UTC')::DATE = f.date) ELSE NULL END::DOUBLE PRECISION AS avg_fuel_per_trip,
    COALESCE(SUM(f.consumed_liters), 0)::DOUBLE PRECISION AS avg_fuel_consumption_period,
    NULL::DOUBLE PRECISION AS fuel_savings_liters
FROM mv_daily_fuel_consumption f
WHERE f.client_id IS NOT NULL
GROUP BY f.date, f.client_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_fuel_summary_pk ON mv_daily_fuel_summary (date, client_id);

-- mv_daily_client_analytics (plan § 6.4; avg_mileage_per_day, avg_mileage_per_vehicle, violation rates, peak_violation_hour)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_client_analytics AS
SELECT
    m.date,
    m.client_id,
    COALESCE(SUM(m.total_distance_km), 0)::DOUBLE PRECISION AS total_distance_km,
    COALESCE(SUM(dv.violation_count), 0)::INTEGER AS total_violations,
    COUNT(DISTINCT m.imei)::INTEGER AS vehicle_count,
    (COALESCE(SUM(m.total_distance_km), 0) / NULLIF(COUNT(DISTINCT m.imei), 0))::DOUBLE PRECISION AS avg_mileage_per_day,
    (COALESCE(SUM(m.total_distance_km), 0) / NULLIF(COUNT(DISTINCT m.imei), 0))::DOUBLE PRECISION AS avg_mileage_per_vehicle,
    (COALESCE(SUM(dv.violation_count), 0)::FLOAT / 1.0)::DOUBLE PRECISION AS violation_frequency,
    CASE WHEN (SELECT COUNT(*) FROM trip tp JOIN vehicle vv ON vv.vehicle_id = tp.vehicle_id WHERE vv.client_id = m.client_id AND (tp.trip_start_time AT TIME ZONE 'UTC')::DATE = m.date) > 0 THEN (COALESCE(SUM(dv.violation_count), 0)::FLOAT / (SELECT COUNT(*) FROM trip tp JOIN vehicle vv ON vv.vehicle_id = tp.vehicle_id WHERE vv.client_id = m.client_id AND (tp.trip_start_time AT TIME ZONE 'UTC')::DATE = m.date)) ELSE NULL END::DOUBLE PRECISION AS violation_rate_per_trip,
    CASE WHEN (SELECT COUNT(*) FROM trip tp JOIN vehicle vv ON vv.vehicle_id = tp.vehicle_id WHERE vv.client_id = m.client_id AND (tp.trip_start_time AT TIME ZONE 'UTC')::DATE = m.date) > 0 THEN (100.0 * (SELECT COUNT(DISTINCT trip_id) FROM metric_events me2 JOIN tracker tr2 ON tr2.imei = me2.imei JOIN vehicle v2 ON v2.vehicle_id = tr2.vehicle_id WHERE v2.client_id = m.client_id AND (me2.gps_time AT TIME ZONE 'UTC')::DATE = m.date) / NULLIF((SELECT COUNT(*) FROM trip tp JOIN vehicle vv ON vv.vehicle_id = tp.vehicle_id WHERE vv.client_id = m.client_id AND (tp.trip_start_time AT TIME ZONE 'UTC')::DATE = m.date), 0)) ELSE NULL END::DOUBLE PRECISION AS violation_rate_percent,
    (COALESCE(SUM(dv.violation_count), 0)::FLOAT / NULLIF(COUNT(DISTINCT m.imei), 0))::DOUBLE PRECISION AS violations_per_vehicle,
    NULL::DOUBLE PRECISION AS violations_per_driver,
    (SELECT EXTRACT(HOUR FROM me2.gps_time AT TIME ZONE 'UTC')::INTEGER FROM metric_events me2 JOIN tracker tr2 ON tr2.imei = me2.imei JOIN vehicle v2 ON v2.vehicle_id = tr2.vehicle_id WHERE v2.client_id = m.client_id AND (me2.gps_time AT TIME ZONE 'UTC')::DATE = m.date GROUP BY EXTRACT(HOUR FROM me2.gps_time AT TIME ZONE 'UTC') ORDER BY COUNT(*) DESC LIMIT 1) AS peak_violation_hour
FROM mv_daily_mileage m
LEFT JOIN mv_daily_violations dv ON dv.date = m.date AND dv.client_id = m.client_id
WHERE m.client_id IS NOT NULL
GROUP BY m.date, m.client_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_client_analytics_pk ON mv_daily_client_analytics (date, client_id);

-- mv_daily_trends (plan § 6.4; trend columns; WoW/MoM deltas computed in app or via LAG in query)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_trends AS
SELECT
    c.date,
    c.client_id,
    c.total_violations::DOUBLE PRECISION AS violation_trend_wow,
    c.total_distance_km::DOUBLE PRECISION AS mileage_trend_mom,
    NULL::DOUBLE PRECISION AS fuel_efficiency_trend,
    NULL::DOUBLE PRECISION AS safety_score_trend,
    NULL::DOUBLE PRECISION AS performance_improvement_pct,
    NULL::DOUBLE PRECISION AS cost_per_km_trend,
    NULL::DOUBLE PRECISION AS utilization_trend,
    NULL::DOUBLE PRECISION AS compliance_trend
FROM mv_daily_client_analytics c;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_trends_pk ON mv_daily_trends (date, client_id);

-- mv_hourly_violations_summary (plan § 6.4; from mv_hourly_violations)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_hourly_violations_summary AS
SELECT
    hour,
    (hour AT TIME ZONE 'UTC')::DATE AS date,
    client_id,
    SUM(violation_count)::INTEGER AS total_violation_count,
    MAX(day_of_week)::INTEGER AS day_of_week,
    MAX(time_slot)::VARCHAR(20) AS time_slot
FROM mv_hourly_violations
WHERE client_id IS NOT NULL
GROUP BY hour, client_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_hourly_violations_summary_pk ON mv_hourly_violations_summary (hour, client_id);

-- Rankings: driver by total_points (plan § 7 rankings)
CREATE OR REPLACE VIEW driver_rankings AS
SELECT week_start, client_id, driver_id,
       total_points, violation_count,
       RANK() OVER (PARTITION BY client_id, week_start ORDER BY total_points ASC) AS ranking_safety
FROM mv_weekly_driver_scores;

-- Rankings: vehicle by total_points
CREATE OR REPLACE VIEW vehicle_rankings AS
SELECT date, client_id, vehicle_id,
       total_points, violation_count,
       RANK() OVER (PARTITION BY client_id, date ORDER BY total_points ASC) AS ranking_safety
FROM mv_daily_vehicle_scores;

-- Config change triggers (notify metric_engine for recalculation)
CREATE OR REPLACE FUNCTION notify_config_change()
RETURNS TRIGGER AS $$
DECLARE
    rkey TEXT;
    ckey TEXT;
    oval TEXT;
    nval TEXT;
    cid INTEGER;
    im BIGINT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF TG_TABLE_NAME = 'client_config' THEN rkey := OLD.client_id::TEXT; cid := OLD.client_id; im := NULL;
        ELSIF TG_TABLE_NAME = 'tracker_config' THEN rkey := OLD.imei::TEXT; cid := NULL; im := OLD.imei;
        ELSE rkey := NULL; cid := NULL; im := NULL; END IF;
        ckey := OLD.config_key;
        oval := OLD.config_value;
        nval := NULL;
    ELSE
        IF TG_TABLE_NAME = 'client_config' THEN rkey := NEW.client_id::TEXT; cid := NEW.client_id; im := NULL;
        ELSIF TG_TABLE_NAME = 'tracker_config' THEN rkey := NEW.imei::TEXT; cid := NULL; im := NEW.imei;
        ELSE rkey := NULL; cid := NULL; im := NULL; END IF;
        ckey := NEW.config_key;
        oval := CASE WHEN TG_OP = 'UPDATE' THEN OLD.config_value ELSE NULL END;
        nval := NEW.config_value;
    END IF;
    INSERT INTO config_change_log (table_name, record_key, config_key, old_value, new_value, client_id, imei)
    VALUES (TG_TABLE_NAME, rkey, ckey, oval, nval, cid, im);
    PERFORM pg_notify('config_change', TG_TABLE_NAME || ':' || COALESCE(rkey, ''));
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tr_client_config_change ON client_config;
CREATE TRIGGER tr_client_config_change
    AFTER INSERT OR UPDATE OR DELETE ON client_config
    FOR EACH ROW EXECUTE PROCEDURE notify_config_change();
DROP TRIGGER IF EXISTS tr_tracker_config_change ON tracker_config;
CREATE TRIGGER tr_tracker_config_change
    AFTER INSERT OR UPDATE OR DELETE ON tracker_config
    FOR EACH ROW EXECUTE PROCEDURE notify_config_change();

-- Plan § 9B.2: triggers on calibration, fence, score_weights for automatic recalculation
CREATE OR REPLACE FUNCTION notify_calibration_change()
RETURNS TRIGGER AS $$
DECLARE
    rkey TEXT;
    vid INTEGER;
BEGIN
    IF TG_OP = 'DELETE' THEN
        vid := OLD.vehicle_id;
    ELSE
        vid := NEW.vehicle_id;
    END IF;
    rkey := vid::TEXT;
    INSERT INTO config_change_log (table_name, record_key, config_key, old_value, new_value, client_id, imei)
    VALUES (TG_TABLE_NAME, rkey, 'calibration', NULL, NULL, NULL, NULL);
    PERFORM pg_notify('config_change', TG_TABLE_NAME || ':' || rkey);
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tr_calibration_change ON calibration;
CREATE TRIGGER tr_calibration_change
    AFTER INSERT OR UPDATE OR DELETE ON calibration
    FOR EACH ROW EXECUTE PROCEDURE notify_calibration_change();

CREATE OR REPLACE FUNCTION notify_fence_change()
RETURNS TRIGGER AS $$
DECLARE
    rkey TEXT;
    fid INTEGER;
    cid INTEGER;
BEGIN
    IF TG_OP = 'DELETE' THEN
        fid := OLD.fence_id;
        cid := OLD.client_id;
    ELSE
        fid := NEW.fence_id;
        cid := NEW.client_id;
    END IF;
    rkey := fid::TEXT;
    INSERT INTO config_change_log (table_name, record_key, config_key, old_value, new_value, client_id, imei)
    VALUES (TG_TABLE_NAME, rkey, 'fence', NULL, NULL, cid, NULL);
    PERFORM pg_notify('config_change', TG_TABLE_NAME || ':' || rkey);
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tr_fence_change ON fence;
CREATE TRIGGER tr_fence_change
    AFTER INSERT OR UPDATE OR DELETE ON fence
    FOR EACH ROW EXECUTE PROCEDURE notify_fence_change();

CREATE OR REPLACE FUNCTION notify_score_weights_change()
RETURNS TRIGGER AS $$
DECLARE
    rkey TEXT;
    cid INTEGER;
BEGIN
    IF TG_OP = 'DELETE' THEN
        cid := OLD.client_id;
    ELSE
        cid := NEW.client_id;
    END IF;
    rkey := cid::TEXT;
    INSERT INTO config_change_log (table_name, record_key, config_key, old_value, new_value, client_id, imei)
    VALUES (TG_TABLE_NAME, rkey, 'score_weights', NULL, NULL, cid, NULL);
    PERFORM pg_notify('config_change', TG_TABLE_NAME || ':' || rkey);
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tr_score_weights_change ON score_weights;
CREATE TRIGGER tr_score_weights_change
    AFTER INSERT OR UPDATE OR DELETE ON score_weights
    FOR EACH ROW EXECUTE PROCEDURE notify_score_weights_change();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 3: COMMAND SYSTEM (from Operations Service)
-- Used by: Operations Service (API), Parser Service (GPRS), SMS Gateway Service (SMS)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Device Config (Settings + Commands from vendors)
-- Hierarchy: DeviceName -> ConfigType -> CategoryTypeDesc -> Category -> Profile -> CommandName
CREATE TABLE IF NOT EXISTS device_config (
    id SERIAL PRIMARY KEY,
    device_name VARCHAR(100) NOT NULL,           -- e.g., "GT06N", "JC400D" (from category's device)
    config_type VARCHAR(20) NOT NULL,            -- 'Setting' or 'Command'
    category_type_desc VARCHAR(50),              -- 'General', 'IOProperties', 'GeoFencing'
    category VARCHAR(100),                       -- Category name from CommandCategory
    profile VARCHAR(10),                         -- Profile number (1, 2, 3, 4) from CommandMaster.Profile
    command_name VARCHAR(200) NOT NULL,          -- Command name from CommandMaster
    description TEXT,
    command_seprator VARCHAR(50),                -- Command separator
    command_syntax VARCHAR(500),                 -- Command syntax from CommandMaster
    command_type VARCHAR(10),                    -- Command type from CommandMaster
    
    -- command_parameters_json: ALL parameters (Fixed + Configurable) for command building
    -- Format: [{"ParameterID": 123, "ParameterType": "1", "ParameterTypeDesc": "Fixed", "ParameterName": "StartCharacter", "DefaultValue": "1"}, ...]
    command_parameters_json JSONB,
    
    -- parameters_json: Configurable parameters with FULL UI metadata
    -- Format: [{"ParameterID": 123, "ParameterName": "CommandValue", "ParameterType": "2", "ParameterValue": "default",
    --           "SubDetails": [{"SubDetailID": 456, "Control": "ComboBox", ...}, ...]}]
    parameters_json JSONB,
    
    command_id INT,                              -- CommandMaster.ID - correlation key for unit_config
    created_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC')
);

-- Index for fast lookups by device + command
CREATE INDEX IF NOT EXISTS idx_device_config_lookup 
    ON device_config(device_name, config_type, COALESCE(category, ''));
CREATE INDEX IF NOT EXISTS idx_device_config_device ON device_config(device_name);
CREATE INDEX IF NOT EXISTS idx_device_config_type ON device_config(config_type);
CREATE INDEX IF NOT EXISTS idx_device_config_category ON device_config(device_name, category);
CREATE INDEX IF NOT EXISTS idx_device_config_command_id ON device_config(command_id);

-- Units table (actual trackers - registry)
-- This links IMEI to sim_no and device_name for command routing
CREATE TABLE IF NOT EXISTS unit (
    id SERIAL PRIMARY KEY,
    mega_id VARCHAR(50),                          -- From ERP system (with 'M' prefix: 'M2100290')
    imei VARCHAR(50) NOT NULL UNIQUE,             -- Device IMEI
    ffid VARCHAR(50),                             -- Fleet/Family ID
    sim_no VARCHAR(50),                           -- SIM card number (for SMS routing)
    device_name VARCHAR(100) NOT NULL,            -- Device type (links to device_config.device_name)
    modem_id INTEGER,                             -- Modem ID from ERP
    created_date TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_unit_device ON unit(device_name);
CREATE INDEX IF NOT EXISTS idx_unit_sim ON unit(sim_no);
CREATE INDEX IF NOT EXISTS idx_unit_mega_id ON unit(mega_id);

-- Unit Configs (saved configurations per tracker)
-- Stores the current saved value for each setting/command per unit
CREATE TABLE IF NOT EXISTS unit_config (
    id SERIAL PRIMARY KEY,
    mega_id VARCHAR(50) NOT NULL,                 -- Unit identifier
    device_name VARCHAR(100) NOT NULL,            -- Enables direct join with device_config
    command_id INT NOT NULL,                      -- CommandMaster.ID - identifies which setting
    value TEXT NOT NULL,                          -- Current saved value (JSON array format)
    modified_by VARCHAR(100),                     -- Who last updated
    modified_date TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    
    -- One value per (mega_id, device_name, command_id) combination
    CONSTRAINT uq_unit_config UNIQUE(mega_id, device_name, command_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_unit_config_mega_id ON unit_config(mega_id);
CREATE INDEX IF NOT EXISTS idx_unit_config_device_command ON unit_config(device_name, command_id);

-- Command Outbox (Queue for sending)
-- Flow: API creates → Parser/SMS Gateway Service polls → Sends → Moves to command_sent
-- Consumed by: Parser Service (send_method='gprs'), SMS Gateway Service (send_method='sms')
CREATE TABLE IF NOT EXISTS command_outbox (
    id SERIAL PRIMARY KEY,
    imei VARCHAR(50) NOT NULL,                    -- Device IMEI
    sim_no VARCHAR(50) NOT NULL,                  -- Destination phone number (for SMS)
    command_text TEXT NOT NULL,                   -- Full command to send
    config_id INT,                                -- Optional: link to device_config
    user_id VARCHAR(100),                         -- Who initiated
    send_method VARCHAR(10) DEFAULT 'sms',        -- 'sms' or 'gprs'
    retry_count INT DEFAULT 0,                    -- Number of send attempts
    created_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC')
);

-- Index for polling (FIFO order)
CREATE INDEX IF NOT EXISTS idx_outbox_created ON command_outbox(created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_imei ON command_outbox(imei);
CREATE INDEX IF NOT EXISTS idx_outbox_send_method ON command_outbox(send_method);

-- Command Sent (Sent commands awaiting device reply)
-- Flow: Moved from outbox after sending → Updates status on device reply
-- Status: 'sent' (awaiting reply), 'failed' (send error), 'successful' (device replied), 'no_reply' (timeout)
CREATE TABLE IF NOT EXISTS command_sent (
    id SERIAL PRIMARY KEY,
    imei VARCHAR(50) NOT NULL,
    sim_no VARCHAR(50) NOT NULL,
    command_text TEXT NOT NULL,
    config_id INT,
    user_id VARCHAR(100),
    send_method VARCHAR(10) DEFAULT 'sms',
    status VARCHAR(20) DEFAULT 'sent',            -- 'sent', 'failed', 'successful', 'no_reply'
    error_message TEXT,                           -- Error details if failed
    response_text TEXT,                           -- Device response (for GPRS)
    modem_id INTEGER,                             -- ID of modem used (FK to alarms_sms_modems.id)
    modem_name VARCHAR(100),                      -- Name of modem used for SMS
    created_at TIMESTAMPTZ,                         -- When originally queued (from outbox)
    sent_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC')               -- When actually sent
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sent_status ON command_sent(status);
CREATE INDEX IF NOT EXISTS idx_sent_imei ON command_sent(imei);
CREATE INDEX IF NOT EXISTS idx_sent_sim_no ON command_sent(sim_no);
CREATE INDEX IF NOT EXISTS idx_sent_created ON command_sent(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sent_send_method ON command_sent(send_method);

COMMENT ON COLUMN command_sent.modem_id IS 'ID of modem used for SMS (FK to alarms_sms_modems.id)';
COMMENT ON COLUMN command_sent.modem_name IS 'Name of modem used for SMS';

-- Command Inbox (Incoming SMS from devices)
-- Flow: SMS Gateway Service receives SMS → Inserts here → Matches to command_sent → Updates sent status
CREATE TABLE IF NOT EXISTS command_inbox (
    id SERIAL PRIMARY KEY,
    sim_no VARCHAR(50) NOT NULL,                  -- From phone number (device's SIM)
    imei VARCHAR(50),                             -- Matched to unit (if found)
    message_text TEXT NOT NULL,                   -- Raw SMS content
    received_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    processed BOOLEAN DEFAULT FALSE               -- Has been matched to sent command?
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inbox_sim ON command_inbox(sim_no);
CREATE INDEX IF NOT EXISTS idx_inbox_received ON command_inbox(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_processed ON command_inbox(processed);

-- Command History (Archive - All completed transactions)
-- Long-term storage for reporting and audit
CREATE TABLE IF NOT EXISTS command_history (
    id SERIAL PRIMARY KEY,
    imei VARCHAR(50),                             -- Can be NULL for unknown devices
    sim_no VARCHAR(50),
    direction VARCHAR(10) NOT NULL,               -- 'outgoing' or 'incoming'
    command_text TEXT NOT NULL,
    config_id INT,                                -- Optional: link to device_config (outgoing only)
    status VARCHAR(20),                           -- 'sent', 'failed', 'successful', 'received', 'no_reply'
    send_method VARCHAR(10),                      -- 'sms' or 'gprs' (outgoing only)
    user_id VARCHAR(100),                         -- Who initiated (outgoing only)
    modem_id INTEGER,                             -- ID of modem used (FK to alarms_sms_modems.id)
    modem_name VARCHAR(100),                      -- Name of modem used for SMS
    created_at TIMESTAMPTZ,                         -- Original queue time (outgoing) or received time (incoming)
    sent_at TIMESTAMPTZ,                            -- When sent (outgoing only)
    archived_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC')           -- When moved to history
);

-- Indexes for history queries
CREATE INDEX IF NOT EXISTS idx_history_imei ON command_history(imei);
CREATE INDEX IF NOT EXISTS idx_history_imei_date ON command_history(imei, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_direction ON command_history(direction);
CREATE INDEX IF NOT EXISTS idx_history_created ON command_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_archived ON command_history(archived_at);

COMMENT ON COLUMN command_history.modem_id IS 'ID of modem used for SMS (FK to alarms_sms_modems.id)';
COMMENT ON COLUMN command_history.modem_name IS 'Name of modem used for SMS';


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 4: ALARM SYSTEM (from Alarm Service)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Alarm Contacts Table
-- Stores contact information for each device/IMEI for alarm notifications
CREATE TABLE IF NOT EXISTS alarms_contacts (
    id SERIAL PRIMARY KEY,
    imei BIGINT NOT NULL,
    contact_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    contact_type VARCHAR(50) DEFAULT 'primary',  -- primary, secondary, emergency
    priority INTEGER DEFAULT 1,                   -- Lower number = higher priority
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    notes TEXT,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    timezone VARCHAR(50) DEFAULT 'UTC',
    bounce_count INT DEFAULT 0,
    last_bounce_at TIMESTAMPTZ,
    CONSTRAINT valid_contact CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- Create indexes for alarms_contacts queries
CREATE INDEX IF NOT EXISTS idx_alarms_contacts_imei ON alarms_contacts(imei);
CREATE INDEX IF NOT EXISTS idx_alarms_contacts_active ON alarms_contacts(active);
CREATE INDEX IF NOT EXISTS idx_alarms_contacts_imei_active ON alarms_contacts(imei, active);
CREATE INDEX IF NOT EXISTS idx_alarms_contacts_bounce ON alarms_contacts(bounce_count) WHERE bounce_count > 0;

COMMENT ON TABLE alarms_contacts IS 'Contact information for alarm notifications per device';
COMMENT ON COLUMN alarms_contacts.contact_type IS 'Type of contact: primary, secondary, emergency';
COMMENT ON COLUMN alarms_contacts.priority IS 'Notification priority (1=highest, lower numbers get notified first)';

-- Alarm History Table (notification audit log)
CREATE TABLE IF NOT EXISTS alarms_history (
    id SERIAL PRIMARY KEY,
    imei BIGINT NOT NULL,
    alarm_gps_time TIMESTAMPTZ NOT NULL,
    notification_type VARCHAR(20) NOT NULL,  -- 'sms', 'email', or 'call'
    recipient VARCHAR(255) NOT NULL,         -- Phone number or email
    status VARCHAR(20) NOT NULL,             -- 'sent', 'failed', 'pending'
    attempt_number INTEGER DEFAULT 1,
    sent_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    error_message TEXT,
    response_data JSONB,
    alarm_id BIGINT,
    provider_message_id VARCHAR(255),
    provider_name VARCHAR(100),
    delivery_status VARCHAR(50),
    delivered_at TIMESTAMPTZ,
    bounce_type VARCHAR(50),
    bounce_reason TEXT,
    delivery_confirmed_at TIMESTAMPTZ,
    delivery_error TEXT,
    modem_id INTEGER,                         -- ID of modem used for SMS (FK to alarms_sms_modems.id)
    modem_name VARCHAR(100)                   -- Name of modem used for SMS
);

-- Create indexes for alarms_history queries
CREATE INDEX IF NOT EXISTS idx_alarms_history_imei ON alarms_history(imei);
CREATE INDEX IF NOT EXISTS idx_alarms_history_sent_at ON alarms_history(sent_at);
CREATE INDEX IF NOT EXISTS idx_alarms_history_status ON alarms_history(status);
CREATE INDEX IF NOT EXISTS idx_alarms_history_notification_type ON alarms_history(notification_type);
CREATE INDEX IF NOT EXISTS idx_alarms_history_provider_id ON alarms_history (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_alarms_history_idempotency 
    ON alarms_history(alarm_id, notification_type) 
    WHERE alarm_id IS NOT NULL AND status = 'success';
CREATE INDEX IF NOT EXISTS idx_alarms_history_imei_status_time 
    ON alarms_history(imei, status, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_alarms_history_modem ON alarms_history(modem_name) WHERE modem_name IS NOT NULL;

COMMENT ON COLUMN alarms_history.modem_id IS 'ID of modem used for SMS (FK to alarms_sms_modems.id)';
COMMENT ON COLUMN alarms_history.modem_name IS 'Name of modem used for SMS';
COMMENT ON TABLE alarms_history IS 'Audit log of all sent alarm notifications';

-- Dead Letter Queue Table
CREATE TABLE IF NOT EXISTS alarms_dlq (
    id BIGSERIAL PRIMARY KEY,
    alarm_id BIGINT NOT NULL,
    imei BIGINT NOT NULL,
    channel VARCHAR(20) NOT NULL,  -- 'email', 'sms', 'call'
    payload JSONB NOT NULL,
    error_message TEXT,
    error_type VARCHAR(50),  -- 'VALIDATION', 'RATE_LIMIT', 'PROVIDER', 'NETWORK'
    attempts INT NOT NULL,
    last_attempt_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    reprocessed BOOLEAN DEFAULT FALSE,
    reprocessed_at TIMESTAMPTZ,
    reprocessed_by VARCHAR(255)
);

-- Create indexes for DLQ queries
CREATE INDEX IF NOT EXISTS idx_alarms_dlq_not_reprocessed ON alarms_dlq (created_at DESC) WHERE reprocessed = FALSE;
CREATE INDEX IF NOT EXISTS idx_alarms_dlq_channel ON alarms_dlq (channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alarms_dlq_error_type ON alarms_dlq (error_type);
CREATE INDEX IF NOT EXISTS idx_alarms_dlq_alarm_id ON alarms_dlq(alarm_id);
CREATE INDEX IF NOT EXISTS idx_alarms_dlq_created ON alarms_dlq(created_at DESC);

COMMENT ON TABLE alarms_dlq IS 'Dead letter queue for failed alarm notifications requiring manual intervention';

-- Alarm Deduplication Table
CREATE TABLE IF NOT EXISTS alarms_dedup (
    id BIGSERIAL PRIMARY KEY,
    imei BIGINT NOT NULL,
    alarm_type VARCHAR(100) NOT NULL,  -- status field value
    first_occurrence TIMESTAMPTZ NOT NULL,
    last_occurrence TIMESTAMPTZ NOT NULL,
    occurrence_count INT DEFAULT 1,
    notification_sent BOOLEAN DEFAULT FALSE,
    notification_sent_at TIMESTAMPTZ
);

-- Create indexes for dedup queries
CREATE INDEX IF NOT EXISTS idx_alarms_dedup_imei_type ON alarms_dedup (imei, alarm_type);
CREATE INDEX IF NOT EXISTS idx_alarms_dedup_last_occurrence ON alarms_dedup (last_occurrence);
CREATE UNIQUE INDEX IF NOT EXISTS idx_alarms_dedup_unique ON alarms_dedup (imei, alarm_type);

COMMENT ON TABLE alarms_dedup IS 'Tracks alarm occurrences for deduplication and batching';

-- Feature Flags Table
CREATE TABLE IF NOT EXISTS alarms_feature_flags (
    name VARCHAR(100) PRIMARY KEY,
    enabled BOOLEAN DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_alarms_feature_flags_enabled ON alarms_feature_flags(enabled);

-- Alarm Workers Registry Table
CREATE TABLE IF NOT EXISTS alarms_workers (
    id VARCHAR(255) PRIMARY KEY,
    hostname VARCHAR(255) NOT NULL,
    pid INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'active',  -- active, stale, dead
    last_heartbeat TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    started_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    alarms_processed INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_alarms_workers_status ON alarms_workers(status);
CREATE INDEX IF NOT EXISTS idx_alarms_workers_last_heartbeat ON alarms_workers(last_heartbeat);

COMMENT ON TABLE alarms_workers IS 'Registry of active Alarm Service workers for monitoring';

-- Alarm Templates Table
CREATE TABLE IF NOT EXISTS alarms_templates (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    channel VARCHAR(20) NOT NULL,  -- 'email', 'sms', 'voice'
    template_type VARCHAR(50) NOT NULL,  -- 'alarm', 'escalation', 'summary'
    subject VARCHAR(255),  -- For email
    body TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    variables JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    created_by VARCHAR(255),
    UNIQUE(name, channel, version)
);

CREATE INDEX IF NOT EXISTS idx_alarms_templates_name_channel ON alarms_templates(name, channel, is_active);
CREATE INDEX IF NOT EXISTS idx_alarms_templates_active ON alarms_templates(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE alarms_templates IS 'Versioned templates for alarm notifications';

-- SMS Modems Table (Shared Pool - used by Alarm Service and SMS Gateway Service)
-- Stores configuration for multiple SMS modems (Teltonika RUT200)
CREATE TABLE IF NOT EXISTS alarms_sms_modems (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    host VARCHAR(255) NOT NULL,
    username VARCHAR(100) NOT NULL,
    password_encrypted TEXT NOT NULL,
    cert_fingerprint VARCHAR(255),
    modem_id VARCHAR(10) DEFAULT '1-1',
    enabled BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 0,
    max_concurrent_sms INTEGER DEFAULT 5,
    health_status VARCHAR(20) DEFAULT 'unknown',  -- healthy, degraded, unhealthy, unknown, quota_exhausted
    last_health_check TIMESTAMPTZ,
    -- SMS Package Management
    sms_sent_count BIGINT DEFAULT 0,
    sms_limit BIGINT DEFAULT 110000,
    package_cost NUMERIC(10,2) DEFAULT 1500.00,
    package_currency VARCHAR(10) DEFAULT 'PKR',
    package_start_date TIMESTAMPTZ,
    package_end_date TIMESTAMPTZ,
    last_count_reset TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    -- Service Assignment (which services can use this modem)
    -- Default: all services can use it. Empty array means disabled for all.
    -- Values: 'alarms', 'commands', 'otp', 'marketing'
    allowed_services TEXT[] DEFAULT ARRAY['alarms', 'commands'],
    created_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_alarms_sms_modems_enabled ON alarms_sms_modems(enabled);
CREATE INDEX IF NOT EXISTS idx_alarms_sms_modems_priority ON alarms_sms_modems(priority DESC) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_alarms_sms_modems_services ON alarms_sms_modems USING GIN(allowed_services) WHERE enabled = TRUE;

COMMENT ON TABLE alarms_sms_modems IS 'Configuration for SMS modems (Teltonika RUT200) in the modem pool';
COMMENT ON COLUMN alarms_sms_modems.health_status IS 'Health status: healthy, degraded, unhealthy, unknown, quota_exhausted';
COMMENT ON COLUMN alarms_sms_modems.allowed_services IS 'Services that can use this modem: alarms, commands, otp, marketing';

-- SMS Modem Daily Usage History (date = UTC midnight for daily bucket)
CREATE TABLE IF NOT EXISTS alarms_sms_modem_usage (
    id SERIAL PRIMARY KEY,
    modem_id INTEGER REFERENCES alarms_sms_modems(id) ON DELETE CASCADE,
    date TIMESTAMPTZ NOT NULL,
    sms_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    UNIQUE(modem_id, date)
);

CREATE INDEX IF NOT EXISTS idx_alarms_sms_modem_usage_modem ON alarms_sms_modem_usage(modem_id);
CREATE INDEX IF NOT EXISTS idx_alarms_sms_modem_usage_date ON alarms_sms_modem_usage(date DESC);

COMMENT ON TABLE alarms_sms_modem_usage IS 'Daily SMS usage history per modem for reporting';

-- AlertManager Recipients Table
CREATE TABLE IF NOT EXISTS alertmanager_recipients (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    severity_filter VARCHAR(20) DEFAULT 'all',  -- 'all', 'critical', 'warning'
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_alertmanager_recipients_enabled ON alertmanager_recipients(enabled);

COMMENT ON TABLE alertmanager_recipients IS 'Recipients for system alerts routed through Alarm Service (alarm_node)';

-- Alarm Channel Configurations Table
CREATE TABLE IF NOT EXISTS alarms_channel_config (
    id SERIAL PRIMARY KEY,
    channel_type VARCHAR(20) NOT NULL,  -- 'sms', 'email', 'voice', 'push'
    config_key VARCHAR(100) NOT NULL,
    config_value TEXT,
    encrypted BOOLEAN DEFAULT FALSE,
    is_mock BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    UNIQUE(channel_type, config_key, is_mock)
);

CREATE INDEX IF NOT EXISTS idx_alarms_channel_config_type ON alarms_channel_config(channel_type);
CREATE INDEX IF NOT EXISTS idx_alarms_channel_config_mock ON alarms_channel_config(channel_type, is_mock);

COMMENT ON TABLE alarms_channel_config IS 'Configuration for all notification channels';

-- Alarm System State Table
CREATE TABLE IF NOT EXISTS alarms_state (
    id SERIAL PRIMARY KEY,
    state VARCHAR(20) NOT NULL DEFAULT 'running',  -- 'running', 'paused', 'restarting'
    paused_at TIMESTAMPTZ,
    paused_by VARCHAR(100),
    reason TEXT,
    use_mock_sms BOOLEAN DEFAULT FALSE,
    use_mock_email BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_alarms_state_state ON alarms_state(state);

COMMENT ON TABLE alarms_state IS 'System state and mock mode configuration';

-- Alarm Push Tokens Table
CREATE TABLE IF NOT EXISTS alarms_push_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    device_token VARCHAR(500) NOT NULL UNIQUE,
    device_type VARCHAR(20) NOT NULL,  -- 'android', 'ios', 'web'
    device_name VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    last_used_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_alarms_push_tokens_user ON alarms_push_tokens(user_id) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_alarms_push_tokens_type ON alarms_push_tokens(device_type) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_alarms_push_tokens_active ON alarms_push_tokens(active);

COMMENT ON TABLE alarms_push_tokens IS 'Device tokens for Firebase FCM push notifications';

-- Additional alarms table index
CREATE INDEX IF NOT EXISTS idx_alarms_imei_status_created 
    ON alarms(imei, status, created_at DESC) 
    WHERE is_valid = 1;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 4B: CAMERA/MDVR SYSTEM
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- CMS Servers Configuration Table
-- Store multiple CMS server configurations (similar to alarms_sms_modems pattern)
CREATE TABLE IF NOT EXISTS cms_servers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    host VARCHAR(255) NOT NULL,
    port INTEGER DEFAULT 8080,
    stream_port INTEGER DEFAULT 6604,
    storage_port INTEGER DEFAULT 6611,
    download_port INTEGER DEFAULT 6609,
    username VARCHAR(100),
    password_encrypted TEXT,
    session_id VARCHAR(255),
    session_expires_at TIMESTAMPTZ,
    enabled BOOLEAN DEFAULT TRUE,
    health_status VARCHAR(20) DEFAULT 'unknown',
    last_health_check TIMESTAMPTZ,
    poll_interval_seconds INTEGER DEFAULT 30,
    device_count INTEGER DEFAULT 0,
    timezone VARCHAR(10) DEFAULT '+00:00',  -- CMS server timezone offset (e.g., '+05:00' for PKT, '+00:00' for UTC)
    created_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_cms_servers_enabled ON cms_servers(enabled);
CREATE INDEX IF NOT EXISTS idx_cms_servers_health ON cms_servers(health_status) WHERE enabled = TRUE;

COMMENT ON TABLE cms_servers IS 'Configuration for CMS/MDVR servers to poll for camera device data';
COMMENT ON COLUMN cms_servers.health_status IS 'Health status: healthy, degraded, unhealthy, unknown';
COMMENT ON COLUMN cms_servers.session_id IS 'Cached CMS session ID (jsession)';
COMMENT ON COLUMN cms_servers.stream_port IS 'Port for live video streaming (default 6604)';
COMMENT ON COLUMN cms_servers.storage_port IS 'Port for storage server access (default 6611)';
COMMENT ON COLUMN cms_servers.download_port IS 'Port for video download (default 6609)';
COMMENT ON COLUMN cms_servers.timezone IS 'CMS server timezone offset (e.g., +05:00 for PKT). Used to convert CMS timestamps to UTC.';

-- Camera Alarm Configuration Table
-- Simple per-device config for which camera events should trigger alarms
CREATE TABLE IF NOT EXISTS camera_alarm_config (
    id SERIAL PRIMARY KEY,
    imei BIGINT NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    is_sms INTEGER DEFAULT 0,
    is_email INTEGER DEFAULT 0,
    is_call INTEGER DEFAULT 0,
    priority INTEGER DEFAULT 5,
    start_time TIME DEFAULT '00:00:00',
    end_time TIME DEFAULT '23:59:59',
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    UNIQUE(imei, event_type)
);

CREATE INDEX IF NOT EXISTS idx_camera_alarm_config_imei ON camera_alarm_config(imei);
CREATE INDEX IF NOT EXISTS idx_camera_alarm_config_lookup ON camera_alarm_config(imei, event_type) WHERE enabled = TRUE;

COMMENT ON TABLE camera_alarm_config IS 'Per-device configuration for which camera events should trigger alarms. imei=0 is the template for auto-provisioning new devices.';
COMMENT ON COLUMN camera_alarm_config.imei IS 'Camera device IMEI (numeric device ID from CMS). 0 = template for new devices';
COMMENT ON COLUMN camera_alarm_config.event_type IS 'Event type: Overspeeding, Distraction, Smoking, PhoneCalling, Fatigue, SeatBelt, Forward Collision, etc.';
COMMENT ON COLUMN camera_alarm_config.priority IS 'Alarm priority (1=highest, 10=lowest)';
COMMENT ON COLUMN camera_alarm_config.start_time IS 'Start of time window for this alarm (HH:MM:SS)';
COMMENT ON COLUMN camera_alarm_config.end_time IS 'End of time window for this alarm (HH:MM:SS)';

-- Ensure unique constraint exists for ON CONFLICT (existing DBs may have been created without it)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid JOIN pg_namespace n ON t.relnamespace = n.oid
                 WHERE n.nspname = 'public' AND t.relname = 'camera_alarm_config' AND c.conname = 'camera_alarm_config_imei_event_type_key') THEN
    ALTER TABLE camera_alarm_config ADD CONSTRAINT camera_alarm_config_imei_event_type_key UNIQUE (imei, event_type);
  END IF;
END $$;

-- Template rows (imei=0) for auto-provisioning new camera devices
-- When a new camera is discovered, template rows are copied to create device-specific config
INSERT INTO camera_alarm_config (imei, event_type, is_sms, is_email, is_call, priority, start_time, end_time, enabled)
VALUES 
    (0, 'Overspeeding', 1, 1, 0, 5, '00:00:00'::TIME, '23:59:59'::TIME, TRUE),
    (0, 'Distraction', 1, 0, 0, 3, '00:00:00'::TIME, '23:59:59'::TIME, TRUE),
    (0, 'Smoking', 1, 0, 0, 3, '00:00:00'::TIME, '23:59:59'::TIME, TRUE),
    (0, 'PhoneCalling', 1, 0, 0, 3, '00:00:00'::TIME, '23:59:59'::TIME, TRUE),
    (0, 'Fatigue', 0, 1, 0, 2, '00:00:00'::TIME, '23:59:59'::TIME, TRUE),
    (0, 'SeatBelt', 1, 0, 0, 4, '00:00:00'::TIME, '23:59:59'::TIME, TRUE),
    (0, 'Forward Collision', 1, 1, 1, 5, '00:00:00'::TIME, '23:59:59'::TIME, TRUE),
    (0, 'Backward Collision', 1, 1, 0, 5, '00:00:00'::TIME, '23:59:59'::TIME, TRUE),
    (0, 'Lost Face', 0, 1, 0, 2, '00:00:00'::TIME, '23:59:59'::TIME, TRUE),
    (0, 'Eyes Close', 1, 0, 0, 4, '00:00:00'::TIME, '23:59:59'::TIME, TRUE)
ON CONFLICT (imei, event_type) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 5: RABBITMQ DEDUPLICATION
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Processed Message IDs table (for Consumer Service message deduplication)
CREATE TABLE IF NOT EXISTS processed_message_ids (
    message_id VARCHAR(255) PRIMARY KEY,
    processed_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_processed_message_ids_processed_at 
    ON processed_message_ids(processed_at);

-- Message Retry Counts table (tracks retry counts across restarts)
-- Prevents infinite retry loops by persisting retry state to database
CREATE TABLE IF NOT EXISTS message_retry_counts (
    message_id VARCHAR(255) PRIMARY KEY,
    queue_name VARCHAR(100) NOT NULL,
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    first_attempt_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    last_attempt_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_message_retry_counts_queue 
    ON message_retry_counts(queue_name);
CREATE INDEX IF NOT EXISTS idx_message_retry_counts_last_attempt 
    ON message_retry_counts(last_attempt_at);

COMMENT ON TABLE message_retry_counts IS 'Persists message retry counts across consumer restarts to prevent infinite retry loops';

-- Invalid Data Queue table (stores records that failed validation for manual review)
-- Allows recovery of data that couldn't be processed due to validation errors
CREATE TABLE IF NOT EXISTS invalid_data_queue (
    id BIGSERIAL PRIMARY KEY,
    source_queue VARCHAR(100) NOT NULL,          -- Which queue the data came from
    message_id VARCHAR(255),                      -- Original message ID
    raw_payload JSONB NOT NULL,                   -- Original payload for recovery
    validation_errors JSONB NOT NULL,             -- List of validation errors
    imei VARCHAR(20),                             -- IMEI if extractable
    created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    reviewed_at TIMESTAMPTZ,                      -- When manually reviewed
    reviewed_by VARCHAR(100),                     -- Who reviewed it
    action_taken VARCHAR(50),                     -- 'fixed', 'discarded', 'reprocessed'
    notes TEXT                                    -- Reviewer notes
);

CREATE INDEX IF NOT EXISTS idx_invalid_data_queue_source ON invalid_data_queue(source_queue);
CREATE INDEX IF NOT EXISTS idx_invalid_data_queue_created ON invalid_data_queue(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invalid_data_queue_not_reviewed ON invalid_data_queue(created_at DESC) WHERE reviewed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invalid_data_queue_imei ON invalid_data_queue(imei) WHERE imei IS NOT NULL;

COMMENT ON TABLE invalid_data_queue IS 'Stores invalid records for manual review and recovery - prevents data loss from validation failures';


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 6: FUNCTIONS & TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Helper function: Update timestamp on update
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = (NOW() AT TIME ZONE 'UTC');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers for updated_at
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_device_config_updated') THEN
        CREATE TRIGGER trg_device_config_updated
            BEFORE UPDATE ON device_config
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_unit_updated') THEN
        CREATE TRIGGER trg_unit_updated
            BEFORE UPDATE ON unit
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
END $$;

-- Trigger for cms_servers updated_at
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cms_servers_updated') THEN
        CREATE TRIGGER trg_cms_servers_updated
            BEFORE UPDATE ON cms_servers
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
END $$;

-- Trigger for camera_alarm_config updated_at
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_camera_alarm_config_updated') THEN
        CREATE TRIGGER trg_camera_alarm_config_updated
            BEFORE UPDATE ON camera_alarm_config
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
END $$;

-- Function to clean old command history
CREATE OR REPLACE FUNCTION cleanup_old_command_history(days_to_keep INT DEFAULT 90)
RETURNS INT AS $$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM command_history
    WHERE archived_at < (NOW() AT TIME ZONE 'UTC') - (days_to_keep || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Alias for Operations Service backend compatibility
CREATE OR REPLACE FUNCTION cleanup_old_history(days_to_keep INT DEFAULT 90)
RETURNS INT AS $$
BEGIN
    RETURN cleanup_old_command_history(days_to_keep);
END;
$$ LANGUAGE plpgsql;

-- Cleanup old alarm notification history (keeps dashboard/audit bounded; run via cron or alarm service)
CREATE OR REPLACE FUNCTION cleanup_old_alarms_history(days_to_keep INT DEFAULT 365)
RETURNS INT AS $$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM alarms_history
    WHERE sent_at < (NOW() AT TIME ZONE 'UTC') - (days_to_keep || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION cleanup_old_alarms_history(INT) IS 'Delete alarms_history rows older than days_to_keep (default 365). Run periodically (e.g. cron or alarm_node) to bound table size.';

-- Cleanup old command inbox (incoming SMS); run by ops_node or sms_gateway to bound table size
CREATE OR REPLACE FUNCTION cleanup_old_command_inbox(days_to_keep INT DEFAULT 90)
RETURNS INT AS $$
DECLARE deleted_count INT;
BEGIN
    DELETE FROM command_inbox WHERE received_at < (NOW() AT TIME ZONE 'UTC') - (days_to_keep || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION cleanup_old_command_inbox(INT) IS 'Delete command_inbox rows older than days_to_keep (default 90). Run periodically by ops_node to bound table size.';

-- Cleanup old reprocessed DLQ rows (keep table bounded; run by alarm_node)
CREATE OR REPLACE FUNCTION cleanup_old_alarms_dlq(days_to_keep INT DEFAULT 90)
RETURNS INT AS $$
DECLARE deleted_count INT;
BEGIN
    DELETE FROM alarms_dlq WHERE reprocessed = TRUE AND reprocessed_at < (NOW() AT TIME ZONE 'UTC') - (days_to_keep || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION cleanup_old_alarms_dlq(INT) IS 'Delete reprocessed alarms_dlq rows older than days_to_keep (default 90). Run periodically by alarm_node.';

-- Cleanup old SMS modem daily usage (run by alarm_node or cron to bound table size)
CREATE OR REPLACE FUNCTION cleanup_old_alarms_sms_modem_usage(days_to_keep INT DEFAULT 730)
RETURNS INT AS $$
DECLARE deleted_count INT;
BEGIN
    DELETE FROM alarms_sms_modem_usage WHERE date < (NOW() AT TIME ZONE 'UTC') - (days_to_keep || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION cleanup_old_alarms_sms_modem_usage(INT) IS 'Delete alarms_sms_modem_usage rows older than days_to_keep (default 730 = 2 years). Run periodically.';

-- PostgreSQL Function for NOTIFY on alarm insert
CREATE OR REPLACE FUNCTION notify_alarm_created()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'alarm_created',
        json_build_object(
            'alarm_id', NEW.id,
            'imei', NEW.imei,
            'status', NEW.status,
            'is_sms', NEW.is_sms,
            'is_email', NEW.is_email
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for NOTIFY on alarm insert
DROP TRIGGER IF EXISTS trigger_notify_alarm_created ON alarms;
CREATE TRIGGER trigger_notify_alarm_created
    AFTER INSERT ON alarms
    FOR EACH ROW
    EXECUTE FUNCTION notify_alarm_created();


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 7: SEED DATA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Metric engine: system_config defaults (NON_LIVE_TABLE_CATALOG)
INSERT INTO system_config (config_key, config_value, description, data_type) VALUES
    ('SPEED_LIMIT_CITY', '60', 'City speed limit (km/h)', 'INTEGER'),
    ('SPEED_LIMIT_HIGHWAY', '100', 'Highway speed limit (km/h)', 'INTEGER'),
    ('SPEED_LIMIT_MOTORWAY', '120', 'Motorway speed limit (km/h)', 'INTEGER'),
    ('MIN_DURATION_SPEED', '30', 'Min duration to count speed violation (sec)', 'INTEGER'),
    ('SEATBELT_SPEED_THRESHOLD', '10', 'Speed above which seatbelt required (km/h)', 'INTEGER'),
    ('SEATBELT_MIN_DURATION', '120', 'Min duration for seatbelt violation (sec)', 'INTEGER'),
    ('SEATBELT_MIN_DISTANCE', '1', 'Min distance for seatbelt violation (km)', 'DECIMAL'),
    ('SEATBELT_DELAY_THRESHOLD', '120', 'Allowed delay after ignition ON (sec)', 'INTEGER'),
    ('IDLE_THRESHOLD', '180', 'Seconds before counting as idle', 'INTEGER'),
    ('NR_THRESHOLD', '86400', 'Seconds before No Response alert (24h)', 'INTEGER'),
    ('CAMERA_NR_THRESHOLD', '3600', 'Seconds before camera NR alert (60 min)', 'INTEGER'),
    ('HARSH_SPEED_DROP_THRESHOLD', '20', 'Speed drop for harsh braking (km/h)', 'INTEGER'),
    ('HARSH_SPEED_INCREASE_THRESHOLD', '20', 'Speed increase for harsh acceleration (km/h)', 'INTEGER'),
    ('HARSH_TIME_WINDOW', '5', 'Time window for harsh detection (sec)', 'INTEGER'),
    ('HARSH_HEADING_THRESHOLD', '45', 'Heading change for harsh cornering (degrees)', 'INTEGER'),
    ('TEMP_MIN', '-25', 'Minimum temperature threshold (°C)', 'DECIMAL'),
    ('TEMP_MAX', '25', 'Maximum temperature threshold (°C)', 'DECIMAL'),
    ('HUMIDITY_MIN', '30', 'Minimum humidity threshold (%)', 'INTEGER'),
    ('HUMIDITY_MAX', '70', 'Maximum humidity threshold (%)', 'INTEGER'),
    ('SENSOR_DURATION_THRESHOLD', '300', 'Duration before sensor alert (sec)', 'INTEGER'),
    ('FILL_THRESHOLD', '5', 'Fuel fill detection threshold (L)', 'DECIMAL'),
    ('THEFT_THRESHOLD', '5', 'Fuel theft detection threshold (L)', 'DECIMAL'),
    ('STOP_THRESHOLD', '300', 'Min duration to count as stop (sec)', 'INTEGER'),
    ('UNUSUAL_STOPPAGE_THRESHOLD', '3600', 'Unusual stoppage threshold (sec)', 'INTEGER'),
    ('MAX_DRIVING_HOURS', '14400', 'Max continuous driving time (sec, 4h)', 'INTEGER'),
    ('MAX_DRIVING_DISTANCE', '300', 'Max continuous driving distance (km)', 'DECIMAL'),
    ('REST_DURATION', '1800', 'Required rest duration (sec, 30 min)', 'INTEGER'),
    ('MIN_REST_DURATION', '900', 'Minimum rest to reset counter (sec, 15 min)', 'INTEGER'),
    ('IDLE_MAX', '600', 'Max idle time before alert (sec, 10 min)', 'INTEGER'),
    ('NIGHT_START', '23:00', 'Night period start', 'VARCHAR'),
    ('NIGHT_END', '05:00', 'Night period end', 'VARCHAR'),
    ('LATE_NIGHT_START', '00:00', 'Late night period start', 'VARCHAR'),
    ('LATE_NIGHT_END', '05:00', 'Late night period end', 'VARCHAR'),
    ('STOP_COUNT_THRESHOLD', '10', 'Stop count threshold for alerts', 'INTEGER'),
    ('DEVIATION_THRESHOLD', '3.5', 'Max distance from route (km)', 'DECIMAL'),
    ('TIME_COMPLIANCE_THRESHOLD', '3600', 'Min time inside destination for round trip compliance (sec)', 'INTEGER'),
    ('TRIP_END_DELAY', '1800', 'Delay after exiting destination before trip end for Case 2 (sec)', 'INTEGER'),
    ('ENTRY_THRESHOLD', '0.5', 'Distance to detect route entry (km)', 'DECIMAL'),
    ('WAYPOINT_RADIUS', '0.5', 'Radius around waypoints (km)', 'DECIMAL'),
    ('MAX_SPEED_FILTER', '150', 'Max speed for data filter (km/h)', 'INTEGER'),
    ('HYSTERESIS', '50', 'Hysteresis for geofence/route (m)', 'INTEGER')
ON CONFLICT (config_key) DO NOTHING;

-- Metric engine: minimal dev data (1 customer, 1 vehicle, 1 tracker)
INSERT INTO customer (customer_name, customer_type, client_id, has_parent_company, is_parent_company)
VALUES ('Dev Customer', 'Retail', 1, FALSE, FALSE)
ON CONFLICT (customer_name) DO NOTHING;
INSERT INTO vehicle (client_id, registration_number, is_active)
SELECT 1, 'DEV-001', TRUE WHERE NOT EXISTS (SELECT 1 FROM vehicle WHERE vehicle_id = 1);
INSERT INTO tracker (imei, vehicle_id, tracker_type, has_fuel_sensor, has_temp_sensor, has_seatbelt_sensor)
VALUES (0, 1, 'GPS', FALSE, FALSE, FALSE)
ON CONFLICT (imei) DO NOTHING;
INSERT INTO driver (driver_name, license_number)
SELECT 'Dev Driver', 'DEV-LIC-001' WHERE NOT EXISTS (SELECT 1 FROM driver WHERE driver_id = 1);

-- Insert default feature flags
INSERT INTO alarms_feature_flags (name, enabled, description) VALUES
    ('email_enabled', TRUE, 'Enable email notifications'),
    ('sms_enabled', TRUE, 'Enable SMS notifications'),
    ('voice_enabled', FALSE, 'Enable voice call notifications'),
    ('deduplication_enabled', TRUE, 'Enable alarm deduplication'),
    ('quiet_hours_enabled', TRUE, 'Enable quiet hours filtering'),
    ('escalation_enabled', FALSE, 'Enable multi-stage escalation'),
    ('rate_limiting_enabled', FALSE, 'Enable Redis rate limiting'),
    ('webhooks_enabled', TRUE, 'Enable webhook handlers'),
    ('listen_notify_enabled', TRUE, 'Enable PostgreSQL LISTEN/NOTIFY'),
    ('channel_fallback_enabled', TRUE, 'Enable channel fallback')
ON CONFLICT (name) DO NOTHING;

-- Insert default admin recipient for system alerts
INSERT INTO alertmanager_recipients (email, name, severity_filter) VALUES 
    ('admin@megatechtrackers.local', 'System Admin', 'all')
ON CONFLICT DO NOTHING;

-- Insert default channel configurations
INSERT INTO alarms_channel_config (channel_type, config_key, config_value, is_mock) VALUES
    -- Mock Email (MailHog)
    ('email', 'smtp_host', 'mailhog', TRUE),
    ('email', 'smtp_port', '1025', TRUE),
    ('email', 'smtp_secure', 'false', TRUE),
    ('email', 'from_address', 'mock@megatechtrackers.com', TRUE),
    -- Mock SMS Server
    ('sms', 'api_url', 'http://mock-sms-server:8086/sms/send', TRUE),
    ('sms', 'api_key', 'mock-api-key', TRUE),
    -- Real Email (defaults)
    ('email', 'smtp_host', 'smtp.gmail.com', FALSE),
    ('email', 'smtp_port', '587', FALSE),
    ('email', 'smtp_secure', 'true', FALSE),
    ('email', 'from_address', 'alerts@megatechtrackers.com', FALSE)
ON CONFLICT (channel_type, config_key, is_mock) DO NOTHING;

-- Insert initial system state (Mock mode enabled by default for testing)
INSERT INTO alarms_state (state, use_mock_sms, use_mock_email) VALUES 
    ('running', TRUE, TRUE)
ON CONFLICT DO NOTHING;

-- Insert test/mock modems
INSERT INTO alarms_sms_modems (
    name, host, username, password_encrypted, modem_id, 
    enabled, priority, max_concurrent_sms, health_status,
    sms_sent_count, sms_limit, package_cost, package_currency
) VALUES (
    'Mock SMS - Legacy API',
    'http://mock-sms-server:8086',
    'mock-user',
    'mock-password',
    '1-1',
    TRUE,
    1,
    10,
    'unknown',
    0,
    100000,
    0.00,
    'PKR'
) ON CONFLICT DO NOTHING;

INSERT INTO alarms_sms_modems (
    name, host, username, password_encrypted, modem_id, 
    enabled, priority, max_concurrent_sms, health_status,
    sms_sent_count, sms_limit, package_cost, package_currency
) VALUES (
    'Mock SMS - Teltonika API',
    'http://mock-sms-server:8086',
    'admin',
    'admin123',
    '1-1',
    TRUE,
    2,
    10,
    'unknown',
    0,
    100000,
    0.00,
    'PKR'
) ON CONFLICT DO NOTHING;

-- Real Teltonika RUT200 template (DISABLED by default)
INSERT INTO alarms_sms_modems (
    name, host, username, password_encrypted, cert_fingerprint, modem_id, 
    enabled, priority, max_concurrent_sms, health_status,
    sms_sent_count, sms_limit, package_cost, package_currency, package_end_date
) VALUES (
    'Real Teltonika RUT200 #1',
    'https://192.168.1.101',
    'admin',
    'Megatech@123',
    '17:14:6F:72:A6:56:26:D5:5A:A6:80:B0:D2:CB:13:6D:B7:39:96:B3:4B:E3:97:C0:17:14:B7:60:0B:91:B2:E0',
    '1-1',
    FALSE,
    10,
    5,
    'unknown',
    0,
    110000,
    1500.00,
    'PKR',
    (CURRENT_DATE + INTERVAL '1 year')::TIMESTAMPTZ
) ON CONFLICT DO NOTHING;

-- Primary CMS Server - ENABLED
-- The camera parser reads from this table to determine which CMS servers to poll
INSERT INTO cms_servers (
    name, host, port, stream_port, storage_port, download_port,
    username, password_encrypted, enabled, health_status, poll_interval_seconds, timezone
) VALUES (
    'Primary CMS',
    '203.101.163.180',
    8080,
    6604,
    6611,
    6609,
    'admin',
    'Megamis.54321',
    TRUE,
    'unknown',
    30,
    '+05:00'  -- Pakistan Time (UTC+5)
) ON CONFLICT DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SECTION 8: PERMISSIONS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Grant permissions on command system tables to all users
-- This ensures parser services and other services can access these tables
GRANT ALL ON device_config TO PUBLIC;
GRANT ALL ON unit TO PUBLIC;
GRANT ALL ON unit_config TO PUBLIC;
GRANT ALL ON command_outbox TO PUBLIC;
GRANT ALL ON command_sent TO PUBLIC;
GRANT ALL ON command_inbox TO PUBLIC;
GRANT ALL ON command_history TO PUBLIC;

-- Grant permissions on camera/CMS tables
GRANT ALL ON cms_servers TO PUBLIC;
GRANT ALL ON camera_alarm_config TO PUBLIC;

-- Grant sequence permissions for auto-increment columns
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO PUBLIC;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- END OF SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
