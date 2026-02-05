-- Seed 39 different clients with one vehicle and one tracker per client (IMEIs from unit_io_mapping.csv + synthetic).
-- All geometry and realistic values are set in Karachi, Pakistan (WGS84) so testing with Karachi trackdata/geofences works.
-- Run (PowerShell): Get-Content database/scripts/seed-dummy-customer-vehicle-tracker-from-unit-io.sql | docker exec -i postgres-primary psql -U postgres -d tracking_db
-- Leaves schema.sql dev data intact (client_id 1: Dev Customer, DEV-001, imei 0, Dev Driver). Uses client_id 1000..1038. Idempotent: ON CONFLICT / WHERE NOT EXISTS where applicable.
--
-- NON_LIVE_TABLE_CATALOG — full list; ✓ = filled here, (schema) = in schema.sql only, (external) = from CSV/other.
-- 1. CUSTOMER HIERARCHY: 1.1 customer ✓  1.2 vehicle ✓  1.3 tracker ✓  1.4 calibration ✓
-- 2. CONFIG: 2.1 client_config ✓  2.2 tracker_config ✓  2.3 system_config (schema)  2.4 client_feature_flags ✓
-- 3. PEOPLE: 3.1 driver ✓  3.2 transporter ✓  3.3 user ✓
-- 4. GEOSPATIAL: 4.1 region ✓  4.2 fence ✓  4.3 route ✓  4.4 road ✓
-- 5. ROUTE MANAGEMENT: 5.1 route_assignment ✓  5.2 fence_trip_config ✓  5.3 upload_sheet ✓
-- 6. SCORING: 6.1 violation_points ✓  6.2 score_weights ✓
-- 7. IO MAPPING: 7.1 unit_io_mapping (external/CSV)  7.2 device_io_mapping (schema or external)
-- 8. ALARM CONFIG: 8.1 camera_alarm_config ✓ (template in schema; per-IMEI here)  8.2 metrics_alarm_config ✓  8.3 alarms_contacts ✓

-- ========== 1. system_config ==========
-- System-wide defaults are in database/schema.sql (NON_LIVE_TABLE_CATALOG). Do not duplicate here.

-- ========== 2. Customers (39 distinct clients: 1000..1038) — schema: customer_name, customer_type, parent_company, client_id, has_parent_company, is_parent_company, relationship_type, billing_mode ==========
INSERT INTO customer (customer_name, client_id, customer_type, has_parent_company, is_parent_company)
SELECT 'Dummy Client ' || n, n, 'Retail', false, false
FROM generate_series(1000, 1038) AS n
ON CONFLICT (customer_name) DO NOTHING;

-- ========== 2b. region (4.1) — Karachi metro (rough bounding polygon: Saddar to Malir, WGS84) ==========
INSERT INTO region (region_name, region_polygon, parent_region_id)
SELECT 'Karachi',
  ST_SetSRID(ST_GeomFromText('POLYGON((66.95 24.80, 67.25 24.80, 67.25 25.05, 66.95 25.05, 66.95 24.80))'), 4326),
  NULL
WHERE NOT EXISTS (SELECT 1 FROM region WHERE region_name = 'Karachi');

-- ========== 2c. transporter (3.2) — schema: transporter_name, corporate_id, vendor_id, region_id, created_at ==========
INSERT INTO transporter (transporter_name, corporate_id, vendor_id, region_id)
SELECT 'Karachi Fleet Transport', NULL, NULL, (SELECT region_id FROM region WHERE region_name = 'Karachi' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM transporter WHERE transporter_name = 'Karachi Fleet Transport');

-- ========== 2d. client_feature_flags (2.4) — one row per client ==========
INSERT INTO client_feature_flags (client_id, feature_temperature_monitoring, feature_fuel_monitoring, feature_driver_scoring, feature_route_tracking, feature_ai_camera)
SELECT c.client_id, true, true, true, true, false
FROM customer c
WHERE c.client_id BETWEEN 1000 AND 1038
ON CONFLICT (client_id) DO NOTHING;

-- ========== 3. client_config (NON_LIVE_TABLE_CATALOG defaults per client) ==========
INSERT INTO client_config (client_id, config_key, config_value)
SELECT c.client_id, k.key, k.val
FROM customer c
CROSS JOIN (VALUES
  ('SPEED_LIMIT_CITY', '60'),
  ('SPEED_LIMIT_HIGHWAY', '100'),
  ('IDLE_THRESHOLD', '180')
) AS k(key, val)
WHERE c.client_id BETWEEN 1000 AND 1038
ON CONFLICT (client_id, config_key) DO NOTHING;

