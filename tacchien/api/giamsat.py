"""API trụ 2 — Hệ thống giám sát (bảng chỉ số an toàn, read-only).

Mỗi mảng giám sát hiện các rule giám sát làm INDICATOR: canh gì, đang bật không,
chạy lần cuối, có lỗi kiểm tra không, số signal mở + màu theo max severity.
Đây là lăng kính TRẠNG THÁI; hành động thực hiện ở trụ Hành động.
"""

from __future__ import annotations

import frappe
from frappe.utils import now_datetime

from tacchien.api._guard import guard

_CACHE_KEY = "tc_giamsat"
_CACHE_TTL = 30
_SEV_RANK = {"P1": 3, "P2": 2, "P3": 1}


@frappe.whitelist()
def get_giamsat():
    guard()
    cached = frappe.cache().get_value(_CACHE_KEY)
    if cached is not None:
        return cached

    # Open signals theo (source_rule, severity).
    open_by_rule: dict[str, dict] = {}
    for r in frappe.db.sql(
        """
        SELECT source_rule, severity, COUNT(*) AS c
        FROM `tabTC Signal` WHERE status = 'Open' AND pillar = 'giam_sat'
        GROUP BY source_rule, severity
        """,
        as_dict=True,
    ):
        d = open_by_rule.setdefault(r.source_rule, {"open": 0, "max_sev": None})
        d["open"] += r.c
        if _SEV_RANK.get(r.severity, 0) > _SEV_RANK.get(d["max_sev"], 0):
            d["max_sev"] = r.severity

    rules = frappe.get_all(
        "TC Rule",
        filters={"pillar": "giam_sat"},
        fields=["rule_code", "title", "domain", "enabled", "schedule",
                "last_run", "last_error", "default_severity"],
        order_by="domain asc, rule_code asc",
    )
    by_domain: dict[str, list] = {}
    summary = {"P1": 0, "P2": 0, "P3": 0, "checks_failing": 0, "checks_off": 0}
    for r in rules:
        info = open_by_rule.get(r.rule_code, {"open": 0, "max_sev": None})
        state = _state(r, info)
        if state == "off":
            summary["checks_off"] += 1
        if r.last_error:
            summary["checks_failing"] += 1
        if info["max_sev"] in summary:
            summary[info["max_sev"]] += info["open"]
        by_domain.setdefault(r.domain, []).append(
            {
                "rule_code": r.rule_code,
                "title": r.title,
                "enabled": r.enabled,
                "schedule": r.schedule,
                "last_run": str(r.last_run) if r.last_run else None,
                "has_error": bool(r.last_error),
                "open": info["open"],
                "max_sev": info["max_sev"],
                "state": state,
            }
        )

    domains = frappe.get_all(
        "TC Domain",
        filters={"is_active": 1, "pillar": "giam_sat"},
        fields=["name", "cluster", "sort_order"],
        order_by="sort_order asc",
    )
    out_domains = []
    for d in domains:
        inds = by_domain.get(d.name, [])
        max_sev = None
        total_open = 0
        for i in inds:
            total_open += i["open"]
            if _SEV_RANK.get(i["max_sev"], 0) > _SEV_RANK.get(max_sev, 0):
                max_sev = i["max_sev"]
        out_domains.append(
            {
                "domain": d.name,
                "cluster": d.cluster,
                "indicators": inds,
                "open": total_open,
                "max_sev": max_sev,
            }
        )

    data = {"domains": out_domains, "summary": summary, "generated_at": str(now_datetime())}
    frappe.cache().set_value(_CACHE_KEY, data, expires_in_sec=_CACHE_TTL)
    return data


def _state(rule, info):
    """green=đang canh sạch · red=lỗi/kiểm tra hoặc P1 · amber=P2 · blue=P3 · off=tắt."""
    if not rule.enabled:
        return "off"
    if rule.last_error:
        return "red"
    sev = info["max_sev"]
    if sev == "P1":
        return "red"
    if sev == "P2":
        return "amber"
    if sev == "P3":
        return "blue"
    return "green"
