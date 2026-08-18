"""API #/luodo — Lưu đồ xưởng: rollup tín hiệu theo mảng để tô 10 công đoạn.

Lưu đồ là màn "2-giây test" treo tường: nhìn phát biết công đoạn nào đang có
vấn đề. Mỗi công đoạn phụ thuộc một vài TC Domain (map ở client, xem
views/luodo.js) nên API chỉ cần trả rollup THEO MẢNG — 1 call trả đủ.

Điểm quan trọng: phân biệt "sạch" với "chưa giám sát". Mảng không có rule nào
bật thì KHÔNG được tô xanh — xanh giả còn tệ hơn không tô, y như đèn "đang
giám sát" nhấp nháy trong khi backend đã chết.
"""

from __future__ import annotations

import frappe
from frappe.utils import now_datetime

from tacchien.api._guard import guard

_CACHE_KEY = "tc_luodo"
_CACHE_TTL = 30
_SEV_RANK = {"P1": 3, "P2": 2, "P3": 1}


@frappe.whitelist()
def get_luodo():
    guard()
    cached = frappe.cache().get_value(_CACHE_KEY)
    if cached is not None:
        return cached

    domains = frappe.get_all(
        "TC Domain",
        filters={"is_active": 1},
        fields=["name", "cluster"],
        order_by="sort_order asc",
    )

    # Signal Open theo (domain, severity).
    agg: dict[str, dict] = {}
    for r in frappe.db.sql(
        """
        SELECT domain, severity, COUNT(*) AS c
        FROM `tabTC Signal`
        WHERE status = 'Open'
        GROUP BY domain, severity
        """,
        as_dict=True,
    ):
        d = agg.setdefault(r.domain, {"count": 0, "max_sev": None})
        d["count"] += r.c
        if _SEV_RANK.get(r.severity, 0) > _SEV_RANK.get(d["max_sev"], 0):
            d["max_sev"] = r.severity

    # Đếm rule theo mảng để biết mảng nào ĐANG được canh thật.
    rules: dict[str, dict] = {}
    for r in frappe.db.sql(
        """
        SELECT domain, enabled, COUNT(*) AS c
        FROM `tabTC Rule`
        GROUP BY domain, enabled
        """,
        as_dict=True,
    ):
        d = rules.setdefault(r.domain, {"rules": 0, "rules_on": 0})
        d["rules"] += r.c
        if r.enabled:
            d["rules_on"] += r.c

    out = {}
    for dom in domains:
        a = agg.get(dom.name, {"count": 0, "max_sev": None})
        rl = rules.get(dom.name, {"rules": 0, "rules_on": 0})
        out[dom.name] = {
            "cluster": dom.cluster,
            "count": a["count"],
            "max_sev": a["max_sev"],
            "rules": rl["rules"],
            "rules_on": rl["rules_on"],
        }

    data = {"domains": out, "generated_at": str(now_datetime())}
    frappe.cache().set_value(_CACHE_KEY, data, expires_in_sec=_CACHE_TTL)
    return data
