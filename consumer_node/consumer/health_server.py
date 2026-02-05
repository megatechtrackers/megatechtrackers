"""
Health and readiness endpoints for Consumer (plan § 12.6).
Serves /health (liveness) and /health/ready (readiness: DB + RabbitMQ).
Runs in a daemon thread so asyncio main loop is not blocked.
"""
import json
import logging
import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Optional

from prometheus_client import REGISTRY, generate_latest, CONTENT_TYPE_LATEST

logger = logging.getLogger(__name__)

# Readiness state (set by run.py after init_orm and connect)
_db_ready = False
_rabbitmq_ready = False
_server = None
_thread = None


def set_db_ready(ready: bool) -> None:
    global _db_ready
    _db_ready = ready


def set_rabbitmq_ready(ready: bool) -> None:
    global _rabbitmq_ready
    _rabbitmq_ready = ready


def is_ready() -> bool:
    return _db_ready and _rabbitmq_ready


class _HealthHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        logger.debug("%s - - [%s] %s", self.address_string(), self.log_date_time_string(), format % args)

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "service": "consumer_node"}).encode())
            return
        if self.path == "/health/ready":
            ready = is_ready()
            self.send_response(200 if ready else 503)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            body = {"status": "ok" if ready else "degraded", "db": _db_ready, "rabbitmq": _rabbitmq_ready}
            self.wfile.write(json.dumps(body).encode())
            return
        if self.path == "/metrics":
            self.send_response(200)
            self.send_header("Content-Type", CONTENT_TYPE_LATEST)
            self.end_headers()
            try:
                self.wfile.write(generate_latest(REGISTRY))
            except Exception as e:
                logger.debug("generate_latest failed: %s", e)
                self.wfile.write(b"")
            return
        self.send_response(404)
        self.end_headers()

    def do_HEAD(self):
        if self.path in ("/health", "/health/ready", "/metrics"):
            self.send_response(200 if self.path != "/health/ready" or is_ready() else 503)
        else:
            self.send_response(404)
        self.end_headers()


def _run_server(port: int):
    global _server
    try:
        _server = HTTPServer(("0.0.0.0", port), _HealthHandler)
        logger.info("Health server started on port %s (GET /health, /health/ready, /metrics)", port)
        _server.serve_forever()
    except Exception as e:
        logger.warning("Health server error: %s", e)


def start_health_server(port: Optional[int] = None) -> None:
    """Start health/ready/metrics server in a daemon thread. Port defaults to CONSUMER_METRICS_PORT or 9090."""
    global _thread
    if _thread is not None and _thread.is_alive():
        return
    p = port if port is not None else int(os.environ.get("CONSUMER_METRICS_PORT", "9090"))
    _thread = threading.Thread(target=_run_server, args=(p,), daemon=True)
    _thread.start()


def stop_health_server() -> None:
    """Stop the health server (e.g. on shutdown)."""
    global _server
    if _server is not None:
        try:
            _server.shutdown()
        except Exception as e:
            logger.debug("Health server shutdown: %s", e)
        _server = None
