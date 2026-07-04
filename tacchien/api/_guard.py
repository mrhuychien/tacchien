"""Guard quyền — gọi ở DÒNG ĐẦU mọi whitelisted method (quyền thật ở server)."""

from __future__ import annotations

import frappe
from frappe import _

ROLE = "Tac Chien"


def guard():
    """Chặn nếu user không có role Tac Chien (System Manager luôn qua)."""
    roles = set(frappe.get_roles())
    if ROLE in roles or "System Manager" in roles:
        return
    frappe.throw(_("Bạn không có quyền truy cập Màn hình tác chiến."), frappe.PermissionError)
