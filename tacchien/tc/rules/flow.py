"""Rule Nhịp bộ phận — chứng từ draft quá SLA.

Đo DÒNG CHẢY (độ trễ draft→submit), không đo gõ phím. Signal domain ánh xạ theo
mảng nghiệp vụ của chứng từ (để health strip 13 ô sáng đúng ô), KHÔNG dùng
"Nhịp bộ phận" (đó là view #/bophan, không phải 1 trong 13 ô).
"""

from __future__ import annotations

import frappe
from frappe.utils import get_datetime, now_datetime

from tacchien.tc.emit import emit_signal
from tacchien.tc.rules._util import to_seconds

# DocType → mảng (một trong 13 TC Domain).
_DOMAIN_OF = {
    "Sales Invoice": "Bán hàng",
    "Sales Order": "Bán hàng",
    "Delivery Note": "Bán hàng",
    "Stock Entry": "Kho · tồn · HSD",
    "Material Request": "Kho · tồn · HSD",
    "Payment Entry": "Tài chính · dòng tiền",
    "Purchase Order": "Mua hàng · NCC",
    "Purchase Invoice": "Mua hàng · NCC",
}


def _sla_doctypes():
    raw = frappe.db.get_single_value("TC Settings", "sla_doctypes") or ""
    return [x.strip() for x in raw.splitlines() if x.strip()]


def _within_working_hours(now):
    tu = to_seconds(frappe.db.get_single_value("TC Settings", "gio_lam_viec_tu")) or 0
    den = to_seconds(frappe.db.get_single_value("TC Settings", "gio_lam_viec_den")) or 86400
    sec = now.hour * 3600 + now.minute * 60
    return tu <= sec <= den


def draft_sla(params, rule):
    """RULE-FLOW-01 (P2): chứng từ draft (docstatus 0) quá sla_duyet_gio giờ."""
    now = now_datetime()
    if not _within_working_hours(now):
        return
    sla_hours = int(frappe.db.get_single_value("TC Settings", "sla_duyet_gio") or 4)
    cutoff = frappe.utils.add_to_date(now, hours=-sla_hours)

    for dt in _sla_doctypes():
        if not frappe.db.exists("DocType", dt):
            continue
        rows = frappe.get_all(
            dt,
            filters={"docstatus": 0, "creation": ["<", cutoff]},
            fields=["name", "creation"],
            order_by="creation asc",
            limit=200,
        )
        if not rows:
            continue
        oldest_h = int((now - get_datetime(rows[0].creation)).total_seconds() // 3600)
        # Gom 1 signal/doctype (chống nhiễu), domain theo mảng nghiệp vụ.
        emit_signal(
            signal_type="Nguong",
            severity=rule.get("default_severity") or "P2",
            domain=_DOMAIN_OF.get(dt, rule.get("domain")),
            title=f"{len(rows)} {dt} chờ duyệt quá {sla_hours}h",
            description=f"{len(rows)} chứng từ {dt} còn draft; cũ nhất ~{oldest_h}h.",
            source_rule=rule.get("rule_code"),
            ref_doctype=dt,
            ref_name=rows[0].name,
        )


def overnight_draft(params, rule):
    """RULE-FLOW-02 (Batch B, P3): draft qua đêm theo bộ phận (gom digest)."""
    today = frappe.utils.getdate(now_datetime())
    for dt in ("Stock Entry", "Delivery Note", "Sales Invoice"):
        if not frappe.db.exists("DocType", dt):
            continue
        cnt = frappe.db.count(dt, {"docstatus": 0, "creation": ["<", today]})
        if cnt:
            emit_signal(
                signal_type="Nguong",
                severity=rule.get("default_severity") or "P3",
                domain=_DOMAIN_OF.get(dt, rule.get("domain")),
                title=f"{cnt} {dt} draft qua đêm",
                description=f"{cnt} chứng từ {dt} tạo trước hôm nay vẫn chưa submit.",
                source_rule=rule.get("rule_code"),
                ref_doctype=dt,
                ref_name=dt,
            )
