"""
Publish metric_events to alarm_exchange for Alarm Service (plan Phase 8).
Respects metrics_alarm_config per IMEI/event_type (enabled, is_alarm).
Non-blocking; failures logged but do not fail pipeline.
Circuit breaker wraps connection and publish (plan § 2.9).
"""
import asyncio
import json
import logging
from typing import Any, Dict, List, Optional

import aio_pika

from .circuit_breaker import rabbitmq_circuit_breaker
from .db import get_metrics_alarm_config_for_events

logger = logging.getLogger(__name__)

_connection = None
_channel = None
_exchange = None
_lock = asyncio.Lock()
_initialized = False


async def _ensure_connection() -> bool:
    global _connection, _channel, _exchange, _initialized
    if _exchange is not None:
        return True
    async with _lock:
        if _exchange is not None:
            return True
        try:
            from config import Config
            from aio_pika import ExchangeType
            cfg = Config.get_rabbitmq_config()
            host = cfg.get("host", "localhost")
            port = cfg.get("port", 5672)
            vhost = cfg.get("virtual_host", "tracking_gateway")
            username = cfg.get("username", "tracking_user")
            password = cfg.get("password", "tracking_password")
            url = f"amqp://{username}:{password}@{host}:{port}/{vhost}"
            _connection = await aio_pika.connect_robust(url)
            _channel = await _connection.channel()
            _exchange = await _channel.declare_exchange(
                "alarm_exchange",
                ExchangeType.TOPIC,
                durable=True,
            )
            _initialized = True
            logger.info("Alarm publisher (alarm_exchange) initialized")
            return True
        except Exception as e:
            logger.warning("Alarm publisher init failed: %s", e)
            _initialized = True
            return False


def _should_publish_alarm(ev: Dict[str, Any], config_map: Dict[tuple, Dict[str, Any]]) -> bool:
    """Plan Phase 8: only publish if no config (default) or config.enabled and config.is_alarm."""
    imei = ev.get("imei")
    etype = ev.get("event_type")
    if imei is None or not etype:
        return True
    k = (int(imei), str(etype))
    cfg = config_map.get(k)
    if cfg is None:
        return True  # no config = default publish
    return bool(cfg.get("enabled", True)) and int(cfg.get("is_alarm", 1)) != 0


async def _publish_metric_events_impl(events: List[Dict[str, Any]]) -> None:
    """Inner: ensure connection; filter by metrics_alarm_config; publish allowed events (one breaker call)."""
    if not await _ensure_connection():
        return
    config_map = await get_metrics_alarm_config_for_events(events)
    for ev in events:
        if not _should_publish_alarm(ev, config_map):
            continue
        payload = {
            "imei": ev.get("imei"),
            "gps_time": ev.get("gps_time").isoformat() if hasattr(ev.get("gps_time"), "isoformat") else str(ev.get("gps_time")),
            "latitude": ev.get("latitude"),
            "longitude": ev.get("longitude"),
            "status": ev.get("event_type", ""),
            "event_category": ev.get("event_category"),
            "event_type": ev.get("event_type"),
            "event_value": ev.get("event_value"),
            "threshold_value": ev.get("threshold_value"),
            "severity": ev.get("severity"),
            "source": "metric_engine",
        }
        await _exchange.publish(
            aio_pika.Message(
                body=json.dumps(payload).encode("utf-8"),
                content_type="application/json",
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            ),
            routing_key="alarm.notification",
        )


async def publish_metric_events(events: List[Dict[str, Any]]) -> None:
    """Publish each metric event to alarm_exchange (routing key: alarm.notification). Non-blocking."""
    if not events:
        return
    try:
        await rabbitmq_circuit_breaker.call(_publish_metric_events_impl, events)
    except Exception as e:
        logger.warning("Failed to publish metric event to alarm_exchange: %s", e)


async def close() -> None:
    global _connection, _channel, _exchange
    async with _lock:
        if _connection:
            try:
                await _connection.close()
            except Exception as e:
                logger.debug("Alarm publisher close: %s", e)
            _connection = None
        _channel = None
        _exchange = None
