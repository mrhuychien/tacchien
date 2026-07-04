"""API #/ Tổng quan — 1 call trả đủ. Cache server TTL 30s (TV mode polling)."""

from __future__ import annotations

import frappe
from frappe.utils import add_days, flt, getdate, now_datetime, nowdate

from tacchien.api._guard import guard
from tacchien.tc import channels

_CACHE_KEY = "tc_overview"
_CACHE_TTL = 30
_SEV_RANK = {"P1": 3, "P2": 2, "P3": 1}


@frappe.whitelist()
def get_overview():
    guard()
    cached = frappe.cache().get_value(_CACHE_KEY)
    if cached is not None:
        return cached

    data = {
        "health": _health(),
        "metrics": _metrics(),
        "sparkline": _sparkline(),
        "feed": _feed(),
        "generated_at": str(now_datetime()),
    }
    frappe.cache().set_value(_CACHE_KEY, data, expires_in_sec=_CACHE_TTL)
    return data


def _health():
    """13 ô: max severity của signal Open + số lượng, theo TC Domain."""
    domains = frappe.get_all(
        "TC Domain",
        filters={"is_active": 1},
        fields=["name", "cluster", "sort_order"],
        order_by="sort_order asc",
    )
    # (domain, severity) -> count
    rows = frappe.db.sql(
        """
        SELECT domain, severity, COUNT(*) AS c
        FROM `tabTC Signal`
        WHERE status = 'Open'
        GROUP BY domain, severity
        """,
        as_dict=True,
    )
    agg: dict[str, dict] = {}
    for r in rows:
        d = agg.setdefault(r.domain, {"count": 0, "max_sev": None})
        d["count"] += r.c
        if _SEV_RANK.get(r.severity, 0) > _SEV_RANK.get(d["max_sev"], 0):
            d["max_sev"] = r.severity

    out = []
    for dom in domains:
        info = agg.get(dom.name, {"count": 0, "max_sev": None})
        out.append(
            {
                "domain": dom.name,
                "cluster": dom.cluster,
                "count": info["count"],
                "max_sev": info["max_sev"],  # None = sạch (xanh)
            }
        )
    return out


def _metrics():
    today = nowdate()
    m = {
        "revenue_today": 0.0,
        "revenue_by_channel": {},
        "cash_in_today": 0.0,
        "new_orders": 0,
        "signals_open": {"P1": 0, "P2": 0, "P3": 0},
    }
    try:
        # Doanh thu hôm nay (loại opening). SI đã gồm cả hoá đơn POS.
        m["revenue_today"] = flt(
            frappe.db.sql(
                """
                SELECT COALESCE(SUM(grand_total), 0)
                FROM `tabSales Invoice`
                WHERE docstatus = 1 AND IFNULL(is_opening,'No') != 'Yes'
                  AND posting_date = %s
                """,
                (today,),
            )[0][0]
        )

        # Doanh thu theo kênh (map Customer Group → kênh).
        cmap = channels.get_channel_map()
        by_group = frappe.db.sql(
            """
            SELECT si.customer_group AS grp, COALESCE(SUM(si.grand_total),0) AS v
            FROM `tabSales Invoice` si
            WHERE si.docstatus = 1 AND IFNULL(si.is_opening,'No') != 'Yes'
              AND si.posting_date = %s
            GROUP BY si.customer_group
            """,
            (today,),
            as_dict=True,
        )
        chan: dict[str, float] = {}
        for r in by_group:
            k = channels.channel_of(r.grp, cmap)
            chan[k] = chan.get(k, 0.0) + flt(r.v)
        m["revenue_by_channel"] = chan

        # Tiền về hôm nay (Payment Entry Receive).
        m["cash_in_today"] = flt(
            frappe.db.sql(
                """
                SELECT COALESCE(SUM(paid_amount), 0)
                FROM `tabPayment Entry`
                WHERE docstatus = 1 AND payment_type = 'Receive' AND posting_date = %s
                """,
                (today,),
            )[0][0]
        )

        # Đơn mới hôm nay: SO submitted + hoá đơn POS.
        so_cnt = frappe.db.count("Sales Order", {"docstatus": 1, "transaction_date": today})
        pos_cnt = frappe.db.count(
            "Sales Invoice", {"docstatus": 1, "is_pos": 1, "posting_date": today}
        )
        m["new_orders"] = (so_cnt or 0) + (pos_cnt or 0)
    except Exception:
        frappe.log_error(frappe.get_traceback(), "tacchien overview metrics")

    # Signal Open theo severity.
    for r in frappe.db.sql(
        "SELECT severity, COUNT(*) c FROM `tabTC Signal` WHERE status='Open' GROUP BY severity",
        as_dict=True,
    ):
        if r.severity in m["signals_open"]:
            m["signals_open"][r.severity] = r.c
    return m


def _sparkline():
    """Doanh thu 14 ngày gần nhất vs trung bình cùng thứ (baseline 8 tuần)."""
    today = getdate(nowdate())
    labels = [str(add_days(today, -i)) for i in range(13, -1, -1)]
    revenue = {d: 0.0 for d in labels}
    weekday_sum: dict[int, float] = {}
    weekday_days: dict[int, set] = {}

    try:
        start = add_days(today, -56)
        rows = frappe.db.sql(
            """
            SELECT posting_date AS d, COALESCE(SUM(grand_total),0) AS v
            FROM `tabSales Invoice`
            WHERE docstatus = 1 AND IFNULL(is_opening,'No') != 'Yes'
              AND posting_date BETWEEN %s AND %s
            GROUP BY posting_date
            """,
            (str(start), str(today)),
            as_dict=True,
        )
        for r in rows:
            d = getdate(r.d)
            key = str(d)
            if key in revenue:
                revenue[key] = flt(r.v)
            wd = d.weekday()
            weekday_sum[wd] = weekday_sum.get(wd, 0.0) + flt(r.v)
            weekday_days.setdefault(wd, set()).add(key)
    except Exception:
        frappe.log_error(frappe.get_traceback(), "tacchien overview sparkline")

    weekday_avg = {
        wd: (weekday_sum[wd] / len(weekday_days[wd])) if weekday_days.get(wd) else 0.0
        for wd in weekday_sum
    }
    avg_series = [round(weekday_avg.get(getdate(d).weekday(), 0.0), 2) for d in labels]

    return {
        "labels": labels,
        "revenue": [round(revenue[d], 2) for d in labels],
        "avg_same_weekday": avg_series,
    }


def _feed(limit: int = 10):
    return frappe.get_all(
        "TC Signal",
        fields=[
            "name",
            "severity",
            "domain",
            "title",
            "description",
            "status",
            "occurrence_count",
            "ref_doctype",
            "ref_name",
            "creation",
        ],
        order_by="creation desc",
        limit=limit,
    )
