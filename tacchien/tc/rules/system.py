"""Rule Hệ thống — backup & bất thường queue/error."""

from __future__ import annotations

import os

import frappe
from frappe.utils import now_datetime

from tacchien.tc.emit import emit_signal


def backup_check(params, rule):
    """RULE-SYS-02 (P2): backup đêm qua fail hoặc thiếu file mới trong N giờ."""
    max_age_hours = int(params.get("max_age_hours", 26))
    backup_dir = frappe.get_site_path("private", "backups")

    newest = None
    try:
        for fn in os.listdir(backup_dir):
            if fn.endswith((".sql.gz", ".sql")):
                mtime = os.path.getmtime(os.path.join(backup_dir, fn))
                newest = mtime if newest is None else max(newest, mtime)
    except OSError:
        newest = None

    if newest is None:
        emit_signal(
            signal_type="He thong",
            severity=rule.get("default_severity") or "P2",
            domain=rule.get("domain"),
            title="Không thấy file backup",
            description=f"Thư mục backup không có file .sql.gz nào.",
            source_rule=rule.get("rule_code"),
        )
        return

    age_h = (now_datetime().timestamp() - newest) / 3600
    if age_h > max_age_hours:
        emit_signal(
            signal_type="He thong",
            severity=rule.get("default_severity") or "P2",
            domain=rule.get("domain"),
            title="Backup quá cũ",
            description=f"Backup mới nhất ~{int(age_h)}h trước (ngưỡng {max_age_hours}h).",
            source_rule=rule.get("rule_code"),
        )


def queue_error_anomaly(params, rule):
    """RULE-SYS-01 (Batch B, P2): Error Log 15' qua > N× baseline/ngày."""
    window_min = int(params.get("window_min", 15))
    mult = float(params.get("error_multiplier", 5))
    now = now_datetime()

    recent = frappe.db.count(
        "Error Log", {"creation": [">", frappe.utils.add_to_date(now, minutes=-window_min)]}
    )
    # Baseline: trung bình số Error Log / cửa sổ trong 24h qua.
    day_total = frappe.db.count(
        "Error Log", {"creation": [">", frappe.utils.add_to_date(now, hours=-24)]}
    )
    windows_per_day = (24 * 60) / window_min
    baseline = max(1.0, day_total / windows_per_day)

    if recent > mult * baseline:
        emit_signal(
            signal_type="Bat thuong",
            severity=rule.get("default_severity") or "P2",
            domain=rule.get("domain"),
            title="Error Log tăng đột biến",
            description=f"{recent} lỗi trong {window_min}' (baseline ~{baseline:.1f}).",
            source_rule=rule.get("rule_code"),
        )
