"""Rule Bảo mật.

RULE-SEC-01 chạy qua doc_events (KHÔNG cron): thay đổi User / Has Role /
Custom DocPerm bởi user ngoài perm_whitelist_users → P1. Handler PHẢI an toàn
tuyệt đối — mọi lỗi nuốt gọn, không bao giờ chặn transaction gốc.

RULE-SEC-02 (cancel_amend_spike) là Batch B → Build 6.
"""

from __future__ import annotations

import frappe

from tacchien.tc.emit import emit_signal


def _whitelist() -> set[str]:
    raw = frappe.db.get_single_value("TC Settings", "perm_whitelist_users") or ""
    return {u.strip() for u in raw.splitlines() if u.strip()}


def on_perm_change(doc, method=None):
    """doc_events handler cho User / Has Role / Custom DocPerm."""
    # Bỏ qua khi cài/migrate/patch — không phải hành vi người dùng thật.
    if frappe.flags.in_install or frappe.flags.in_migrate or frappe.flags.in_patch:
        return
    try:
        actor = frappe.session.user
        if actor in _whitelist():
            return

        dt = getattr(doc, "doctype", "?")
        target = getattr(doc, "name", "?")
        # User liên quan: nếu đổi Has Role thì là doc.parent (user bị gán role).
        related_user = getattr(doc, "parent", None) if dt == "Has Role" else None

        emit_signal(
            signal_type="He thong",
            severity="P1",
            domain="Hệ thống",
            title=f"Thay đổi phân quyền: {dt}",
            description=f"'{actor}' vừa {method or 'thay đổi'} {dt} ({target}).",
            source_rule="RULE-SEC-01",
            user=related_user or actor,
            ref_doctype=dt,
            ref_name=target,
        )
    except Exception:
        # Guard tuyệt đối: log, KHÔNG raise (không được làm hỏng thao tác gốc).
        frappe.log_error(frappe.get_traceback(), "tacchien RULE-SEC-01")


_WATCH_CANCEL = ("Sales Invoice", "Stock Entry", "Payment Entry", "Delivery Note")


def cancel_amend_spike(params, rule):
    """RULE-SEC-02 (Batch B, P2): 1 user cancel/amend > N docs trong M phút.

    Xấp xỉ: đếm chứng từ docstatus=2 (Cancelled) modified trong cửa sổ, theo user.
    Baseline 30 ngày để sau; phase B chỉ dùng ngưỡng tuyệt đối.
    """
    threshold = int(params.get("threshold", 5))
    window_min = int(params.get("window_min", 30))
    since = frappe.utils.add_to_date(frappe.utils.now_datetime(), minutes=-window_min)

    counts: dict[str, int] = {}
    for dt in _WATCH_CANCEL:
        if not frappe.db.exists("DocType", dt):
            continue
        for r in frappe.db.sql(
            f"""
            SELECT modified_by AS u, COUNT(*) AS c
            FROM `tab{dt}`
            WHERE docstatus = 2 AND modified > %s
            GROUP BY modified_by
            """,
            (since,),
            as_dict=True,
        ):
            counts[r.u] = counts.get(r.u, 0) + r.c

    for user, cnt in counts.items():
        if cnt > threshold:
            emit_signal(
                signal_type="Bat thuong",
                severity=rule.get("default_severity") or "P2",
                domain=rule.get("domain"),
                title=f"Cancel/amend bất thường: {user}",
                description=f"{cnt} chứng từ bị huỷ trong {window_min}' (ngưỡng {threshold}).",
                source_rule=rule.get("rule_code"),
                user=user,
            )