-- ========== 4. vehicle — schema: client_id, registration_number, fuel_capacity, expected_km_per_liter, fuel_price_per_liter, driver_id, transporter_id, region_id, last_service_date, last_service_km, insurance_expiry, manufacture_year, is_active ==========
INSERT INTO vehicle (client_id, registration_number, is_active, transporter_id, region_id, fuel_capacity, expected_km_per_liter, fuel_price_per_liter, last_service_date, last_service_km, insurance_expiry, manufacture_year)
SELECT c.client_id, 'REG-' || c.client_id, true,
  (SELECT transporter_id FROM transporter WHERE transporter_name = 'Karachi Fleet Transport' LIMIT 1),
  (SELECT region_id FROM region WHERE region_name = 'Karachi' LIMIT 1),
  50, 10, 250, (CURRENT_DATE - INTERVAL '90 days')::DATE, 5000, (CURRENT_DATE + INTERVAL '6 months')::DATE, 2022
FROM customer c
WHERE c.client_id BETWEEN 1000 AND 1038
  AND NOT EXISTS (
    SELECT 1 FROM vehicle v
    WHERE v.client_id = c.client_id AND v.registration_number = 'REG-' || c.client_id
  );
UPDATE vehicle SET transporter_id = (SELECT transporter_id FROM transporter WHERE transporter_name = 'Karachi Fleet Transport' LIMIT 1),
  region_id = (SELECT region_id FROM region WHERE region_name = 'Karachi' LIMIT 1)
WHERE client_id BETWEEN 1000 AND 1038;

-- ========== 5. Drivers — schema: driver_name, license_number, license_expiry, hire_date (realistic Karachi) ==========
INSERT INTO driver (driver_name, license_number, license_expiry, hire_date)
SELECT 'Driver ' || n, 'SINDH-' || n || '-2022', (CURRENT_DATE + INTERVAL '1 year')::DATE, (CURRENT_DATE - INTERVAL '2 years')::DATE
FROM generate_series(1000, 1038) AS n
WHERE NOT EXISTS (SELECT 1 FROM driver d WHERE d.license_number = 'SINDH-' || n || '-2022');

-- Link vehicles to drivers by client order (vehicle for client 1000 -> driver LIC-1000, etc.)
DO $$
DECLARE
  drv_ids INT[];
  v_rec RECORD;
  idx INT := 1;
BEGIN
  SELECT array_agg(driver_id ORDER BY license_number)
  INTO drv_ids
  FROM driver
  WHERE license_number LIKE 'SINDH-%' AND license_number >= 'SINDH-1000' AND license_number <= 'SINDH-1038';
  IF drv_ids IS NOT NULL THEN
    FOR v_rec IN (SELECT vehicle_id FROM vehicle WHERE client_id BETWEEN 1000 AND 1038 ORDER BY client_id)
    LOOP
      EXIT WHEN idx > array_length(drv_ids, 1);
      UPDATE vehicle SET driver_id = drv_ids[idx] WHERE vehicle_id = v_rec.vehicle_id;
      idx := idx + 1;
    END LOOP;
  END IF;
END $$;

-- ========== 5b. users (3.3) — schema: user_name, user_role, client_id, created_at ==========
INSERT INTO users (user_name, user_role, client_id)
SELECT 'dummy_user_' || n, 'Viewer', n
FROM generate_series(1000, 1038) AS n
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.user_name = 'dummy_user_' || n AND u.client_id = n);

-- ========== 6. Trackers (39 distinct IMEIs: 19 from unit_io_mapping + 20 synthetic; one per client, linked by client_id order) ==========
DO $$
DECLARE
  imeis BIGINT[] := ARRAY[
    350424064740085, 352094085155775, 352094089400136, 352625695475549, 352625699008304,
    352848023607183, 352848025988086, 352848027112941, 353691841333213, 353691843551457,
    353691843551523, 353976013360098, 354018113247716, 356307042117183, 357454074658418,
    357544373240676, 357544375602980, 359632101788088, 359633106583763,
    999000000000001, 999000000000002, 999000000000003, 999000000000004, 999000000000005,
    999000000000006, 999000000000007, 999000000000008, 999000000000009, 999000000000010,
    999000000000011, 999000000000012, 999000000000013, 999000000000014, 999000000000015,
    999000000000016, 999000000000017, 999000000000018, 999000000000019, 999000000000020
  ];
  v_ids INT[];
  i INT;
