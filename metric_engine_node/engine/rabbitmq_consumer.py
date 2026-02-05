"""
RabbitMQ consumer for Metric Engine Node.
Consumes from metrics_queue (same routing as trackdata_queue).
Plan § 2.6: bounded retries (e.g. 3); send to DLQ after max; persist retry count in DB so restarts do not reset.
"""
import asyncio
import hashlib
import json
import logging
from typing import Dict, Any, Optional, Callable, Awaitable

import aio_pika
from aio_pika import ExchangeType

from config import Config
from .circuit_breaker import rabbitmq_circuit_breaker, CircuitBreakerOpenError
from .db import (
    get_message_retry_count,
    increment_message_retry_count,
    clear_message_retry_count,
    is_message_processed,
    mark_message_processed,
)

logger = logging.getLogger(__name__)

# Plan § 2.6: bounded retries for message processing (e.g. 3); send to DLQ after max
MAX_MESSAGE_RETRIES = 3


async def default_message_handler(record: Dict[str, Any]) -> None:
    """Phase 1: Log message only. Later: run calculators and write metric_events/laststatus state."""
    imei = record.get("imei", "?")
    gps_time = record.get("gps_time", "?")
    lat = record.get("latitude")
    lon = record.get("longitude")
    speed = record.get("speed")
    status = record.get("status", "Normal")
    logger.info(
        "metric_engine message: imei=%s gps_time=%s lat=%s lon=%s speed=%s status=%s",
        imei,
        gps_time,
        lat,
        lon,
        speed,
        status,
    )


