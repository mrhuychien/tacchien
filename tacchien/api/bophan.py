"""API #/bophan — nhịp bộ phận từ owner+creation+docstatus trên DocType nguồn.

KHÔNG query tabVersion / tabActivity Log (brief §6). Đo độ trễ dòng chảy.
"""

from __future__ import annotations

import frappe
from frappe.utils import get_datetime, now_datetime

from tacchien.api._guard import guard

# Bộ phận ↔ các DocType nguồn (proxy cho hoạt động của bộ phận).
_DEPTS = [
    {"label": "Bán hàng", "doctypes": ["Sales Invoice", "Sales Order", "Delivery Note"]},
    {"label": "Kho", "doctypes": ["Stock Entry", "Material Request"]},
    {"label": "Mua hàng", "doctypes": ["Purchase Order", "Purchase Invoice"]},
    {"label": "Tài chính", "doctypes": ["Payment Entry"]},
]


@frappe.whitelist()
def get_bophan():
    guard()
    now = now_datetime()
    today = frappe.utils.getdate(now)
    sla_hours = int(frappe.db.get_single_value("TC Settings", "sla_duyet_gio") or 4)
    cutoff = frappe.utils.add_to_date(now, hours=-sla_hours)

    rows = []
    for dept in _DEPTS:
        today_count = 0
        stuck = 0
        oldest_h = 0
        for dt in dept["doctypes"]:
            if not frappe.db.exists("DocType", dt):
                continue
            today_count += frappe.db.count(dt, {"creation": [">=", today]})
            drafts = frappe.get_all(
                dt,
                filters={"docstatus": 0, "creation": ["<", cutoff]},
                fields=["creation"],
                order_by="creation asc",
                limit=100,
            )
            stuck += len(drafts)
            if drafts:
                h = int((now - get_datetime(drafts[0].creation)).total_seconds() // 3600)
                oldest_h = max(oldest_h, h)

        status = "green" if stuck == 0 else ("red" if stuck >= 5 or oldest_h >= sla_hours * 3 else "amber")
        rows.append(
            {
                "dept": dept["label"],
                "today": today_count,
                "stuck": stuck,
                "oldest_h": oldest_h,
                "status": status,
            }
        )
    return {"rows": rows, "sla_hours": sla_hours, "generated_at": str(now)}