BEGIN
  -- Vehicles ordered by client_id so index i = client 1000+i-1
  SELECT array_agg(vehicle_id ORDER BY client_id)
  INTO v_ids
  FROM vehicle
  WHERE client_id BETWEEN 1000 AND 1038;
  FOR i IN 1..least(array_length(imeis, 1), coalesce(array_length(v_ids, 1), 0)) LOOP
    INSERT INTO tracker (imei, vehicle_id, tracker_type, has_fuel_sensor, has_temp_sensor, has_humidity_sensor, has_mdvr, has_seatbelt_sensor)
    VALUES (imeis[i], v_ids[i], 'GPS', true, true, true, false, true)
    ON CONFLICT (imei) DO UPDATE SET
      vehicle_id = EXCLUDED.vehicle_id,
      tracker_type = EXCLUDED.tracker_type,
      has_fuel_sensor = EXCLUDED.has_fuel_sensor,
      has_temp_sensor = EXCLUDED.has_temp_sensor,
      has_humidity_sensor = EXCLUDED.has_humidity_sensor,
      has_mdvr = EXCLUDED.has_mdvr,
      has_seatbelt_sensor = EXCLUDED.has_seatbelt_sensor;
  END LOOP;
END $$;

-- ========== 7. tracker_config (one key per tracker; CONFIG KEYS REFERENCE default) ==========
INSERT INTO tracker_config (imei, config_key, config_value)
SELECT t.imei, 'SPEED_LIMIT_CITY', '60'
FROM tracker t
JOIN vehicle v ON v.vehicle_id = t.vehicle_id
WHERE v.client_id BETWEEN 1000 AND 1038
ON CONFLICT (imei, config_key) DO NOTHING;

-- ========== 8. violation_points (per client; metric_events event_type = violation_type, NON_LIVE_TABLE_CATALOG § 6.1) ==========
INSERT INTO violation_points (client_id, violation_type, points, severity)
SELECT c.client_id, vp.violation_type, vp.points, vp.severity
FROM customer c
CROSS JOIN (VALUES
  ('Overspeed', 5, 'Medium'),
  ('Harsh_Brake', 3, 'Low'),
  ('Harsh_Accel', 3, 'Low'),
  ('Harsh_Corner', 3, 'Low'),
  ('Idle_Violation', 3, 'Low'),
  ('Seatbelt_Violation', 4, 'Medium'),
  ('Fence_Enter', 2, 'Low'),
  ('Fence_Exit', 2, 'Low'),
  ('Continuous_Driving_Violation', 15, 'High'),
  ('Rest_Time_Violation', 10, 'High')
) AS vp(violation_type, points, severity)
WHERE c.client_id BETWEEN 1000 AND 1038
ON CONFLICT (client_id, violation_type) DO NOTHING;

-- ========== 9. score_weights (per client; NON_LIVE_TABLE_CATALOG § 6.2 — Risk + Driver Performance defaults) ==========
INSERT INTO score_weights (client_id, weight_key, weight_value)
SELECT c.client_id, sw.key, sw.val
FROM customer c
CROSS JOIN (VALUES
  ('speed_violation_weight', 0.3),
  ('harsh_driving_weight', 0.2),
  ('seatbelt_weight', 0.2),
  ('idle_weight', 0.1),
  ('fuel_efficiency_weight', 0.1),
  ('ai_violation_weight', 0.1),
  ('safety_weight', 0.4),
  ('efficiency_weight', 0.3),
  ('compliance_weight', 0.3)
) AS sw(key, val)
WHERE c.client_id BETWEEN 1000 AND 1038
ON CONFLICT (client_id, weight_key) DO NOTHING;

-- ========== 10. calibration — 50L tank: raw 0–100% → 0–50 L (Karachi fleet) ==========
INSERT INTO calibration (vehicle_id, raw_value_min, raw_value_max, calibrated_liters, sequence)
SELECT v.vehicle_id, 0, 100, 50, 1
FROM vehicle v
WHERE v.client_id BETWEEN 1000 AND 1038
  AND NOT EXISTS (SELECT 1 FROM calibration c WHERE c.vehicle_id = v.vehicle_id AND c.sequence = 1);

