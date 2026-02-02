-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Megatechtrackers Fleet Tracking - Unified Database Schema
-- Database: megatechtrackers (PostgreSQL with TimescaleDB + PostGIS)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 
-- This is the SINGLE SOURCE OF TRUTH for the megatechtrackers database schema.
-- All services (parser_node, consumer_node, alarm_node, ops_node, sms_gateway_node) use this file.
-- 
-- Usage: Each service runs this schema on startup with IF NOT EXISTS (idempotent).
-- 
-- Sections:
--   1. EXTENSIONS
--   2. TRACKING TABLES (trackdata, alarms, events, laststatus, unit_io_mapping, location_reference)
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
    status VARCHAR(100) DEFAULT 'Normal',
    vendor VARCHAR(50) DEFAULT 'teltonika',
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

-- Enable compression on the hypertable
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

-- Add retention policy to drop chunks older than 12 months
DO $$
BEGIN
    PERFORM add_retention_policy('trackdata', INTERVAL '12 months', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to add retention policy for trackdata: %', SQLERRM;
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
    status VARCHAR(100) DEFAULT 'Normal',
    vendor VARCHAR(50) DEFAULT 'teltonika',
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
    category VARCHAR(50) DEFAULT 'general',
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

-- Enable compression on the hypertable
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
    status VARCHAR(100) DEFAULT 'Normal',
    vendor VARCHAR(50) DEFAULT 'teltonika',
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

-- Enable compression on the hypertable
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

COMMENT ON TABLE device_io_mapping IS 'Default IO mapping templates per device type. Trackers inherit these when registered.';
COMMENT ON COLUMN device_io_mapping.device_name IS 'Device type name (e.g., GT06N, JC400D) - links to device_config.device_name';
COMMENT ON COLUMN device_io_mapping.io_type IS '2=Digital, 3=Analog';
COMMENT ON COLUMN device_io_mapping.target IS '0=column, 1=status, 2=both, 3=jsonb';

-- LastStatus table (Hash Partitioned by IMEI for scalability)
-- Partitioned from the start to support large fleets (100K+ trackers)
DO $$
BEGIN
    -- Create partitioned table if it doesn't exist
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
            PRIMARY KEY (imei)
        ) PARTITION BY HASH (imei);
        
        -- Create 8 partitions for good distribution
        CREATE TABLE laststatus_p0 PARTITION OF laststatus
            FOR VALUES WITH (MODULUS 8, REMAINDER 0);
        CREATE TABLE laststatus_p1 PARTITION OF laststatus
            FOR VALUES WITH (MODULUS 8, REMAINDER 1);
        CREATE TABLE laststatus_p2 PARTITION OF laststatus
            FOR VALUES WITH (MODULUS 8, REMAINDER 2);
        CREATE TABLE laststatus_p3 PARTITION OF laststatus
            FOR VALUES WITH (MODULUS 8, REMAINDER 3);
        CREATE TABLE laststatus_p4 PARTITION OF laststatus
            FOR VALUES WITH (MODULUS 8, REMAINDER 4);
        CREATE TABLE laststatus_p5 PARTITION OF laststatus
            FOR VALUES WITH (MODULUS 8, REMAINDER 5);
        CREATE TABLE laststatus_p6 PARTITION OF laststatus
            FOR VALUES WITH (MODULUS 8, REMAINDER 6);
        CREATE TABLE laststatus_p7 PARTITION OF laststatus
            FOR VALUES WITH (MODULUS 8, REMAINDER 7);
    END IF;
END $$;

-- Add vendor column to existing laststatus table (for migrations)
ALTER TABLE laststatus ADD COLUMN IF NOT EXISTS vendor VARCHAR(50) DEFAULT 'teltonika';

-- Indexes on partitioned table
CREATE INDEX IF NOT EXISTS idx_laststatus_imei ON laststatus (imei);
CREATE INDEX IF NOT EXISTS idx_laststatus_reference_id ON laststatus (reference_id);
CREATE INDEX IF NOT EXISTS idx_laststatus_updateddate ON laststatus (updateddate);
CREATE INDEX IF NOT EXISTS idx_laststatus_vendor ON laststatus (vendor);

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
