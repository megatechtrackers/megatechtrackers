-- Migration: Add modem tracking columns to SMS-related tables
-- Date: 2026-01-22
-- Description: Track which modem was used for each SMS notification/command
--
-- This migration adds modem_id and modem_name columns to:
--   - command_sent: Track modem used for SMS commands
--   - command_history: Archive modem info for audit trail
--   - alarms_history: Track modem used for alarm SMS notifications
--
-- Run this migration on existing databases to enable modem tracking.
-- New installations will have these columns from the schema.sql file.

-- ═══════════════════════════════════════════════════════════════════════════════
-- Add modem tracking to command_sent table
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
    -- Add modem_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'command_sent' AND column_name = 'modem_id'
    ) THEN
        ALTER TABLE command_sent ADD COLUMN modem_id INTEGER;
        RAISE NOTICE 'Added modem_id column to command_sent';
    END IF;

    -- Add modem_name column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'command_sent' AND column_name = 'modem_name'
    ) THEN
        ALTER TABLE command_sent ADD COLUMN modem_name VARCHAR(100);
        RAISE NOTICE 'Added modem_name column to command_sent';
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Add modem tracking to command_history table
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
    -- Add modem_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'command_history' AND column_name = 'modem_id'
    ) THEN
        ALTER TABLE command_history ADD COLUMN modem_id INTEGER;
        RAISE NOTICE 'Added modem_id column to command_history';
    END IF;

    -- Add modem_name column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'command_history' AND column_name = 'modem_name'
    ) THEN
        ALTER TABLE command_history ADD COLUMN modem_name VARCHAR(100);
        RAISE NOTICE 'Added modem_name column to command_history';
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Add modem tracking to alarms_history table
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
    -- Add modem_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'alarms_history' AND column_name = 'modem_id'
    ) THEN
        ALTER TABLE alarms_history ADD COLUMN modem_id INTEGER;
        RAISE NOTICE 'Added modem_id column to alarms_history';
    END IF;

    -- Add modem_name column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'alarms_history' AND column_name = 'modem_name'
    ) THEN
        ALTER TABLE alarms_history ADD COLUMN modem_name VARCHAR(100);
        RAISE NOTICE 'Added modem_name column to alarms_history';
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Add index for modem-based queries on alarms_history
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_alarms_history_modem 
    ON alarms_history(modem_name) 
    WHERE modem_name IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Comments for documentation
-- ═══════════════════════════════════════════════════════════════════════════════
COMMENT ON COLUMN command_sent.modem_id IS 'ID of modem used for SMS (FK to alarms_sms_modems.id)';
COMMENT ON COLUMN command_sent.modem_name IS 'Name of modem used for SMS';
COMMENT ON COLUMN command_history.modem_id IS 'ID of modem used for SMS (FK to alarms_sms_modems.id)';
COMMENT ON COLUMN command_history.modem_name IS 'Name of modem used for SMS';
COMMENT ON COLUMN alarms_history.modem_id IS 'ID of modem used for SMS (FK to alarms_sms_modems.id)';
COMMENT ON COLUMN alarms_history.modem_name IS 'Name of modem used for SMS';

-- ═══════════════════════════════════════════════════════════════════════════════
-- Verification query (run manually to verify migration)
-- ═══════════════════════════════════════════════════════════════════════════════
-- SELECT 
--     table_name, 
--     column_name, 
--     data_type 
-- FROM information_schema.columns 
-- WHERE table_name IN ('command_sent', 'command_history', 'alarms_history')
--   AND column_name IN ('modem_id', 'modem_name')
-- ORDER BY table_name, column_name;
