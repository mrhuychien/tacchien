"""TC Settings (Single).

on_update xoá cache channel-map vì đổi root nhóm khách phải rebuild (bài học pkd).
"""

from __future__ import annotations

import frappe
from frappe.model.document import Document


class TCSettings(Document):
    def on_update(self):
        frappe.cache().delete_value("tc_channel_map")
