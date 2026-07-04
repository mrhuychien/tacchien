"""Rule Bán hàng (Batch B) — lệch giá & nhịp doanh thu."""

from __future__ import annotations

import frappe
from frappe.utils import add_days, flt, getdate, now_datetime, nowdate

from tacchien.tc.emit import emit_signal


def price_variance(params, rule):
    """RULE-SAL-01 (Batch B, P2): SI có item lệch giá > N% so Price List."""
    variance = flt(params.get("variance_pct", 15))
    today = nowdate()
    rows = frappe.db.sql(
        """
        SELECT si.name AS si, sii.item_code, sii.rate, sii.price_list_rate
        FROM `tabSales Invoice Item` sii
        JOIN `tabSales Invoice` si ON sii.parent = si.name
        WHERE si.docstatus = 1 AND si.posting_date = %s AND sii.price_list_rate > 0
        """,
        (today,),
        as_dict=True,
    )
    for r in rows:
        dev = abs(flt(r.rate) - flt(r.price_list_rate)) / flt(r.price_list_rate) * 100
        if dev > variance:
            emit_signal(
                signal_type="Bat thuong",
                severity=rule.get("default_severity") or "P2",
                domain=rule.get("domain"),
                title=f"Lệch giá {dev:.0f}%: {r.item_code}",
                description=f"HĐ {r.si}: giá {flt(r.rate):,.0f} vs Price List {flt(r.price_list_rate):,.0f}.",
                source_rule=rule.get("rule_code"),
                ref_doctype="Sales Invoice",
                ref_name=r.si,
            )


def revenue_pace(params, rule):
    """RULE-SAL-02 (Batch B, P3): doanh thu hôm nay < N% TB cùng thứ 4 tuần gần nhất."""
    run_hours = params.get("run_hours", [11, 16])
    if now_datetime().hour not in run_hours:
        return
    pct = flt(params.get("pct_of_avg", 60))
    today = getdate(nowdate())

    def rev(day):
        return flt(
            frappe.db.sql(
                """
                SELECT COALESCE(SUM(grand_total), 0)
                FROM `tabSales Invoice`
                WHERE docstatus = 1 AND IFNULL(is_opening,'No') != 'Yes' AND posting_date = %s
                """,
                (str(day),),
            )[0][0]
        )

    today_rev = rev(today)
    peers = [rev(add_days(today, -7 * w)) for w in range(1, 5)]
    peers = [p for p in peers if p > 0]
    if not peers:
        return
    avg = sum(peers) / len(peers)
    if today_rev < avg * pct / 100:
        emit_signal(
            signal_type="Nguong",
            severity=rule.get("default_severity") or "P3",
            domain=rule.get("domain"),
            title="Doanh thu hôm nay dưới nhịp",
            description=f"Lũy kế {today_rev:,.0f} < {pct:.0f}% TB cùng thứ ({avg:,.0f}).",
            source_rule=rule.get("rule_code"),
        )
