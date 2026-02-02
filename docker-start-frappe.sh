#!/bin/bash
set -e

echo "Starting Megatechtrackers Docker Environment"
echo "============================================"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed. Please install Docker first."
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "ERROR: Docker is not running. Please start Docker first."
    exit 1
fi

echo "Building and starting Docker containers..."
echo "   (Starting full stack with frappe profile)"

docker compose --profile frappe up --build -d

# --- Auto-provision keys (Grafana + Frappe) ---

set_dotenv() {
  # usage: set_dotenv NAME VALUE
  local name="$1"
  local value="$2"
  local file=".env"

  if [ -f "$file" ] && grep -qE "^${name}=" "$file"; then
    # Replace existing
    sed -i "s|^${name}=.*|${name}=${value}|" "$file"
  else
    # Append
    printf "%s=%s\n" "$name" "$value" >> "$file"
  fi
}

wait_http_ok() {
  local url="$1"
  local timeout="${2:-300}"
  local start
  start="$(date +%s)"
  printf "   Waiting for %s ..." "$url"
  while true; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo " OK"
      return 0
    fi
    if [ "$(( $(date +%s) - start ))" -ge "$timeout" ]; then
      echo " TIMEOUT"
      return 1
    fi
    printf "."
    sleep 3
  done
}

wait_frappe_app_installed() {
  local timeout="${1:-600}"
  local start
  start="$(date +%s)"
  printf "   Waiting for megatechtrackers app to be installed ..."
  while true; do
    if docker exec frappe bash -lc "cd /home/frappe/frappe-bench && bench --site site1.localhost list-apps" 2>/dev/null | grep -qE 'megatechtrackers'; then
      echo " OK"
      return 0
    fi
    if [ "$(( $(date +%s) - start ))" -ge "$timeout" ]; then
      echo " TIMEOUT"
      return 1
    fi
    printf "."
    sleep 5
  done
}

# Ensure local dev CORS origins are configured for Access Gateway and Frappe (idempotent)
merge_origins() {
  # usage: merge_origins "csv,of,origins" "origin1" "origin2" ...
  local existing="$1"; shift || true
  local all=""
  if [ -n "$existing" ]; then
    all="$existing"
  fi
  for r in "$@"; do
    [ -z "$r" ] && continue
    if [ -z "$all" ]; then
      all="$r"
    else
      # Append if not present as whole token
      if ! printf "%s" "$all" | tr ',' '\n' | awk '{$1=$1}1' | grep -Fxq "$r"; then
        all="${all},${r}"
      fi
    fi
  done
  # Normalize: one per line -> unique -> csv
  printf "%s" "$all" | tr ',' '\n' | awk '{$1=$1}1' | grep -v '^$' | sort -u | paste -sd ',' -
}

