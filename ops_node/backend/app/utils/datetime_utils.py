"""Datetime helpers for PostgreSQL and API responses.
- Bind naive UTC for TIMESTAMP WITHOUT TIME ZONE (asyncpg).
- Serialize API datetimes as UTC with Z so clients interpret as UTC."""
from datetime import datetime, timezone


def to_naive_utc(dt: datetime) -> datetime:
    """Convert to naive UTC for binding to TIMESTAMP WITHOUT TIME ZONE."""
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def serialize_datetime_utc(v: datetime) -> str:
    """Serialize datetime for API JSON: always UTC with Z (ISO 8601)."""
    if v.tzinfo is None:
        return v.isoformat() + "Z"
    return v.astimezone(timezone.utc).replace(tzinfo=None).isoformat() + "Z"