-- ========== 10b. road (4.4) — Shahrah-e-Faisal segment, Karachi (WGS84); speed 80 km/h ==========
INSERT INTO road (road_name, road_type, road_linestring, road_width, speed_limit)
SELECT 'Shahrah-e-Faisal (Karachi)', 'Highway',
  ST_SetSRID(ST_GeomFromText('LINESTRING(67.051 24.860, 67.058 24.868, 67.065 24.876, 67.072 24.884, 67.080 24.892)'), 4326),
  20, 80
WHERE NOT EXISTS (SELECT 1 FROM road WHERE road_name = 'Shahrah-e-Faisal (Karachi)');

-- ========== 11. fence — one geofence per client in Karachi (center 24.8607°N 67.0011°E; ~400m box, spread so no overlap) ==========
DO $$
DECLARE
  c_id INT;
  base_lat DOUBLE PRECISION := 24.8607;
  base_lon DOUBLE PRECISION := 67.0011;
  off_lat DOUBLE PRECISION;
  off_lon DOUBLE PRECISION;
  half DOUBLE PRECISION := 0.002;
  wkt TEXT;
  cx DOUBLE PRECISION;
  cy DOUBLE PRECISION;
BEGIN
  FOR c_id IN SELECT client_id FROM customer WHERE client_id BETWEEN 1000 AND 1038 LOOP
    IF NOT EXISTS (SELECT 1 FROM fence WHERE client_id = c_id AND fence_name = 'Karachi Depot ' || c_id) THEN
      off_lat := (c_id - 1000) * 0.006;
      off_lon := (c_id - 1000) * 0.006;
      cx := base_lat + off_lat;
      cy := base_lon + off_lon;
      wkt := 'LINESTRING(' || (cy - half) || ' ' || (cx - half) || ', ' || (cy + half) || ' ' || (cx - half) || ', ' || (cy + half) || ' ' || (cx + half) || ', ' || (cy - half) || ' ' || (cx + half) || ', ' || (cy - half) || ' ' || (cx - half) || ')';
      INSERT INTO fence (fence_name, client_id, fence_type, polygon, center_point, buffer_distance, restricted_hours)
      VALUES (
        'Karachi Depot ' || c_id,
        c_id,
        'Authorized',
        ST_SetSRID(ST_MakePolygon(ST_GeomFromText(wkt)), 4326),
        ST_SetSRID(ST_MakePoint(cy, cx), 4326),
        50,
        NULL
      );
    END IF;
  END LOOP;
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'PostGIS not available or fence.polygon type differs; skipping fence inserts.';
END $$;

-- ========== 12. route (4.3) — Karachi: Saddar–Airport corridor (~12 km, ~25 min); polyline WGS84 ==========
INSERT INTO route (route_name, client_id, polyline, waypoints, distance_km, eta_seconds)
SELECT 'Karachi Route ' || c.client_id, c.client_id,
  ST_SetSRID(ST_GeomFromText('LINESTRING(67.028 24.848, 67.038 24.855, 67.048 24.862, 67.058 24.868, 67.068 24.875, 67.078 24.882, 67.088 24.890)'), 4326),
  '[{"sequence":1,"name":"Saddar","latitude":24.848,"longitude":67.028,"radius":300},{"sequence":2,"name":"Airport","latitude":24.890,"longitude":67.088,"radius":500}]'::JSONB,
  12.0, 1500
FROM customer c
WHERE c.client_id BETWEEN 1000 AND 1038
  AND NOT EXISTS (SELECT 1 FROM route r WHERE r.client_id = c.client_id AND r.route_name = 'Karachi Route ' || c.client_id);

-- ========== 13. route_assignment (5.1) — schema: client_id, route_id, vehicle_id, is_active, created_at ==========
INSERT INTO route_assignment (client_id, route_id, vehicle_id, is_active)
SELECT v.client_id, r.route_id, v.vehicle_id, true
FROM vehicle v
JOIN route r ON r.client_id = v.client_id AND r.route_name = 'Karachi Route ' || v.client_id
WHERE v.client_id BETWEEN 1000 AND 1038
  AND NOT EXISTS (SELECT 1 FROM route_assignment ra WHERE ra.vehicle_id = v.vehicle_id AND ra.route_id = r.route_id);