echo ""
echo "Waiting for services to be ready..."
if wait_http_ok "http://localhost:3000/api/health" 300 && wait_http_ok "http://localhost:8000/api/method/ping" 600; then
  if ! wait_frappe_app_installed 600; then
    echo "WARNING: Timed out waiting for megatechtrackers app install; skipping key provisioning/tests."
  fi

  # --- CORS defaults (idempotent) ---
  # access-gateway supports wildcard patterns like http://localhost:* (implemented in code).
  # This avoids chasing changing Expo web ports (19016/19018/etc).
  required_origins=(
    "http://localhost:*"
    "http://127.0.0.1:*"
  )

  existing_allowed=""
  if [ -f .env ]; then
    existing_allowed="$(grep -E '^ALLOWED_ORIGINS=' .env | head -n1 | sed 's/^ALLOWED_ORIGINS=//')"
  fi
  merged_allowed="$(merge_origins "$existing_allowed" "${required_origins[@]}")"
  set_dotenv "ALLOWED_ORIGINS" "$merged_allowed"

  # 1) Grafana API key (only if not already set)
  # Grafana v12+ removed /api/auth/keys; use Service Account token API.
  if [ ! -f .env ] || ! grep -qE '^GRAFANA_API_KEY=.+' .env; then
    sa_name="fleet-service"
    sa_id="$(
      curl -fsS -u admin:admin "http://localhost:3000/api/serviceaccounts/search?name=$(python -c "import urllib.parse; print(urllib.parse.quote('''$sa_name'''))")" \
      | python -c "import sys,json; d=json.load(sys.stdin); sas=d.get('serviceAccounts',[]); print((sas[0].get('id') if sas else '') or '')"
    )"

    if [ -z "$sa_id" ]; then
      sa_id="$(
        curl -fsS -u admin:admin \
          -H 'Content-Type: application/json' \
          -d "{\"name\":\"$sa_name\",\"role\":\"Admin\",\"isDisabled\":false}" \
          http://localhost:3000/api/serviceaccounts \
        | python -c "import sys,json; print(json.load(sys.stdin).get('id',''))"
      )"
    fi

    if [ -n "$sa_id" ]; then
      # Best-effort cleanup of old tokens
      tok_ids="$(
        curl -fsS -u admin:admin "http://localhost:3000/api/serviceaccounts/$sa_id/tokens" \
        | python -c "import sys,json; ts=json.load(sys.stdin); print(' '.join(str(t.get('id')) for t in ts if (t.get('name') or '').startswith('fleet-token')))"
      )"
      for tid in $tok_ids; do
        [ -n "$tid" ] && curl -fsS -u admin:admin -X DELETE "http://localhost:3000/api/serviceaccounts/$sa_id/tokens/$tid" >/dev/null 2>&1 || true
      done

      token_name="fleet-token-$(date +%s)"
      grafana_key="$(
        curl -fsS -u admin:admin \
          -H 'Content-Type: application/json' \
          -d "{\"name\":\"$token_name\",\"secondsToLive\":0}" \
          "http://localhost:3000/api/serviceaccounts/$sa_id/tokens" \
        | python -c "import sys,json; print(json.load(sys.stdin).get('key',''))"
      )"
      if [ -n "$grafana_key" ]; then
        set_dotenv "GRAFANA_API_KEY" "$grafana_key"
        echo "Generated Grafana API key (service account token) and saved to .env"
      fi
    fi
  fi

  # 2) Ensure Frappe API key/secret exist for Administrator and sync them to .env
  # (Do this even if .env has values, to guarantee .env matches Frappe DB.)
  frappe_json="$(docker exec frappe bash -lc "cd /home/frappe/frappe-bench && env FRAPPE_SITE=site1.localhost FRAPPE_SITES_PATH=/home/frappe/frappe-bench/sites env/bin/python /home/frappe/provision_frappe_keys.py")"
  frappe_key="$(printf "%s" "$frappe_json" | python -c "import sys,json; print(json.load(sys.stdin).get('frappe_api_key',''))")"
  frappe_secret="$(printf "%s" "$frappe_json" | python -c "import sys,json; print(json.load(sys.stdin).get('frappe_api_secret',''))")"
  if [ -n "$frappe_key" ] && [ -n "$frappe_secret" ]; then
    set_dotenv "FRAPPE_API_KEY" "$frappe_key"
    set_dotenv "FRAPPE_API_SECRET" "$frappe_secret"
    echo "Frappe API key/secret ensured and synced to .env"
  fi

  # Restart access-gateway to pick up newly written .env
  docker compose --profile frappe up -d --no-deps --force-recreate access-gateway >/dev/null 2>&1 || true

  # Ensure Frappe allow_cors is configured for local dev (any origin)
  docker exec frappe bash -lc "cd /home/frappe/frappe-bench && bench --site site1.localhost set-config allow_cors '*'" >/dev/null 2>&1 || true
  # Ensure Frappe CSP frame-ancestors allows localhost:* so Expo web can embed forms/reports.
  # (CSP header is set by megatechtrackers.utils.http.after_request; this config is optional extra.)
  docker exec frappe bash -lc "cd /home/frappe/frappe-bench && bench --site site1.localhost set-config frame_ancestors 'http://localhost:* https://localhost:* http://127.0.0.1:* https://127.0.0.1:*'" >/dev/null 2>&1 || true
  docker compose --profile frappe restart frappe >/dev/null 2>&1 || true

  # Hard verification (fail fast)
  if [ ! -f .env ] || ! grep -qE '^GRAFANA_API_KEY=.+' .env || ! grep -qE '^FRAPPE_API_KEY=.+' .env || ! grep -qE '^FRAPPE_API_SECRET=.+' .env; then
    echo "ERROR: Key provisioning failed (missing GRAFANA_API_KEY or FRAPPE_API_KEY/FRAPPE_API_SECRET)."
    exit 1
  fi
else
  echo "WARNING: Skipping key auto-provisioning (Grafana/Frappe not ready yet)."
fi

echo ""
echo "Seeding Frappe test data (megatechtrackers)..."
docker exec frappe bash -lc "cd /home/frappe/frappe-bench && env/bin/python /home/frappe/create_test_data.py" || true

echo ""
echo "Provisioning Grafana (datasource + dashboards)..."
docker exec frappe bash -lc "cd /home/frappe/frappe-bench && env/bin/python /home/frappe/provision_grafana.py" || true

echo ""
echo "Syncing Grafana dashboards into Frappe and assigning to Administrator..."
docker exec frappe bash -lc "cd /home/frappe/frappe-bench && env/bin/python /home/frappe/sync_grafana_reports_to_frappe.py" || true

# Smoke tests are optional - skip if service doesn't exist
if docker compose --profile test config --services 2>/dev/null | grep -q "frappe-grafana-query-tests"; then
  echo ""
  echo "Running smoke tests (Grafana query tests)..."
  if docker compose --profile test run --rm frappe-grafana-query-tests; then
    echo "Smoke tests passed."
  else
    echo "WARNING: Smoke tests failed (non-critical)."
  fi
else
  echo ""
  echo "Skipping smoke tests (service not configured)."
fi

echo ""
echo "Waiting for services to be ready..."
sleep 10

echo ""
echo "Service Status:"
docker compose --profile frappe ps

echo ""
echo "Services are starting up."
echo ""
echo "Docker Services:"
echo "   - Frappe:        http://localhost:8000 (Administrator/admin)"
echo "   - Grafana:       http://localhost:3000 (admin/admin)"
echo "   - Access Gateway: http://localhost:3001/health"
echo "   - Next.js:       http://localhost:3002"
echo "   - Docs:          http://localhost:8002"
echo "   - MariaDB:       localhost:3306"
echo "   - Redis:         localhost:6379"
echo ""
echo "IMPORTANT: Frappe Initialization"
echo "   Frappe takes 3-5 minutes to initialize on first startup."
echo "   Check logs: docker compose logs -f frappe"
echo ""
echo "Next Steps:"
echo "   1. Wait for Frappe to be ready (check logs above)"
echo "   2. Keys are auto-generated into .env (Grafana + Frappe)"
echo "   3. Create users in Frappe and assign permissions"
echo "   4. Expo (mobile) is running in Docker (see react-native-app logs)"
echo ""