class MetricEngineConsumer:
    """Consumes from metrics_queue. Phase 1: log only; Phase 2+: run calculators."""

    def __init__(
        self,
        queue_name: str = "metrics_queue",
        handler: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None,
    ):
        self.queue_name = queue_name
        self.handler = handler or default_message_handler
        self.connection: Optional[aio_pika.Connection] = None
        self.channel: Optional[aio_pika.Channel] = None
        self.queue: Optional[aio_pika.Queue] = None
        self._consuming = False
        self._processed = 0
        self._errors = 0
        # Plan § 2.9 graceful shutdown: set when idle, clear when processing; wait for this on shutdown.
        self._message_done_event: asyncio.Event = asyncio.Event()
        self._message_done_event.set()

    async def connect(self, retry: bool = True) -> None:
        """Connect to RabbitMQ and declare metrics_queue."""
        cfg = Config.get_rabbitmq_config()
        host = cfg.get("host", "localhost")
        port = cfg.get("port", 5672)
        vhost = cfg.get("virtual_host", "tracking_gateway")
        username = cfg.get("username", "tracking_user")
        password = cfg.get("password", "tracking_password")
        exchange_name = cfg.get("exchange", "tracking_data_exchange")
        queue_name = cfg.get("queue", self.queue_name)

        url = f"amqp://{username}:{password}@{host}:{port}/{vhost}"

        async def _connect() -> None:
            logger.info("Connecting to RabbitMQ at %s:%s...", host, port)
            self.connection = await aio_pika.connect_robust(url)
            self.channel = await self.connection.channel()
            prefetch = Config.load().get("metric_engine", {}).get("prefetch_count", 50)
            await self.channel.set_qos(prefetch_count=prefetch)

            exchange = await self.channel.declare_exchange(
                exchange_name, ExchangeType.TOPIC, durable=True
            )
            queue_args = {
                "x-message-ttl": 3600000,
                "x-max-length": 1000000,
                "x-dead-letter-exchange": "dlx_tracking_data",
                "x-dead-letter-routing-key": "dlq_metrics",
                "x-queue-mode": "lazy",
            }
            self.queue = await self.channel.declare_queue(
                queue_name, durable=True, arguments=queue_args
            )
            await self.queue.bind(exchange, routing_key="tracking.*.trackdata")
            logger.info("Connected to RabbitMQ, queue=%s, routing_key=tracking.*.trackdata", queue_name)

        if retry:
            delay = 1.0
            while True:
                try:
                    await rabbitmq_circuit_breaker.call(_connect)
                    return
                except asyncio.CancelledError:
                    raise
                except CircuitBreakerOpenError as e:
                    logger.warning("RabbitMQ circuit open: %s; retry in %.1fs", e, delay)
                    await asyncio.sleep(delay)
                    delay = min(delay * 2, 30.0)
                except Exception as e:
                    logger.warning("RabbitMQ connect failed: %s; retry in %.1fs", e, delay)
                    await asyncio.sleep(delay)
                    delay = min(delay * 2, 30.0)
        else:
            await rabbitmq_circuit_breaker.call(_connect)

    def _message_signature(self, body: bytes, record: Optional[Dict[str, Any]] = None) -> str:
        """Stable signature for deduplication (plan § 2.9). Prefer message_id from payload, else body hash."""
        if record is not None:
            mid = record.get("message_id")
            if mid is not None and isinstance(mid, str) and len(mid) <= 128:
                return hashlib.sha256(mid.encode("utf-8")).hexdigest()[:64]
        return hashlib.sha256(body).hexdigest()[:64]

    async def _process_message(self, message: aio_pika.IncomingMessage) -> None:
        """Parse body, call handler, ACK; on failure bounded retries then DLQ (plan § 2.6)."""
        try:
            body = message.body
            body_str = body.decode("utf-8")
            record = json.loads(body_str)
        except Exception as e:
            logger.warning("Failed to parse message: %s", e)
            await message.nack(requeue=False)
            self._errors += 1
            return

        signature = self._message_signature(body, record)

        # Plan § 2.9: idempotency — skip if already successfully processed
        try:
            if await is_message_processed(signature):
                await message.ack()
                return
        except Exception as e:
            logger.debug("is_message_processed check failed: %s; continuing", e)

        self._message_done_event.clear()
        try:
            await self.handler(record)
            await clear_message_retry_count(signature)
            await mark_message_processed(signature)
            await message.ack()
            self._processed += 1
            try:
                from metrics import metric_engine_messages_processed_total
                metric_engine_messages_processed_total.labels(queue=self.queue_name).inc()
            except Exception:
                pass
        except Exception as e:
            self._errors += 1
            logger.warning("Handler error: %s", e, exc_info=True)
            try:
                from metrics import metric_engine_messages_failed_total
                metric_engine_messages_failed_total.labels(queue=self.queue_name).inc()
            except Exception:
                pass
            # Bounded retries: persist count, DLQ after max (plan § 2.6)
            try:
                retry_count = await get_message_retry_count(signature)
                if retry_count >= MAX_MESSAGE_RETRIES - 1:
                    logger.warning(
                        "Message exceeded max retries (%s), sending to DLQ (signature=%s)",
                        MAX_MESSAGE_RETRIES,
                        signature[:16],
                    )
                    await message.nack(requeue=False)
                else:
                    await increment_message_retry_count(signature)
                    await message.nack(requeue=True)
            except Exception as db_err:
                logger.warning("Retry count check failed, requeuing: %s", db_err)
                await message.nack(requeue=True)
        finally:
            self._message_done_event.set()

    async def start_consuming(self) -> None:
        """Consume until _consuming is False."""
        self._consuming = True
        while self._consuming:
            try:
                if not self.connection or self.connection.is_closed:
                    await self.connect(retry=True)
                if not self.queue:
                    await self.connect(retry=False)
                async with self.queue.iterator() as queue_iter:
                    async for message in queue_iter:
                        if not self._consuming:
                            break
                        await self._process_message(message)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("Consume loop error: %s", e)
                await asyncio.sleep(2.0)

    async def disconnect(self) -> None:
        """Stop consuming and close connection."""
        self._consuming = False
        if self.connection:
            try:
                await self.connection.close()
            except Exception as e:
                logger.debug("Error closing connection: %s", e)
            self.connection = None
        self.channel = None
        self.queue = None
        logger.info("Metric engine consumer disconnected; processed=%s errors=%s", self._processed, self._errors)
