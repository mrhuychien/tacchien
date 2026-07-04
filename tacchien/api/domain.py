"""API #/domain/:name — metric mảng + list signal + link desk.

Phase 1 làm sâu 3 mảng: Tài chính · dòng tiền / Kho · tồn · HSD / Bán hàng.
Còn lại: generic (signal + đếm).
"""

from __future__ import annotations

import frappe
from frappe.utils import add_days, flt, nowdate

from tacchien.api._guard import guard
from tacchien.tc import channels

FIN = "Tài chính · dòng tiền"
KHO = "Kho · tồn · HSD"
BAN = "Bán hàng"


@frappe.whitelist()
def get_domain(domain):
    guard()
    out = {
        "domain": domain,
        "signals": _signals(domain),
        "deep": None,
        "detail": {},
    }
    try:
        if domain == FIN:
            out["deep"] = "finance"
            out["detail"] = _finance_detail()
        elif domain == KHO:
            out["deep"] = "inventory"
            out["detail"] = _inventory_detail()
        elif domain == BAN:
            out["deep"] = "sales"
            out["detail"] = _sales_detail()
    except Exception:
        frappe.log_error(frappe.get_traceback(), "tacchien domain detail")
    return out


def _signals(domain):
    return frappe.get_all(
        "TC Signal",
        filters={"domain": domain, "status": ["in", ["Open", "Acked"]]},
        fields=["name", "severity", "title", "description", "status", "occurrence_count",
                "ref_doctype", "ref_name", "last_seen", "creation"],
        order_by="severity asc, last_seen desc",
        limit=50,
    )


def _finance_detail():
    today = nowdate()
    # Aging theo khách (bucket theo số ngày quá hạn).
    aging = frappe.db.sql(
        """
        SELECT customer,
               SUM(CASE WHEN DATEDIFF(%(t)s, due_date) <= 0 THEN outstanding_amount ELSE 0 END) AS current,
               SUM(CASE WHEN DATEDIFF(%(t)s, due_date) BETWEEN 1 AND 30 THEN outstanding_amount ELSE 0 END) AS d30,
               SUM(CASE WHEN DATEDIFF(%(t)s, due_date) BETWEEN 31 AND 60 THEN outstanding_amount ELSE 0 END) AS d60,
               SUM(CASE WHEN DATEDIFF(%(t)s, due_date) > 60 THEN outstanding_amount ELSE 0 END) AS d60p,
               SUM(outstanding_amount) AS total
        FROM `tabSales Invoice`
        WHERE docstatus = 1 AND outstanding_amount > 0
        GROUP BY customer
        ORDER BY total DESC
        LIMIT 15
        """,
        {"t": today},
        as_dict=True,
    )
    # Tiền về 7 ngày.
    cash = frappe.db.sql(
        """
        SELECT posting_date AS d, COALESCE(SUM(paid_amount), 0) AS v
        FROM `tabPayment Entry`
        WHERE docstatus = 1 AND payment_type = 'Receive' AND posting_date >= %s
        GROUP BY posting_date ORDER BY posting_date
        """,
        (add_days(today, -6),),
        as_dict=True,
    )
    return {"aging": aging, "cash_7d": cash}


def _inventory_detail():
    negative = frappe.db.sql(
        "SELECT item_code, warehouse, actual_qty FROM `tabBin` WHERE actual_qty < 0 LIMIT 30",
        as_dict=True,
    )
    below = frappe.db.sql(
        """
        SELECT ir.parent AS item, ir.warehouse, ir.warehouse_reorder_level AS lvl,
               COALESCE(b.projected_qty, 0) AS proj
        FROM `tabItem Reorder` ir
        LEFT JOIN `tabBin` b ON b.item_code = ir.parent AND b.warehouse = ir.warehouse
        WHERE ir.warehouse_reorder_level > 0 HAVING proj < lvl LIMIT 30
        """,
        as_dict=True,
    )
    return {"negative": negative, "below_reorder": below}


def _sales_detail():
    today = nowdate()
    cmap = channels.get_channel_map()
    by_group = frappe.db.sql(
        """
        SELECT customer_group AS grp, COALESCE(SUM(grand_total), 0) AS v
        FROM `tabSales Invoice`
        WHERE docstatus = 1 AND IFNULL(is_opening,'No') != 'Yes' AND posting_date = %s
        GROUP BY customer_group
        """,
        (today,),
        as_dict=True,
    )
    by_channel = {}
    for r in by_group:
        k = channels.channel_of(r.grp, cmap)
        by_channel[k] = by_channel.get(k, 0.0) + flt(r.v)

    rev_7d = frappe.db.sql(
        """
        SELECT posting_date AS d, COALESCE(SUM(grand_total), 0) AS v
        FROM `tabSales Invoice`
        WHERE docstatus = 1 AND IFNULL(is_opening,'No') != 'Yes' AND posting_date >= %s
        GROUP BY posting_date ORDER BY posting_date
        """,
        (add_days(today, -6),),
        as_dict=True,
    )
    return {"by_channel": by_channel, "rev_7d": rev_7d}
