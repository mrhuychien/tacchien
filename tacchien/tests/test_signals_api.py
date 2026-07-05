"""Test API signals — act_on_signal + guard quyền (brief §8.7)."""

from __future__ import annotations

import frappe
from frappe.tests.utils import FrappeTestCase

from tacchien.api.signals import act_on_signal, get_signals
from tacchien.tc.emit import emit_signal

DOMAIN = "Hệ thống"
RULE = "RULE-TEST-ACT"
NOPERM = "tc_noperm@example.com"


class TestSignalsApi(FrappeTestCase):
    def setUp(self):
        frappe.set_user("Administrator")
        if not frappe.db.exists("TC Domain", DOMAIN):
            frappe.get_doc(
                {"doctype": "TC Domain", "title": DOMAIN, "cluster": "Nen tang"}
            ).insert(ignore_permissions=True)
        frappe.db.delete("TC Signal", {"source_rule": RULE})
        self.sig = emit_signal(
            signal_type="He thong",
            severity="P2",
            domain=DOMAIN,
            title="test act",
            source_rule=RULE,
            ref_doctype="Warehouse",
            ref_name="W-ACT",
        )
        frappe.db.commit()

    def tearDown(self):
        frappe.set_user("Administrator")
        frappe.db.delete("TC Signal", {"source_rule": RULE})
        frappe.db.commit()

    def _make_noperm_user(self):
        if not frappe.db.exists("User", NOPERM):
            frappe.get_doc(
                {
                    "doctype": "User",
                    "email": NOPERM,
                    "first_name": "NoPerm",
                    "send_welcome_email": 0,
                    "roles": [],
                }
            ).insert(ignore_permissions=True)
        return NOPERM

    def test_ack_then_resolve(self):
        res = act_on_signal(self.sig, "ack")
        self.assertEqual(res["status"], "Acked")
        self.assertEqual(res["acked_by"], "Administrator")
        res = act_on_signal(self.sig, "resolve")
        self.assertEqual(res["status"], "Resolved")

    def test_mute_sets_muted_until(self):
        res = act_on_signal(self.sig, "mute", mute_preset="1d")
        self.assertEqual(res["status"], "Muted")
        self.assertIsNotNone(res["muted_until"])

    def test_get_signals_returns_open(self):
        data = get_signals()
        names = [r["name"] for r in data["rows"]]
        self.assertIn(self.sig, names)
        self.assertEqual(len(data["domains"]), frappe.db.count("TC Domain", {"is_active": 1}))

    def test_get_signals_pillar_filter(self):
        # signal của setUp có pillar giam_sat (rule không tồn tại → mặc định).
        gs = get_signals(pillar="giam_sat")
        self.assertIn(self.sig, [r["name"] for r in gs["rows"]])
        bc = get_signals(pillar="bao_cao")
        self.assertNotIn(self.sig, [r["name"] for r in bc["rows"]])

    def test_giamsat_structure(self):
        from tacchien.api.giamsat import get_giamsat

        data = get_giamsat()
        self.assertIn("domains", data)
        self.assertIn("summary", data)
        for key in ("P1", "P2", "P3", "checks_failing", "checks_off"):
            self.assertIn(key, data["summary"])

    def test_permission_denied_without_role(self):
        user = self._make_noperm_user()
        frappe.set_user(user)
        try:
            with self.assertRaises(frappe.PermissionError):
                act_on_signal(self.sig, "ack")
        finally:
            frappe.set_user("Administrator")
