"""Context cho SPA /tc. Quyền THẬT kiểm ở đây + guard trong mỗi API."""

from __future__ import annotations

import frappe
from frappe import _

SHELL_BUILD = "0.1.0"  # phải khớp BUILD trong shell.js (Luật vàng #2)


def get_context(context):
    if frappe.session.user == "Guest":
        raise frappe.PermissionError

    roles = set(frappe.get_roles())
    if "Tac Chien" not in roles and "System Manager" not in roles:
        frappe.throw(_("Bạn không có quyền truy cập Màn hình tác chiến."), frappe.PermissionError)

    context.no_cache = 1
    context.tc_user = frappe.session.user
    context.tc_is_manager = "System Manager" in roles
    context.tc_roles = list(roles)
    context.shell_build = SHELL_BUILD
    context.csrf_token = frappe.sessions.get_csrf_token()
    return context
