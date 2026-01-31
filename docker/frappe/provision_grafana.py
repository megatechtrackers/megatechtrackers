#!/usr/bin/env python3
"""
Provision Grafana (datasource + dashboards) from inside Docker.

Runs with stdlib only (no requests dependency) so it works inside the Frappe image.
Idempotent: safe to run multiple times.
"""

from __future__ import annotations

import base64
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request


def _env(name: str, default: str) -> str:
    v = os.getenv(name)
    return v if v not in (None, "") else default


GRAFANA_URL = _env("GRAFANA_INTERNAL_URL", "http://grafana:3000").rstrip("/")
GRAFANA_USER = _env("GRAFANA_USER", "admin")
GRAFANA_PASSWORD = _env("GRAFANA_PASSWORD", "admin")

MARIADB_HOST = _env("MARIADB_HOST", "mariadb")
MARIADB_PORT = int(_env("MARIADB_PORT", "3306"))
MARIADB_DB = _env("MARIADB_DB", "frappe")
MARIADB_USER = _env("MARIADB_USER", "frappe")
MARIADB_PASSWORD = _env("MARIADB_PASSWORD", "frappe")

FOLDER_TITLE = _env("GRAFANA_FOLDER_TITLE", "Megatechtrackers")
DATASOURCE_NAME = _env("GRAFANA_DATASOURCE_NAME", "Frappe MariaDB")


def _basic_auth_header(user: str, password: str) -> str:
    token = base64.b64encode(f"{user}:{password}".encode("utf-8")).decode("ascii")
    return f"Basic {token}"


def _http_json(method: str, url: str, payload: dict | None = None) -> tuple[int, dict | list | str]:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": _basic_auth_header(GRAFANA_USER, GRAFANA_PASSWORD),
    }
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url=url, method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            status = resp.getcode()
            body = resp.read().decode("utf-8", errors="replace").strip()
            if not body:
                return status, ""
            try:
                return status, json.loads(body)
            except Exception:
                return status, body
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def wait_for_grafana(timeout_sec: int = 180) -> None:
    deadline = time.time() + timeout_sec
    last_err = None
    while time.time() < deadline:
        try:
            code, _ = _http_json("GET", f"{GRAFANA_URL}/api/health")
            if code == 200:
                return
        except Exception as e:
            last_err = e
        time.sleep(2)
    raise RuntimeError(f"Grafana not ready at {GRAFANA_URL} (last error: {last_err})")


def ensure_folder(title: str) -> str:
    # Search existing folders by title
    q = urllib.parse.quote(title)
    code, data = _http_json("GET", f"{GRAFANA_URL}/api/search?type=dash-folder&query={q}&limit=50")
    if code == 200 and isinstance(data, list):
        for item in data:
            if item.get("title") == title and item.get("uid"):
                return item["uid"]

    # Create
    code, data = _http_json("POST", f"{GRAFANA_URL}/api/folders", {"title": title})
    if code in (200, 201) and isinstance(data, dict) and data.get("uid"):
        return data["uid"]
    raise RuntimeError(f"Failed to ensure Grafana folder '{title}': {code} {data}")


def ensure_mysql_datasource(name: str) -> str:
    # Try existing by name
    code, data = _http_json("GET", f"{GRAFANA_URL}/api/datasources/name/{urllib.parse.quote(name)}")
    if code == 200 and isinstance(data, dict):
        ds_id = data.get("id")
        ds_uid = data.get("uid") or data.get("datasource", {}).get("uid")
        if ds_id and ds_uid:
            # Update to expected config (idempotent)
            update_payload = {
                "id": ds_id,
                "uid": ds_uid,
                "name": name,
                "type": "mysql",
                "access": "proxy",
                "url": f"{MARIADB_HOST}:{MARIADB_PORT}",
                "user": MARIADB_USER,
                "isDefault": True,
                "jsonData": {
                    "database": MARIADB_DB,
                    "maxOpenConns": 100,
                    "maxIdleConns": 100,
                    "connMaxLifetime": 14400,
                },
                "secureJsonData": {"password": MARIADB_PASSWORD},
                "version": data.get("version", 1),
            }
            _http_json("PUT", f"{GRAFANA_URL}/api/datasources/{ds_id}", update_payload)
            return ds_uid

    # Create new
    payload = {
        "name": name,
        "type": "mysql",
        "access": "proxy",
        "url": f"{MARIADB_HOST}:{MARIADB_PORT}",
        "user": MARIADB_USER,
        "isDefault": True,
        "jsonData": {
            "database": MARIADB_DB,
            "maxOpenConns": 100,
            "maxIdleConns": 100,
            "connMaxLifetime": 14400,
        },
        "secureJsonData": {"password": MARIADB_PASSWORD},
    }
    code, data = _http_json("POST", f"{GRAFANA_URL}/api/datasources", payload)
    if code == 200 and isinstance(data, dict):
        ds = data.get("datasource", data)
        ds_uid = ds.get("uid")
        if ds_uid:
            return ds_uid
    raise RuntimeError(f"Failed to create Grafana datasource '{name}': {code} {data}")


