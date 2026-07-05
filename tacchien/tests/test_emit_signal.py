"""Test emit_signal — dedup discipline (brief §8.7)."""

from __future__ import annotations

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_to_date, now_datetime

from tacchien.tc.emit import dedup_key, emit_signal

DOMAIN = "Hệ thống"
RULE = "RULE-TEST-EMIT"


class TestEmitSignal(FrappeTestCase):
    def setUp(self):
        if not frappe.db.exists("TC Domain", DOMAIN):
            frappe.get_doc(
                {"doctype": "TC Domain", "title": DOMAIN, "cluster": "Nen tang"}
            ).insert(ignore_permissions=True)
        # dọn signal test cũ
        frappe.db.delete("TC Signal", {"source_rule": RULE})
        frappe.db.commit()

    def tearDown(self):
        frappe.db.delete("TC Signal", {"source_rule": RULE})
        frappe.db.commit()

    def _emit(self, severity="P2", title="tồn âm A", ref="W-01"):
        return emit_signal(
            signal_type="Bat thuong",
            severity=severity,
            domain=DOMAIN,
            title=title,
            source_rule=RULE,
            ref_doctype="Warehouse",
            ref_name=ref,
        )

    def test_create_new(self):
        name = self._emit()
        self.assertTrue(name)
        doc = frappe.get_doc("TC Signal", name)
        self.assertEqual(doc.occurrence_count, 1)
        self.assertEqual(doc.status, "Open")
        self.assertEqual(doc.pillar, "giam_sat")  # rule không tồn tại → mặc định
        self.assertEqual(
            doc.dedup_key, dedup_key(RULE, DOMAIN, "Warehouse", "W-01", "tồn âm A")
        )

    def test_pillar_from_rule(self):
        code = "RULE-TEST-PILLAR"
        if not frappe.db.exists("TC Rule", code):
            frappe.get_doc(
                {
                    "doctype": "TC Rule",
                    "rule_code": code,
                    "title": "test pillar",
                    "domain": DOMAIN,
                    "default_severity": "P2",
                    "pillar": "bao_cao",
                    "method_path": "tacchien.tc.rules.pos.opening_late",
                }
            ).insert(ignore_permissions=True)
        frappe.cache().hdel("tc_rule_pillar", code)
        name = emit_signal(
            signal_type="Nguong", severity="P2", domain=DOMAIN,
            title="pillar theo rule", source_rule=code,
        )
        self.assertEqual(frappe.db.get_value("TC Signal", name, "pillar"), "bao_cao")
        frappe.db.delete("TC Signal", {"source_rule": code})
        frappe.delete_doc("TC Rule", code, ignore_permissions=True, force=True)

    def test_increment_and_escalate(self):
        first = self._emit(severity="P2")
        second = self._emit(severity="P2")
        self.assertEqual(first, second)  # cùng signal, không tạo mới
        doc = frappe.get_doc("TC Signal", first)
        self.assertEqual(doc.occurrence_count, 2)
        # escalate: P2 -> P1 khi tái phát nặng hơn
        third = self._emit(severity="P1")
        self.assertEqual(third, first)
        doc.reload()
        self.assertEqual(doc.occurrence_count, 3)
        self.assertEqual(doc.severity, "P1")
        self.assertEqual(
            frappe.db.count("TC Signal", {"source_rule": RULE}), 1
        )

    def test_muted_swallows(self):
        name = self._emit(severity="P2")
        doc = frappe.get_doc("TC Signal", name)
        doc.status = "Muted"
        doc.muted_until = add_to_date(now_datetime(), hours=1)
        doc.save(ignore_permissions=True)
        # emit lại cùng key khi đang Muted còn hạn → nuốt, không tạo mới
        result = self._emit(severity="P2")
        self.assertIsNone(result)
        self.assertEqual(
            frappe.db.count("TC Signal", {"source_rule": RULE}), 1
        )
