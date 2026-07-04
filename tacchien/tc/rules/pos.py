"""Rule POS — canh mở ca & opening treo (bài học Bạch Đằng)."""

from __future__ import annotations

import frappe
from frappe.utils import getdate, now_datetime

from tacchien.tc.emit import emit_signal
from tacchien.tc.rules._util import to_seconds


def opening_late(params, rule):
    """RULE-POS-01: POS trong Watch list chưa mở ca sau giờ quy định (khung sáng)."""
    now = now_datetime()
    now_sec = now.hour * 3600 + now.minute * 60 + now.second

    wf = to_seconds(params.get("window_from", "07:30"))
    wt = to_seconds(params.get("window_to", "09:30"))
    if wf is not None and now_sec < wf:
        return
    if wt is not None and now_sec > wt:
        return

    today = getdate(now)
    is_sunday = today.weekday() == 6

    settings = frappe.get_cached_doc("TC Settings")
    for row in settings.get("pos_watch") or []:
        if is_sunday and not row.hoat_dong_cn:
            continue
        latest = to_seconds(row.gio_mo_cham_nhat)
        if latest is not None and now_sec < latest:
            continue  # chưa tới giờ mở chậm nhất

        # Đã có POS Opening Entry hôm nay (submitted) chưa?
        opened = frappe.db.exists(
            "POS Opening Entry",
            {"pos_profile": row.pos_profile, "posting_date": today, "docstatus": 1},
        )
        if opened:
            continue

        emit_signal(
            signal_type="He thong",
            severity=rule.get("default_severity") or "P1",
            domain=rule.get("domain"),
            title=f"POS chưa mở ca: {row.pos_profile}",
            description=f"POS Profile '{row.pos_profile}' chưa có POS Opening Entry hôm nay ({today}).",
            source_rule=rule.get("rule_code"),
            ref_doctype="POS Profile",
            ref_name=row.pos_profile,
        )


def opening_stuck_open(params, rule):
    """RULE-POS-02: POS Opening Entry ngày trước vẫn còn status Open."""
    today = getdate(now_datetime())
    # Opening entry của NGÀY TRƯỚC còn Open = ca chưa đóng → lệch số liệu.
    rows = frappe.get_all(
        "POS Opening Entry",
        filters={"status": "Open", "posting_date": ["<", today], "docstatus": 1},
        fields=["name", "pos_profile", "posting_date"],
    )
    for r in rows:
        emit_signal(
            signal_type="He thong",
            severity=rule.get("default_severity") or "P1",
            domain=rule.get("domain"),
            title=f"POS Opening treo Open: {r.pos_profile}",
            description=f"POS Opening Entry {r.name} ({r.posting_date}) vẫn đang Open.",
            source_rule=rule.get("rule_code"),
            ref_doctype="POS Opening Entry",
            ref_name=r.name,
        )
