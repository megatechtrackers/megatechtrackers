#!/bin/bash
set -e

echo "🚀 Starting Frappe (pre-installed in image)..."

# Wait for MariaDB to be ready
echo "⏳ Waiting for MariaDB..."
until python3 -c "import socket; s = socket.socket(); s.settimeout(2); result = s.connect_ex(('mariadb', 3306)); s.close(); exit(0 if result == 0 else 1)" 2>/dev/null; do
  echo "   Waiting for MariaDB..."
  sleep 2
done
echo "✅ MariaDB is ready!"

# Change to home directory
cd /home/frappe || exit 1

# Ensure Frappe log directory exists (some code paths expect /home/frappe/logs)
mkdir -p /home/frappe/logs

# The bench is pre-installed in the image, but volume mount overrides it
# So we need to check if volume is empty and copy from image bench
# The image bench is at /home/frappe/frappe-bench (before volume mount)
# But we need to check the actual mounted volume

# Check if volume has a valid bench
if [ ! -d "frappe-bench" ] || [ ! -f "frappe-bench/sites/apps.txt" ] || [ ! -d "frappe-bench/apps/frappe" ]; then
    echo "📦 Volume is empty, copying pre-installed bench from image..."
    # The bench from image build is available, we need to copy it to volume
    # Since volume mount overrides, we need to initialize in a temp location first
    # Actually, the bench should be in the image at /home/frappe/frappe-bench
    # But volume mount hides it. Let's check if we can access it via a different path
    # Or we need to re-initialize in the volume (but using the pre-installed one as reference)
    
    # For now, since volume mount overrides, we'll need to copy from a known location
    # The bench was built in the image, so let's check if it exists in a backup location
    # Actually, the simplest is to just re-init in volume since we have the image setup
    echo "   Initializing bench in volume (using pre-installed setup as reference)..."
    bench init frappe-bench --frappe-branch version-14 --no-procfile --no-backups --skip-redis-config-generation
    echo "✅ Bench initialized in volume"
else
    echo "✅ Using existing bench from volume"
fi

# Change to bench directory
cd frappe-bench || exit 1
echo "📂 Current directory: $(pwd)"

# Create site if not exists (using MariaDB from docker-compose)
if [ ! -d "sites/site1.localhost" ]; then
    echo "🌐 Creating site..."
    bench new-site site1.localhost \
        --db-root-password admin \
        --admin-password admin \
        --no-mariadb-socket \
        --db-name frappe \
        --db-password frappe \
        --db-host mariadb \
        --db-port 3306 \
        --db-root-username root \
        --force \
        --install-app frappe \
        --set-default
    echo "✅ Site created!"
else
    echo "🌐 Site already exists"
fi

# Ensure site DB config matches docker-compose MariaDB user/db (prevents 1045 access denied)
echo "   Ensuring site DB config..."
bench --site site1.localhost set-config db_name "frappe"
bench --site site1.localhost set-config db_user "frappe"
bench --site site1.localhost set-config db_password "frappe"
bench --site site1.localhost set-config db_host "mariadb"
bench --site site1.localhost set-config db_port "3306"
echo "✅ Site DB config set"

# If this site was created previously with a different DB, the configured DB can be empty.
# Detect missing schema and auto-reinstall to self-heal after partial/failed runs.
echo "   Checking DB schema..."
if env/bin/python - <<'PY'
import json, sys
import pymysql

cfg_path = "/home/frappe/frappe-bench/sites/site1.localhost/site_config.json"
cfg = json.load(open(cfg_path, "r", encoding="utf-8"))

conn = pymysql.connect(
    host=cfg.get("db_host", "mariadb"),
    user=cfg["db_user"],
    password=cfg["db_password"],
    database=cfg["db_name"],
    port=int(cfg.get("db_port", 3306)),
    connect_timeout=5,
)
cur = conn.cursor()
cur.execute("SELECT 1 FROM tabSingles LIMIT 1")
print("✅ DB schema looks present")
PY
then
  true
else
  echo "⚠️  DB schema missing/incomplete. Reinstalling site (dev reset)..."
  bench --site site1.localhost reinstall \
    --yes \
    --admin-password admin \
    --mariadb-root-username root \
    --mariadb-root-password admin
  echo "✅ Site reinstalled"
fi