-- ========== 14. fence_trip_config (5.2) — Karachi depot round trip: 25 min, 8 km ==========
INSERT INTO fence_trip_config (config_name, client_id, origin_fence_id, destination_fence_id, expected_duration_min, expected_distance_km, is_active)
SELECT 'Karachi Depot Round ' || c.client_id, c.client_id, f.fence_id, f.fence_id, 25, 8, true
FROM customer c
JOIN fence f ON f.client_id = c.client_id AND f.fence_name = 'Karachi Depot ' || c.client_id
WHERE c.client_id BETWEEN 1000 AND 1038
  AND NOT EXISTS (SELECT 1 FROM fence_trip_config ftc WHERE ftc.client_id = c.client_id AND ftc.config_name = 'Karachi Depot Round ' || c.client_id);

-- ========== 15. upload_sheet (5.3) — Karachi round trip: 08:00 start, 25 min, 8 km ==========
INSERT INTO upload_sheet (client_id, vehicle_id, vehicle_number, driver_name, helper_name, start_date, start_time, destination_fence_id, expected_duration_min, expected_mileage_km, project_id, remarks, created_by)
SELECT v.client_id, v.vehicle_id, v.registration_number, d.driver_name, NULL, CURRENT_DATE, '08:00'::TIME, f.fence_id, 25, 8, 'KHI-001', 'Karachi depot run', NULL
FROM vehicle v
JOIN driver d ON d.driver_id = v.driver_id
JOIN fence f ON f.client_id = v.client_id AND f.fence_name = 'Karachi Depot ' || v.client_id
WHERE v.client_id BETWEEN 1000 AND 1038
  AND NOT EXISTS (SELECT 1 FROM upload_sheet us WHERE us.vehicle_id = v.vehicle_id);

-- ========== 16. camera_alarm_config (8.1) — schema: imei, event_type, is_sms, is_email, is_call, priority, start_time, end_time, enabled, created_at, updated_at ==========
INSERT INTO camera_alarm_config (imei, event_type, is_sms, is_email, is_call, priority, start_time, end_time, enabled)
SELECT t.imei, ev.event_type, 1, 0, 0, 5, '00:00:00'::TIME, '23:59:59'::TIME, true
FROM tracker t
JOIN vehicle v ON v.vehicle_id = t.vehicle_id
CROSS JOIN (VALUES ('Overspeeding'), ('Distraction'), ('Smoking'), ('PhoneCalling'), ('Fatigue'), ('SeatBelt'), ('Forward Collision'), ('Backward Collision'), ('Lost Face'), ('Eyes Close')) AS ev(event_type)
WHERE v.client_id BETWEEN 1000 AND 1038
ON CONFLICT (imei, event_type) DO NOTHING;

-- ========== 17. metrics_alarm_config (8.2) — schema: imei, event_type, is_alarm, is_sms, is_email, is_call, priority, start_time, end_time, enabled ==========
INSERT INTO metrics_alarm_config (imei, event_type, is_alarm, is_sms, is_email, is_call, priority, start_time, end_time, enabled)
SELECT t.imei, ev.event_type, 1, 0, 0, 0, 5, '00:00:00'::TIME, '23:59:59'::TIME, true
FROM tracker t
JOIN vehicle v ON v.vehicle_id = t.vehicle_id
CROSS JOIN (VALUES ('Overspeed'), ('Idle_Violation'), ('Seatbelt_Violation'), ('Harsh_Brake'), ('Harsh_Accel'), ('Harsh_Corner'), ('Fence_Enter'), ('Fence_Exit'), ('Continuous_Driving_Violation'), ('Rest_Time_Violation')) AS ev(event_type)
WHERE v.client_id BETWEEN 1000 AND 1038
  AND NOT EXISTS (SELECT 1 FROM metrics_alarm_config mac WHERE mac.imei = t.imei AND mac.event_type = ev.event_type);

-- ========== 18. alarms_contacts (8.3) — schema: imei, contact_name, email, phone, contact_type, priority, active, notes, quiet_hours_start, quiet_hours_end, timezone, bounce_count, last_bounce_at (valid_contact: email OR phone NOT NULL) ==========
INSERT INTO alarms_contacts (imei, contact_name, email, phone, contact_type, priority, active, notes)
SELECT t.imei, 'Dummy Contact ' || t.imei, 'dummy-' || t.imei || '@example.com', NULL, 'primary', 1, true, NULL
FROM tracker t
JOIN vehicle v ON v.vehicle_id = t.vehicle_id
WHERE v.client_id BETWEEN 1000 AND 1038
  AND NOT EXISTS (SELECT 1 FROM alarms_contacts ac WHERE ac.imei = t.imei);
