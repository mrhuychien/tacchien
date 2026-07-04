"""Test rule OBL-01 (mốc lead) + AR-02 (công nợ quá hạn). Brief §8.7."""

from __future__ import annotations

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from tacchien.tc.rules import finance, obligation

DOM_LEGAL = "Pháp lý · tuân thủ"
DOM_FIN = "Tài chính · dòng tiền"


def _ensure_domain(name, cluster="Nen tang"):
    if not frappe.db.exists("TC Domain", name):
        frappe.get_doc({"doctype": "TC Domain", "title": name, "cluster": cluster}).insert(
            ignore_permissions=True
        )


class TestObligationScan(FrappeTestCase):
    RULE = {"rule_code": "RULE-OBL-01", "domain": DOM_LEGAL, "default_severity": "P2"}

    def setUp(self):
        _ensure_domain(DOM_LEGAL)
        frappe.db.delete("TC Signal", {"source_rule": "RULE-OBL-01"})
        self._obl = []

    def tearDown(self):
        for name in self._obl:
            frappe.delete_doc("TC Obligation", name, ignore_permissions=True, force=True)
        frappe.db.delete("TC Signal", {"source_rule": "RULE-OBL-01"})
        frappe.db.commit()

    def _make(self, ten, days_from_today):
        doc = frappe.get_doc(
            {
                "doctype": "TC Obligation",
                "ten": ten,
                "loai": "Khac",
                "ngay_het_han": add_days(nowdate(), days_from_today),
                "lead_p2_ngay": 30,
                "lead_p3_ngay": 60,
                "trang_thai": "Hieu luc",
            }
        ).insert(ignore_permissions=True)
        self._obl.append(doc.name)
        return doc.name

    def _sev(self, ref):
        return frappe.db.get_value(
            "TC Signal", {"source_rule": "RULE-OBL-01", "ref_name": ref}, "severity"
        )

    def test_tiers(self):
        far = self._make("Xa han", 70)     # > lead_p3 → không kêu
        p3 = self._make("Muc P3", 50)      # <= 60, > 30
        p2 = self._make("Muc P2", 20)      # <= 30
        p1 = self._make("Qua han", -5)     # âm → quá hạn
        obligation.scan({}, self.RULE)

        self.assertIsNone(self._sev(far))
        self.assertEqual(self._sev(p3), "P3")
        self.assertEqual(self._sev(p2), "P2")
        self.assertEqual(self._sev(p1), "P1")

    def test_escalate_on_rerun(self):
        ref = self._make("Escalate", 50)   # P3
        obligation.scan({}, self.RULE)
        self.assertEqual(self._sev(ref), "P3")
        # Đổi hạn về gần (P2) rồi quét lại → cùng signal escalate P3→P2.
        frappe.db.set_value("TC Obligation", ref, "ngay_het_han", add_days(nowdate(), 20))
        obligation.scan({}, self.RULE)
        self.assertEqual(self._sev(ref), "P2")
        self.assertEqual(frappe.db.count("TC Signal", {"source_rule": "RULE-OBL-01", "ref_name": ref}), 1)


class TestOverdueAR(FrappeTestCase):
    RULE = {"rule_code": "RULE-AR-02", "domain": DOM_FIN, "default_severity": "P2"}
    CUST = "_TC Overdue Customer"

    def setUp(self):
        _ensure_domain(DOM_FIN)
        frappe.db.delete("TC Signal", {"source_rule": "RULE-AR-02"})
        self._si = None
        try:
            self._setup_invoice()
        except Exception as exc:
            self.skipTest(f"site thiếu scaffolding kế toán để tạo SI: {exc}")

    def tearDown(self):
        if self._si:
            try:
                doc = frappe.get_doc("Sales Invoice", self._si)
                if doc.docstatus == 1:
                    doc.cancel()
                frappe.delete_doc("Sales Invoice", self._si, ignore_permissions=True, force=True)
            except Exception:
                pass
        frappe.db.delete("TC Signal", {"source_rule": "RULE-AR-02"})
        frappe.db.commit()

    def _setup_invoice(self):
        company = frappe.defaults.get_global_default("company") or frappe.db.get_value("Company", {}, "name")
        if not company:
            raise RuntimeError("no company")
        if not frappe.db.exists("Customer", self.CUST):
            frappe.get_doc(
                {
                    "doctype": "Customer",
                    "customer_name": self.CUST,
                    "customer_group": frappe.db.get_value("Customer Group", {"is_group": 0}, "name"),
                    "territory": frappe.db.get_value("Territory", {"is_group": 0}, "name"),
                }
            ).insert(ignore_permissions=True)
        item = frappe.db.get_value("Item", {"is_sales_item": 1, "disabled": 0}, "name")
        if not item:
            raise RuntimeError("no sales item")
        si = frappe.get_doc(
            {
                "doctype": "Sales Invoice",
                "customer": self.CUST,
                "company": company,
                "due_date": add_days(nowdate(), -40),
                "set_posting_time": 1,
                "posting_date": add_days(nowdate(), -45),
                "items": [{"item_code": item, "qty": 1, "rate": 1_000_000}],
            }
        )
        si.insert(ignore_permissions=True)
        si.submit()
        self._si = si.name

    def test_overdue_emits_signal(self):
        finance.overdue_ar({"overdue_days": 10}, self.RULE)
        sev = frappe.db.get_value(
            "TC Signal", {"source_rule": "RULE-AR-02", "ref_name": self.CUST}, "severity"
        )
        self.assertEqual(sev, "P2")
