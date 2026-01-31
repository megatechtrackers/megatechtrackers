"""
Migration Script: SQL Server (old system) -> PostgreSQL (new system)
Migrates ALL data from the old normalized/cfg_ tables to the new simplified schema
with progress indicators and batch processing

USAGE:
    # Option 1: Connect to Docker postgres-primary (default after Docker setup)
    python migrate.py
    
    # Option 2: Set environment variables for custom connection
    set POSTGRES_HOST=localhost
    set POSTGRES_PORT=5432
    set POSTGRES_DB=tracking_db
    python migrate.py
    
    # Option 3: Skip schema recreation (tables already exist from database/schema.sql)
    python migrate.py --skip-schema

NOTE: Run this AFTER starting Docker services:
    docker compose up -d postgres-primary
    # Wait for PostgreSQL to be ready, then run:
    python ops_node/migration/migrate.py --skip-schema
"""
import pyodbc
import psycopg2
from psycopg2.extras import execute_values
import json
from datetime import datetime
import time
import sys
import os
import argparse

# Fix Unicode output on Windows
sys.stdout.reconfigure(encoding='utf-8')

try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False
    print("Warning: tqdm not installed. Install with: pip install tqdm")
    print("Progress bars will be disabled.\n")

# Configuration - can be overridden by environment variables
SQLSERVER_CONN = os.environ.get(
    'SQLSERVER_CONN',
    "DRIVER={ODBC Driver 17 for SQL Server};SERVER=ALIPC;DATABASE=WEBRPTInternal;Trusted_Connection=yes"
)

# PostgreSQL connection - default to Docker's postgres-primary on port 5432
# The Docker network maps postgres-primary to localhost:5432 (or use 15432 if standalone ops_node)
POSTGRES_HOST = os.environ.get('POSTGRES_HOST', 'localhost')
POSTGRES_PORT = os.environ.get('POSTGRES_PORT', '5432')
POSTGRES_DB = os.environ.get('POSTGRES_DB', 'tracking_db')  # Changed from ops_node to tracking_db
POSTGRES_USER = os.environ.get('POSTGRES_USER', 'postgres')
POSTGRES_PASSWORD = os.environ.get('POSTGRES_PASSWORD', 'postgres')
POSTGRES_CONN = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"

# Batch size for bulk inserts - larger = faster
BATCH_SIZE = 100000

def get_sqlserver_connection():
    """Get SQL Server connection"""
    return pyodbc.connect(SQLSERVER_CONN)

def get_postgres_connection():
    """Get PostgreSQL connection"""
    return psycopg2.connect(POSTGRES_CONN)

