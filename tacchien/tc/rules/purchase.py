"""Rule Mua hàng (Batch B) — PO quá hạn giao chưa nhận đủ."""

from __future__ import annotations

import frappe
from frappe.utils import nowdate

from tacchien.tc.emit import emit_signal


def po_overdue(params, rule):
    """RULE-PUR-01 (Batch B): PO quá ngày giao chưa nhận đủ.

    Nếu tồn NVL của item đó dưới reorder → P1 (gấp), còn ổn → P3.
    """
    today = nowdate()
    pos = frappe.get_all(
        "Purchase Order",
        filters={"docstatus": 1, "status": ["not in", ["Completed", "Closed"]],
                 "per_received": ["<", 100], "schedule_date": ["<", today]},
        fields=["name", "supplier", "schedule_date", "per_received"],
        limit=200,
    )
    for po in pos:
        sev = "P1" if _has_item_below_reorder(po.name) else "P3"
        emit_signal(
            signal_type="Nguong",
            severity=sev,
            domain=rule.get("domain"),
            title=f"PO trễ giao: {po.name}",
            description=f"NCC {po.supplier}, hẹn {po.schedule_date}, mới nhận {po.per_received:.0f}%.",
            source_rule=rule.get("rule_code"),
            ref_doctype="Purchase Order",
            ref_name=po.name,
        )


def _has_item_below_reorder(po_name) -> bool:
    rows = frappe.db.sql(
        """
        SELECT poi.item_code,
               COALESCE(SUM(b.projected_qty), 0) AS proj,
               COALESCE(MAX(ir.warehouse_reorder_level), 0) AS lvl
        FROM `tabPurchase Order Item` poi
        LEFT JOIN `tabBin` b ON b.item_code = poi.item_code
        LEFT JOIN `tabItem Reorder` ir ON ir.parent = poi.item_code
        WHERE poi.parent = %s
        GROUP BY poi.item_code
        """,
        (po_name,),
        as_dict=True,
    )
    return any(r.lvl and r.proj < r.lvl for r in rows)
