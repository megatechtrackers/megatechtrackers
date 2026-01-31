#!/usr/bin/env python3
"""
Script to migrate cfg_ tables in SQL Server.

This script runs migrate_sql_server_to_cfg.sql which:
1. Drops and recreates all cfg_ tables
2. Migrates data from original tables to cfg_ tables

Usage:
    python run_cfg_migration.py
    
    Or with custom connection string:
    python run_cfg_migration.py --connection "Driver={ODBC Driver 17 for SQL Server};Server=ALIPC;Database=WEBRptInternal;Trusted_Connection=yes;TrustServerCertificate=yes;"
"""

import sys
import os
import argparse
import pyodbc
from pathlib import Path

# Set UTF-8 encoding for output
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

def get_default_connection_string():
    """Get default SQL Server connection string."""
    return (
        "Driver={ODBC Driver 17 for SQL Server};"
        "Server=ALIPC;"
        "Database=WEBRptInternal;"
        "Trusted_Connection=yes;"
        "TrustServerCertificate=yes;"
    )

def read_sql_file(file_path):
    """Read SQL file and split by GO statements."""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Split by GO statements (case-insensitive, with or without semicolon)
    import re
    # Split on GO followed by optional whitespace and newline
    statements = re.split(r'\bGO\b\s*', content, flags=re.IGNORECASE)
    
    # Filter out empty statements
    statements = [s.strip() for s in statements if s.strip()]
    
    return statements

def execute_sql_statements(conn, statements, script_name):
    """Execute SQL statements and handle errors."""
    cursor = conn.cursor()
    success_count = 0
    error_count = 0
    
    print(f"\n{'='*60}")
    print(f"Executing: {script_name}")
    print(f"{'='*60}\n")
    
    for i, statement in enumerate(statements, 1):
        try:
            # Skip empty statements
            if not statement or not statement.strip():
                continue
            
            # Execute statement
            cursor.execute(statement)
            
            # Try to fetch messages (PRINT statements, etc.)
            try:
                while cursor.nextset():
                    pass
            except:
                pass
            
            success_count += 1
            
            # Print progress for long scripts
            if len(statements) > 10 and i % 10 == 0:
                print(f"  Progress: {i}/{len(statements)} statements executed...")
                
        except pyodbc.Error as e:
            error_count += 1
            print(f"\n❌ Error in statement {i}:")
            print(f"   {str(e)}")
            # Print first few lines of the statement for context
            statement_lines = statement.split('\n')[:5]
            print(f"   Statement preview: {statement_lines[0][:100]}...")
            
            # Ask user if they want to continue
            if error_count == 1:
                response = input("\n⚠️  Error encountered. Continue with remaining statements? (y/n): ")
                if response.lower() != 'y':
                    print("\n❌ Migration aborted by user.")
                    return False
    
    # Commit all changes
    try:
        conn.commit()
        print(f"\n✅ Committed all changes successfully.")
    except Exception as e:
        print(f"\n❌ Error committing changes: {e}")
        conn.rollback()
        return False
    
    print(f"\n📊 Summary for {script_name}:")
    print(f"   ✅ Successful: {success_count}")
    print(f"   ❌ Errors: {error_count}")
    
    return error_count == 0