def verify_postgres_schema(pg_conn):
    """Verify that required tables exist (created by database/schema.sql via Docker)"""
    print("\n" + "=" * 70)
    print("STEP 0: Verifying PostgreSQL Schema")
    print("=" * 70)
    
    pg_cursor = pg_conn.cursor()
    
    # Check for required tables
    pg_cursor.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('device_config', 'unit', 'unit_config', 'command_history', 'command_outbox', 'command_sent', 'command_inbox')
        ORDER BY table_name
    """)
    existing_tables = [row[0] for row in pg_cursor.fetchall()]
    required_tables = ['device_config', 'unit', 'unit_config']
    optional_tables = ['command_history', 'command_outbox', 'command_sent', 'command_inbox']
    
    missing_required = [t for t in required_tables if t not in existing_tables]
    
    if missing_required:
        print(f"\n    ❌ ERROR: Missing required tables: {', '.join(missing_required)}")
        print(f"    Existing tables: {', '.join(existing_tables) if existing_tables else 'none'}")
        print("\n    Please ensure Docker services are running:")
        print("      docker compose up -d postgres-primary")
        print("    And wait for the database to initialize (check with):")
        print("      docker exec postgres-primary psql -U postgres -d tracking_db -c '\\dt'")
        raise Exception(f"Schema verification failed - missing tables: {', '.join(missing_required)}")
    
    print(f"    ✓ Required tables found: {', '.join(sorted([t for t in existing_tables if t in required_tables]))}")
    
    # Check optional tables
    found_optional = [t for t in optional_tables if t in existing_tables]
    if found_optional:
        print(f"    ✓ Optional tables found: {', '.join(sorted(found_optional))}")
    
    return existing_tables


def recreate_postgres_schema(pg_conn):
    """Drop and recreate PostgreSQL tables from schema file
    
    NOTE: This is typically NOT needed when running after Docker setup,
    since database/schema.sql creates all tables automatically.
    Use --skip-schema flag to skip this step.
    """
    import os
    import re
    from pathlib import Path
    
    print("\n" + "=" * 70)
    print("STEP 0: Recreating PostgreSQL Schema (STANDALONE MODE)")
    print("=" * 70)
    print("  WARNING: This drops and recreates tables!")
    print("  If running with Docker, use --skip-schema instead.")
    
    print("  Dropping and recreating tables...")
    
    # Use autocommit mode for schema creation to avoid transaction abort issues
    pg_conn.autocommit = True
    pg_cursor = pg_conn.cursor()
    
    # Define all schema statements directly (no file parsing needed)
    schema_statements = [
        # Drop tables in reverse dependency order
        "DROP TABLE IF EXISTS command_history CASCADE",
        "DROP TABLE IF EXISTS command_inbox CASCADE",
        "DROP TABLE IF EXISTS command_sent CASCADE",
        "DROP TABLE IF EXISTS command_outbox CASCADE",
        "DROP TABLE IF EXISTS unit_config CASCADE",
        "DROP TABLE IF EXISTS unit CASCADE",
        "DROP TABLE IF EXISTS device_config CASCADE",
        
        # Create tables - matches original CommandConfigApi structure
        """CREATE TABLE device_config (
    id SERIAL PRIMARY KEY,
    device_name VARCHAR(100) NOT NULL,
    config_type VARCHAR(20) NOT NULL,
    category_type_desc VARCHAR(50),
    category VARCHAR(100),
    profile VARCHAR(10),
    command_name VARCHAR(200) NOT NULL,
    description TEXT,
    command_seprator VARCHAR(50),
    command_syntax VARCHAR(500),
    command_type VARCHAR(10),
    command_parameters_json JSONB,
    parameters_json JSONB,
    command_id INT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
)""",
        
        """CREATE TABLE unit (
    id SERIAL PRIMARY KEY,
    mega_id VARCHAR(50),
    imei VARCHAR(50) NOT NULL UNIQUE,
    ffid VARCHAR(50),
    sim_no VARCHAR(50),
    device_name VARCHAR(100) NOT NULL,
    modem_id INTEGER,
    created_date TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
)""",
        
        """CREATE TABLE unit_config (
    id SERIAL PRIMARY KEY,
    mega_id VARCHAR(50) NOT NULL,
    device_name VARCHAR(100) NOT NULL,
    command_id INT NOT NULL,
    value TEXT NOT NULL,
    modified_by VARCHAR(100),
    modified_date TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uq_unit_config UNIQUE(mega_id, device_name, command_id)
)""",
        
        """CREATE TABLE command_outbox (
    id SERIAL PRIMARY KEY,
    imei VARCHAR(50) NOT NULL,
    sim_no VARCHAR(50) NOT NULL,
    command_text TEXT NOT NULL,
    config_id INT REFERENCES device_config(id),
    user_id VARCHAR(100),
    send_method VARCHAR(10) DEFAULT 'sms',
    retry_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
)""",

        """CREATE TABLE command_sent (
    id SERIAL PRIMARY KEY,
    imei VARCHAR(50) NOT NULL,
    sim_no VARCHAR(50) NOT NULL,
    command_text TEXT NOT NULL,
    config_id INT REFERENCES device_config(id),
    user_id VARCHAR(100),
    send_method VARCHAR(10) DEFAULT 'sms',
    status VARCHAR(20) DEFAULT 'sent',
    error_message TEXT,
    response_text TEXT,
    created_at TIMESTAMP,
    sent_at TIMESTAMP DEFAULT NOW()
)""",

        """CREATE TABLE command_inbox (
    id SERIAL PRIMARY KEY,
    sim_no VARCHAR(50) NOT NULL,
    imei VARCHAR(50),
    message_text TEXT NOT NULL,
    received_at TIMESTAMP DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE
)""",
        
        """CREATE TABLE command_history (
    id SERIAL PRIMARY KEY,
    imei VARCHAR(50),
    sim_no VARCHAR(50),
    direction VARCHAR(10) NOT NULL,
    command_text TEXT NOT NULL,
    config_id INT REFERENCES device_config(id),
    status VARCHAR(20),
    send_method VARCHAR(10),
    user_id VARCHAR(100),
    created_at TIMESTAMP,
    sent_at TIMESTAMP,
    archived_at TIMESTAMP DEFAULT NOW()
)""",
        
        # Create indexes
        "CREATE INDEX idx_device_config_lookup ON device_config(device_name, config_type, COALESCE(category, ''))",
        "CREATE INDEX idx_device_config_device ON device_config(device_name)",
        "CREATE INDEX idx_device_config_type ON device_config(config_type)",
        "CREATE INDEX idx_device_config_category ON device_config(device_name, category)",
        "CREATE INDEX idx_device_config_command_id ON device_config(command_id)",
        "CREATE INDEX idx_unit_device ON unit(device_name)",
        "CREATE INDEX idx_unit_sim ON unit(sim_no)",
        "CREATE INDEX idx_unit_mega_id ON unit(mega_id)",
        "CREATE INDEX idx_unit_config_mega_id ON unit_config(mega_id)",
        "CREATE INDEX idx_unit_config_device_command ON unit_config(device_name, command_id)",
        "CREATE INDEX idx_outbox_created ON command_outbox(created_at)",
        "CREATE INDEX idx_outbox_imei ON command_outbox(imei)",
        "CREATE INDEX idx_outbox_send_method ON command_outbox(send_method)",
        "CREATE INDEX idx_sent_status ON command_sent(status)",
        "CREATE INDEX idx_sent_imei ON command_sent(imei)",
        "CREATE INDEX idx_sent_sim_no ON command_sent(sim_no)",
        "CREATE INDEX idx_sent_created ON command_sent(sent_at DESC)",
        "CREATE INDEX idx_sent_send_method ON command_sent(send_method)",
        "CREATE INDEX idx_inbox_sim ON command_inbox(sim_no)",
        "CREATE INDEX idx_inbox_received ON command_inbox(received_at DESC)",
        "CREATE INDEX idx_inbox_processed ON command_inbox(processed)",
        "CREATE INDEX idx_history_imei ON command_history(imei)",
        "CREATE INDEX idx_history_imei_date ON command_history(imei, created_at DESC)",
        "CREATE INDEX idx_history_direction ON command_history(direction)",
        "CREATE INDEX idx_history_created ON command_history(created_at DESC)",
        "CREATE INDEX idx_history_archived ON command_history(archived_at)",
        
        # Create functions
        """CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql""",

        """CREATE OR REPLACE FUNCTION cleanup_old_command_history(days_to_keep INT DEFAULT 90)
