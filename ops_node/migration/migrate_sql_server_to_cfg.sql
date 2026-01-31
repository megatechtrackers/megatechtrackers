-- ============================================
-- MIGRATION SCRIPT: Original Tables → cfg_ Tables
-- ============================================
-- Purpose: Migrate data from original SQL Server schema to simplified cfg_ tables
--          before migrating to PostgreSQL
-- 
-- Source Tables: CommandMaster, CommandDetail, CommandSubDetail, CommandCategory,
--                CommandCategoryDetail, UnitMaster, DeviceConfiguration, De_UnitInfo,
--                LastConfiguration
-- 
-- Target Tables: cfg_DeviceConfig, cfg_Unit, cfg_UnitConfig, cfg_CommandHistory
-- ============================================

-- ============================================
-- PART 1: CREATE cfg_ TABLES
-- ============================================

-- Drop if exists (for re-running)
-- Step 1: Drop all foreign keys that reference cfg_ tables
DECLARE @dropFK NVARCHAR(MAX) = '';
SELECT @dropFK = @dropFK + 
    'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(fk.parent_object_id)) + '.' + QUOTENAME(OBJECT_NAME(fk.parent_object_id)) + 
    ' DROP CONSTRAINT ' + QUOTENAME(fk.name) + ';' + CHAR(13)
FROM sys.foreign_keys fk
INNER JOIN sys.objects obj ON fk.parent_object_id = obj.object_id
WHERE obj.name LIKE 'cfg_%';
IF LEN(@dropFK) > 0 EXEC sp_executesql @dropFK;

-- Step 2: Drop all unique constraints (these create indexes but must be dropped as constraints)
DECLARE @dropUnique NVARCHAR(MAX) = '';
SELECT @dropUnique = @dropUnique + 
    'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(kc.parent_object_id)) + '.' + QUOTENAME(OBJECT_NAME(kc.parent_object_id)) + 
    ' DROP CONSTRAINT ' + QUOTENAME(kc.name) + ';' + CHAR(13)
FROM sys.key_constraints kc
INNER JOIN sys.objects obj ON kc.parent_object_id = obj.object_id
WHERE obj.name LIKE 'cfg_%'
    AND kc.type = 'UQ';  -- Unique constraints
IF LEN(@dropUnique) > 0 EXEC sp_executesql @dropUnique;

-- Step 3: Drop all non-clustered indexes on cfg_ tables (primary keys and unique constraints already handled)
DECLARE @dropIndex NVARCHAR(MAX) = '';
SELECT @dropIndex = @dropIndex + 
    'DROP INDEX ' + QUOTENAME(idx.name) + ' ON ' + QUOTENAME(OBJECT_SCHEMA_NAME(idx.object_id)) + '.' + QUOTENAME(OBJECT_NAME(idx.object_id)) + ';' + CHAR(13)
FROM sys.indexes idx
INNER JOIN sys.objects obj ON idx.object_id = obj.object_id
WHERE obj.name LIKE 'cfg_%'
    AND idx.is_primary_key = 0
    AND idx.name IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM sys.key_constraints kc 
        WHERE kc.parent_object_id = idx.object_id 
        AND kc.unique_index_id = idx.index_id
    );
IF LEN(@dropIndex) > 0 EXEC sp_executesql @dropIndex;

-- Step 4: Drop all cfg_ tables (in any order since foreign keys are already dropped)
IF OBJECT_ID('cfg_CommandHistory', 'U') IS NOT NULL DROP TABLE cfg_CommandHistory;
IF OBJECT_ID('cfg_UnitConfig', 'U') IS NOT NULL DROP TABLE cfg_UnitConfig;
IF OBJECT_ID('cfg_Unit', 'U') IS NOT NULL DROP TABLE cfg_Unit;
IF OBJECT_ID('cfg_DeviceConfig', 'U') IS NOT NULL DROP TABLE cfg_DeviceConfig;
GO

