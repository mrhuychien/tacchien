"""Rule Pháp lý+ — quét Sổ Nghĩa Vụ Định Kỳ (TC Obligation)."""

from __future__ import annotations

import frappe
from frappe.utils import date_diff, nowdate

from tacchien.tc.emit import emit_signal


def scan(params, rule):
    """RULE-OBL-01 (P1/P2/P3): quét toàn sổ theo mốc lead.

    Dedup theo obligation (title ổn định) → mỗi nghĩa vụ chỉ 1 signal; severity
    ESCALATE khi tới hạn gần hơn (P3 → P2 → P1) nhờ logic escalate của emit_signal.
    """
    today = nowdate()
    rows = frappe.get_all(
        "TC Obligation",
        filters={"trang_thai": ["!=", "Het han"]},
        fields=["name", "ten", "loai", "ngay_het_han", "lead_p2_ngay", "lead_p3_ngay"],
    )
    for r in rows:
        if not r.ngay_het_han:
            continue
        days_left = date_diff(r.ngay_het_han, today)  # âm = đã quá hạn
        lead_p2 = int(r.lead_p2_ngay or 30)
        lead_p3 = int(r.lead_p3_ngay or 60)

        if days_left < 0:
            sev, phrase = "P1", f"ĐÃ QUÁ HẠN {abs(days_left)} ngày"
        elif days_left <= lead_p2:
            sev, phrase = "P2", f"còn {days_left} ngày"
        elif days_left <= lead_p3:
            sev, phrase = "P3", f"còn {days_left} ngày"
        else:
            continue  # chưa tới mốc cảnh báo

        emit_signal(
            signal_type="Han dinh ky",
            severity=sev,
            domain=rule.get("domain"),
            title=f"Nghĩa vụ đến hạn: {r.ten}",
            description=f"[{r.loai}] {phrase} (hết hạn {r.ngay_het_han}).",
            source_rule=rule.get("rule_code"),
            ref_doctype="TC Obligation",
            ref_name=r.name,
        )