def upsert_dashboard(*, folder_uid: str, datasource_uid: str, title: str, uid: str, panels: list[dict]) -> None:
    dashboard = {
        "dashboard": {
            "uid": uid,
            "title": title,
            "tags": ["fleet"],
            "timezone": "browser",
            "schemaVersion": 38,
            "version": 0,
            "refresh": "30s",
            "time": {"from": "now-7d", "to": "now"},
            "panels": panels,
        },
        "folderUid": folder_uid,
        "overwrite": True,
    }
    code, data = _http_json("POST", f"{GRAFANA_URL}/api/dashboards/db", dashboard)
    if code != 200:
        raise RuntimeError(f"Failed to upsert dashboard '{title}': {code} {data}")


def build_stat_panel(*, panel_id: int, title: str, x: int, y: int, w: int, h: int, datasource_uid: str, raw_sql: str) -> dict:
    return {
        "id": panel_id,
        "type": "stat",
        "title": title,
        "gridPos": {"x": x, "y": y, "w": w, "h": h},
        "datasource": {"uid": datasource_uid, "type": "mysql"},
        "targets": [
            {
                "refId": "A",
                "format": "table",
                "datasource": {"uid": datasource_uid, "type": "mysql"},
                "rawSql": raw_sql,
            }
        ],
        "options": {
            "reduceOptions": {"values": False, "calcs": ["lastNotNull"], "fields": ""},
            "orientation": "auto",
            "textMode": "auto",
        },
        "fieldConfig": {
            "defaults": {
                "unit": "short",
                "thresholds": {"mode": "absolute", "steps": [{"value": None, "color": "green"}]},
            },
            "overrides": [],
        },
    }


def main() -> None:
    print(f"[*] Provisioning Grafana at {GRAFANA_URL}")
    wait_for_grafana()

    folder_uid = ensure_folder(FOLDER_TITLE)
    print(f"[+] Grafana folder ensured: {FOLDER_TITLE} (uid={folder_uid})")

    datasource_uid = ensure_mysql_datasource(DATASOURCE_NAME)
    print(f"[+] Grafana datasource ensured: {DATASOURCE_NAME} (uid={datasource_uid})")

    # Dashboard: Overview
    overview_panels = [
        build_stat_panel(
            panel_id=1,
            title="Access Control Records",
            x=0,
            y=0,
            w=6,
            h=4,
            datasource_uid=datasource_uid,
            raw_sql="SELECT COUNT(*) as value FROM `tabMegatechtrackers Access Control` WHERE docstatus != 2",
        ),
        build_stat_panel(
            panel_id=2,
            title="Companies",
            x=6,
            y=0,
            w=6,
            h=4,
            datasource_uid=datasource_uid,
            raw_sql="SELECT COUNT(*) as value FROM `tabAC Company` WHERE docstatus != 2",
        ),
        build_stat_panel(
            panel_id=3,
            title="Departments",
            x=12,
            y=0,
            w=6,
            h=4,
            datasource_uid=datasource_uid,
            raw_sql="SELECT COUNT(*) as value FROM `tabAC Department` WHERE docstatus != 2",
        ),
        build_stat_panel(
            panel_id=4,
            title="Vehicles",
            x=18,
            y=0,
            w=6,
            h=4,
            datasource_uid=datasource_uid,
            raw_sql="SELECT COUNT(*) as value FROM `tabAC Vehicle` WHERE docstatus != 2",
        ),
    ]
    upsert_dashboard(
        folder_uid=folder_uid,
        datasource_uid=datasource_uid,
        title="Megatechtrackers - Overview",
        uid="mt-overview",
        panels=overview_panels,
    )
    print("[+] Dashboard upserted: Megatechtrackers - Overview (uid=mt-overview)")

    # Dashboard: Assignments
    assignment_panels = [
        build_stat_panel(
            panel_id=1,
            title="Assigned Forms (rows)",
            x=0,
            y=0,
            w=8,
            h=4,
            datasource_uid=datasource_uid,
            raw_sql="SELECT COUNT(*) as value FROM `tabAC Frappe Form Assignment` WHERE parenttype='Megatechtrackers Access Control'",
        ),
        build_stat_panel(
            panel_id=2,
            title="Assigned Reports (rows)",
            x=8,
            y=0,
            w=8,
            h=4,
            datasource_uid=datasource_uid,
            raw_sql="SELECT COUNT(*) as value FROM `tabAC Grafana Report Assignment` WHERE parenttype='Megatechtrackers Access Control'",
        ),
        build_stat_panel(
            panel_id=3,
            title="Report Masters",
            x=16,
            y=0,
            w=8,
            h=4,
            datasource_uid=datasource_uid,
            raw_sql="SELECT COUNT(*) as value FROM `tabAC Grafana Report` WHERE docstatus != 2",
        ),
    ]
    upsert_dashboard(
        folder_uid=folder_uid,
        datasource_uid=datasource_uid,
        title="Megatechtrackers - Assignments",
        uid="mt-assignments",
        panels=assignment_panels,
    )
    print("[+] Dashboard upserted: Megatechtrackers - Assignments (uid=mt-assignments)")

    print("[+] Grafana provisioning complete.")


if __name__ == "__main__":
    main()

