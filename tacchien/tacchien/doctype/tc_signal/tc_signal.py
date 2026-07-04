"""TC Signal — tín hiệu tác chiến.

Signal chỉ được tạo qua tacchien.tc.emit.emit_signal (cửa duy nhất). Controller
này lo phần side-effect khi có signal MỚI: publish realtime + notify P1. Khi
emit_signal chỉ tăng occurrence (save, không insert) thì after_insert KHÔNG chạy
→ không notify lại (đúng thiết kế chống nhiễu).
"""

from __future__ import annotations

import frappe
from frappe.model.document import Document


class TCSignal(Document):
    def after_insert(self):
        payload = {
            "name": self.name,
            "severity": self.severity,
            "domain": self.domain,
            "title": self.title,
            "description": self.description,
            "status": self.status,
            "source_rule": self.source_rule,
            "creation": str(self.creation),
        }
        # Realtime cho SPA /tc (fallback polling 60s ở client nếu miss).
        frappe.publish_realtime("tc_signal_new", payload)

        # P1 → Telegram tức thì, LUÔN qua queue (không bao giờ block transaction).
        if self.severity == "P1":
            frappe.enqueue(
                "tacchien.tc.notify.telegram.send_signal",
                queue="short",
                signal_name=self.name,
            )


def on_doctype_update():
    """Composite index phục vụ feed & health strip (brief §3.2)."""
    frappe.db.add_index("TC Signal", ["status", "severity"])
    frappe.db.add_index("TC Signal", ["domain", "status"])
