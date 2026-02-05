#!/usr/bin/env python3
"""
Production verification script (PRODUCTION_CHECKLIST § 6).
Runs health, readiness, and metrics checks against the metric engine.
Exit 0 if all pass, 1 otherwise.
"""
import argparse
import json
import sys
import urllib.request
import urllib.error


def get(url: str, timeout: float = 5.0) -> tuple[int, bytes]:
    """GET url; return (status_code, body)."""
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read() if e.fp else b""
    except Exception as e:
        print(f"Request failed: {e}", file=sys.stderr)
        return -1, b""


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify metric engine health/ready/metrics (PRODUCTION_CHECKLIST § 6)."
    )
    parser.add_argument(
        "--base-url",
        default="http://localhost:9091",
        help="Base URL of metric engine (default: http://localhost:9091)",
    )
    parser.add_argument(
        "--require-ready",
        action="store_true",
        help="Exit 1 if /health/ready returns 503 (DB or RabbitMQ down)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=5.0,
        help="Request timeout in seconds (default: 5)",
    )
    args = parser.parse_args()
    base = args.base_url.rstrip("/")
    timeout = args.timeout
    failed = False

    # 1. Liveness
    status, body = get(f"{base}/health", timeout=timeout)
    if status != 200:
        print(f"FAIL /health: status={status}", file=sys.stderr)
        failed = True
    else:
        try:
            data = json.loads(body.decode("utf-8"))
            if data.get("status") != "ok" or data.get("service") != "metric_engine_node":
                print(f"FAIL /health: unexpected body {data}", file=sys.stderr)
                failed = True
            else:
                print("OK  /health")
        except Exception as e:
            print(f"FAIL /health: invalid JSON: {e}", file=sys.stderr)
            failed = True

    # 2. Readiness
    status, body = get(f"{base}/health/ready", timeout=timeout)
    if status != 200 and status != 503:
        print(f"FAIL /health/ready: status={status}", file=sys.stderr)
        failed = True
    else:
        try:
            data = json.loads(body.decode("utf-8"))
            ready = data.get("status") == "ok"
            if args.require_ready and not ready:
                print(f"FAIL /health/ready: not ready (db={data.get('db')}, rabbitmq={data.get('rabbitmq')})", file=sys.stderr)
                failed = True
            else:
                print(f"OK  /health/ready (ready={ready})")
        except Exception as e:
            print(f"FAIL /health/ready: invalid JSON: {e}", file=sys.stderr)
            failed = True

    # 3. Metrics
    status, body = get(f"{base}/metrics", timeout=timeout)
    if status != 200:
        print(f"FAIL /metrics: status={status}", file=sys.stderr)
        failed = True
    else:
        text = body.decode("utf-8")
        required = [
            "metric_engine_ready",
            "metric_engine_circuit_breaker_state",
            "metric_engine_messages_processed_total",
        ]
        missing = [r for r in required if r not in text]
        if missing:
            print(f"FAIL /metrics: missing metrics: {missing}", file=sys.stderr)
            failed = True
        else:
            print("OK  /metrics (required metrics present)")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