def main():
    parser = argparse.ArgumentParser(
        description='Migrate cfg_ tables in SQL Server',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run_cfg_migration.py
  python run_cfg_migration.py --connection "Driver={...};Server=...;Database=...;"
        """
    )
    
    parser.add_argument(
        '--connection',
        type=str,
        default=None,
        help='SQL Server connection string (default: uses ALIPC/WEBRptInternal)'
    )
    
    args = parser.parse_args()
    
    # Get script directory
    script_dir = Path(__file__).parent
    
    # Get SQL file path
    migrate_script = script_dir / 'migrate_sql_server_to_cfg.sql'
    
    # Check if file exists
    if not migrate_script.exists():
        print(f"❌ Error: {migrate_script} not found!")
        return 1
    
    # Get connection string
    connection_string = args.connection or get_default_connection_string()
    
    print("="*60)
    print("CFG Tables Migration Script")
    print("="*60)
    print(f"\n📁 Script directory: {script_dir}")
    print(f"📦 Migration script: {migrate_script.name}")
    print(f"\n🔌 Connecting to SQL Server...")
    
    # Connect to SQL Server
    try:
        conn = pyodbc.connect(connection_string)
        print("✅ Connected successfully!")
    except Exception as e:
        print(f"❌ Failed to connect to SQL Server: {e}")
        print(f"\nConnection string used: {connection_string[:50]}...")
        return 1
    
    try:
        overall_success = True
        
        # Migrate cfg_ tables (drop/create + data migration)
        print(f"\n{'='*60}")
        print("Migrating cfg_ tables (drops, creates, and populates tables)")
        print(f"{'='*60}")
        
        migrate_statements = read_sql_file(migrate_script)
        success = execute_sql_statements(conn, migrate_statements, migrate_script.name)
        
        if not success:
            print("\n❌ Migration failed.")
            overall_success = False
        else:
            print("\n✅ Migration completed successfully!")
        
        # Final summary
        print(f"\n{'='*60}")
        if overall_success:
            print("✅ MIGRATION COMPLETED SUCCESSFULLY!")
        else:
            print("⚠️  MIGRATION COMPLETED WITH ERRORS")
        print(f"{'='*60}\n")
        
        # Show table counts
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM cfg_DeviceConfig")
            device_config_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM cfg_Unit")
            unit_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM cfg_UnitConfig")
            unit_config_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM cfg_CommandHistory")
            history_count = cursor.fetchone()[0]
            
            print("📊 Final table counts:")
            print(f"   cfg_DeviceConfig: {device_config_count:,}")
            print(f"   cfg_Unit: {unit_count:,}")
            print(f"   cfg_UnitConfig: {unit_config_count:,}")
            print(f"   cfg_CommandHistory: {history_count:,}")

            # Simple diagnostic (avoid expensive joins)
            if unit_config_count == 0:
                print("\n⚠️  cfg_UnitConfig is empty. Quick diagnostic:")
                try:
                    cursor.execute("SELECT COUNT(*) FROM LastConfiguration WHERE Value IS NOT NULL AND Value != ''")
                    total_last_config = cursor.fetchone()[0]
                    print(f"   LastConfiguration records (with values): {total_last_config:,}")
                    
                    if total_last_config > 0:
                        # Check sample MegaID formats
                        cursor.execute("""
                            SELECT TOP 5 MegaID
                            FROM LastConfiguration 
                            WHERE Value IS NOT NULL AND Value != ''
                            ORDER BY ID
                        """)
                        lc_megaids = [row[0] for row in cursor.fetchall()]
                        
                        cursor.execute("""
                            SELECT TOP 5 MegaID
                            FROM cfg_Unit
                            ORDER BY ID
                        """)
                        unit_megaids = [row[0] for row in cursor.fetchall()]
                        
                        print(f"\n   Sample LastConfiguration.MegaID formats:")
                        for megaid in lc_megaids:
                            print(f"      - {megaid}")
                        
                        print(f"\n   Sample cfg_Unit.MegaID formats:")
                        for megaid in unit_megaids:
                            print(f"      - {megaid}")
                        
                        # Check if any direct matches exist
                        if lc_megaids and unit_megaids:
                            sample_lc = lc_megaids[0]
                            has_match = any(m == sample_lc for m in unit_megaids)
                            if not has_match:
                                print(f"\n   ❌ No direct MegaID match found in samples!")
                                print(f"   💡 The MegaID formats may differ - check if normalization needed")
                        
                        print("\n   💡 Tip: If formats differ, we may need to normalize MegaID in the join")
                except Exception as e:
                    print(f"   ⚠️  Could not run diagnostic: {e}")
                    import traceback
                    traceback.print_exc()
        except Exception as e:
                print(f"⚠️  Could not retrieve table counts: {e}")
        
        return 0 if overall_success else 1
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Migration interrupted by user.")
        conn.rollback()
        return 1
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        conn.rollback()
        return 1
    finally:
        conn.close()
        print("\n🔌 Connection closed.")

if __name__ == '__main__':
    sys.exit(main())
