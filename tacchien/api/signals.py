"""API feed tín hiệu + hành động ack/resolve/mute. Guard dòng đầu."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import add_to_date, now_datetime

from tacchien.api._guard import guard

_FIELDS = [
    "name",
    "severity",
    "pillar",
    "domain",
    "title",
    "description",
    "status",
    "source_rule",
    "user",
    "ref_doctype",
    "ref_name",
    "occurrence_count",
    "first_seen",
    "last_seen",
    "acked_by",
    "muted_until",
    "creation",
]

_MUTE_PRESETS = {"1h": {"hours": 1}, "1d": {"days": 1}, "1w": {"days": 7}}


@frappe.whitelist()
def get_signals(severity=None, domain=None, status=None, user=None, pillar=None, page=1, page_size=20):
    guard()
    filters = {}
    if severity:
        filters["severity"] = severity
    if domain:
        filters["domain"] = domain
    if user:
        filters["user"] = user
    if pillar:
        filters["pillar"] = pillar
    if status:
        filters["status"] = status
    else:
        filters["status"] = ["in", ["Open", "Acked"]]

    page = max(1, int(page))
    page_size = min(max(1, int(page_size)), 100)

    total = frappe.db.count("TC Signal", filters)
    rows = frappe.get_all(
        "TC Signal",
        filters=filters,
        fields=_FIELDS,
        order_by="severity asc, last_seen desc",
        limit_start=(page - 1) * page_size,
        limit_page_length=page_size,
    )
    return {
        "rows": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
        "domains": frappe.get_all(
            "TC Domain", filters={"is_active": 1}, pluck="name", order_by="sort_order asc"
        ),
    }


@frappe.whitelist()
def act_on_signal(name, action, mute_preset=None, muted_until=None):
    """action: ack | resolve | mute | reopen."""
    guard()
    doc = frappe.get_doc("TC Signal", name)
    now = now_datetime()
    actor = frappe.session.user

    if action == "ack":
        doc.status = "Acked"
        doc.acked_by = actor
        doc.acked_at = now
    elif action == "resolve":
        doc.status = "Resolved"
        doc.resolved_at = now
    elif action == "mute":
        doc.status = "Muted"
        if muted_until:
            doc.muted_until = muted_until
        elif mute_preset in _MUTE_PRESETS:
            doc.muted_until = add_to_date(now, **_MUTE_PRESETS[mute_preset])
        else:
            doc.muted_until = add_to_date(now, days=1)
    elif action == "reopen":
        doc.status = "Open"
        doc.muted_until = None
    else:
        frappe.throw(_("Hành động không hợp lệ: {0}").format(action))

    doc.save(ignore_permissions=True)
    # Cập nhật ngay các bảng đọc-cache của 3 trụ.
    for key in ("tc_overview", "tc_baocao", "tc_giamsat"):
        frappe.cache().delete_value(key)
    return {
        "name": doc.name,
        "status": doc.status,
        "acked_by": doc.acked_by,
        "muted_until": str(doc.muted_until) if doc.muted_until else None,
    }
