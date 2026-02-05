"""
Publish invalid/partial records to invalid_data_queue (plan § 2.6, Appendix A).
Non-blocking; failures logged but do not fail pipeline.
"""
import asyncio
import json
import logging
from typing import Any, Dict

import aio_pika

logger = logging.getLogger(__name__)

_connection = None
_channel = None
_queue_name = "invalid_data_queue"
_lock = asyncio.Lock()
_initialized = False


async def _ensure_channel() -> bool:
    global _connection, _channel, _initialized
    if _channel is not None:
        return True
    async with _lock:
        if _channel is not None:
            return True
        try:
            from config import Config
            cfg = Config.get_rabbitmq_config()
            host = cfg.get("host", "localhost")
            port = cfg.get("port", 5672)
            vhost = cfg.get("virtual_host", "tracking_gateway")
            username = cfg.get("username", "tracking_user")
            password = cfg.get("password", "tracking_password")
            url = f"amqp://{username}:{password}@{host}:{port}/{vhost}"
            _connection = await aio_pika.connect_robust(url)
            _channel = await _connection.channel()
            await _channel.declare_queue(_queue_name, durable=True)
            _initialized = True
            logger.info("Invalid data publisher (invalid_data_queue) initialized")
            return True
        except Exception as e:
            logger.warning("Invalid data publisher init failed: %s", e)
            _initialized = True
            return False


async def publish_invalid_data(record: Dict[str, Any], reason: str) -> None:
    """
    Publish a record that failed validation to invalid_data_queue (plan § 2.6).
    Does not raise; logs on failure.
    """
    if not await _ensure_channel():
        return
    try:
        payload = json.dumps({"record": record, "reason": reason}).encode("utf-8")
        await _channel.default_exchange.publish(
            aio_pika.Message(body=payload, delivery_mode=aio_pika.DeliveryMode.PERSISTENT),
            routing_key=_queue_name,
        )
        logger.debug("Published invalid record to invalid_data_queue: reason=%s", reason)
    except Exception as e:
        logger.warning("publish_invalid_data failed: %s", e)
