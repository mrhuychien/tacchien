"""Dispatcher — MỘT cron mỗi phút chạy các rule đến hạn từ registry TC Rule.

Kỷ luật: mỗi rule chạy trong try/except RIÊNG (một rule lỗi không giết batch);
lỗi ghi last_error + Error Log. Rule schedule='event' KHÔNG do dispatcher chạy
(chúng chạy qua doc_events). Mọi lịch nằm trong TC Rule.params (không hardcode).

Chữ ký hàm rule: fn(params: dict, rule: dict) -> None
"""

from __future__ import annotations

import json

import frappe
from frappe.utils import get_datetime, getdate, now_datetime

_INTERVAL_MIN = {"every_5min": 5, "every_15min": 15, "hourly": 60}

_RULE_FIELDS = [
    "name",
    "rule_code",
    "domain",
    "default_severity",
    "schedule",
    "method_path",
    "params",
    "last_run",
]


def tick():
    """Điểm vào cron `* * * * *`."""
    rules = frappe.get_all(
        "TC Rule",
        filters={"enabled": 1, "schedule": ["!=", "event"]},
        fields=_RULE_FIELDS,
    )
    now = now_datetime()
    for rule in rules:
        try:
            if _is_due(rule, now):
                _run_rule(rule, now)
        except Exception:
            _mark_error(rule)

    # Digest hằng ngày dùng chung heartbeat này (guard 1 lần/ngày ở trong).
    try:
        from tacchien.tc.notify.digest import maybe_send_digest

        maybe_send_digest(now)
    except Exception:
        frappe.log_error(frappe.get_traceback(), "tacchien digest")


def parse_params(rule) -> dict:
    raw = rule.get("params")
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return {}


def _is_due(rule, now) -> bool:
    last = get_datetime(rule.last_run) if rule.get("last_run") else None
    sched = rule.get("schedule")

    if sched in _INTERVAL_MIN:
        if not last:
            return True
        # -1s để tránh lệch phút do jitter cron
        return (now - last).total_seconds() >= _INTERVAL_MIN[sched] * 60 - 1

    if sched == "daily":
        params = parse_params(rule)
        run_hour = int(params.get("run_hour", 0))
        run_minute = int(params.get("run_minute", 0))
        if (now.hour, now.minute) < (run_hour, run_minute):
            return False
        # Đã chạy trong ngày hôm nay rồi thì thôi.
        if last and getdate(last) == getdate(now):
            return False
        return True

    return False


def _run_rule(rule, now):
    fn = frappe.get_attr(rule.method_path)
    fn(parse_params(rule), rule)
    frappe.db.set_value(
        "TC Rule",
        rule.name,
        {"last_run": now, "last_error": ""},
        update_modified=False,
    )
    frappe.db.commit()


def _mark_error(rule):
    tb = frappe.get_traceback()
    frappe.db.set_value(
        "TC Rule",
        rule.name,
        {"last_run": now_datetime(), "last_error": tb[:2000]},
        update_modified=False,
    )
    frappe.db.commit()
    frappe.log_error(tb, f"tacchien rule {rule.get('rule_code')}")
