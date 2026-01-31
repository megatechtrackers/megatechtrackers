#!/usr/bin/env python3
"""
Sync Grafana dashboards -> Frappe "AC Grafana Report" master + assign to Administrator.

This makes dashboards show up in Web App / Mobile App via the megatechtrackers permission APIs.
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

import frappe


def _env(name: str, default: str) -> str:
    v = os.getenv(name)
    return v if v not in (None, "") else default


SITE = _env("FRAPPE_SITE", "site1.localhost")
FRAPPE_USER = _env("FRAPPE_SEED_USER", "Administrator")
SITES_PATH = _env("FRAPPE_SITES_PATH", "/home/frappe/frappe-bench/sites")

GRAFANA_URL = _env("GRAFANA_INTERNAL_URL", "http://grafana:3000").rstrip("/")
GRAFANA_USER = _env("GRAFANA_USER", "admin")
GRAFANA_PASSWORD = _env("GRAFANA_PASSWORD", "admin")
# Set to empty string or "all" to sync ALL dashboards
GRAFANA_TAG = _env("GRAFANA_DASHBOARD_TAG", "all")


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
    while time.time() < deadline:
        code, _ = _http_json("GET", f"{GRAFANA_URL}/api/health")
        if code == 200:
            return
        time.sleep(2)
    raise RuntimeError(f"Grafana not ready at {GRAFANA_URL}")


def fetch_dashboards() -> list[dict]:
    # Build query - if tag is "all" or empty, don't filter by tag
    params = {
        "type": "dash-db",
        "limit": 500,
    }
    if GRAFANA_TAG and GRAFANA_TAG.lower() != "all":
        params["tag"] = GRAFANA_TAG
    
    query = urllib.parse.urlencode(params)
    code, data = _http_json("GET", f"{GRAFANA_URL}/api/search?{query}")
    if code != 200 or not isinstance(data, list):
        raise RuntimeError(f"Failed to fetch dashboards from Grafana: {code} {data}")
    # Expected items include: id, uid, title, url
    return [d for d in data if d.get("id") and d.get("uid") and d.get("title")]


def ensure_access_control(user: str) -> "frappe.model.document.Document":
    name = frappe.db.get_value("Megatechtrackers Access Control", {"ac_user": user}, "name")
    if name:
        return frappe.get_doc("Megatechtrackers Access Control", name)
    doc = frappe.get_doc({"doctype": "Megatechtrackers Access Control", "ac_user": user, "ac_user_type": "Internal"})
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return doc


def _get_unique_report_name(report_title: str, report_uid: str, current_doc_name: str | None = None) -> str:
    """
    Return a unique report name. If the title already exists for a different record,
    append the UID to disambiguate.
    """
    # Check if title already exists for a DIFFERENT record
    existing_with_same_title = frappe.db.get_value(
        "AC Grafana Report",
        {"ac_grafana_report_name": report_title},
        "name"
    )
    
    # If no conflict, or it's the same document, use the original title
    if not existing_with_same_title or existing_with_same_title == current_doc_name:
        return report_title
    
    # Conflict exists - append UID to make it unique
    unique_name = f"{report_title} ({report_uid})"
    print(f"    [!] Title conflict: '{report_title}' already exists, using '{unique_name}'")
    return unique_name


def upsert_report_master(*, report_id: int, report_uid: str, report_title: str) -> str:
    existing = frappe.db.get_value("AC Grafana Report", {"ac_report_id": int(report_id)}, "name")
    if existing:
        doc = frappe.get_doc("AC Grafana Report", existing)
        changed = False
        
        # Get unique name (handles title conflicts with other records)
        unique_title = _get_unique_report_name(report_title, report_uid, doc.name)
        
        if doc.ac_grafana_report_name != unique_title:
            doc.ac_grafana_report_name = unique_title
            changed = True
        if doc.ac_report_uid != report_uid:
            doc.ac_report_uid = report_uid
            changed = True
        if doc.ac_is_active is None or int(doc.ac_is_active) != 1:
            doc.ac_is_active = 1
            changed = True
        if changed:
            doc.save(ignore_permissions=True)
            frappe.db.commit()
        return doc.name

    # Create - get unique name first
    unique_title = _get_unique_report_name(report_title, report_uid, None)
    
    doc = frappe.get_doc(
        {
            "doctype": "AC Grafana Report",
            "ac_grafana_report_name": unique_title,
            "ac_report_id": int(report_id),
            "ac_report_uid": report_uid,
            "ac_is_active": 1,
        }
    )
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return doc.name


def assign_report(access_control, report_name: str) -> bool:
    # access_control.ac_assigned_reports is child table AC Grafana Report Assignment
    for row in access_control.get("ac_assigned_reports") or []:
        if row.ac_report == report_name:
            return False
    access_control.append(
        "ac_assigned_reports",
        {
            "ac_report": report_name,
            "ac_context_vehicles": "",
            "ac_context_companies": "",
            "ac_context_departments": "",
            "ac_inherited": 0,
        },
    )
    return True


def main() -> None:
    print(f"[*] Syncing Grafana dashboards -> Frappe reports (site={SITE})")
    wait_for_grafana()

    # Explicit sites_path for reliable container execution
    frappe.init(site=SITE, sites_path=SITES_PATH)
    frappe.connect()
    frappe.set_user(FRAPPE_USER)

    dashboards = fetch_dashboards()
    tag_info = "ALL dashboards" if (not GRAFANA_TAG or GRAFANA_TAG.lower() == "all") else f"tag '{GRAFANA_TAG}'"
    print(f"[+] Found {len(dashboards)} Grafana dashboards ({tag_info})")

    ac = ensure_access_control(FRAPPE_USER)

    created_or_updated = 0
    assigned = 0
    for d in dashboards:
        rid = int(d["id"])
        ruid = str(d["uid"])
        title = str(d["title"])
        report_name = upsert_report_master(report_id=rid, report_uid=ruid, report_title=title)
        created_or_updated += 1
        if assign_report(ac, report_name):
            assigned += 1

    if assigned:
        ac.save(ignore_permissions=True)
        frappe.db.commit()

    print(f"[+] Synced {created_or_updated} report masters; assigned {assigned} to {FRAPPE_USER}")


if __name__ == "__main__":
    main()

