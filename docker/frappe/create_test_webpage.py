#!/usr/bin/env python3
"""
Create a test web page in Frappe for mobile app performance testing
This script creates a simple, lightweight web page that can be loaded in WebView
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

def create_test_webpage():
    """Create a simple test web page for performance testing"""
    # Use the globals set before import
    global site, sites_path
    
    frappe.init(site=site, sites_path=sites_path)
    frappe.connect()
    frappe.set_user('Administrator')
    
    print("\n" + "="*60)
    print("🌐 CREATING TEST WEB PAGE")
    print("="*60 + "\n")
    
    # Check if web page already exists
    existing = frappe.db.get_value('Web Page', {'route': 'test-page'}, 'name')
    
    if existing:
        print(f"   ⚠️  Web page already exists: {existing}")
        print(f"   📍 URL: http://localhost:8000/test-page")
        # Update the existing page
        doc = frappe.get_doc('Web Page', existing)
    else:
        print("   📝 Creating new web page...")
        doc = frappe.get_doc({
            'doctype': 'Web Page',
            'title': 'Test Page - Performance',
            'route': 'test-page',
            'published': 1,
            'content_type': 'Rich Text'
        })
    
    # Simple, lightweight HTML content optimized for performance
    html_content = """<div style="padding: 20px; font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
    <h1 style="color: #0070f3; margin-bottom: 20px;">Performance Test Page</h1>
    
    <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
        <h2 style="margin-top: 0;">Page Information</h2>
        <p><strong>Status:</strong> ✅ Loaded successfully</p>
        <p><strong>Purpose:</strong> Mobile app performance testing</p>
        <p><strong>Optimizations:</strong> No animations, minimal CSS, fast loading</p>
    </div>
    
    <div style="background: #fff; border: 1px solid #ddd; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
        <h2 style="margin-top: 0;">Test Content</h2>
        <p>This is a simple test page to verify WebView performance in the mobile app.</p>
        <p>The page is optimized for fast loading with:</p>
        <ul>
            <li>No animations or transitions</li>
            <li>Minimal CSS</li>
            <li>Simple HTML structure</li>
            <li>No external resources</li>
        </ul>
    </div>
    
    <div style="background: #e3f2fd; padding: 15px; border-radius: 5px; border-left: 4px solid #0070f3;">
        <h3 style="margin-top: 0;">Performance Metrics</h3>
        <p>Check the browser console or network tab to see:</p>
        <ul>
            <li>Page load time</li>
            <li>Time to interactive</li>
            <li>Resource loading</li>
        </ul>
    </div>
    
    <div style="margin-top: 30px; padding: 15px; background: #f9f9f9; border-radius: 5px;">
        <h3>Form Test Section</h3>
        <form style="margin-top: 15px;">
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Name:</label>
                <input type="text" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;" placeholder="Enter your name">
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Email:</label>
                <input type="email" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;" placeholder="Enter your email">
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Message:</label>
                <textarea style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; min-height: 100px;" placeholder="Enter your message"></textarea>
            </div>
            <button type="submit" style="background: #0070f3; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;">Submit</button>
        </form>
    </div>
    
    <div style="margin-top: 30px; padding: 15px; background: #fff3cd; border-radius: 5px; border-left: 4px solid #ffc107;">
        <p style="margin: 0;"><strong>Note:</strong> This page is designed for performance testing. It should load quickly in the mobile app WebView.</p>
    </div>
</div>"""
    
    doc.main_section = html_content
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    
    print(f"   ✅ Web page created/updated: {doc.name}")
    print(f"   📍 URL: http://localhost:8000/{doc.route}")
    print(f"   📍 Mobile URL: http://10.0.2.2:8000/{doc.route}")
    print("\n" + "="*60)
    print("🎉 TEST WEB PAGE CREATED!")
    print("="*60 + "\n")
    print("You can now test this page in your mobile app by:")
    print(f"   • Adding it as a form with URL: /{doc.route}")
    print(f"   • Or accessing directly: http://10.0.2.2:8000/{doc.route}")
    print("="*60 + "\n")

if __name__ == '__main__':
    try:
        create_test_webpage()
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Error creating test web page: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