-- 1. Device Config (Settings + Commands from vendors)
-- Structure matches original CommandConfigDto from CommandConfigApi:
-- - CommandParametersJSON: ALL parameters for command building (Fixed + Configurable)
-- - ParametersJSON: Configurable parameters with full UI metadata (matches ParameterConfigDto → SubDetailConfigDto)
CREATE TABLE cfg_DeviceConfig (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    DeviceName NVARCHAR(100) NOT NULL,          -- e.g., "GT06N", "JC400D" (from category's device)
    -- Hierarchy: DeviceName -> ConfigType -> CategoryTypeDesc -> Category -> Profile -> CommandName -> Description
    ConfigType NVARCHAR(20) NOT NULL,           -- 'Setting' or 'Command'
    CategoryTypeDesc NVARCHAR(50),              -- 'General', 'IOProperties', 'Profile'
    Category NVARCHAR(100),                     -- Category name from CommandCategory
    Profile NVARCHAR(10),                       -- Profile number (1, 2, 3, 4) from CommandMaster.Profile
    CommandName NVARCHAR(200) NOT NULL,         -- Command name from CommandMaster
    Description NVARCHAR(500),

    CommandSeprator NVARCHAR(50),               -- Command separator (from CommandMaster.CommandSeprator)
    CommandSyntax NVARCHAR(500),                -- Command syntax from CommandMaster
    CommandType NVARCHAR(10),                   -- Command type from CommandMaster
    
    -- CommandParametersJSON: ALL parameters (Fixed + Configurable) for command building
    -- Format: [{"ParameterID": 123, "ParameterType": "1", "ParameterTypeDesc": "Fixed", "ParameterName": "StartCharacter", "DefaultValue": "1"}, ...]
    CommandParametersJSON NVARCHAR(MAX),
    
    -- ParametersJSON: Configurable parameters with FULL UI metadata (matches original ParameterConfigDto → SubDetailConfigDto)
    -- Format: [{"ParameterID": 123, "ParameterName": "CommandValue", "ParameterType": "2", "ParameterValue": "default",
    --           "SubDetails": [{"SubDetailID": 456, "Control": "ComboBox", "ControlWidth": 200, "ActualValue": "0", 
    --                          "Description": "...", "CmdText": "Disable", "CmdValue": "0", "MinValue": null, "MaxValue": null}, ...]}]
    ParametersJSON NVARCHAR(MAX),
    
    CommandID INT NULL                          -- CommandMaster.ID - correlation key for unit_config
);

-- 2. Units (actual trackers) - Simplified to match View_UnitViewFromERP
CREATE TABLE cfg_Unit (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    MegaID NVARCHAR(50),                        -- From View_UnitViewFromERP.MegaID (with 'M' prefix: 'M2100290')
    IMEI NVARCHAR(50) NOT NULL UNIQUE,          -- From View_UnitViewFromERP.UnitID
    FFID NVARCHAR(50),                          -- From View_UnitViewFromERP.FF
    SimNo NVARCHAR(50),                         -- From View_UnitViewFromERP.ServiceNo
    DeviceName NVARCHAR(100) NOT NULL,          -- From View_UnitViewFromERP.UnitName (links to cfg_DeviceConfig.DeviceName)
    ModemID INT,                                -- From View_UnitViewFromERP.ModemID
    CreatedDate DATETIME DEFAULT GETDATE()
);

-- 3. Unit Configs (saved configurations per tracker)
CREATE TABLE cfg_UnitConfig (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    MegaID NVARCHAR(50) NOT NULL,                  -- From LastConfiguration.MegaID
    DeviceName NVARCHAR(100) NOT NULL,             -- From cfg_Unit.DeviceName - enables direct join with cfg_DeviceConfig
    CommandID INT NOT NULL,                        -- CommandMaster.ID - identifies which setting this value is for
    Value NVARCHAR(MAX) NOT NULL,                  -- JSON array: [{"ParameterID": 123, "Value": "val1"}, ...] - needs MAX for multiple parameters
    ModifiedBy NVARCHAR(50),
    ModifiedDate DATETIME DEFAULT GETDATE(),
    CONSTRAINT UQ_UnitConfig UNIQUE (MegaID, DeviceName, CommandID)
);

-- 4. Command History (SMS sent log)
CREATE TABLE cfg_CommandHistory (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    FK_UnitID INT NOT NULL FOREIGN KEY REFERENCES cfg_Unit(ID),
    FK_ConfigID INT NULL FOREIGN KEY REFERENCES cfg_DeviceConfig(ID),
    CommandSent NVARCHAR(1000) NOT NULL,
    SentDate DATETIME DEFAULT GETDATE(),
    SentBy NVARCHAR(50),
    Status NVARCHAR(50) DEFAULT 'Sent'
);

-- Indexes for performance
CREATE INDEX IX_cfg_DeviceConfig_DeviceName ON cfg_DeviceConfig(DeviceName);
CREATE INDEX IX_cfg_DeviceConfig_ConfigType ON cfg_DeviceConfig(ConfigType);
CREATE INDEX IX_cfg_Unit_IMEI ON cfg_Unit(IMEI);
CREATE INDEX IX_cfg_Unit_MegaID ON cfg_Unit(MegaID);
CREATE INDEX IX_cfg_Unit_DeviceName ON cfg_Unit(DeviceName);
CREATE INDEX IX_cfg_Unit_SimNo ON cfg_Unit(SimNo);
CREATE INDEX IX_cfg_UnitConfig_MegaID ON cfg_UnitConfig(MegaID);
CREATE INDEX IX_cfg_UnitConfig_DeviceCommand ON cfg_UnitConfig(DeviceName, CommandID);
CREATE INDEX IX_cfg_CommandHistory_UnitID ON cfg_CommandHistory(FK_UnitID);
CREATE INDEX IX_cfg_CommandHistory_SentDate ON cfg_CommandHistory(SentDate DESC);

PRINT 'Tables created successfully.';
GO

-- ============================================
-- PART 2: MIGRATE SETTINGS
-- ============================================
-- Migrates configurable settings from CommandMaster/CommandDetail/CommandSubDetail
-- 
-- Device Inheritance Logic:
-- - DeviceName = Category's device (UI device - the device whose UI shows this config)
-- - When Device A inherits Device B: 
--   * Device A's category links to Device B's command (via CommandCategoryDetail)
--   * Creates config with DeviceName = 'A' (replica of Device B's command data)
--   * Device B's own categories create configs with DeviceName = 'B' (original)
-- - This ensures each device has its own configs, units can match by DeviceName directly
-- 
-- Filter: Only includes commands with configurable parameters (ParameterType = '2')
-- ============================================

INSERT INTO cfg_DeviceConfig (
    DeviceName, 
    ConfigType, 
    Category, 
    CategoryTypeDesc,
    CommandName, 
    CommandSeprator,
    Profile,
    CommandSyntax,
    CommandType,
    CommandParametersJSON,
    ParametersJSON,
    CommandID
)
SELECT 
    d_cat.DeviceID AS DeviceName,
    'Setting' AS ConfigType,
    cc.Category,
    CASE cc.CategoryType 
        WHEN '1' THEN 'General' 
        WHEN '2' THEN 'IOProperties' 
        WHEN '3' THEN 'GeoFencing' 
        ELSE NULL 
    END AS CategoryTypeDesc,
    cm.CommandName,
    cm.CommandSeprator,
    cm.Profile,
    cm.CommandSyntax,
    cm.CommandType,
    -- CommandParametersJSON: ALL parameters (Fixed + Configurable) for command building
    -- CRITICAL: ORDER BY cd2.ID preserves parameter order - this order must be maintained when building commands
    (SELECT 
            cd2.ID as ParameterID,
            cd2.ParameterType, 
            CASE cd2.ParameterType WHEN '1' THEN 'Fixed' WHEN '2' THEN 'Configurable' END as ParameterTypeDesc, 
            cd2.ParameterName, 
            cd2.ParameterValue as DefaultValue 
     FROM CommandDetail cd2 
     WHERE cd2.FK_CmdID = cm.ID 
     ORDER BY cd2.ID 
     FOR JSON PATH) AS CommandParametersJSON,
    -- ParametersJSON: Configurable parameters with FULL UI metadata (matches original ParameterConfigDto)
    -- Contains ALL configurable parameters (ParameterType='2') with their SubDetails
    -- CRITICAL: ORDER BY preserves parameter order for correct command building and UI display
    (SELECT 
        cd_param.ID as ParameterID,
        cd_param.ParameterName,
        cd_param.ParameterType,
        cd_param.ParameterValue,
        -- SubDetails: ALL SubDetails for this parameter (matches original SubDetailConfigDto)
        (SELECT 
            sub.ID as SubDetailID,
            sub.Control,
            sub.ControlWidth,
            sub.ActualValue,
            sub.Description,
            sub.CmdText,
            sub.CmdValue,
            sub.MinValue,
            sub.MaxValue
         FROM CommandSubDetail sub
         WHERE sub.FK_CmdDetailID = cd_param.ID
         ORDER BY sub.ID
         FOR JSON PATH) as SubDetails
     FROM CommandDetail cd_param
     WHERE cd_param.FK_CmdID = cm.ID 
       AND cd_param.ParameterType = '2'  -- Only configurable parameters
     ORDER BY cd_param.ID
     FOR JSON PATH) AS ParametersJSON,
    cm.ID AS CommandID
 
FROM CommandCategory cc
-- Join to get category's device (UI device - the device whose UI shows this)
INNER JOIN Device d_cat ON cc.FK_DeviceID = d_cat.ID
-- Join to CommandCategoryDetail to link categories to commands
INNER JOIN CommandCategoryDetail ccd ON cc.id = ccd.FK_CategoryID
-- Join to CommandMaster to get the actual command (supports template inheritance)
INNER JOIN CommandMaster cm ON ccd.FK_CommandID = cm.ID
-- Join to get command's device (source device - where command comes from, may differ from UI device)
INNER JOIN Device d_cmd ON cm.FK_DeviceID = d_cmd.ID
-- Ensure command has at least one configurable parameter
WHERE EXISTS (
    SELECT 1 FROM CommandDetail cd 
    WHERE cd.FK_CmdID = cm.ID AND cd.ParameterType = '2'
);

PRINT 'Settings migrated: ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';
GO

-- ============================================
-- PART 3: MIGRATE DIRECT COMMANDS
-- ============================================
-- Migrates CommandType='1' commands that are NOT in any category (Feature Commands)
-- 
-- Application Logic: GetCommandsByMegaIdAsync retrieves these by unit's actual device
-- - Unit's device (View_UnitViewFromErp.UnitName) matches command's source device (cm.FK_DeviceID)
-- - DirectCommands are NOT inherited - they're specific to the unit's actual device
-- 
-- Filter: CommandType='1', has CommandSyntax, NOT in any CommandCategoryDetail
-- ============================================

INSERT INTO cfg_DeviceConfig (
    DeviceName, 
    ConfigType, 
    Category, 
    CategoryTypeDesc,
    CommandName, 
    CommandSeprator,
    Profile,
    CommandSyntax,
    CommandType,
    CommandParametersJSON,
    ParametersJSON,
    CommandID
)
SELECT 
    d_cmd.DeviceID AS DeviceName,
    'Command' AS ConfigType,
    NULL AS Category,  -- DirectCommands are NOT in categories
    NULL AS CategoryTypeDesc,  -- DirectCommands don't have category types
    cm.CommandName,
    cm.CommandSeprator,  -- Separator from CommandMaster
    cm.Profile,  -- Profile from CommandMaster
    cm.CommandSyntax,  -- Direct commands use CommandSyntax as-is
    cm.CommandType,
    NULL AS CommandParametersJSON,  -- DirectCommands don't have parameters (use CommandSyntax directly)
    NULL AS ParametersJSON,         -- DirectCommands don't have configurable parameters
    cm.ID AS CommandID

FROM CommandMaster cm
INNER JOIN Device d_cmd ON cm.FK_DeviceID = d_cmd.ID
WHERE cm.CommandType = '1'
    AND cm.CommandSyntax IS NOT NULL 
    AND cm.CommandSyntax != ''
    -- Exclude commands that are in categories (those are migrated as Settings in PART 2)
    AND NOT EXISTS (
        SELECT 1 
        FROM CommandCategoryDetail ccd 
        WHERE ccd.FK_CommandID = cm.ID
    );

PRINT 'DirectCommands migrated: ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';
GO

-- ============================================
-- PART 4: MIGRATE UNITS
-- ============================================
-- Migrates units from View_UnitViewFromERP (simplified to match original CommandConfigApi approach)
-- 
-- Data Source:
-- - View_UnitViewFromERP: Contains all unit information from ERP system
-- 
-- Column Mapping:
-- - MegaID: View_UnitViewFromERP.MegaID (already has 'M' prefix)
-- - IMEI: View_UnitViewFromERP.UnitID
-- - FFID: View_UnitViewFromERP.FF
-- - SimNo: View_UnitViewFromERP.ServiceNo
-- - DeviceName: View_UnitViewFromERP.UnitName
-- - ModemID: View_UnitViewFromERP.ModemID
-- 
-- Deduplication: Uses ROW_NUMBER to get one row per IMEI (UnitID)
-- ============================================
WITH UnitRanked AS (
    SELECT 
        uv.MegaID,
        uv.UnitID AS IMEI,
        uv.FF AS FFID,
        uv.ServiceNo AS SimNo,
        COALESCE(uv.UnitName, 'Unknown') AS DeviceName,  -- Default to 'Unknown' if UnitName is NULL
        uv.ModemID,
        ROW_NUMBER() OVER (PARTITION BY uv.UnitID ORDER BY uv.MegaID DESC) AS rn
    FROM [WebRptInternal].[dbo].[View_UnitViewFromERP] uv
    WHERE uv.UnitID IS NOT NULL 
    AND uv.UnitID != ''
    AND uv.UnitID NOT LIKE '%none%'
    AND LEN(uv.UnitID) > 5  -- Filter out invalid IMEIs
    AND uv.ServiceNo NOT LIKE '%none%'  -- Filter out invalid ServiceNo
)
INSERT INTO cfg_Unit (
    MegaID, IMEI, FFID, SimNo, DeviceName, ModemID
)
SELECT 
    ur.MegaID,
    ur.IMEI,
    ur.FFID,
    ur.SimNo,
    ur.DeviceName,
    ur.ModemID
FROM UnitRanked ur
WHERE ur.rn = 1;  -- Only one row per IMEI

PRINT 'Units migrated: ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';
GO

-- ============================================
-- PART 5: MIGRATE Unit ConfigS
-- ============================================
-- Migrates saved configuration values from LastConfiguration
-- 
-- Key Logic: Commands can have multiple configurable parameters (ParameterType='2')
-- - Each parameter has its own LastConfiguration entry (same MegaID, different FK_CmdDId)
-- - Aggregates all parameter values for the same command into a JSON array
-- - Stores as single row per (MegaID, CommandID) for efficient lookup
-- - Uses MegaID directly - no need to join with cfg_Unit table
-- 
-- Value Format: Always JSON array with ParameterID (ordered by CommandDetail.ID)
-- - Single value: [{"ParameterID": 123, "Value": "val1"}]
-- - Multiple values: [{"ParameterID": 123, "Value": "val1"}, {"ParameterID": 124, "Value": "val2"}]
-- ============================================
WITH LastConfigAggregated AS (
    SELECT 
        lc.MegaID,
        cd.FK_CmdID AS CommandID,
            -- Get the most recent modification info
        MAX(lc.LCDateTime) AS LatestModified,
        MAX(lc.UserID) AS LastUser,
        -- Aggregate values into JSON array with ParameterID, ordered by CommandDetail.ID (maintains parameter order)
        -- CRITICAL: ORDER BY cd.ID must match CommandParametersJSON order for correct command building
        '[' + STRING_AGG(
            '{"ParameterID":' + CAST(cd.ID AS VARCHAR) + ',"Value":"' + REPLACE(REPLACE(lc.Value, '\', '\\'), '"', '\"') + '"}', 
            ','
        ) WITHIN GROUP (ORDER BY cd.ID) + ']' AS Value
    FROM LastConfiguration lc
    -- Join to CommandDetail to get the CommandMaster ID and ensure it's configurable
    INNER JOIN CommandDetail cd ON cd.ID = lc.FK_CmdDId AND cd.ParameterType = '2'
    GROUP BY lc.MegaID, cd.FK_CmdID
)
INSERT INTO cfg_UnitConfig (MegaID, DeviceName, CommandID, Value, ModifiedBy, ModifiedDate)
SELECT 
    lca.MegaID,
    COALESCE(u.DeviceName, 'Unknown') AS DeviceName,  -- Get DeviceName from cfg_Unit via MegaID
    lca.CommandID AS CommandID,  -- Store CommandMaster.ID directly
    lca.Value,
    lca.LastUser AS ModifiedBy,
    lca.LatestModified AS ModifiedDate
FROM LastConfigAggregated lca
LEFT JOIN cfg_Unit u ON lca.MegaID = u.MegaID;  -- Join to get DeviceName from cfg_Unit

PRINT 'Unit Configs migrated: ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';
GO

-- ============================================
-- PART 6: VERIFY MIGRATION
-- ============================================

PRINT '';
PRINT '============================================';
PRINT 'MIGRATION STATISTICS';
PRINT '============================================';

SELECT 'cfg_DeviceConfig' AS TableName, COUNT(*) AS TotalRows FROM cfg_DeviceConfig
UNION ALL SELECT 'cfg_Unit', COUNT(*) FROM cfg_Unit
UNION ALL SELECT 'cfg_UnitConfig', COUNT(*) FROM cfg_UnitConfig
UNION ALL SELECT 'cfg_CommandHistory', COUNT(*) FROM cfg_CommandHistory;

-- Check by ConfigType
SELECT ConfigType, COUNT(*) AS Count 
FROM cfg_DeviceConfig 
GROUP BY ConfigType
ORDER BY 
    CASE ConfigType 
        WHEN 'Setting' THEN 1 
        WHEN 'Command' THEN 2 
        ELSE 3 
    END;

-- Check by CategoryTypeDesc
SELECT CategoryTypeDesc, COUNT(*) AS Count 
FROM cfg_DeviceConfig 
WHERE CategoryTypeDesc IS NOT NULL
GROUP BY CategoryTypeDesc
ORDER BY 
    CASE CategoryTypeDesc 
        WHEN 'General' THEN 1 
        WHEN 'IOProperties' THEN 2 
        WHEN 'Profile' THEN 3 
        ELSE 4 
    END;

-- Check JSON columns
PRINT '';
PRINT 'JSON Columns Statistics:';
SELECT 
    'Settings with ParametersJSON' AS Stat, 
    COUNT(*) AS Count 
FROM cfg_DeviceConfig 
WHERE ConfigType = 'Setting' AND ParametersJSON IS NOT NULL
UNION ALL
SELECT 
    'Settings with CommandParametersJSON', 
    COUNT(*) 
FROM cfg_DeviceConfig 
WHERE ConfigType = 'Setting' AND CommandParametersJSON IS NOT NULL
UNION ALL
SELECT 
    'Commands with CommandSyntax', 
    COUNT(*) 
FROM cfg_DeviceConfig 
WHERE ConfigType = 'Command' AND CommandSyntax IS NOT NULL;

-- Sample data
PRINT '';
PRINT 'Sample Settings:';
SELECT TOP 5 DeviceName, CommandName, Category, 
    JSON_VALUE(ParametersJSON, '$[0].SubDetails[0].Control') as FirstControl
FROM cfg_DeviceConfig WHERE ConfigType = 'Setting';

PRINT '';
PRINT 'Sample Commands:';
SELECT TOP 5 DeviceName, CommandName, CommandSyntax, CategoryTypeDesc FROM cfg_DeviceConfig WHERE ConfigType = 'Command';

PRINT '';
PRINT 'Sample Units:';
SELECT TOP 5 IMEI, DeviceName, SimNo FROM cfg_Unit;

PRINT '';
PRINT '============================================';
PRINT 'MIGRATION COMPLETE!';
PRINT '============================================';
GO

