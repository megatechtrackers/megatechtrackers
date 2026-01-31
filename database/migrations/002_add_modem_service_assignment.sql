-- Migration: Add service assignment to SMS modems
-- Date: 2026-01-22
-- Description: Allow modems to be assigned to specific services (alarms, commands, otp, marketing)
--
-- This enables:
--   - Service-level modem pools (e.g., modems 1,2 for alarms; modems 3,4 for commands)
--   - Combined with unit.modem_id for device-specific routing
--
-- Selection priority:
--   1. Device has modem_id AND modem exists → Use that modem
--   2. Device modem_id not found (invalid) → Use service pool
--   3. Device has no modem_id → Use service pool  
--   4. Service pool exhausted → Fallback to any modem
--
-- Run this migration on existing databases to enable service assignment.

-- ═══════════════════════════════════════════════════════════════════════════════
-- Add allowed_services column to alarms_sms_modems
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
    -- Add allowed_services column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'alarms_sms_modems' AND column_name = 'allowed_services'
    ) THEN
        -- Default to all services for backward compatibility
        ALTER TABLE alarms_sms_modems 
        ADD COLUMN allowed_services TEXT[] DEFAULT ARRAY['alarms', 'commands'];
        
        RAISE NOTICE 'Added allowed_services column to alarms_sms_modems';
        
        -- Update existing modems to allow all services
        UPDATE alarms_sms_modems 
        SET allowed_services = ARRAY['alarms', 'commands']
        WHERE allowed_services IS NULL;
        
        RAISE NOTICE 'Set default allowed_services for existing modems';
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Add GIN index for efficient array queries
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_alarms_sms_modems_services 
    ON alarms_sms_modems USING GIN(allowed_services) 
    WHERE enabled = TRUE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Add comment for documentation
-- ═══════════════════════════════════════════════════════════════════════════════
COMMENT ON COLUMN alarms_sms_modems.allowed_services IS 
    'Services that can use this modem: alarms, commands, otp, marketing. Default allows all.';

