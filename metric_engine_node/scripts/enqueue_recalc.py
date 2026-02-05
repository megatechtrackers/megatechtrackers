#!/usr/bin/env python3
"""
Manual recalculation tooling (Phase 9).
Enqueue RECALC_VIOLATIONS, REFRESH_VIEW, or REFRESH_VIEWS jobs into recalculation_queue.

Usage (from metric_engine_node directory or with PYTHONPATH):
  python scripts/enqueue_recalc.py --job-type REFRESH_VIEWS --reason all
  python scripts/enqueue_recalc.py --job-type RECALC_VIOLATIONS --scope-imei 123456789
  python scripts/enqueue_recalc.py --job-type RECALC_VIOLATIONS --scope-client-id 1 --scope-date-from 2025-01-01
  python scripts/enqueue_recalc.py --job-type REFRESH_VIEW --reason mv_daily_violations
"""
import argparse
import asyncio
import os
import sys
from datetime import datetime
from typing import Optional

# Allow importing config and engine when run from repo root or metric_engine_node
_metric_engine_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _metric_engine_root not in sys.path:
    sys.path.insert(0, _metric_engine_root)


async def enqueue(
    job_type: str,
    trigger_type: str = "MANUAL",
    scope_imei: Optional[int] = None,
    scope_client_id: Optional[int] = None,
    scope_date_from: Optional[str] = None,
    scope_date_to: Optional[str] = None,
    reason: Optional[str] = None,
    priority: int = 2,
) -> int:
    """Insert one job into recalculation_queue; return job id."""
    import asyncpg
    from config import Config

    db = Config.get_database_config()
    conn = await asyncpg.connect(
        host=db.get("host", "localhost"),
        port=int(db.get("port", 5432)),
        database=db.get("name", "megatechtrackers"),
        user=db.get("user", "postgres"),
        password=db.get("password", ""),
        statement_cache_size=0,  # Required for pgbouncer transaction pooling
        server_settings={"application_name": "megatechtrackers_metric_engine_enqueue", "timezone": "UTC"},
    )
    try:
        row = await conn.fetchrow(
            """
            INSERT INTO recalculation_queue
            (job_type, trigger_type, status, priority, reason, scope_imei, scope_client_id, scope_date_from, scope_date_to)
            VALUES ($1, $2, 'PENDING', $3, $4, $5, $6, $7::date, $8::date)
            RETURNING id
            """,
            job_type,
            trigger_type,
            priority,
            reason or None,
            scope_imei,
            scope_client_id,
            scope_date_from if scope_date_from else None,
            scope_date_to if scope_date_to else None,
        )
        return int(row["id"])
    finally:
        await conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Enqueue a recalculation job (Phase 9 recalculation tooling)."
    )
    parser.add_argument(
        "--job-type",
        required=True,
        choices=["RECALC_VIOLATIONS", "REFRESH_VIEW", "REFRESH_VIEWS"],
        help="Job type: RECALC_VIOLATIONS, REFRESH_VIEW (single view), REFRESH_VIEWS (all scoring MVs)",
    )
    parser.add_argument(
        "--trigger",
        type=str,
        default="MANUAL",
        choices=["MANUAL", "FORMULA_CHANGE"],
        help="Trigger type (plan § 9.3: FORMULA_CHANGE for formula-version–driven recalc)",
    )
    parser.add_argument("--scope-imei", type=int, default=None, help="Limit recalculation to this IMEI")
    parser.add_argument("--scope-client-id", type=int, default=None, help="Limit recalculation to this client_id")
    parser.add_argument("--scope-date-from", type=str, default=None, help="Date from (YYYY-MM-DD) for RECALC_VIOLATIONS")
    parser.add_argument("--scope-date-to", type=str, default=None, help="Date to (YYYY-MM-DD) for RECALC_VIOLATIONS")
    parser.add_argument(
        "--reason",
        type=str,
        default=None,
        help="For REFRESH_VIEW: view name (e.g. mv_daily_violations). For REFRESH_VIEWS: 'all' or comma-separated list",
    )
    parser.add_argument("--priority", type=int, default=2, help="Queue priority (lower = higher priority, default 2)")
    args = parser.parse_args()

    if args.job_type == "REFRESH_VIEW" and not args.reason:
        parser.error("--reason is required for REFRESH_VIEW (view name)")
    if args.job_type == "REFRESH_VIEWS" and not args.reason:
        args.reason = "all"
    if args.trigger == "FORMULA_CHANGE" and args.job_type != "RECALC_VIOLATIONS":
        parser.error("--trigger FORMULA_CHANGE is only valid with --job-type RECALC_VIOLATIONS")
    if args.trigger == "FORMULA_CHANGE" and not args.reason:
        args.reason = "formula:all"

    job_id = asyncio.run(
        enqueue(
            job_type=args.job_type,
            trigger_type=args.trigger,
            scope_imei=args.scope_imei,
            scope_client_id=args.scope_client_id,
            scope_date_from=args.scope_date_from,
            scope_date_to=args.scope_date_to,
            reason=args.reason,
            priority=args.priority,
        )
    )
    print(f"Enqueued job id={job_id} job_type={args.job_type}")


if __name__ == "__main__":
    main()
