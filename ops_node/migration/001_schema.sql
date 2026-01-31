-- ============================================
-- Operations Service - PostgreSQL Schema
-- Migrated from SQL Server cfg_ tables (migrate_sql_server_to_cfg.sql)
-- Denormalized structure optimized for application queries
-- ============================================

-- Drop tables if exist (for clean reinstall)
DROP TABLE IF EXISTS command_history CASCADE;
DROP TABLE IF EXISTS command_inbox CASCADE;
DROP TABLE IF EXISTS command_sent CASCADE;
DROP TABLE IF EXISTS command_outbox CASCADE;
DROP TABLE IF EXISTS unit_config CASCADE;
DROP TABLE IF EXISTS unit CASCADE;
DROP TABLE IF EXISTS device_config CASCADE;

-- ============================================
-- 1. Device Config (Settings + Commands from vendors)
-- ============================================
-- Migrated from: CommandMaster, CommandDetail, CommandSubDetail, CommandCategory, CommandCategoryDetail
-- 
-- Structure matches original CommandConfigApi:
-- - command_parameters_json: ALL parameters for command building (Fixed + Configurable)
-- - parameters_json: Configurable parameters with full UI metadata (matches ParameterConfigDto → SubDetailConfigDto)
-- 
-- Hierarchy: DeviceName -> ConfigType -> CategoryTypeDesc -> Category -> Profile -> CommandName
-- 
-- Device Inheritance Logic:
-- - DeviceName = Category's device (UI device - the device whose UI shows this config)
-- - When Device A inherits Device B: 
--   * Device A's category links to Device B's command (via CommandCategoryDetail)
--   * Creates config with DeviceName = 'A' (replica of Device B's command data)
--   * Device B's own categories create configs with DeviceName = 'B' (original)
-- - This ensures each device has its own configs, units can match by DeviceName directly
-- ============================================
CREATE TABLE device_config (
    id SERIAL PRIMARY KEY,
    device_name VARCHAR(100) NOT NULL,           -- e.g., "GT06N", "JC400D" (from category's device)
    config_type VARCHAR(20) NOT NULL,            -- 'Setting' or 'Command'
    category_type_desc VARCHAR(50),              -- 'General', 'IOProperties', 'GeoFencing'
    category VARCHAR(100),                       -- Category name from CommandCategory
    profile VARCHAR(10),                         -- Profile number (1, 2, 3, 4) from CommandMaster.Profile
    command_name VARCHAR(200) NOT NULL,          -- Command name from CommandMaster
    description TEXT,
    command_seprator VARCHAR(50),                -- Command separator (from CommandMaster.CommandSeprator)
    command_syntax VARCHAR(500),                 -- Command syntax from CommandMaster
    command_type VARCHAR(10),                    -- Command type from CommandMaster
    
    -- command_parameters_json: ALL parameters (Fixed + Configurable) for command building
    -- Format: [{"ParameterID": 123, "ParameterType": "1", "ParameterTypeDesc": "Fixed", "ParameterName": "StartCharacter", "DefaultValue": "1"}, ...]
    command_parameters_json JSONB,
    
    -- parameters_json: Configurable parameters with FULL UI metadata (matches original ParameterConfigDto → SubDetailConfigDto)
    -- Format: [{"ParameterID": 123, "ParameterName": "CommandValue", "ParameterType": "2", "ParameterValue": "default",
    --           "SubDetails": [{"SubDetailID": 456, "Control": "ComboBox", "ControlWidth": 200, "ActualValue": "0", 
    --                          "Description": "...", "CmdText": "Disable", "CmdValue": "0", "MinValue": null, "MaxValue": null}, ...]}]
    parameters_json JSONB,
    
    command_id INT,                              -- CommandMaster.ID - correlation key for unit_config
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast lookups by device + command (follows hierarchy order)
CREATE INDEX idx_device_config_lookup 
    ON device_config(device_name, config_type, COALESCE(category, ''));

-- Index for fast device lookups
CREATE INDEX idx_device_config_device ON device_config(device_name);
CREATE INDEX idx_device_config_type ON device_config(config_type);
CREATE INDEX idx_device_config_category ON device_config(device_name, category);
CREATE INDEX idx_device_config_command_id ON device_config(command_id);

-- ============================================
-- 2. Units (actual trackers)
-- ============================================
-- Migrated from: View_UnitViewFromERP
-- 
-- Simplified to match View_UnitViewFromERP structure
-- Data Sources:
-- - View_UnitViewFromERP: Contains all unit information from ERP system
-- 
-- Column Mapping:
-- - MegaID: View_UnitViewFromERP.MegaID (already has 'M' prefix)
-- - IMEI: View_UnitViewFromERP.UnitID
-- - FFID: View_UnitViewFromERP.FF
-- - SimNo: View_UnitViewFromERP.ServiceNo
-- - DeviceName: View_UnitViewFromERP.UnitName
-- - ModemID: View_UnitViewFromERP.ModemID
-- ============================================
CREATE TABLE unit (
    id SERIAL PRIMARY KEY,
    mega_id VARCHAR(50),                          -- From View_UnitViewFromERP.MegaID (with 'M' prefix: 'M2100290')
    imei VARCHAR(50) NOT NULL UNIQUE,             -- From View_UnitViewFromERP.UnitID
    ffid VARCHAR(50),                             -- From View_UnitViewFromERP.FF
    sim_no VARCHAR(50),                           -- From View_UnitViewFromERP.ServiceNo
    device_name VARCHAR(100) NOT NULL,            -- From View_UnitViewFromERP.UnitName (links to device_config.device_name)
    modem_id INTEGER,                             -- From View_UnitViewFromERP.ModemID
    created_date TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_unit_device ON unit(device_name);
CREATE INDEX idx_unit_sim ON unit(sim_no);
CREATE INDEX idx_unit_mega_id ON unit(mega_id);

-- ============================================
-- 3. Unit Configs (saved configurations per tracker)
-- ============================================
-- Migrated from: LastConfiguration
-- 
-- Key Logic: Commands can have multiple configurable parameters (ParameterType='2')
-- - Each parameter has its own LastConfiguration entry (same MegaID, different FK_CmdDId)
-- - Aggregates all parameter values for the same command into a JSON array
-- - Stores as single row per (mega_id, device_name, command_id) for efficient lookup
-- - Uses device_name to enable direct join with device_config (no need to join through unit table)
-- 
-- Value Format: Always JSON array with ParameterID (ordered by CommandDetail.ID)
-- - Single value: [{"ParameterID": 123, "Value": "val1"}]
-- - Multiple values: [{"ParameterID": 123, "Value": "val1"}, {"ParameterID": 124, "Value": "val2"}]
-- ============================================
CREATE TABLE unit_config (
    id SERIAL PRIMARY KEY,
    mega_id VARCHAR(50) NOT NULL,                 -- From LastConfiguration.MegaID
    device_name VARCHAR(100) NOT NULL,            -- From cfg_Unit.DeviceName - enables direct join with device_config
    command_id INT NOT NULL,                      -- CommandMaster.ID - identifies which setting this value is for
    value TEXT NOT NULL,                          -- Current saved value (JSON array format) - uses TEXT for large JSON with multiple parameters
    modified_by VARCHAR(100),                     -- Who last updated
    modified_date TIMESTAMP DEFAULT NOW(),
    
    -- One value per (mega_id, device_name, command_id) combination
    CONSTRAINT uq_unit_config UNIQUE(mega_id, device_name, command_id)
);

-- Indexes for fast lookups
CREATE INDEX idx_unit_config_mega_id ON unit_config(mega_id);
CREATE INDEX idx_unit_config_device_command ON unit_config(device_name, command_id);

-- ============================================
-- 4. Command Outbox (Queue for sending - Modem reads from here)
-- ============================================
-- Flow: API creates → Modem polls → Modem sends SMS → Moves to command_sent
-- This table stays minimal - records are moved out after processing
-- ============================================
CREATE TABLE command_outbox (
    id SERIAL PRIMARY KEY,
    imei VARCHAR(50) NOT NULL REFERENCES unit(imei),
    sim_no VARCHAR(50) NOT NULL,                  -- Destination phone number
    command_text TEXT NOT NULL,                   -- Full command to send
    config_id INT REFERENCES device_config(id),   -- Optional: link to setting
    user_id VARCHAR(100),                         -- Who initiated
    send_method VARCHAR(10) DEFAULT 'sms',        -- 'sms' or 'gprs'
    retry_count INT DEFAULT 0,                    -- Number of send attempts
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for polling (FIFO order)
CREATE INDEX idx_outbox_created ON command_outbox(created_at);
CREATE INDEX idx_outbox_imei ON command_outbox(imei);

-- ============================================
-- 5. Command Sent (Sent commands awaiting device reply)
-- ============================================
-- Flow: Modem moves from outbox after sending → Updates status on device reply
-- Status: 'sent' (awaiting reply), 'failed' (send error), 'successful' (device replied)
-- Eventually moved to history by cleanup job
-- ============================================
CREATE TABLE command_sent (
    id SERIAL PRIMARY KEY,
    imei VARCHAR(50) NOT NULL,
    sim_no VARCHAR(50) NOT NULL,
    command_text TEXT NOT NULL,
    config_id INT REFERENCES device_config(id),
    user_id VARCHAR(100),
    send_method VARCHAR(10) DEFAULT 'sms',
    status VARCHAR(20) DEFAULT 'sent',            -- 'sent', 'failed', 'successful'
    error_message TEXT,                           -- Error details if failed
    created_at TIMESTAMP,                         -- When originally queued (from outbox)
    sent_at TIMESTAMP DEFAULT NOW()               -- When actually sent
);

-- Indexes
CREATE INDEX idx_sent_status ON command_sent(status);
CREATE INDEX idx_sent_imei ON command_sent(imei);
CREATE INDEX idx_sent_sim_no ON command_sent(sim_no);
CREATE INDEX idx_sent_created ON command_sent(sent_at DESC);

-- ============================================
-- 6. Command Inbox (Incoming SMS from devices)
-- ============================================
-- Flow: Modem receives SMS → Inserts here → Matches to command_sent → Updates sent status
-- Eventually moved to history by cleanup job
-- ============================================
CREATE TABLE command_inbox (
    id SERIAL PRIMARY KEY,
    sim_no VARCHAR(50) NOT NULL,                  -- From phone number (device's SIM)
    imei VARCHAR(50),                             -- Matched to unit (if found)
    message_text TEXT NOT NULL,                   -- Raw SMS content
    received_at TIMESTAMP DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE               -- Has been matched to sent command?
);

-- Indexes
CREATE INDEX idx_inbox_sim ON command_inbox(sim_no);
CREATE INDEX idx_inbox_received ON command_inbox(received_at DESC);
CREATE INDEX idx_inbox_processed ON command_inbox(processed);

-- ============================================
-- 7. Command History (Archive - All completed transactions)
-- ============================================
-- Long-term storage for reporting and audit
-- Populated from command_sent and command_inbox by cleanup job
-- ============================================
CREATE TABLE command_history (
    id SERIAL PRIMARY KEY,
    imei VARCHAR(50),                             -- Can be NULL for unknown devices
    sim_no VARCHAR(50),
    direction VARCHAR(10) NOT NULL,               -- 'outgoing' or 'incoming'
    command_text TEXT NOT NULL,
    config_id INT REFERENCES device_config(id),   -- Optional: link to setting (outgoing only)
    status VARCHAR(20),                           -- 'sent', 'failed', 'successful', 'received'
    send_method VARCHAR(10),                      -- 'sms' or 'gprs' (outgoing only)
    user_id VARCHAR(100),                         -- Who initiated (outgoing only)
    created_at TIMESTAMP,                         -- Original queue time (outgoing) or received time (incoming)
    sent_at TIMESTAMP,                            -- When sent (outgoing only)
    archived_at TIMESTAMP DEFAULT NOW()           -- When moved to history
);

-- Indexes for history queries
CREATE INDEX idx_history_imei ON command_history(imei);
CREATE INDEX idx_history_imei_date ON command_history(imei, created_at DESC);
CREATE INDEX idx_history_direction ON command_history(direction);
CREATE INDEX idx_history_created ON command_history(created_at DESC);

-- ============================================
-- Helper function: Update timestamp on update
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER trg_device_config_updated
    BEFORE UPDATE ON device_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_unit_updated
    BEFORE UPDATE ON unit
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Note: unit_config uses modified_date (not updated_at), handled by SQLAlchemy onupdate

-- ============================================
-- History Retention Policy
-- ============================================
-- Add index for cleanup queries (records older than X days)
CREATE INDEX idx_history_archived ON command_history(archived_at);

-- Function to clean old history (call periodically via cron or app)
-- Keeps last 90 days by default
CREATE OR REPLACE FUNCTION cleanup_old_history(days_to_keep INT DEFAULT 90)
RETURNS INT AS $$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM command_history
    WHERE archived_at < NOW() - (days_to_keep || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Example usage: SELECT cleanup_old_history(90); -- Deletes records older than 90 days
