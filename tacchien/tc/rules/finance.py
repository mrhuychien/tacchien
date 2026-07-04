"""Rule Tài chính — hạn mức công nợ, quá hạn, dòng tiền."""

from __future__ import annotations

import frappe
from frappe.utils import add_days, flt, nowdate

from tacchien.tc.emit import emit_signal


def credit_limit(params, rule):
    """RULE-AR-01 (P2): khách vượt hạn mức công nợ."""
    limits = frappe.db.sql(
        """
        SELECT parent AS customer, credit_limit
        FROM `tabCustomer Credit Limit`
        WHERE credit_limit > 0
        """,
        as_dict=True,
    )
    for lim in limits:
        # Dư nợ = tổng outstanding của hoá đơn bán chưa tất toán.
        outstanding = flt(
            frappe.db.sql(
                """
                SELECT COALESCE(SUM(outstanding_amount), 0)
                FROM `tabSales Invoice`
                WHERE docstatus = 1 AND customer = %s AND outstanding_amount > 0
                """,
                (lim.customer,),
            )[0][0]
        )
        if outstanding > flt(lim.credit_limit):
            emit_signal(
                signal_type="Nguong",
                severity=rule.get("default_severity") or "P2",
                domain=rule.get("domain"),
                title=f"Vượt hạn mức: {lim.customer}",
                description=f"Dư nợ {outstanding:,.0f} > hạn mức {flt(lim.credit_limit):,.0f}.",
                source_rule=rule.get("rule_code"),
                ref_doctype="Customer",
                ref_name=lim.customer,
            )


def overdue_ar(params, rule):
    """RULE-AR-02 (P2): công nợ quá hạn > N ngày, gom 1 signal/khách."""
    days = int(params.get("overdue_days", 10))
    cutoff = add_days(nowdate(), -days)
    rows = frappe.db.sql(
        """
        SELECT customer,
               COALESCE(SUM(outstanding_amount), 0) AS total,
               MIN(due_date) AS oldest_due
        FROM `tabSales Invoice`
        WHERE docstatus = 1 AND outstanding_amount > 0 AND due_date < %s
        GROUP BY customer
        """,
        (cutoff,),
        as_dict=True,
    )
    for r in rows:
        overdue_days = frappe.utils.date_diff(nowdate(), r.oldest_due)
        emit_signal(
            signal_type="Nguong",
            severity=rule.get("default_severity") or "P2",
            domain=rule.get("domain"),
            title=f"Công nợ quá hạn: {r.customer}",
            description=f"Tổng {flt(r.total):,.0f}, quá hạn tới {overdue_days} ngày.",
            source_rule=rule.get("rule_code"),
            ref_doctype="Customer",
            ref_name=r.customer,
        )


def ap_vs_inflow(params, rule):
    """RULE-FIN-01 (Batch B, P2): AP đến hạn N ngày tới > tiền về dự kiến."""
    horizon = int(params.get("horizon_days", 7))
    lookback = int(params.get("inflow_lookback_days", 7))
    today = nowdate()

    ap_due = flt(
        frappe.db.sql(
            """
            SELECT COALESCE(SUM(outstanding_amount), 0)
            FROM `tabPurchase Invoice`
            WHERE docstatus = 1 AND outstanding_amount > 0 AND due_date <= %s
            """,
            (add_days(today, horizon),),
        )[0][0]
    )
    # Tiền về dự kiến ~ trung bình tiền về/ngày (lookback) × horizon.
    inflow = flt(
        frappe.db.sql(
            """
            SELECT COALESCE(SUM(paid_amount), 0)
            FROM `tabPayment Entry`
            WHERE docstatus = 1 AND payment_type = 'Receive' AND posting_date >= %s
            """,
            (add_days(today, -lookback),),
        )[0][0]
    )
    expected = (inflow / lookback) * horizon if lookback else 0
    if ap_due > expected:
        emit_signal(
            signal_type="Nguong",
            severity=rule.get("default_severity") or "P2",
            domain=rule.get("domain"),
            title="AP đến hạn vượt tiền về dự kiến",
            description=f"Phải trả {ap_due:,.0f} trong {horizon} ngày, dự kiến thu {expected:,.0f}.",
            source_rule=rule.get("rule_code"),
        )
