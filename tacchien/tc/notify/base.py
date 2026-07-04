"""Notifier adapter — lõi không biết kênh cụ thể.

Phase 1 chỉ có Telegram. Muốn cắm thêm kênh (AKASHIC…) sau này: viết một hàm
send_text(text) mới và thêm vào danh sách notifier — KHÔNG sửa emit/rule.
"""

from __future__ import annotations

import frappe


def desk_url(ref_doctype: str | None, ref_name: str | None) -> str:
    """Link Desk tới ref document (nếu có)."""
    if not ref_doctype or not ref_name:
        return frappe.utils.get_url()
    return f"{frappe.utils.get_url()}/app/{frappe.scrub(ref_doctype).replace('_', '-')}/{ref_name}"


_SEV_ICON = {"P1": "🔴", "P2": "🟡", "P3": "🔵"}


def format_signal(signal) -> str:
    """`🔴 P1 · <title>\\n<domain> · <description>\\n<desk link>` (brief §5)."""
    icon = _SEV_ICON.get(signal.severity, "⚪")
    lines = [f"{icon} {signal.severity} · {signal.title}"]
    detail = f"{signal.domain}"
    if signal.description:
        detail += f" · {signal.description}"
    lines.append(detail)
    if signal.ref_doctype and signal.ref_name:
        lines.append(desk_url(signal.ref_doctype, signal.ref_name))
    return "\n".join(lines)
