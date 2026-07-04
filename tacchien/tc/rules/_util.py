"""Tiện ích dùng chung cho rule."""

from __future__ import annotations

import datetime


def to_seconds(value) -> int | None:
    """Chuẩn hoá Time (timedelta của Frappe) / time / 'HH:MM' về số giây trong ngày."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime.timedelta):
        return int(value.total_seconds())
    if isinstance(value, datetime.time):
        return value.hour * 3600 + value.minute * 60 + value.second
    if isinstance(value, str):
        parts = value.split(":")
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
        s = int(parts[2]) if len(parts) > 2 else 0
        return h * 3600 + m * 60 + s
    return None
