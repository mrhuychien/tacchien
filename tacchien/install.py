"""Cài đặt app tacchien.

Quyền được gán ở ĐÂY (không dùng custom_docperm.json — bài học iso22000_fsms).
Idempotent: chạy lại sau mỗi migrate/reinstall không nhân đôi.
"""

from __future__ import annotations

import frappe
from frappe.permissions import add_permission, update_permission_property

ROLE = "Tac Chien"

# DocType → danh sách (perm_dict) cho role Tac Chien.
# read=1 mặc định khi add_permission; các quyền khác set qua update_permission_property.
_PERMS = {
    "TC Signal": {"read": 1, "write": 1},
    "TC Domain": {"read": 1},
    "TC Rule": {"read": 1, "write": 1},
    "TC Obligation": {"read": 1, "write": 1, "create": 1, "delete": 1},
    "TC Settings": {"read": 1, "write": 1},
}

_SLA_DOCTYPES_DEFAULT = "\n".join(
    [
        "Sales Invoice",
        "Sales Order",
        "Delivery Note",
        "Stock Entry",
        "Payment Entry",
        "Purchase Order",
        "Purchase Invoice",
        "Material Request",
    ]
)


def after_install():
    _ensure_role()
    _grant_permissions()
    _seed_settings()
    frappe.db.commit()


def _ensure_role():
    if not frappe.db.exists("Role", ROLE):
        frappe.get_doc(
            {
                "doctype": "Role",
                "role_name": ROLE,
                "desk_access": 1,
            }
        ).insert(ignore_permissions=True)


def _grant_permissions():
    for doctype, perms in _PERMS.items():
        if not frappe.db.exists("DocType", doctype):
            # DocType chưa sync (chạy trước model sync) — bỏ qua, migrate sau sẽ gọi lại.
            continue
        # add_permission tạo dòng permlevel 0 với read=1 nếu chưa có.
        add_permission(doctype, ROLE, 0)
        for ptype, value in perms.items():
            update_permission_property(doctype, ROLE, 0, ptype, value)


def _seed_settings():
    if not frappe.db.exists("DocType", "TC Settings"):
        return
    settings = frappe.get_single("TC Settings")
    changed = False
    defaults = {
        "gio_lam_viec_tu": "07:30:00",
        "gio_lam_viec_den": "17:30:00",
        "digest_hour": 7,
        "sla_duyet_gio": 4,
        "sla_doctypes": _SLA_DOCTYPES_DEFAULT,
        "perm_whitelist_users": "Administrator",
        "channel_source": "pkd",
    }
    for field, value in defaults.items():
        if not settings.get(field):
            settings.set(field, value)
            changed = True
    if changed:
        settings.save(ignore_permissions=True)
