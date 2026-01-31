-- Setup Device Contacts for Mock Trackers
-- This script adds test contacts for all mock tracker IMEIs (999000000000001 - 999000000000020)
-- The contacts will receive alarm notifications (SMS and Email) through mock services

-- First, clear any existing mock tracker contacts
DELETE FROM alarms_contacts WHERE imei::text LIKE '9990000000000%';

-- Insert contacts for all 20 mock trackers
-- Each tracker gets 2 contacts: primary and secondary
DO $$
DECLARE
    mock_imei BIGINT;
    tracker_num INT;
BEGIN
    FOR tracker_num IN 1..20 LOOP
        mock_imei := 999000000000000 + tracker_num;
        
        -- Primary contact
        INSERT INTO alarms_contacts (
            imei, contact_name, email, phone, contact_type, priority, active, timezone
        ) VALUES (
            mock_imei,
            'Test User ' || tracker_num || ' (Primary)',
            'test.user' || tracker_num || '@mockmail.local',
            '+1555000' || LPAD(tracker_num::text, 4, '0'),
            'primary',
            1,
            TRUE,
            'Asia/Karachi'
        );
        
        -- Secondary contact (emergency)
        INSERT INTO alarms_contacts (
            imei, contact_name, email, phone, contact_type, priority, active, timezone
        ) VALUES (
            mock_imei,
            'Test User ' || tracker_num || ' (Emergency)',
            'emergency' || tracker_num || '@mockmail.local',
            '+1555100' || LPAD(tracker_num::text, 4, '0'),
            'emergency',
            2,
            TRUE,
            'Asia/Karachi'
        );
        
        RAISE NOTICE 'Added contacts for mock tracker IMEI: %', mock_imei;
    END LOOP;
END $$;

-- Verify the inserted contacts
SELECT 
    imei,
    contact_name,
    email,
    phone,
    contact_type,
    priority,
    active
FROM alarms_contacts 
WHERE imei::text LIKE '9990000000000%'
ORDER BY imei, priority;

-- Show summary
SELECT 
    COUNT(*) as total_contacts,
    COUNT(DISTINCT imei) as unique_imeis,
    COUNT(DISTINCT email) as unique_emails,
    COUNT(DISTINCT phone) as unique_phones
FROM alarms_contacts 
WHERE imei::text LIKE '9990000000000%';
