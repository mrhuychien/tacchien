"""Rule Kho — tồn âm, cận HSD, dưới định mức."""

from __future__ import annotations

import frappe
from frappe.utils import add_days, flt, nowdate

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


def expiry_soon(params, rule):
    """RULE-INV-02 (P2/P3): batch thành phẩm còn tồn, HSD ≤30 ngày → P2; ≤60 → P3."""
    p2 = int(params.get("hsd_p2_days", 30))
    p3 = int(params.get("hsd_p3_days", 60))
    today = nowdate()
    limit_date = add_days(today, p3)

    batches = frappe.get_all(
        "Batch",
        filters={"expiry_date": ["between", [today, limit_date]], "disabled": 0},
        fields=["name", "item", "expiry_date"],
        limit=500,
    )
    for b in batches:
        qty = flt(
            frappe.db.sql(
                """
                SELECT COALESCE(SUM(actual_qty), 0)
                FROM `tabStock Ledger Entry`
                WHERE batch_no = %s AND is_cancelled = 0
                """,
                (b.name,),
            )[0][0]
        )
        if qty <= 0:
            continue
        days_left = frappe.utils.date_diff(b.expiry_date, today)
        sev = "P2" if days_left <= p2 else "P3"
        emit_signal(
            signal_type="Han dinh ky",
            severity=sev,
            domain=rule.get("domain"),
            title=f"Cận HSD: {b.item} (batch {b.name})",
            description=f"Còn {qty:,.0f} tồn, HSD {b.expiry_date} (còn {days_left} ngày).",
            source_rule=rule.get("rule_code"),
            ref_doctype="Batch",
            ref_name=b.name,
        )


def below_reorder(params, rule):
    """RULE-INV-03 (Batch B, P2): tồn NVL/bao bì dưới reorder level."""
    rows = frappe.db.sql(
        """
        SELECT ir.parent AS item, ir.warehouse,
               ir.warehouse_reorder_level AS lvl,
               COALESCE(b.projected_qty, 0) AS proj
        FROM `tabItem Reorder` ir
        LEFT JOIN `tabBin` b ON b.item_code = ir.parent AND b.warehouse = ir.warehouse
        WHERE ir.warehouse_reorder_level > 0
        HAVING proj < lvl
        """,
        as_dict=True,
    )
    for r in rows:
        emit_signal(
            signal_type="Nguong",
            severity=rule.get("default_severity") or "P2",
            domain=rule.get("domain"),
            title=f"Dưới định mức: {r.item} @ {r.warehouse}",
            description=f"Tồn dự kiến {flt(r.proj):,.0f} < định mức {flt(r.lvl):,.0f}.",
            source_rule=rule.get("rule_code"),
            ref_doctype="Item",
            ref_name=r.item,
        )
