-- ============================================
-- Alarm Templates Setup Script
-- ============================================
-- This script creates alarm notification templates
-- for Email and SMS channels.
-- 
-- Note: All required tables are created in database/schema.sql
-- ============================================

-- ============================================
-- NAMING CONVENTION:
-- - ALARM: Events from GPS trackers (Panic, Geofence, Speed, Ignition, etc.)
-- - ALERT: System/infrastructure events (AlertManager, service health, etc.)
-- ============================================

-- ============================================
-- Alarm Templates
-- ============================================
-- Insert default templates for email and SMS notifications
-- Templates use Handlebars syntax for variable substitution

-- ============================================
-- DEFAULT ALARM TEMPLATE (catches all unmatched alarms)
-- ============================================

-- Email Template: Default Alarm Notification
INSERT INTO alarms_templates (
    name, channel, template_type, subject, body, version, is_active, variables, created_by
) VALUES (
    'default',
    'email',
    'alarm',
    '🚨 Vehicle Alarm: {{status}}',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; }
        .alarm-details { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #dc3545; }
        .detail-row { margin: 8px 0; }
        .label { font-weight: bold; color: #495057; }
        .footer { text-align: center; padding: 20px; color: #6c757d; font-size: 12px; }
        .map-link { display: inline-block; margin-top: 10px; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚨 Vehicle Alarm</h1>
        </div>
        <div class="content">
            <div class="alarm-details">
                <h2>{{status}}</h2>
                <div class="detail-row">
                    <span class="label">IMEI:</span> {{imei}}
                </div>
                <div class="detail-row">
                    <span class="label">Time:</span> {{gps_time}}
                </div>
                <div class="detail-row">
                    <span class="label">Location:</span> {{latitude}}, {{longitude}}
                </div>
                <div class="detail-row">
                    <span class="label">Speed:</span> {{speed}} km/h
                </div>
                {{#if distance}}
                <div class="detail-row">
                    <span class="label">Distance:</span> {{distance}} km
                </div>
                {{/if}}
                <a href="https://www.google.com/maps?q={{latitude}},{{longitude}}" class="map-link" target="_blank">
                    View on Google Maps
                </a>
            </div>
        </div>
        <div class="footer">
            <p>This is an automated alarm notification from Megatechtrackers Tracking System</p>
            <p>Generated at {{server_time}}</p>
        </div>
    </div>
</body>
</html>',
    1,
    TRUE,
    '{"imei": "Device IMEI number", "status": "Alarm status/message", "gps_time": "GPS timestamp", "server_time": "Server timestamp", "latitude": "Latitude coordinate", "longitude": "Longitude coordinate", "speed": "Speed in km/h", "distance": "Distance (optional)"}'::jsonb,
    'system'
) ON CONFLICT (name, channel, version) DO NOTHING;

-- SMS Template: Default Alarm Notification
INSERT INTO alarms_templates (
    name, channel, template_type, subject, body, version, is_active, variables, created_by
) VALUES (
    'default',
    'sms',
    'alarm',
    NULL,
    'ALARM: {{status}} | IMEI: {{imei}} | {{gps_time}} | {{latitude}},{{longitude}} | {{speed}}km/h | https://maps.google.com/?q={{latitude}},{{longitude}}',
    1,
    TRUE,
    '{"imei": "Device IMEI number", "status": "Alarm status/message", "gps_time": "GPS timestamp", "latitude": "Latitude coordinate", "longitude": "Longitude coordinate", "speed": "Speed in km/h"}'::jsonb,
    'system'
) ON CONFLICT (name, channel, version) DO NOTHING;

-- ============================================
-- PANIC ALARM TEMPLATE (SOS / Emergency Button)
-- ============================================

-- Email Template: Panic Alarm
INSERT INTO alarms_templates (
    name, channel, template_type, subject, body, version, is_active, variables, created_by
) VALUES (
    'panic',
    'email',
    'alarm',
    '🆘 PANIC ALARM: Emergency Button Pressed',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; }
        .alarm-details { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #dc3545; }
        .emergency-warning { font-size: 24px; font-weight: bold; color: #dc3545; text-align: center; margin: 15px 0; }
        .detail-row { margin: 8px 0; }
        .label { font-weight: bold; color: #495057; }
        .map-link { display: inline-block; margin-top: 10px; padding: 10px 20px; background-color: #dc3545; color: white; text-decoration: none; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🆘 PANIC ALARM</h1>
        </div>
        <div class="content">
            <div class="alarm-details">
                <div class="emergency-warning">⚠️ EMERGENCY BUTTON PRESSED ⚠️</div>
                <h2>{{status}}</h2>
                <div class="detail-row">
                    <span class="label">IMEI:</span> {{imei}}
                </div>
                <div class="detail-row">
                    <span class="label">Time:</span> {{gps_time}}
                </div>
                <div class="detail-row">
                    <span class="label">Location:</span> {{latitude}}, {{longitude}}
                </div>
                <div class="detail-row">
                    <span class="label">Speed:</span> {{speed}} km/h
                </div>
                <a href="https://www.google.com/maps?q={{latitude}},{{longitude}}" class="map-link" target="_blank">
                    🗺️ View Location on Google Maps
                </a>
            </div>
        </div>
    </div>
</body>
</html>',
    1,
    TRUE,
    '{"imei": "Device IMEI number", "status": "Alarm status", "gps_time": "GPS timestamp", "latitude": "Latitude coordinate", "longitude": "Longitude coordinate", "speed": "Speed in km/h"}'::jsonb,
    'system'
) ON CONFLICT (name, channel, version) DO NOTHING;

-- SMS Template: Panic Alarm
INSERT INTO alarms_templates (
    name, channel, template_type, subject, body, version, is_active, variables, created_by
) VALUES (
    'panic',
    'sms',
    'alarm',
    NULL,
    '🆘 PANIC ALARM: {{status}} | IMEI:{{imei}} | {{gps_time}} | https://maps.google.com/?q={{latitude}},{{longitude}}',
    1,
    TRUE,
    '{"imei": "Device IMEI number", "status": "Alarm status", "gps_time": "GPS timestamp", "latitude": "Latitude coordinate", "longitude": "Longitude coordinate"}'::jsonb,
    'system'
) ON CONFLICT (name, channel, version) DO NOTHING;

-- ============================================
-- IGNITION ALARM TEMPLATE
-- ============================================

-- Email Template: Ignition Alarm
INSERT INTO alarms_templates (
    name, channel, template_type, subject, body, version, is_active, variables, created_by
) VALUES (
    'ignition',
    'email',
    'alarm',
    '🔑 Ignition {{status}}: Vehicle State Changed',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #17a2b8; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; }
        .alarm-details { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #17a2b8; }
        .detail-row { margin: 8px 0; }
        .label { font-weight: bold; color: #495057; }
        .map-link { display: inline-block; margin-top: 10px; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔑 Ignition {{status}}</h1>
        </div>
        <div class="content">
            <div class="alarm-details">
                <h2>Vehicle Ignition: {{status}}</h2>
                <div class="detail-row">
                    <span class="label">IMEI:</span> {{imei}}
                </div>
                <div class="detail-row">
                    <span class="label">Time:</span> {{gps_time}}
                </div>
                <div class="detail-row">
                    <span class="label">Location:</span> {{latitude}}, {{longitude}}
                </div>
                <div class="detail-row">
                    <span class="label">Speed:</span> {{speed}} km/h
                </div>
                <a href="https://www.google.com/maps?q={{latitude}},{{longitude}}" class="map-link" target="_blank">
                    View on Google Maps
                </a>
            </div>
        </div>
    </div>
</body>
</html>',
    1,
    TRUE,
    '{"imei": "Device IMEI number", "status": "On or Off", "gps_time": "GPS timestamp", "latitude": "Latitude coordinate", "longitude": "Longitude coordinate", "speed": "Speed in km/h"}'::jsonb,
    'system'
) ON CONFLICT (name, channel, version) DO NOTHING;

-- SMS Template: Ignition Alarm
INSERT INTO alarms_templates (
    name, channel, template_type, subject, body, version, is_active, variables, created_by
) VALUES (
    'ignition',
    'sms',
    'alarm',
    NULL,
    'IGNITION {{status}} | IMEI:{{imei}} | {{gps_time}} | {{latitude}},{{longitude}} | https://maps.google.com/?q={{latitude}},{{longitude}}',
    1,
    TRUE,
    '{"imei": "Device IMEI number", "status": "On or Off", "gps_time": "GPS timestamp", "latitude": "Latitude coordinate", "longitude": "Longitude coordinate"}'::jsonb,
    'system'
) ON CONFLICT (name, channel, version) DO NOTHING;

-- ============================================
-- SPEED LIMIT ALARM TEMPLATE
-- ============================================

-- Email Template: Speed Limit Exceeded
INSERT INTO alarms_templates (
    name, channel, template_type, subject, body, version, is_active, variables, created_by
) VALUES (
    'speed_limit',
    'email',
    'alarm',
    '⚠️ Speed Limit Exceeded: {{speed}} km/h',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #ffc107; color: #000; padding: 20px; text-align: center; }
        .content { background-color: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; }
        .alarm-details { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #ffc107; }
        .speed-warning { font-size: 24px; font-weight: bold; color: #dc3545; text-align: center; margin: 15px 0; }
        .detail-row { margin: 8px 0; }
        .label { font-weight: bold; color: #495057; }
        .map-link { display: inline-block; margin-top: 10px; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚠️ Speed Limit Exceeded</h1>
        </div>
        <div class="content">
            <div class="alarm-details">
                <div class="speed-warning">Speed: {{speed}} km/h</div>
                <div class="detail-row">
                    <span class="label">IMEI:</span> {{imei}}
                </div>
                <div class="detail-row">
                    <span class="label">Time:</span> {{gps_time}}
                </div>
                <div class="detail-row">
                    <span class="label">Location:</span> {{latitude}}, {{longitude}}
                </div>
                <a href="https://www.google.com/maps?q={{latitude}},{{longitude}}" class="map-link" target="_blank">
                    View on Google Maps
                </a>
            </div>
        </div>
    </div>
</body>
</html>',
    1,
    TRUE,
    '{"imei": "Device IMEI number", "speed": "Speed in km/h", "gps_time": "GPS timestamp", "latitude": "Latitude coordinate", "longitude": "Longitude coordinate"}'::jsonb,
    'system'
) ON CONFLICT (name, channel, version) DO NOTHING;

-- SMS Template: Speed Limit Exceeded
INSERT INTO alarms_templates (
    name, channel, template_type, subject, body, version, is_active, variables, created_by
) VALUES (
    'speed_limit',
    'sms',
    'alarm',
    NULL,
    'SPEED ALARM: {{speed}}km/h | IMEI:{{imei}} | {{gps_time}} | https://maps.google.com/?q={{latitude}},{{longitude}}',
    1,
    TRUE,
    '{"imei": "Device IMEI number", "speed": "Speed in km/h", "gps_time": "GPS timestamp", "latitude": "Latitude coordinate", "longitude": "Longitude coordinate"}'::jsonb,
    'system'
) ON CONFLICT (name, channel, version) DO NOTHING;

-- ============================================
-- GEOFENCE ALARM TEMPLATE
-- ============================================

-- Email Template: Geofence Violation
INSERT INTO alarms_templates (
    name, channel, template_type, subject, body, version, is_active, variables, created_by
) VALUES (
    'geofence',
    'email',
    'alarm',
    '🚫 Geofence {{status}}: Zone Boundary Crossed',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #6f42c1; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; }
        .alarm-details { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #6f42c1; }
        .detail-row { margin: 8px 0; }
        .label { font-weight: bold; color: #495057; }
        .map-link { display: inline-block; margin-top: 10px; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚫 Geofence {{status}}</h1>
        </div>
        <div class="content">
            <div class="alarm-details">
                <h2>{{status}}</h2>
                <div class="detail-row">
                    <span class="label">IMEI:</span> {{imei}}
                </div>
                <div class="detail-row">
                    <span class="label">Time:</span> {{gps_time}}
                </div>
                <div class="detail-row">
                    <span class="label">Location:</span> {{latitude}}, {{longitude}}
                </div>
                {{#if distance}}
                <div class="detail-row">
                    <span class="label">Distance from zone:</span> {{distance}} km
                </div>
                {{/if}}
                <a href="https://www.google.com/maps?q={{latitude}},{{longitude}}" class="map-link" target="_blank">
                    View on Google Maps
                </a>
            </div>
        </div>
    </div>
</body>
</html>',
    1,
    TRUE,
    '{"imei": "Device IMEI number", "status": "Enter or Exit", "gps_time": "GPS timestamp", "latitude": "Latitude coordinate", "longitude": "Longitude coordinate", "distance": "Distance from geofence (optional)"}'::jsonb,
    'system'
) ON CONFLICT (name, channel, version) DO NOTHING;

-- SMS Template: Geofence Violation
INSERT INTO alarms_templates (
    name, channel, template_type, subject, body, version, is_active, variables, created_by
) VALUES (
    'geofence',
    'sms',
    'alarm',
    NULL,
    'GEOFENCE {{status}} | IMEI:{{imei}} | {{gps_time}} | {{latitude}},{{longitude}} | https://maps.google.com/?q={{latitude}},{{longitude}}',
    1,
    TRUE,
    '{"imei": "Device IMEI number", "status": "Enter or Exit", "gps_time": "GPS timestamp", "latitude": "Latitude coordinate", "longitude": "Longitude coordinate"}'::jsonb,
    'system'
) ON CONFLICT (name, channel, version) DO NOTHING;

-- ============================================
-- HARSH DRIVING ALARM TEMPLATE
-- ============================================

-- Email Template: Harsh Driving
INSERT INTO alarms_templates (
    name, channel, template_type, subject, body, version, is_active, variables, created_by
) VALUES (
    'harsh',
    'email',
    'alarm',
    '⚡ Harsh Driving Detected: {{status}}',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #fd7e14; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; }
        .alarm-details { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #fd7e14; }
        .detail-row { margin: 8px 0; }
        .label { font-weight: bold; color: #495057; }
        .map-link { display: inline-block; margin-top: 10px; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚡ Harsh Driving Detected</h1>
        </div>
        <div class="content">
            <div class="alarm-details">
                <h2>{{status}}</h2>
                <div class="detail-row">
                    <span class="label">IMEI:</span> {{imei}}
                </div>
                <div class="detail-row">
                    <span class="label">Time:</span> {{gps_time}}
                </div>
                <div class="detail-row">
                    <span class="label">Location:</span> {{latitude}}, {{longitude}}
                </div>
                <div class="detail-row">
                    <span class="label">Speed:</span> {{speed}} km/h
                </div>
                <a href="https://www.google.com/maps?q={{latitude}},{{longitude}}" class="map-link" target="_blank">
                    View on Google Maps
                </a>
            </div>
        </div>
    </div>
</body>
</html>',
    1,
    TRUE,
    '{"imei": "Device IMEI number", "status": "Harsh braking/acceleration/cornering", "gps_time": "GPS timestamp", "latitude": "Latitude coordinate", "longitude": "Longitude coordinate", "speed": "Speed in km/h"}'::jsonb,
    'system'
) ON CONFLICT (name, channel, version) DO NOTHING;

-- SMS Template: Harsh Driving
INSERT INTO alarms_templates (
    name, channel, template_type, subject, body, version, is_active, variables, created_by
) VALUES (
    'harsh',
    'sms',
    'alarm',
    NULL,
    'HARSH DRIVING: {{status}} | IMEI:{{imei}} | {{gps_time}} | {{speed}}km/h | https://maps.google.com/?q={{latitude}},{{longitude}}',
    1,
    TRUE,
    '{"imei": "Device IMEI number", "status": "Harsh braking/acceleration/cornering", "gps_time": "GPS timestamp", "latitude": "Latitude coordinate", "longitude": "Longitude coordinate", "speed": "Speed in km/h"}'::jsonb,
    'system'
) ON CONFLICT (name, channel, version) DO NOTHING;

-- ============================================
-- IMMOBILIZER ALARM TEMPLATE
-- ============================================

-- Email Template: Immobilizer
INSERT INTO alarms_templates (
    name, channel, template_type, subject, body, version, is_active, variables, created_by
) VALUES (
    'immobilizer',
    'email',
    'alarm',
    '🔒 Immobilizer {{status}}: Vehicle Lock State Changed',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #28a745; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; }
        .alarm-details { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #28a745; }
        .detail-row { margin: 8px 0; }
        .label { font-weight: bold; color: #495057; }
        .map-link { display: inline-block; margin-top: 10px; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔒 Immobilizer {{status}}</h1>
        </div>
        <div class="content">
            <div class="alarm-details">
                <h2>Vehicle Immobilizer: {{status}}</h2>
                <div class="detail-row">
                    <span class="label">IMEI:</span> {{imei}}
                </div>
                <div class="detail-row">
                    <span class="label">Time:</span> {{gps_time}}
                </div>
                <div class="detail-row">
                    <span class="label">Location:</span> {{latitude}}, {{longitude}}
                </div>
                <a href="https://www.google.com/maps?q={{latitude}},{{longitude}}" class="map-link" target="_blank">
                    View on Google Maps
                </a>
            </div>
        </div>
    </div>
</body>
</html>',
    1,
    TRUE,
    '{"imei": "Device IMEI number", "status": "Locked or Unlocked", "gps_time": "GPS timestamp", "latitude": "Latitude coordinate", "longitude": "Longitude coordinate"}'::jsonb,
    'system'
) ON CONFLICT (name, channel, version) DO NOTHING;

-- SMS Template: Immobilizer
INSERT INTO alarms_templates (
    name, channel, template_type, subject, body, version, is_active, variables, created_by
) VALUES (
    'immobilizer',
    'sms',
    'alarm',
    NULL,
    'IMMOBILIZER {{status}} | IMEI:{{imei}} | {{gps_time}} | {{latitude}},{{longitude}} | https://maps.google.com/?q={{latitude}},{{longitude}}',
    1,
    TRUE,
    '{"imei": "Device IMEI number", "status": "Locked or Unlocked", "gps_time": "GPS timestamp", "latitude": "Latitude coordinate", "longitude": "Longitude coordinate"}'::jsonb,
    'system'
) ON CONFLICT (name, channel, version) DO NOTHING;

-- ============================================
-- LOW BATTERY ALARM TEMPLATE
-- ============================================

-- Email Template: Low Battery
INSERT INTO alarms_templates (
    name, channel, template_type, subject, body, version, is_active, variables, created_by
) VALUES (
    'battery',
    'email',
    'alarm',
    '🔋 Low Battery Warning: {{status}}',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #e83e8c; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; }
        .alarm-details { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #e83e8c; }
        .detail-row { margin: 8px 0; }
        .label { font-weight: bold; color: #495057; }
        .map-link { display: inline-block; margin-top: 10px; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔋 Low Battery Warning</h1>
        </div>
        <div class="content">
            <div class="alarm-details">
                <h2>{{status}}</h2>
                <div class="detail-row">
                    <span class="label">IMEI:</span> {{imei}}
                </div>
                <div class="detail-row">
                    <span class="label">Time:</span> {{gps_time}}
                </div>
                <div class="detail-row">
                    <span class="label">Location:</span> {{latitude}}, {{longitude}}
                </div>
                <a href="https://www.google.com/maps?q={{latitude}},{{longitude}}" class="map-link" target="_blank">
                    View on Google Maps
                </a>
            </div>
        </div>
    </div>
</body>
</html>',
    1,
    TRUE,
    '{"imei": "Device IMEI number", "status": "Battery status", "gps_time": "GPS timestamp", "latitude": "Latitude coordinate", "longitude": "Longitude coordinate"}'::jsonb,
    'system'
) ON CONFLICT (name, channel, version) DO NOTHING;

-- SMS Template: Low Battery
INSERT INTO alarms_templates (
    name, channel, template_type, subject, body, version, is_active, variables, created_by
) VALUES (
    'battery',
    'sms',
    'alarm',
    NULL,
    'LOW BATTERY: {{status}} | IMEI:{{imei}} | {{gps_time}} | https://maps.google.com/?q={{latitude}},{{longitude}}',
    1,
    TRUE,
    '{"imei": "Device IMEI number", "status": "Battery status", "gps_time": "GPS timestamp", "latitude": "Latitude coordinate", "longitude": "Longitude coordinate"}'::jsonb,
    'system'
) ON CONFLICT (name, channel, version) DO NOTHING;

-- ============================================
-- Feature Flags for Alarm Service
-- ============================================
-- These flags control various alarm service behaviors

INSERT INTO alarms_feature_flags (name, is_enabled, description, updated_by)
VALUES 
    ('rate_limiting_enabled', TRUE, 'Enable rate limiting for SMS and email notifications', 'system'),
    ('channel_fallback_enabled', TRUE, 'Enable fallback to next channel if primary fails', 'system'),
    ('deduplication_enabled', TRUE, 'Enable alarm deduplication within time window', 'system'),
    ('quiet_hours_enabled', TRUE, 'Enable quiet hours filtering for non-critical alarms', 'system'),
    ('priority_routing_enabled', TRUE, 'Enable priority-based alarm routing', 'system'),
    ('webhook_notifications_enabled', FALSE, 'Enable webhook notifications for alarms', 'system'),
    ('sms_mock_mode', TRUE, 'Use mock SMS server instead of real modems', 'system'),
    ('email_mock_mode', TRUE, 'Use MailHog instead of real SMTP server', 'system'),
    ('dlq_auto_reprocess_enabled', TRUE, 'Enable automatic DLQ reprocessing', 'system'),
    ('circuit_breaker_enabled', TRUE, 'Enable circuit breaker for channel failures', 'system')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- Usage Instructions
-- ============================================

-- To run this script:
-- docker exec -i postgres-primary psql -U postgres -d tracking_db < alarm_node/test-alarm.sql

-- To check templates:
-- docker exec postgres-primary psql -U postgres -d tracking_db -c "SELECT name, channel, template_type FROM alarms_templates WHERE is_active = TRUE;"

-- To check feature flags:
-- docker exec postgres-primary psql -U postgres -d tracking_db -c "SELECT name, is_enabled FROM alarms_feature_flags;"
