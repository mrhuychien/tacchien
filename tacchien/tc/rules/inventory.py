"""Rule Kho — tồn âm (lỗi data, xử ngay). INV-02/03 làm ở Build 6."""

from __future__ import annotations

import frappe

from tacchien.tc.emit import emit_signal


def negative_stock(params, rule):
    """RULE-INV-01: tồn âm bất kỳ item/kho nào → P1 (đây là lỗi data)."""
    # Bin.actual_qty < 0: tồn kho âm — không hợp lệ về mặt vật lý.
    rows = frappe.db.sql(
        """
        SELECT item_code, warehouse, actual_qty
        FROM `tabBin`
        WHERE actual_qty < 0
        """,
        as_dict=True,
    )
    for r in rows:
        emit_signal(
            signal_type="Bat thuong",
            severity=rule.get("default_severity") or "P1",
            domain=rule.get("domain"),
            title=f"Tồn âm: {r.item_code} @ {r.warehouse}",
            description=f"Tồn kho {r.actual_qty} cho item '{r.item_code}' tại kho '{r.warehouse}'.",
            source_rule=rule.get("rule_code"),
            ref_doctype="Warehouse",
            ref_name=r.warehouse,
        )
