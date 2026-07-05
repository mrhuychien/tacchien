"""Backfill TC Signal.pillar cho signal tạo TRƯỚC khi có field pillar.

Chạy post_model_sync. Dùng map hardcode (không đọc TC Rule.pillar vì fixtures có
thể CHƯA re-sync tại thời điểm patch) → đúng bất kể thứ tự migrate.
"""

from __future__ import annotations

import frappe

_GIAM_SAT = {
    "RULE-POS-01", "RULE-POS-02", "RULE-INV-01", "RULE-INV-02",
    "RULE-SEC-01", "RULE-SEC-02", "RULE-SYS-01", "RULE-SYS-02", "RULE-OBL-01",
}


def execute():
    if not frappe.db.has_column("TC Signal", "pillar"):
        return
    rows = frappe.get_all(
        "TC Signal",
        filters={"pillar": ["in", ["", None]]},
        fields=["name", "source_rule"],
    )
    for r in rows:
        pillar = "giam_sat" if (r.source_rule in _GIAM_SAT) else "bao_cao"
        # source_rule rỗng (Guardian/thủ công) → mặc định giam_sat.
        if not r.source_rule:
            pillar = "giam_sat"
        frappe.db.set_value("TC Signal", r.name, "pillar", pillar, update_modified=False)
    frappe.db.commit()