RETURNS INT AS $$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM command_history
    WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql""",

        """CREATE OR REPLACE FUNCTION cleanup_old_history(days_to_keep INT DEFAULT 90)
RETURNS INT AS $$
BEGIN
    RETURN cleanup_old_command_history(days_to_keep);
END;
$$ LANGUAGE plpgsql""",
        
        # Create triggers
        "CREATE TRIGGER trg_device_config_updated BEFORE UPDATE ON device_config FOR EACH ROW EXECUTE FUNCTION update_updated_at()",
        "CREATE TRIGGER trg_unit_updated BEFORE UPDATE ON unit FOR EACH ROW EXECUTE FUNCTION update_updated_at()",
        "CREATE TRIGGER trg_unit_config_updated BEFORE UPDATE ON unit_config FOR EACH ROW EXECUTE FUNCTION update_updated_at()",
        
        # Grant permissions on command system tables to all users
        # This ensures parser services and other services can access these tables
        "GRANT ALL ON device_config TO PUBLIC",
        "GRANT ALL ON unit TO PUBLIC",
        "GRANT ALL ON unit_config TO PUBLIC",
        "GRANT ALL ON command_outbox TO PUBLIC",
        "GRANT ALL ON command_sent TO PUBLIC",
        "GRANT ALL ON command_inbox TO PUBLIC",
        "GRANT ALL ON command_history TO PUBLIC",
        "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO PUBLIC",
    ]
    
    # Execute each statement
    success_count = 0
    error_count = 0
    failed_statements = []
    
    for i, statement in enumerate(schema_statements, 1):
        try:
            pg_cursor.execute(statement)
            success_count += 1
            if i <= 5 or i % 10 == 0 or i == len(schema_statements):
                print(f"    Executed {i}/{len(schema_statements)} statements...", end='\r')
        except Exception as e:
            error_msg = str(e).lower()
            is_drop = 'DROP' in statement.upper()
            is_create = 'CREATE' in statement.upper()
            
            if is_drop and 'does not exist' in error_msg:
                # Expected error for DROP IF EXISTS
                success_count += 1
            elif 'already exists' in error_msg:
                # Expected for CREATE IF NOT EXISTS or duplicate indexes
                success_count += 1
            else:
                error_count += 1
                stmt_preview = statement[:150].replace('\n', ' ').strip()
                if error_count <= 10 or is_create:
                    print(f"\n    ⚠️  Error in statement {i}: {e}")
                    if is_create:
                        print(f"        ⚠️  CRITICAL: CREATE statement failed!")
                    print(f"        Statement: {stmt_preview}...")
                failed_statements.append((i, str(e), stmt_preview))
    
    # Restore normal transaction mode
    pg_conn.autocommit = False
    
    print(f"\n    ✓ Executed {success_count}/{len(schema_statements)} statements successfully")
    
    # Verify that essential tables were created
    # Make sure we're in a clean transaction state
    try:
        pg_conn.rollback()
    except:
        pass
    
    try:
        pg_cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('device_config', 'unit', 'unit_config', 'command_history', 'command_outbox')
            ORDER BY table_name
        """)
    except Exception as e:
        # If verification query fails due to transaction abort, rollback and retry
        pg_conn.rollback()
        pg_cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('device_config', 'unit', 'unit_config', 'command_history', 'command_outbox')
            ORDER BY table_name
        """)
    existing_tables = [row[0] for row in pg_cursor.fetchall()]
    expected_tables = ['command_history', 'command_outbox', 'device_config', 'unit', 'unit_config']
    missing_tables = [t for t in expected_tables if t not in existing_tables]
    
    if missing_tables:
        print(f"\n    ❌ ERROR: Missing tables: {', '.join(missing_tables)}")
        print(f"    Existing tables: {', '.join(existing_tables) if existing_tables else 'none'}")
        if failed_statements:
            print(f"\n    Failed statements:")
            for stmt_num, error, stmt_preview in failed_statements[:5]:
                print(f"      Statement {stmt_num}: {error}")
                print(f"        {stmt_preview}...")
        raise Exception(f"Schema recreation incomplete - missing tables: {', '.join(missing_tables)}")
    
    print("\n    ✓ Schema recreation completed successfully!")
    print(f"    ✓ Created tables: {', '.join(sorted(existing_tables))}")

def print_progress(message, current=None, total=None):
    """Print progress message"""
    if current is not None and total is not None:
        percent = (current / total) * 100 if total > 0 else 0
        print(f"\r  {message}: {current:,}/{total:,} ({percent:.1f}%)", end='', flush=True)
    else:
        print(f"  {message}")

def migrate_device_configs(sql_conn, pg_conn):
    """Migrate device configurations with progress"""
    print("\n" + "=" * 70)
    print("STEP 1: Migrating Device Configurations")
    print("=" * 70)
    
    start_time = time.time()
    cursor = sql_conn.cursor()
    
    # First, get total count - NO FILTERS (migrate all)
    cursor.execute("SELECT COUNT(*) FROM cfg_DeviceConfig")
    total_count = cursor.fetchone()[0]
    print(f"\nFound {total_count:,} device configurations to migrate (ALL rows, no filters)")
    
    # Query cfg_DeviceConfig - match final structure from migrate_sql_server_to_cfg.sql
    cursor.execute("""
        SELECT 
            ID,
            DeviceName,
            ConfigType,
            CategoryTypeDesc,
            Category,
            Profile,
            CommandName,
            Description,
            CommandSeprator,
            CommandSyntax,
            CommandType,
            CommandParametersJSON,
            ParametersJSON,
            CommandID
        FROM cfg_DeviceConfig
        ORDER BY DeviceName, CategoryTypeDesc, Category, Profile, CommandName
    """)
    
    rows = cursor.fetchall()
    
    pg_cursor = pg_conn.cursor()
    
    # Clear existing command system data (NOT alarm system tables!)
    print("\nClearing existing command system data...")
    print("  Note: Only clearing device_config, unit, unit_config, command_* tables")
    print("  Alarm system tables (alarms_*, trackdata, etc.) are NOT touched")
    
    # Check which tables exist before trying to truncate
    pg_cursor.execute("""
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('device_config', 'unit', 'unit_config', 'command_outbox', 'command_sent', 'command_inbox', 'command_history')
    """)
    existing_tables = [row[0] for row in pg_cursor.fetchall()]
    
    # Truncate in dependency order (children first)
    tables_to_truncate = [
        'unit_config',
        'command_outbox', 
        'command_sent',
        'command_inbox',
        'command_history',
        'unit',
        'device_config'
    ]
    
    for table in tables_to_truncate:
        if table in existing_tables:
            try:
                pg_cursor.execute(f"TRUNCATE TABLE {table} CASCADE")
                print(f"    ✓ Truncated {table}")
            except Exception as e:
                print(f"    ⚠ Could not truncate {table}: {e}")
                pg_conn.rollback()
    
    # Reset sequences if they exist
    sequences = [
        'device_config_id_seq',
        'unit_id_seq', 
        'unit_config_id_seq',
        'command_outbox_id_seq',
        'command_sent_id_seq',
        'command_inbox_id_seq',
        'command_history_id_seq'
    ]
    
    for seq in sequences:
        try:
            pg_cursor.execute(f"ALTER SEQUENCE IF EXISTS {seq} RESTART WITH 1")
        except Exception as e:
            pass  # Sequence may not exist
    
    pg_conn.commit()
    print("  ✓ Command system data cleared")
    
    # Insert into PostgreSQL - match final structure from migrate_sql_server_to_cfg.sql
    insert_sql = """
        INSERT INTO device_config 
        (device_name, config_type, category_type_desc, category, profile, command_name, description,
         command_seprator, command_syntax, command_type, command_parameters_json, parameters_json, command_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
    """
    
    config_id_map = {}  # old_config_id -> new_id
    
    # Use tqdm if available, otherwise simple progress
    if HAS_TQDM:
        iterator = tqdm(rows, desc="  Migrating configs", unit="config", ncols=100)
    else:
        iterator = rows
    
    processed = 0
    errors = 0
    
    for row in iterator:
        old_config_id, device_name, config_type, category_type_desc, category, profile, \
        command_name, description, command_seprator, command_syntax, command_type, \
        command_parameters_json, parameters_json, command_id = row
        
        try:
            pg_cursor.execute(insert_sql, (
                device_name,
                config_type,
                category_type_desc if category_type_desc else None,
                category if category else None,
                profile if profile else None,
                command_name,
                description if description else None,
                command_seprator if command_seprator else None,
                command_syntax if command_syntax else None,
                command_type if command_type else None,
                command_parameters_json if command_parameters_json else None,
                parameters_json if parameters_json else None,
                int(command_id) if command_id else None
            ))
            result = pg_cursor.fetchone()
            if result:
                new_id = result[0]
            else:
                errors += 1
                if errors <= 3:
                    print(f"\n  Warning: Could not get ID for config {command_name}")
                continue
            
            config_id_map[old_config_id] = new_id
            processed += 1
            
            # Commit every 1000 records instead of 100 for better performance
            if processed % 1000 == 0:
                pg_conn.commit()
            
        except Exception as e:
            errors += 1
            # If transaction is aborted, rollback and continue
            if "current transaction is aborted" in str(e):
                pg_conn.rollback()
                continue
            
            # Print first few errors for debugging
            if errors <= 5:
                print(f"\n  Error inserting config {command_name}: {e}")
                import traceback
                if errors == 1:  # Full traceback for first error
                    traceback.print_exc()
            
            # Rollback on unique constraint violation to continue
            if "unique constraint" in str(e).lower() or "duplicate key" in str(e).lower():
                pg_conn.rollback()
                continue
    
    # Final commit
    pg_conn.commit()
    elapsed = time.time() - start_time

    # Recreate lookup index
    try:
        pg_cursor.execute("DROP INDEX IF EXISTS idx_device_config_lookup")
        pg_conn.commit()
    except:
        pass
    
    pg_cursor.execute("""
        CREATE INDEX idx_device_config_lookup
        ON device_config(device_name, config_type, COALESCE(category, ''))
    """)
    pg_conn.commit()
    
    if HAS_TQDM:
        print()  # New line after progress bar
    
    print(f"\n✓ Migrated {processed:,} device configs in {elapsed:.2f}s")
    if errors > 0:
        print(f"  ⚠ {errors} errors encountered")
    
    return config_id_map

def migrate_units(sql_conn, pg_conn):
    """Migrate units with progress"""
    print("\n" + "=" * 70)
    print("STEP 2: Migrating Units")
    print("=" * 70)
    
    start_time = time.time()
    cursor = sql_conn.cursor()
    
    # Get total count - NO FILTERS (migrate all)
    cursor.execute("SELECT COUNT(*) FROM cfg_Unit")
    total_count = cursor.fetchone()[0]
    print(f"\nFound {total_count:,} units to migrate")
    
    cursor.execute("""
        SELECT 
            ID,
            IMEI,
            MegaID,
            FFID,
            SimNo,
            DeviceName,
            ModemID,
            CreatedDate
        FROM cfg_Unit
        ORDER BY ID
    """)
    
    rows = cursor.fetchall()
    
    pg_cursor = pg_conn.cursor()
    
    # Keep original ID from SQL Server for referential integrity
    insert_sql = """
        INSERT INTO unit (id, imei, device_name, sim_no, mega_id, ffid, modem_id, created_date)
        VALUES %s
        ON CONFLICT (id) DO UPDATE
        SET imei = EXCLUDED.imei,
            device_name = EXCLUDED.device_name,
            sim_no = EXCLUDED.sim_no,
            mega_id = EXCLUDED.mega_id,
            ffid = EXCLUDED.ffid,
            modem_id = EXCLUDED.modem_id,
            created_date = EXCLUDED.created_date
    """
    
    # Batch insert for better performance
    batch = []
    processed = 0
    errors = 0
    truncated_imeis = 0
    seen_imeis = set()  # Track for duplicate detection after truncation
    
    if HAS_TQDM:
        iterator = tqdm(rows, desc="  Migrating units", unit="unit", ncols=100)
    else:
        iterator = rows
    
    for row in iterator:
        id, imei, mega_id, ffid, sim_no, device_name, modem_id, created_date = row
        
        original_imei = str(imei) if imei else None
        
        # Truncate values to fit schema constraints
        imei = original_imei[:50] if original_imei else None  # VARCHAR(50)
        sim_no = str(sim_no)[:50] if sim_no else None  # VARCHAR(50)
        device_name = str(device_name)[:100] if device_name else 'Unknown'  # VARCHAR(100), default to 'Unknown'
        mega_id = str(mega_id)[:50] if mega_id else None  # VARCHAR(50)
        ffid = str(ffid)[:50] if ffid else None  # VARCHAR(50)
        modem_id = int(modem_id) if modem_id else None
        
        # Track truncation
        if original_imei and len(original_imei) > 50:
            truncated_imeis += 1
            if truncated_imeis <= 5:
                print(f"\n  Warning: IMEI truncated from {len(original_imei)} to 50 chars: {original_imei[:55]}...")
        
        # NO IMEI FILTERING - migrate all rows
        # Only check for duplicates after truncation (data integrity)
        if imei and imei in seen_imeis:
            errors += 1
            if errors <= 10:
                print(f"\n  Warning: Duplicate IMEI after truncation: {imei}")
            continue
        if imei:
            seen_imeis.add(imei)
        
        # Keep original ID from SQL Server
        batch.append((
            id, imei, device_name, sim_no, mega_id, ffid, modem_id, created_date if created_date else None
        ))
        
        if len(batch) >= BATCH_SIZE:
            try:
                execute_values(pg_cursor, insert_sql, batch, page_size=BATCH_SIZE)
                pg_conn.commit()  # Commit after each batch
                processed += len(batch)
                batch = []
            except Exception as e:
                # Try inserting individually to find problematic records
                pg_conn.rollback()
                for item in batch:
                    try:
                        single_insert = """
                            INSERT INTO unit (imei, device_name, sim_no, mega_id, ffid, modem_id)
                            VALUES (%s, %s, %s, %s, %s, %s)
                            ON CONFLICT (imei) DO UPDATE
                            SET device_name = EXCLUDED.device_name,
                                sim_no = EXCLUDED.sim_no,
                                mega_id = EXCLUDED.mega_id,
                                ffid = EXCLUDED.ffid,
                                modem_id = EXCLUDED.modem_id
                        """
                        pg_cursor.execute(single_insert, item[1:7])  # Skip id, get imei through modem_id
                        processed += 1
                    except Exception as e2:
                        errors += 1
                        if errors <= 10:
                            print(f"\n  Error inserting unit {item[0]}: {e2}")
                        # Continue with next item even if this one fails
                pg_conn.commit()
                batch = []
    
    # Insert remaining
    if batch:
        try:
            execute_values(pg_cursor, insert_sql, batch, page_size=len(batch))
            pg_conn.commit()
            processed += len(batch)
        except Exception as e:
            pg_conn.rollback()
            # Try individually
            for item in batch:
                try:
                    single_insert = """
                        INSERT INTO unit (id, imei, device_name, sim_no, mega_id, ffid, modem_id, created_date)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (id) DO UPDATE
                        SET imei = EXCLUDED.imei,
                            device_name = EXCLUDED.device_name,
                            sim_no = EXCLUDED.sim_no,
                            mega_id = EXCLUDED.mega_id,
                            ffid = EXCLUDED.ffid,
                            modem_id = EXCLUDED.modem_id,
                            created_date = EXCLUDED.created_date
                    """
                    pg_cursor.execute(single_insert, item)
                    processed += 1
                except Exception as e2:
                    errors += 1
                    if errors <= 10:
                        print(f"\n  Error inserting unit {item[0]}: {e2}")
                    # Continue with next item even if this one fails
            pg_conn.commit()
    
    elapsed = time.time() - start_time
    
    # Update sequence to match highest ID (so next auto-generated ID continues from there)
    if processed > 0:
        pg_cursor.execute("SELECT MAX(id) FROM unit")
        max_id_result = pg_cursor.fetchone()
        if max_id_result and max_id_result[0]:
            max_id = max_id_result[0]
            pg_cursor.execute(f"SELECT setval('unit_id_seq', {max_id})")
            pg_conn.commit()
    
    if HAS_TQDM:
        print()  # New line after progress bar
    
    print(f"\n✓ Migrated {processed:,} units in {elapsed:.2f}s")
    if truncated_imeis > 0:
        print(f"  ⚠ {truncated_imeis:,} IMEIs were truncated to fit VARCHAR(20) constraint")
    if errors > 0:
        print(f"  ⚠ {errors} errors encountered")

def migrate_unit_configs(sql_conn, pg_conn, config_id_map):
    """Migrate Unit Configs with progress - deduplicates in Python first"""
    print("\n" + "=" * 70)
    print("STEP 3: Migrating Unit Configs")
    print("=" * 70)
    
    start_time = time.time()
    cursor = sql_conn.cursor()
    
    # Get total count - NO FILTERS (migrate all)
    cursor.execute("SELECT COUNT(*) FROM cfg_UnitConfig")
    total_count = cursor.fetchone()[0]
    print(f"\nFound {total_count:,} Unit Configs to migrate")
    
    # Get Unit Configs - use MegaID and DeviceName instead of FK_UnitID
    cursor.execute("""
        SELECT 
            uv.MegaID,
            uv.DeviceName,
            uv.CommandID,
            uv.Value,
            uv.ModifiedBy,
            uv.ModifiedDate
        FROM cfg_UnitConfig uv
        ORDER BY uv.MegaID, uv.DeviceName, uv.CommandID
    """)
    
    rows = cursor.fetchall()
    
    pg_cursor = pg_conn.cursor()
    
    # Direct insert - use MegaID and DeviceName instead of unit_id
    insert_sql = """
        INSERT INTO unit_config (mega_id, device_name, command_id, value, modified_by, modified_date)
        VALUES %s
        ON CONFLICT (mega_id, device_name, command_id) DO UPDATE
        SET value = EXCLUDED.value,
            modified_by = EXCLUDED.modified_by,
            modified_date = EXCLUDED.modified_date
    """
    
    print(f"\n  Inserting {len(rows):,} Unit Configs...")
    
    batch = []
    processed = 0
    errors = 0
    
    if HAS_TQDM:
        iterator = tqdm(rows, desc="  Migrating values", unit="value", ncols=100)
    else:
        iterator = rows
    
    for row in iterator:
        mega_id, device_name, command_id, value, modified_by, modified_date = row
        
        # Use MegaID and DeviceName directly - no need to join with unit table
        # Default device_name to 'Unknown' if NULL (shouldn't happen, but safety check)
        device_name = device_name if device_name else 'Unknown'
        batch.append((mega_id, device_name, command_id, value, modified_by, modified_date))
        
        if len(batch) >= BATCH_SIZE:
            try:
                execute_values(pg_cursor, insert_sql, batch, page_size=BATCH_SIZE)
                pg_conn.commit()
                processed += len(batch)
                batch = []
            except Exception as e:
                pg_conn.rollback()
                # Try one by one for this failed batch
                for single_item in batch:
                    try:
                        pg_cursor.execute("""
                            INSERT INTO unit_config (mega_id, device_name, command_id, value, modified_by, modified_date)
                            VALUES (%s, %s, %s, %s, %s, %s)
                            ON CONFLICT (mega_id, device_name, command_id) DO UPDATE
                            SET value = EXCLUDED.value, modified_by = EXCLUDED.modified_by, modified_date = EXCLUDED.modified_date
                        """, single_item)
                        pg_conn.commit()
                        processed += 1
                    except Exception as e2:
                        pg_conn.rollback()
                        errors += 1
                        if errors <= 5:
                            print(f"\n    Error inserting: {single_item[0]}, config_id={single_item[1]}: {e2}")
                batch = []
    
    # Insert remaining
    if batch:
        try:
            execute_values(pg_cursor, insert_sql, batch, page_size=len(batch))
            pg_conn.commit()
            processed += len(batch)
        except Exception as e:
            pg_conn.rollback()
            for single_item in batch:
                try:
                    pg_cursor.execute("""
                        INSERT INTO unit_config (mega_id, device_name, command_id, value, modified_by, modified_date)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        ON CONFLICT (mega_id, device_name, command_id) DO UPDATE
                        SET value = EXCLUDED.value, modified_by = EXCLUDED.modified_by, modified_date = EXCLUDED.modified_date
                        """, single_item)
                    pg_conn.commit()
                    processed += 1
                except Exception as e2:
                    pg_conn.rollback()
                    errors += 1
                    if errors <= 5:
                        print(f"\n    Error inserting: {single_item[0]}, config_id={single_item[1]}: {e2}")
    
    elapsed = time.time() - start_time
    
    if HAS_TQDM:
        print()  # New line after progress bar
    
    print(f"\n✓ Migrated {processed:,} Unit Configs in {elapsed:.2f}s")
    print(f"  ✓ Source records: {total_count:,}")
    if errors > 0:
        print(f"  ⚠ Errors: {errors:,}")

def migrate_command_history(sql_conn, pg_conn):
    """Migrate ALL command history with progress"""
    print("\n" + "=" * 70)
    print("STEP 4: Migrating Command History (ALL RECORDS)")
    print("=" * 70)
    
    start_time = time.time()
    cursor = sql_conn.cursor()
    
    # Get total count - REMOVED TOP 50000 LIMIT
    cursor.execute("""
        SELECT COUNT(*)
        FROM cfg_CommandHistory ch
        LEFT JOIN cfg_Unit u ON ch.FK_UnitID = u.ID
    """)
    total_count = cursor.fetchone()[0]
    print(f"\nFound {total_count:,} command history records to migrate")
    
    if total_count == 0:
        print("  No records to migrate")
        return
    
    # Query ALL records - REMOVED TOP 50000 LIMIT
    # Note: Actual table has CommandSent, SentBy, no SimNo/Direction
    cursor.execute("""
        SELECT 
            u.IMEI,
            u.SimNo,
            ch.CommandSent,
            ch.Status,
            ch.SentBy,
            ch.SentDate,
            ch.FK_ConfigID
        FROM cfg_CommandHistory ch
        LEFT JOIN cfg_Unit u ON ch.FK_UnitID = u.ID
        ORDER BY ch.SentDate DESC
    """)
    
    rows = cursor.fetchall()
    
    pg_cursor = pg_conn.cursor()
    
    insert_sql = """
        INSERT INTO command_history (imei, sim_no, direction, command_text, status, user_id, created_at)
        VALUES %s
    """
    
    batch = []
    processed = 0
    errors = 0
    
    if HAS_TQDM:
        iterator = tqdm(rows, desc="  Migrating history", unit="record", ncols=100)
    else:
        iterator = rows
    
    for row in iterator:
        imei, sim_no, command_sent, status, sent_by, sent_date, fk_config_id = row
        
        # All records in history are outgoing (sent commands)
        # Map old config_id to new if we have it in our map
        new_config_id = None
        if fk_config_id:
            # Try to find the config - we'd need to query it, but for now set to None
            # The config_id in history is optional anyway
            pass
        
        batch.append((
            imei,
            sim_no,
            'outgoing',  # All are outgoing commands
            command_sent,  # CommandSent column
            status,
            sent_by,  # SentBy column
            sent_date
        ))
        
        if len(batch) >= BATCH_SIZE:
            try:
                execute_values(pg_cursor, insert_sql, batch, page_size=BATCH_SIZE)
                processed += len(batch)
                batch = []
            except Exception as e:
                errors += len(batch)
                if not HAS_TQDM:
                    print(f"\n  Error in batch insert: {e}")
                batch = []
    
    # Insert remaining
    if batch:
        try:
            execute_values(pg_cursor, insert_sql, batch, page_size=len(batch))
            processed += len(batch)
        except Exception as e:
            errors += len(batch)
            if not HAS_TQDM:
                print(f"\n  Error in final batch insert: {e}")
    
    pg_conn.commit()
    elapsed = time.time() - start_time
    
    if HAS_TQDM:
        print()  # New line after progress bar
    
    print(f"\n✓ Migrated {processed:,} history records in {elapsed:.2f}s")
    if errors > 0:
        print(f"  ⚠ {errors} errors encountered")

def get_statistics(pg_conn):
    """Get migration statistics"""
    print("\n" + "=" * 70)
    print("MIGRATION STATISTICS")
    print("=" * 70)
    
    cursor = pg_conn.cursor()
    
    # Disable parallel queries to avoid "default_text_search_config" errors
    # This can happen with large tables when parallel workers have config issues
    try:
        cursor.execute("SET max_parallel_workers_per_gather = 0")
    except:
        pass  # Ignore if setting fails
    
    try:
        cursor.execute("SELECT COUNT(*) FROM device_config")
        config_count = cursor.fetchone()[0]
    except Exception as e:
        print(f"  Warning: Could not count device_config: {e}")
        config_count = "?"
    
    try:
        cursor.execute("SELECT COUNT(*) FROM unit")
        unit_count = cursor.fetchone()[0]
    except Exception as e:
        print(f"  Warning: Could not count unit: {e}")
        unit_count = "?"
    
    try:
        cursor.execute("SELECT COUNT(*) FROM unit_config")
        value_count = cursor.fetchone()[0]
    except Exception as e:
        # Try alternative approach - estimate from pg_class
        try:
            pg_conn.rollback()  # Reset transaction after error
            cursor.execute("""
                SELECT reltuples::bigint AS estimate 
                FROM pg_class WHERE relname = 'unit_config'
            """)
            value_count = f"~{cursor.fetchone()[0]:,} (estimated)"
        except:
            print(f"  Warning: Could not count unit_config: {e}")
            value_count = "?"
    
    try:
        cursor.execute("SELECT COUNT(*) FROM command_history")
        history_count = cursor.fetchone()[0]
    except Exception as e:
        print(f"  Warning: Could not count command_history: {e}")
        history_count = "?"
    
    print(f"\nDevice Configurations: {config_count:,}" if isinstance(config_count, int) else f"\nDevice Configurations: {config_count}")
    print(f"Units:                 {unit_count:,}" if isinstance(unit_count, int) else f"Units:                 {unit_count}")
    print(f"Unit Configs:           {value_count:,}" if isinstance(value_count, int) else f"Unit Configs:           {value_count}")
    print(f"Command History:       {history_count:,}" if isinstance(history_count, int) else f"Command History:       {history_count}")
    print()

def main():
    """Main migration function"""
    # Parse command line arguments
    parser = argparse.ArgumentParser(
        description='Migrate Operations Service data from SQL Server to PostgreSQL',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
USAGE EXAMPLES:
    # After Docker setup (recommended):
    python migrate.py --skip-schema
    
    # Standalone mode (creates own tables):
    python migrate.py
    
    # With custom PostgreSQL connection:
    set POSTGRES_HOST=192.168.1.100
    set POSTGRES_PORT=5432
    set POSTGRES_DB=tracking_db
    python migrate.py --skip-schema

ENVIRONMENT VARIABLES:
    SQLSERVER_CONN    - SQL Server connection string
    POSTGRES_HOST     - PostgreSQL host (default: localhost)
    POSTGRES_PORT     - PostgreSQL port (default: 5432)
    POSTGRES_DB       - PostgreSQL database (default: tracking_db)
    POSTGRES_USER     - PostgreSQL user (default: postgres)
    POSTGRES_PASSWORD - PostgreSQL password (default: postgres)
        """
    )
    parser.add_argument(
        '--skip-schema', 
        action='store_true',
        help='Skip schema recreation (use when tables already exist from Docker setup)'
    )
    parser.add_argument(
        '--skip-history',
        action='store_true', 
        help='Skip command history migration (can be slow for large datasets)'
    )
    args = parser.parse_args()
    
    overall_start = time.time()
    
    print("\n" + "=" * 70)
    print("Operations Service Migration: SQL Server -> PostgreSQL")
    print("Full Data Migration with Progress Tracking")
    print("=" * 70)
    print(f"\nPostgreSQL Target: {POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}")
    if args.skip_schema:
        print("Mode: --skip-schema (tables must already exist from Docker)")
    else:
        print("Mode: Standalone (will create tables)")
    
    try:
        print("\n[1/2] Connecting to SQL Server...")
        sql_conn = get_sqlserver_connection()
        print("  ✓ Connected to SQL Server")
        
        print("\n[2/2] Connecting to PostgreSQL...")
        pg_conn = get_postgres_connection()
        print("  ✓ Connected to PostgreSQL")
        
        # Schema handling
        if args.skip_schema:
            # Just verify tables exist (Docker should have created them)
            verify_postgres_schema(pg_conn)
        else:
            # Recreate PostgreSQL schema (standalone mode)
            recreate_postgres_schema(pg_conn)
        
        # Run migrations
        config_id_map = migrate_device_configs(sql_conn, pg_conn)
        migrate_units(sql_conn, pg_conn)
        migrate_unit_configs(sql_conn, pg_conn, config_id_map)
        
        if not args.skip_history:
            migrate_command_history(sql_conn, pg_conn)
        else:
            print("\n" + "=" * 70)
            print("STEP 4: Skipping Command History (--skip-history flag)")
            print("=" * 70)
        
        # Show statistics
        get_statistics(pg_conn)
        
        overall_elapsed = time.time() - overall_start
        
        print("=" * 70)
        print(f"✓ Migration completed successfully in {overall_elapsed:.2f} seconds!")
        print("=" * 70)
        print("\nNext steps:")
        print("  1. Verify data in Operations Service UI: http://localhost:13000")
        print("  2. Test command sending via API: http://localhost:18000/docs")
        
    except Exception as e:
        print("\n" + "=" * 70)
        print(f"✗ Migration failed: {e}")
        print("=" * 70)
        import traceback
        traceback.print_exc()
        raise
    finally:
        if 'sql_conn' in locals():
            sql_conn.close()
        if 'pg_conn' in locals():
            pg_conn.close()

if __name__ == "__main__":
    main()
