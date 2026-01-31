#!/usr/bin/env python3
"""
Provision Frappe API key/secret for a user (default: Administrator).

Idempotent:
- If a usable key+secret already exist, returns them.
- Otherwise generates new keys and returns them.

This avoids heredoc execution issues from PowerShell (CRLF) by being a real file.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import frappe


def _env(name: str, default: str) -> str:
    v = os.getenv(name)
    return v if v not in (None, "") else default


SITE = _env("FRAPPE_SITE", _env("SITE_NAME", "site1.localhost"))
SITES_PATH = _env("FRAPPE_SITES_PATH", "/home/frappe/frappe-bench/sites")
USER = _env("FRAPPE_KEY_USER", "Administrator")


def _resolve_sites_path(site: str, candidate: str) -> str:
    """
    Frappe needs the correct `sites_path`. If it's wrong, logging paths become invalid
    (e.g. /home/frappe/frappe-bench/<site>/logs instead of .../sites/<site>/logs).
    """
    c = Path(candidate)

    # Preferred layout: <sites_path>/<site>/site_config.json
    if (c / site / "site_config.json").is_file():
        return str(c)

    # Common fallback: candidate is bench root; sites are at <bench>/sites/<site>
    c2 = c / "sites"
    if (c2 / site / "site_config.json").is_file():
        return str(c2)

    return str(c)


def _ensure_site_logs_dir(sites_path: str, site: str) -> None:
    # Must exist before frappe.connect() because logger opens files during connect.
    sp = Path(sites_path)
    Path(sp, site, "logs").mkdir(parents=True, exist_ok=True)

    # Defensive: some misconfigurations make Frappe think sites live under the bench root
    # (e.g. /home/frappe/frappe-bench/<site>/logs). Create that too so connect() can't fail.
    bench_root = sp.parent if sp.name == "sites" else sp
    Path(bench_root, site, "logs").mkdir(parents=True, exist_ok=True)


def _get_existing_secret() -> str | None:
    try:
        from frappe.utils.password import get_decrypted_password

        secret = get_decrypted_password("User", USER, "api_secret")
        return secret or None
    except Exception:
        return None


def main() -> None:
    sites_path = _resolve_sites_path(SITE, SITES_PATH)
    _ensure_site_logs_dir(sites_path, SITE)

    frappe.init(site=SITE, sites_path=sites_path)
    frappe.connect()
    frappe.set_user("Administrator")

    doc = frappe.get_doc("User", USER)
    api_key = getattr(doc, "api_key", None) or None
    api_secret = _get_existing_secret()

    if api_key and api_secret:
        print(json.dumps({"frappe_api_key": api_key, "frappe_api_secret": api_secret}))
        return

    # Ensure API key exists (stored on User)
    if not api_key:
        doc.api_key = frappe.generate_hash(length=15)
        doc.save(ignore_permissions=True)
        api_key = doc.api_key

    # Ensure API secret exists (stored encrypted in auth table)
    if not api_secret:
        from frappe.utils.password import set_encrypted_password

        api_secret = frappe.generate_hash(length=32)
        set_encrypted_password("User", USER, api_secret, fieldname="api_secret")
        frappe.db.commit()

        # Verify we can decrypt it back (guards against silent failures)
        api_secret = _get_existing_secret()

    if not api_key or not api_secret:
        raise SystemExit(f"Failed to provision API key/secret for user: {USER}")

    print(json.dumps({"frappe_api_key": api_key, "frappe_api_secret": api_secret}))


if __name__ == "__main__":
    main()

