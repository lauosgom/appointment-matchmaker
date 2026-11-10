"""Colombia time (UTC-5, no daylight saving) helpers. All instants are stored as UTC."""

from __future__ import annotations

from datetime import datetime, timedelta

OFFSET = timedelta(hours=5)


def _shifted(dt: datetime) -> datetime:
    return dt - OFFSET


def colombia_day_key(dt: datetime) -> str:
    """YYYY-MM-DD in Colombia time."""
    return _shifted(dt).strftime("%Y-%m-%d")


def colombia_year(dt: datetime) -> str:
    return str(_shifted(dt).year)
