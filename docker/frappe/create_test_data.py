#!/usr/bin/env python3
"""
Create test data for megatechtrackers app
This script is called from init-frappe.sh after app installation
"""
import sys
import os

# IMPORTANT: Create logs directory BEFORE importing frappe
# Frappe configures logging during import, not during init()
site = os.getenv("FRAPPE_SITE") or os.getenv("SITE_NAME") or "site1.localhost"
sites_path = os.getenv("FRAPPE_SITES_PATH") or "/home/frappe/frappe-bench/sites"
bench_path = os.path.dirname(sites_path)

# Create logs at ALL possible paths Frappe might look for
site_logs_dir = os.path.join(sites_path, site, "logs")
bench_logs_dir = os.path.join(bench_path, "logs")
# Frappe sometimes incorrectly looks at bench_path/site/logs instead of sites_path/site/logs
wrong_site_logs_dir = os.path.join(bench_path, site, "logs")

os.makedirs(site_logs_dir, exist_ok=True)
os.makedirs(bench_logs_dir, exist_ok=True)
os.makedirs(wrong_site_logs_dir, exist_ok=True)

import frappe

def create_test_data():
    """Create test data for all doctypes"""
    # Use the globals set before import
    global site, sites_path
    
    frappe.init(site=site, sites_path=sites_path)
    frappe.connect()
    frappe.set_user('Administrator')
    
    print("\n" + "="*60)
    print("📦 CREATING TEST DATA")
    print("="*60 + "\n")
    
    # Create companies
    print("🏢 Creating Companies...")
    companies = []
    company_names = ['ACME Corp', 'Tech Solutions Inc', 'Global Industries']
    for name in company_names:
        existing = frappe.db.get_value('AC Company', {'ac_company_name': name}, 'name')
        if not existing:
            doc = frappe.get_doc({'doctype': 'AC Company', 'ac_company_name': name})
            doc.insert(ignore_permissions=True)
            companies.append(doc.name)
            print(f"   ✅ Created: {name} ({doc.name})")
        else:
            companies.append(existing)
            print(f"   ⚠️  Exists: {name} ({existing})")
    
    frappe.db.commit()
    
    # Create departments
    print("\n🏛️  Creating Departments...")
    departments = []
    dept_data = [
        {'name': 'Sales', 'company': companies[0] if companies else None},
        {'name': 'Engineering', 'company': companies[0] if companies else None},
        {'name': 'Marketing', 'company': companies[1] if len(companies) > 1 else None},
    ]
    for dept in dept_data:
        existing = frappe.db.get_value('AC Department', {'ac_department_name': dept['name']}, 'name')
        if not existing:
            doc = frappe.get_doc({
                'doctype': 'AC Department',
                'ac_department_name': dept['name'],
                'ac_company': dept['company']
            })
            doc.insert(ignore_permissions=True)
            departments.append(doc.name)
            print(f"   ✅ Created: {dept['name']} ({doc.name})")
        else:
            departments.append(existing)
            print(f"   ⚠️  Exists: {dept['name']} ({existing})")
    
    frappe.db.commit()
    
    # Create vehicles
    print("\n🚗 Creating Vehicles...")
    vehicles = []
    vehicle_data = [
        {'name': 'VH-001', 'company': companies[0] if companies else None, 'dept': departments[0] if departments else None},
        {'name': 'VH-002', 'company': companies[0] if companies else None, 'dept': departments[1] if len(departments) > 1 else None},
        {'name': 'VH-003', 'company': companies[1] if len(companies) > 1 else None, 'dept': departments[2] if len(departments) > 2 else None},
    ]
    for vh in vehicle_data:
        existing = frappe.db.get_value('AC Vehicle', {'ac_vehicle_name': vh['name']}, 'name')
        if not existing:
            doc = frappe.get_doc({
                'doctype': 'AC Vehicle',
                'ac_vehicle_name': vh['name'],
                'ac_company': vh['company'],
                'ac_department': vh['dept']
            })
            doc.insert(ignore_permissions=True)
            vehicles.append(doc.name)
            print(f"   ✅ Created: {vh['name']} ({doc.name})")
        else:
            vehicles.append(existing)
            print(f"   ⚠️  Exists: {vh['name']} ({existing})")
    
    frappe.db.commit()
    
    # Create forms
    print("\n📋 Creating Forms...")
    forms = []
    form_data = [
        {'name': 'Customer', 'label': 'Customer Management', 'url': '/app/customer'},
        {'name': 'Item', 'label': 'Item Management', 'url': '/app/item'},
        {'name': 'Sales Order', 'label': 'Sales Orders', 'url': '/app/sales-order'},
        {'name': 'Test Page', 'label': 'Test Page (Performance)', 'url': '/test-page'},
    ]
    for form in form_data:
        existing = frappe.db.get_value('AC Frappe Form', {'ac_frappe_form_name': form['name']}, 'name')
        if not existing:
            doc = frappe.get_doc({
                'doctype': 'AC Frappe Form',
                'ac_frappe_form_name': form['name'],
                'ac_form_label': form['label'],
                'ac_form_url': form['url']
            })
            doc.insert(ignore_permissions=True)
            forms.append(doc.name)
            print(f"   ✅ Created: {form['name']} ({doc.name})")
        else:
            forms.append(existing)
            print(f"   ⚠️  Exists: {form['name']} ({existing})")
    
    frappe.db.commit()
    
    # Create access control for Administrator
    print("\n🔐 Creating Access Control for Administrator...")
    user = 'Administrator'
    existing_ac = frappe.db.get_value('Megatechtrackers Access Control', {'ac_user': user}, 'name')
    if not existing_ac:
        doc = frappe.get_doc({
            'doctype': 'Megatechtrackers Access Control',
            'ac_user': user,
            'ac_user_type': 'Internal'
        })
        if companies:
            doc.append('ac_assigned_companies', {'ac_company': companies[0]})
        if len(companies) > 1:
            doc.append('ac_assigned_companies', {'ac_company': companies[1]})
        if departments:
            doc.append('ac_assigned_departments', {'ac_department': departments[0]})
        if vehicles:
            doc.append('ac_assigned_vehicles', {'ac_vehicle': vehicles[0]})
        if forms:
            for form in forms:
                doc.append('ac_assigned_forms', {'ac_form': form})
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        print(f"   ✅ Created Access Control for {user}")
    else:
        print(f"   ⚠️  Access Control already exists for {user}")
    
    print("\n" + "="*60)
    print("🎉 TEST DATA CREATION COMPLETE!")
    print("="*60 + "\n")
    print("📊 Summary:")
    print(f"   • Companies: {len(companies)}")
    print(f"   • Departments: {len(departments)}")
    print(f"   • Vehicles: {len(vehicles)}")
    print(f"   • Forms: {len(forms)}")
    print(f"   • Access Control: 1 (Administrator)")
    print("="*60 + "\n")

if __name__ == '__main__':
    try:
        create_test_data()
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Error creating test data: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
