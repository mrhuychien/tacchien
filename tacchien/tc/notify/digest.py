"""Digest hằng ngày — gom P2/P3 đang Open + tín hiệu mới 24h, nhóm theo mảng.

Chạy nhờ dispatcher heartbeat (maybe_send_digest gọi mỗi phút), guard 1 lần/ngày
bằng field bền TC Settings.last_digest_date (sống qua restart). Rỗng vẫn gửi
"✅ Không có tín hiệu mở" để biết hệ còn sống (brief §5).
"""

from __future__ import annotations

import frappe
from frappe.utils import add_to_date, getdate, now_datetime

from tacchien.tc.notify import telegram

_SEV_ORDER = {"P1": 0, "P2": 1, "P3": 2}


def build_digest() -> dict:
    now = now_datetime()
    since = add_to_date(now, hours=-24)

    rows = frappe.get_all(
        "TC Signal",
        filters={"status": "Open"},
        or_filters=[
            {"severity": ["in", ["P2", "P3"]]},
            {"creation": [">=", since]},
        ],
        fields=[
            "name",
            "severity",
            "domain",
            "title",
            "description",
            "occurrence_count",
            "creation",
        ],
        order_by="creation desc",
    )

    groups: dict[str, list] = {}
    new_24h = 0
    for r in rows:
        groups.setdefault(r.domain, []).append(r)
        if getdate(r.creation) == getdate(now) or r.creation >= since:
            new_24h += 1

    for items in groups.values():
        items.sort(key=lambda x: _SEV_ORDER.get(x.severity, 9))

    return {
        "total": len(rows),
        "new_24h": new_24h,
        "groups": groups,
        "generated_at": str(now),
    }


def format_digest(data: dict) -> str:
    if not data["total"]:
        return "✅ Không có tín hiệu mở"

    lines = [f"📋 Digest tác chiến — {data['total']} tín hiệu mở ({data['new_24h']} mới 24h)"]
    for domain, items in data["groups"].items():
        lines.append(f"\n▸ {domain} ({len(items)})")
        for it in items[:8]:
            extra = f" ×{it.occurrence_count}" if (it.occurrence_count or 1) > 1 else ""
            lines.append(f"  {it.severity} · {it.title}{extra}")
        if len(items) > 8:
            lines.append(f"  … +{len(items) - 8} nữa")
    return "\n".join(lines)


def send_digest() -> dict:
    data = build_digest()
    telegram.send_text(format_digest(data))
    return data


def maybe_send_digest(now=None):
    """Gọi từ dispatcher.tick mỗi phút — gửi đúng 1 lần/ngày từ digest_hour."""
    now = now or now_datetime()
    digest_hour = int(frappe.db.get_single_value("TC Settings", "digest_hour") or 7)
    if now.hour < digest_hour:
        return
    today = str(getdate(now))
    if frappe.db.get_single_value("TC Settings", "last_digest_date") == today:
        return
    send_digest()
    frappe.db.set_value("TC Settings", "TC Settings", "last_digest_date", today)
    frappe.db.commit()