# Configure Redis connection (Redis runs in separate container)
echo "   Configuring Redis connection..."
bench set-config -g redis_cache "redis://redis:6379"
bench set-config -g redis_queue "redis://redis:6379"
bench set-config -g redis_socketio "redis://redis:6379"
echo "✅ Redis configured"

# Configure Access Gateway URL (for accessing the Node.js service from Docker)
# Prefer docker-compose DNS (works across Windows/Mac/Linux). Override via env if needed.
ACCESS_GATEWAY_URL="${ACCESS_GATEWAY_URL:-http://access-gateway:3001}"
echo "   Configuring Access Gateway URL: ${ACCESS_GATEWAY_URL}"
bench --site site1.localhost set-config access_gateway_url "${ACCESS_GATEWAY_URL}"
echo "✅ Access Gateway URL configured"

# Setup megatechtrackers app
if [ -d "/workspace/apps/megatechtrackers" ]; then
    echo "📦 Setting up megatechtrackers app..."
    
    # Copy app to bench if not already there
    if [ ! -d "apps/megatechtrackers" ]; then
        echo "   Copying megatechtrackers app to bench..."
        cp -r /workspace/apps/megatechtrackers apps/
        echo "✅ App copied to bench"
    else
        echo "   App already in bench, updating..."
        cp -r /workspace/apps/megatechtrackers/* apps/megatechtrackers/ 2>/dev/null || true
        echo "✅ App updated in bench"
    fi
    
    # Ensure proper structure: apps/megatechtrackers/megatechtrackers/hooks.py
    if [ ! -f "/workspace/apps/megatechtrackers/megatechtrackers/hooks.py" ] && [ ! -f "/workspace/apps/megatechtrackers/hooks.py" ]; then
        echo "⚠️  Warning: hooks.py not found in expected locations"
        echo "   Checked: /workspace/apps/megatechtrackers/megatechtrackers/hooks.py"
        echo "   Checked: /workspace/apps/megatechtrackers/hooks.py"
        echo "   Listing app structure:"
        ls -la /workspace/apps/megatechtrackers/megatechtrackers/ 2>&1 || true
    fi
    
    # Frappe requires: apps/megatechtrackers/megatechtrackers/hooks.py
    if [ -f "apps/megatechtrackers/hooks.py" ] && [ ! -f "apps/megatechtrackers/megatechtrackers/hooks.py" ]; then
        echo "   Fixing app structure (moving hooks.py to correct location)..."
        mkdir -p apps/megatechtrackers/megatechtrackers
        mv apps/megatechtrackers/hooks.py apps/megatechtrackers/megatechtrackers/ 2>/dev/null || true
        if [ -f "apps/megatechtrackers/__init__.py" ]; then
            mv apps/megatechtrackers/__init__.py apps/megatechtrackers/megatechtrackers/ 2>/dev/null || true
        else
            echo "__version__ = \"1.0.0\"" > apps/megatechtrackers/megatechtrackers/__init__.py
        fi
        echo "✅ App structure fixed"
    fi
    
    # Create modules.txt if it doesn't exist (required for app to show in frontend)
    # Module name must match a directory structure: megatechtrackers/megatechtrackers/megatechtrackers/
    if [ ! -f "apps/megatechtrackers/megatechtrackers/modules.txt" ]; then
        echo "   Creating modules.txt for frontend visibility..."
        echo "Megatechtrackers" > apps/megatechtrackers/megatechtrackers/modules.txt
        echo "✅ modules.txt created"
    fi
    
    # CRITICAL: Create module directory that matches modules.txt entry
    # Frappe expects: megatechtrackers/megatechtrackers/megatechtrackers/ (module name -> folder name)
    if [ ! -d "apps/megatechtrackers/megatechtrackers/megatechtrackers" ]; then
        echo "   Creating module directory (required for sync_for)..."
        mkdir -p apps/megatechtrackers/megatechtrackers/megatechtrackers
        echo "# Megatechtrackers module" > apps/megatechtrackers/megatechtrackers/megatechtrackers/__init__.py
        echo "✅ Module directory created"
    fi
    
    # Create doctype Python modules (required for Frappe to import doctypes)
    # NOTE: Doctypes go at package root: megatechtrackers/megatechtrackers/doctype/
    # The module directory (megatechtrackers/megatechtrackers/megatechtrackers/) is separate
    echo "   Creating doctype Python modules..."
    mkdir -p apps/megatechtrackers/megatechtrackers/doctype
    for dt in ac_company ac_department ac_vehicle ac_frappe_form ac_grafana_report ac_frappe_form_assignment ac_grafana_report_assignment ac_company_assignment ac_department_assignment ac_vehicle_assignment megatechtrackers_access_control; do
        dt_dir="apps/megatechtrackers/megatechtrackers/doctype/$dt"
        mkdir -p "$dt_dir"
        if [ ! -f "$dt_dir/__init__.py" ]; then
            echo "# Auto-generated" > "$dt_dir/__init__.py"
        fi
        if [ ! -f "$dt_dir/$dt.py" ]; then
            # Convert snake_case to PascalCase for class name
            class_name=$(echo "$dt" | sed 's/_\([a-z]\)/\U\1/g' | sed 's/^\([a-z]\)/\U\1/')
            cat > "$dt_dir/$dt.py" << PYEOF
from frappe.model.document import Document


class $class_name(Document):
    pass
PYEOF
        fi
    done
    echo "✅ Doctype Python modules created"
    
    # Create the module directory (required for Frappe's doctype resolution)
    # The module name from modules.txt is "Megatechtrackers"
    # Frappe constructs doctype paths as: {app}.{module}.doctype.{doctype}
    # So doctypes MUST be in: apps/megatechtrackers/megatechtrackers/megatechtrackers/doctype/
    echo "   Creating module directory structure for doctypes..."
    mkdir -p apps/megatechtrackers/megatechtrackers/megatechtrackers/doctype
    cat > apps/megatechtrackers/megatechtrackers/megatechtrackers/__init__.py << 'EOF'
# Logical module for Megatechtrackers
# This directory is required by Frappe's sync_for function and doctype resolution
__version__ = "1.0.0"
EOF
    touch apps/megatechtrackers/megatechtrackers/megatechtrackers/doctype/__init__.py
    
    # CRITICAL: Copy to BOTH locations
    # 1. Root level: for Python imports (from megatechtrackers.utils import ...)
    # 2. Module directory: for Frappe doctype resolution
    
    echo "   Copying resources to root level (for Python imports)..."
    for dir in api config utils public; do
        if [ -d "/workspace/apps/megatechtrackers/megatechtrackers/megatechtrackers/$dir" ]; then
            mkdir -p apps/megatechtrackers/megatechtrackers/$dir
            cp -r /workspace/apps/megatechtrackers/megatechtrackers/megatechtrackers/$dir/* apps/megatechtrackers/megatechtrackers/$dir/ 2>/dev/null || true
        fi
    done
    
    echo "✅ Root-level resources copied"
    
    if [ -d "/workspace/apps/megatechtrackers/megatechtrackers/megatechtrackers" ]; then
        echo "   Copying module resources (for Frappe)..."
        # Copy all module resources including workspace directory
        cp -r /workspace/apps/megatechtrackers/megatechtrackers/megatechtrackers/* apps/megatechtrackers/megatechtrackers/megatechtrackers/ 2>/dev/null || true
        echo "✅ Module resources copied (including workspace)"
    fi
    
    echo "✅ Module directory structure created (both locations)"
    
    # Create setup.py if it doesn't exist (required for pip install -e)
    if [ ! -f "apps/megatechtrackers/setup.py" ]; then
        echo "   Creating setup.py..."
        cat > apps/megatechtrackers/setup.py << 'SETUPEOF'
from setuptools import setup, find_packages

with open('requirements.txt') as f:
    install_requires = f.read().strip().split('\n') if f.read().strip() else []

setup(
    name='megatechtrackers',
    version='1.0.0',
    description='Megatechtrackers access control system for Frappe forms and Grafana reports',
    author='Megatechtrackers',
    author_email='support@megatechtrackers.com',
    packages=find_packages(),
    zip_safe=False,
    include_package_data=True,
    install_requires=install_requires
)
SETUPEOF
        echo "✅ setup.py created"
    fi
    
    # CRITICAL: Remove from apps.txt FIRST (before any operations)
    # This prevents Frappe from trying to import the module during init
    # install-app will add it automatically, so we don't add it manually
    if [ -f "sites/apps.txt" ]; then
        # Remove all occurrences (in case it was added multiple times)
        sed -i '/megatechtrackers/d' sites/apps.txt
        # Verify it's removed
        if grep -q "megatechtrackers" sites/apps.txt; then
            echo "⚠️  Warning: megatechtrackers still in apps.txt after removal attempt"
            # Force remove with a more aggressive approach
            grep -v "megatechtrackers" sites/apps.txt > sites/apps.txt.tmp && mv sites/apps.txt.tmp sites/apps.txt
        fi
        echo "✅ Verified megatechtrackers is NOT in apps.txt (will be added by install-app)"
    fi
    
    # CRITICAL: Install app as editable package FIRST (before any Frappe operations)
    # This ensures the package is importable when frappe.init() runs during install-app
    echo "   Installing app as editable package..."
    source env/bin/activate
    pip install -e ./apps/megatechtrackers --no-cache-dir --retries 5 --timeout 300 2>&1 | tail -5
    echo "✅ App installed as editable package"
    
    # CRITICAL: Verify the package is importable BEFORE proceeding
    echo "   Verifying package is importable..."
    if python3 -c "import megatechtrackers; print('✅ Package importable')" 2>&1; then
        echo "✅ Package verification successful"
    else
        echo "❌ ERROR: Package is not importable! This will cause install-app to fail."
        echo "   Checking package structure..."
        ls -la apps/megatechtrackers/megatechtrackers/ 2>&1 | head -10
        exit 1
    fi
    
    # CRITICAL: Clear cache BEFORE adding to apps.txt
    # clear-cache calls frappe.init() which tries to import all apps in apps.txt
    # So we must clear cache while app is NOT in apps.txt
    if [ -d "sites/site1.localhost" ]; then
        echo "   Clearing Frappe cache (app not in apps.txt yet)..."
        bench --site site1.localhost clear-cache 2>&1 | tail -2 || true
        # Also clear global cache
        rm -rf sites/.cache 2>/dev/null || true
        echo "✅ Cache cleared"
    fi
    
    # CRITICAL: Test import one more time to ensure Python can find it
    echo "   Testing Python import one final time..."
    python3 << 'PYTEST'
import sys
try:
    import megatechtrackers
    print(f"✅ Import successful: {megatechtrackers.__file__}")
    print(f"✅ Module path: {megatechtrackers.__path__}")
    sys.exit(0)
except ImportError as e:
    print(f"❌ Import failed: {e}")
    sys.exit(1)
PYTEST
    
    if [ $? -ne 0 ]; then
        echo "❌ ERROR: Package import test failed! Cannot proceed with install-app."
        exit 1
    fi
    
    # CRITICAL: Add to apps.txt AFTER cache is cleared and import verified
    # install-app REQUIRES the app to be in apps.txt, but we cleared cache first
    # This way, when frappe.init() runs during install-app, the package is already ready
    if [ ! -f "sites/apps.txt" ]; then
        touch sites/apps.txt
    fi
    # Ensure apps.txt has proper newline at end (prevent concatenation)
    if [ -f "sites/apps.txt" ] && [ -s "sites/apps.txt" ]; then
        # Add newline if last line doesn't have one
        tail -c1 sites/apps.txt | read -r _ || echo "" >> sites/apps.txt
    fi
    
    # Add to apps.txt ONLY if not present (required by bench install-app)
    if ! grep -q "^megatechtrackers$" sites/apps.txt 2>/dev/null; then
        echo "megatechtrackers" >> sites/apps.txt
        echo "✅ Added to apps.txt"
    else
        echo "✅ Already in apps.txt"
    fi
    
    # Verify apps.txt format (debug)
    echo "   apps.txt contents:"
    cat sites/apps.txt | while IFS= read -r line; do echo "     - [$line]"; done
    
    echo "📦 megatechtrackers app is ready (structure fixed, installed as editable package)"
    echo "   Attempting to install app on site automatically..."
    
    # Attempt to install the app on the site (only if site exists)
    # NOTE: bench install-app uses the FOLDER name (megatechtrackers), not app_name from hooks.py
    if [ -d "sites/site1.localhost" ]; then
        echo "   Installing app on site (using folder name: megatechtrackers)..."
        # Don't clear cache here - we already cleared it, and it triggers frappe.init() which tries to import apps
        # The package is already installed and importable, so install-app should work
        
        # Verify package AND module directory are importable right before install-app
        echo "   Final verification: package and module directory importable..."
        python3 << 'PYFINAL'
import sys
try:
    # Test main package import
    import megatechtrackers
    print(f"✅ Package import: {megatechtrackers.__file__}")
    
    # Test module directory import (required for sync_for)
    import megatechtrackers.megatechtrackers as mt_module
    if mt_module.__file__ is None:
        print("❌ ERROR: Module directory __file__ is None!")
        sys.exit(1)
    print(f"✅ Module directory import: {mt_module.__file__}")
    
    sys.exit(0)
except ImportError as e:
    print(f"❌ Import failed: {e}")
    sys.exit(1)
PYFINAL
        
        if [ $? -ne 0 ]; then
            echo "❌ ERROR: Package/module verification failed! Cannot proceed with install-app."
            # Remove from apps.txt to prevent worker crashes
            sed -i '/megatechtrackers/d' sites/apps.txt
            exit 1
        fi
        echo "✅ Package verification passed, proceeding with install-app"
        
        # Ensure proper newline before adding
        if [ -f "sites/apps.txt" ] && [ -s "sites/apps.txt" ]; then
            tail -c1 sites/apps.txt | read -r _ || echo "" >> sites/apps.txt
        fi
        
        # Ensure app is in apps.txt (install-app requires it)
        if ! grep -q "^megatechtrackers$" sites/apps.txt 2>/dev/null; then
            echo "megatechtrackers" >> sites/apps.txt
            echo "   Added to apps.txt for install-app"
        fi
        
        # Verify no concatenation (debug)
        echo "   Final apps.txt check:"
        cat sites/apps.txt | while IFS= read -r line; do echo "     [$line]"; done
        
        if bench --site site1.localhost install-app megatechtrackers 2>&1; then
            echo "✅ megatechtrackers app installed successfully!"
            
            # Verify app in apps.txt (bench should have added it)
            if grep -q "megatechtrackers" sites/apps.txt; then
                echo "✅ App in apps.txt"
            else
                echo "⚠️  Adding to apps.txt..."
                echo "megatechtrackers" >> sites/apps.txt
            fi
            
            bench --site site1.localhost migrate 2>&1 | tail -3
            echo "✅ Migration completed!"

            # Build and link assets so /assets/megatechtrackers/... URLs resolve (fixes 404s)
            # Only build if the expected asset is missing (keeps restarts fast).
            if [ ! -f "sites/assets/megatechtrackers/js/link_formatters.js" ]; then
                echo "   Building assets (this may take a minute)..."
                bench build 2>&1 | tail -20 || true
                bench --site site1.localhost clear-cache 2>&1 | tail -2 || true
                echo "✅ Assets built and cache cleared"
            else
                echo "✅ Assets already present (skipping build)"
            fi

            # Final cache clear (keeps sidebar/workspace consistent after install/migrate)
            bench --site site1.localhost clear-cache 2>&1 | tail -1 || true
            echo "   ✅ Installation complete"
        else
            echo "❌ Auto-installation failed!"
            echo "   Removing app from apps.txt to prevent worker crashes..."
            sed -i '/megatechtrackers/d' sites/apps.txt
            if ! grep -q "megatechtrackers" sites/apps.txt; then
                echo "✅ App removed from apps.txt"
            fi
            echo ""
            echo "⚠️  Manual installation required. Follow these steps:"
            echo "   1. Exec into container:"
            echo "      docker exec -it frappe bash"
            echo "   2. Add app to apps.txt manually:"
            echo "      echo 'megatechtrackers' >> sites/apps.txt"
            echo "   3. Install the app:"
            echo "      bench --site site1.localhost install-app megatechtrackers"
            echo "   4. Run migration:"
            echo "      bench --site site1.localhost migrate"
            echo "   5. Restart Frappe:"
            echo "      bench restart"
        fi
    else
        echo "⚠️  Site not created yet. App will be installed when site is created."
    fi
else
    echo "⚠️  megatechtrackers app not found in /workspace/apps/"
fi

# Copy performance optimization assets (disable animations CSS/JS)
if [ -d "apps/megatechtrackers" ]; then
    echo "⚡ Setting up performance optimization assets..."
    
    # Create assets directories
    mkdir -p apps/megatechtrackers/megatechtrackers/public/css
    mkdir -p apps/megatechtrackers/megatechtrackers/public/js
    
    # Copy CSS and JS files if they exist in the workspace
    if [ -f "/workspace/apps/megatechtrackers/megatechtrackers/public/css/disable-animations.css" ]; then
        cp /workspace/apps/megatechtrackers/megatechtrackers/public/css/disable-animations.css apps/megatechtrackers/megatechtrackers/public/css/ 2>/dev/null || true
    fi
    
    if [ -f "/workspace/apps/megatechtrackers/megatechtrackers/public/js/disable-animations.js" ]; then
        cp /workspace/apps/megatechtrackers/megatechtrackers/public/js/disable-animations.js apps/megatechtrackers/megatechtrackers/public/js/ 2>/dev/null || true
    fi
    
    # Also copy from docker/frappe directory if available (fallback)
    if [ -f "/home/frappe/disable-animations.css" ]; then
        cp /home/frappe/disable-animations.css apps/megatechtrackers/megatechtrackers/public/css/ 2>/dev/null || true
    fi
    
    if [ -f "/home/frappe/disable-animations.js" ]; then
        cp /home/frappe/disable-animations.js apps/megatechtrackers/megatechtrackers/public/js/ 2>/dev/null || true
    fi
    
    echo "✅ Performance assets setup complete"
fi

# Run Frappe performance optimizations
if [ -f "/home/frappe/optimize-frappe.sh" ]; then
    echo "⚡ Running Frappe performance optimizations..."
    # Run with bash directly (doesn't require execute permission)
    bash /home/frappe/optimize-frappe.sh || echo "⚠️  Optimization script had issues (non-critical)"
fi

# Create test web page for mobile app performance testing
if [ -f "/home/frappe/create_test_webpage.py" ] && [ -d "/home/frappe/frappe-bench/sites/site1.localhost" ]; then
    echo "🌐 Creating test web page for mobile app..."
    # Ensure logs directory exists at ALL possible paths Frappe might look
    mkdir -p /home/frappe/frappe-bench/sites/site1.localhost/logs
    mkdir -p /home/frappe/frappe-bench/site1.localhost/logs  # Frappe sometimes uses wrong path
    mkdir -p /home/frappe/frappe-bench/logs
    mkdir -p /home/frappe/logs
    source env/bin/activate
    cd /home/frappe/frappe-bench
    FRAPPE_SITES_PATH=/home/frappe/frappe-bench/sites python3 /home/frappe/create_test_webpage.py 2>&1 | tail -10 || echo "⚠️  Test web page creation had issues (non-critical)"
fi

# Create test data (companies, departments, vehicles, forms, access control)
if [ -f "/home/frappe/create_test_data.py" ] && [ -d "/home/frappe/frappe-bench/sites/site1.localhost" ]; then
    echo "📦 Creating test data (companies, departments, vehicles, forms, access control)..."
    # Ensure logs directory exists at ALL possible paths Frappe might look
    mkdir -p /home/frappe/frappe-bench/sites/site1.localhost/logs
    mkdir -p /home/frappe/frappe-bench/site1.localhost/logs  # Frappe sometimes uses wrong path
    mkdir -p /home/frappe/frappe-bench/logs
    mkdir -p /home/frappe/logs
    source env/bin/activate
    cd /home/frappe/frappe-bench
    FRAPPE_SITES_PATH=/home/frappe/frappe-bench/sites python3 /home/frappe/create_test_data.py 2>&1 || echo "⚠️  Test data creation had issues (non-critical)"
fi

# Create/Update Procfile (needed for bench start)
# Note: Redis is running in separate container, so we don't start it here
echo "📝 Creating/updating Procfile..."
# Find node path
NODE_PATH=$(which node 2>/dev/null || find /home/frappe/.pyenv -name node -type f 2>/dev/null | head -1 || echo "node")
SITE_NAME="${SITE_NAME:-site1.localhost}"
cat > Procfile << EOF
web: bench --site $SITE_NAME serve --port 8000
socketio: $NODE_PATH apps/frappe/socketio.js --site $SITE_NAME
worker_short: bench --site $SITE_NAME worker --queue short
worker_long: bench --site $SITE_NAME worker --queue long
worker_default: bench --site $SITE_NAME worker --queue default
EOF
echo "✅ Procfile created/updated (Redis runs in separate container, watch removed)"

# Start Frappe
echo "🚀 Starting Frappe..."
exec bench start
