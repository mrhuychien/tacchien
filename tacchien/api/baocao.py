"""API trụ 1 — Báo cáo hoạt động (màn mặc định).

Dashboard số liệu nghiệp vụ + thẻ mảng (drill-down) + tóm tắt nhịp bộ phận.
Tái dùng helper của overview/bophan — KHÔNG lặp SQL.
"""

from __future__ import annotations

import frappe
from frappe.utils import now_datetime

from tacchien.api import bophan, overview
from tacchien.api._guard import guard

_CACHE_KEY = "tc_baocao"
_CACHE_TTL = 30
_SEV_RANK = {"P1": 3, "P2": 2, "P3": 1}


@frappe.whitelist()
def get_baocao():
    guard()
    cached = frappe.cache().get_value(_CACHE_KEY)
    if cached is not None:
        return cached

    data = {
        "metrics": overview._metrics(),
        "sparkline": overview._sparkline(),
        "domains": _domain_cards("bao_cao"),
        "bophan": bophan.compute_bophan(),
        "feed": _feed("bao_cao"),
        "generated_at": str(now_datetime()),
    }
    frappe.cache().set_value(_CACHE_KEY, data, expires_in_sec=_CACHE_TTL)
    return data


def _domain_cards(pillar):
    """Thẻ mảng theo trụ: tên + số signal Open + max severity (để drill-down)."""
    domains = frappe.get_all(
        "TC Domain",
        filters={"is_active": 1, "pillar": pillar},
        fields=["name", "cluster", "sort_order"],
        order_by="sort_order asc",
    )
    agg = _open_by_domain()
    return [
        {
            "domain": d.name,
            "cluster": d.cluster,
            "count": agg.get(d.name, {}).get("count", 0),
            "max_sev": agg.get(d.name, {}).get("max_sev"),
        }
        for d in domains
    ]


def _open_by_domain():
    rows = frappe.db.sql(
        """
        SELECT domain, severity, COUNT(*) AS c
        FROM `tabTC Signal` WHERE status = 'Open'
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
    return agg


def _feed(pillar, limit: int = 8):
    return frappe.get_all(
        "TC Signal",
        filters={"pillar": pillar, "status": ["in", ["Open", "Acked"]]},
        fields=["name", "severity", "domain", "title", "status", "occurrence_count", "creation"],
        order_by="creation desc",
        limit=limit,
    )
