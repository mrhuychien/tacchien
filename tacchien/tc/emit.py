"""emit_signal — CỬA DUY NHẤT tạo TC Signal.

Cấm insert TC Signal trực tiếp ở bất kỳ đâu. Helper này lo:
  - dedup theo dedup_key (sha1),
  - nuốt tín hiệu đang Muted còn hạn,
  - gộp lần xuất hiện + escalate severity thay vì tạo trùng.
Realtime publish + notify P1 nằm ở TC Signal.after_insert (chỉ chạy khi tạo MỚI).
"""

from __future__ import annotations

import hashlib

import frappe
from frappe.utils import now_datetime

SEV_RANK = {"P1": 3, "P2": 2, "P3": 1}


def _normalize(title: str | None) -> str:
    return (title or "").strip().lower()


def dedup_key(source_rule, domain, ref_doctype, ref_name, title) -> str:
    raw = "|".join(
        [
            source_rule or "",
            domain or "",
            ref_doctype or "",
            ref_name or "",
            _normalize(title),
        ]
    )
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def emit_signal(
    *,
    signal_type: str,
    severity: str,
    domain: str,
    title: str,
    description: str = "",
    source_rule: str | None = None,
    user: str | None = None,
    ref_doctype: str | None = None,
    ref_name: str | None = None,
) -> str | None:
    """Tạo hoặc gộp một tín hiệu. Trả về name của TC Signal (hoặc None nếu bị nuốt)."""
    key = dedup_key(source_rule, domain, ref_doctype, ref_name, title)
    now = now_datetime()

    # 1) Đang Muted còn hạn → nuốt luôn.
    muted = frappe.db.get_value(
        "TC Signal",
        {"dedup_key": key, "status": "Muted", "muted_until": [">", now]},
        "name",
    )
    if muted:
        return None

    # 2) Đã có Open/Acked cùng key → tăng count, update last_seen, escalate.
    existing = frappe.db.get_value(
        "TC Signal",
        {"dedup_key": key, "status": ["in", ["Open", "Acked"]]},
        ["name", "severity"],
        as_dict=True,
    )
    if existing:
        doc = frappe.get_doc("TC Signal", existing.name)
        doc.occurrence_count = (doc.occurrence_count or 1) + 1
        doc.last_seen = now
        if SEV_RANK.get(severity, 0) > SEV_RANK.get(doc.severity, 0):
            doc.severity = severity
        doc.save(ignore_permissions=True)
        return doc.name

    # 3) Tạo mới (after_insert lo realtime + notify P1).
    doc = frappe.get_doc(
        {
            "doctype": "TC Signal",
            "signal_type": signal_type,
            "severity": severity,
            "domain": domain,
            "title": title,
            "description": description,
            "source_rule": source_rule,
            "user": user,
            "ref_doctype": ref_doctype,
            "ref_name": ref_name,
            "status": "Open",
            "dedup_key": key,
            "occurrence_count": 1,
            "first_seen": now,
            "last_seen": now,
        }
    ).insert(ignore_permissions=True)
    return doc.name
