"""API #/luodo — Lưu đồ xưởng: rollup tín hiệu theo mảng để tô 10 công đoạn.

Lưu đồ là màn "2-giây test" treo tường: nhìn phát biết công đoạn nào đang có
vấn đề. Mỗi công đoạn phụ thuộc một vài TC Domain (map ở client, xem
views/luodo.js) nên API chỉ cần trả rollup THEO MẢNG — 1 call trả đủ.

Điểm quan trọng: phân biệt "sạch" với "chưa giám sát". Mảng không có rule nào
CHẠY ĐƯỢC thì KHÔNG được tô xanh — xanh giả còn tệ hơn không tô, y như đèn "đang
giám sát" nhấp nháy trong khi backend đã chết. "Chạy được" = enabled VÀ không có
last_error: rule bật nhưng đang ném lỗi thì nó có canh gì đâu (giamsat._state
cũng coi last_error là đỏ).

Đếm signal theo Open + Acked, khớp với get_signals và #/domain/:name mà thẻ công
đoạn bấm sang. Acked = "đã thấy, CHƯA sửa" — ack một P1 mà công đoạn lật sang
xanh là nói dối.
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

    # Signal chưa xử lý xong theo (domain, status, severity).
    agg: dict[str, dict] = {}
    for r in frappe.db.sql(
        """
        SELECT domain, status, severity, COUNT(*) AS c
        FROM `tabTC Signal`
        WHERE status IN ('Open', 'Acked')
        GROUP BY domain, status, severity
        """,
        as_dict=True,
    ):
        d = agg.setdefault(r.domain, {"count": 0, "open": 0, "acked": 0, "max_sev": None})
        d["count"] += r.c
        d["acked" if r.status == "Acked" else "open"] += r.c
        if _SEV_RANK.get(r.severity, 0) > _SEV_RANK.get(d["max_sev"], 0):
            d["max_sev"] = r.severity

    # Đếm rule theo mảng để biết mảng nào ĐANG được canh THẬT.
    # rules_ok = bật VÀ không có last_error. Rule bật mà đang ném lỗi thì coi như
    # không canh — nếu tính nó là "đang canh" thì công đoạn tô xanh trong khi
    # thực tế mù, đúng loại lỗi mà docstring trên cấm.
    rules: dict[str, dict] = {}
    for r in frappe.db.sql(
        """
        SELECT domain,
               COUNT(*) AS rules,
               SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) AS rules_on,
               SUM(CASE WHEN enabled = 1 AND last_error IS NOT NULL AND last_error != ''
                        THEN 1 ELSE 0 END) AS rules_failing
        FROM `tabTC Rule`
        GROUP BY domain
        """,
        as_dict=True,
    ):
        rules[r.domain] = {
            "rules": int(r.rules or 0),
            "rules_on": int(r.rules_on or 0),
            "rules_failing": int(r.rules_failing or 0),
            "rules_ok": int(r.rules_on or 0) - int(r.rules_failing or 0),
        }

    out = {}
    for dom in domains:
        a = agg.get(dom.name, {"count": 0, "open": 0, "acked": 0, "max_sev": None})
        rl = rules.get(dom.name, {"rules": 0, "rules_on": 0, "rules_failing": 0, "rules_ok": 0})
        out[dom.name] = {
            "cluster": dom.cluster,
            "count": a["count"],
            "open": a["open"],
            "acked": a["acked"],
            "max_sev": a["max_sev"],
            "rules": rl["rules"],
            "rules_on": rl["rules_on"],
            "rules_failing": rl["rules_failing"],
            "rules_ok": rl["rules_ok"],
        }

    data = {"domains": out, "generated_at": str(now_datetime())}
    frappe.cache().set_value(_CACHE_KEY, data, expires_in_sec=_CACHE_TTL)
    return data
