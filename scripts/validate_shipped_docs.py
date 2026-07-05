#!/usr/bin/env python3
"""Validator cho app tacchien (chạy được KHÔNG cần bench).

Thay cho `bench` khi verify trước ship:
  - DocType JSON hợp lệ, fieldname ASCII, không trùng, field_order khớp fields,
    Link/Select có options, non-child có ít nhất 1 permission.
  - Fixtures hợp lệ; TC Rule.domain trỏ tới TC Domain có thật; params là JSON.
  - Mọi package Python có __init__.py.
Exit code != 0 nếu có ERROR.

Dùng:  python3 scripts/validate_shipped_docs.py
"""

from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "tacchien")
DOCTYPE_DIR = os.path.join(APP, "tacchien", "doctype")
FIXTURES_DIR = os.path.join(APP, "fixtures")

errors: list[str] = []
warns: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warns.append(msg)


def is_ascii(s: str) -> bool:
    try:
        s.encode("ascii")
        return True
    except UnicodeEncodeError:
        return False


NO_OPTIONS_LINKISH = {"Dynamic Link"}  # options = fieldname khác, không phải doctype


def load_json(path: str):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def validate_doctype(path: str) -> dict | None:
    try:
        dt = load_json(path)
    except json.JSONDecodeError as exc:
        err(f"[JSON] {path}: {exc}")
        return None

    name = dt.get("name", os.path.basename(path))
    fields = dt.get("fields", [])
    field_order = dt.get("field_order", [])
    fieldnames = [f.get("fieldname") for f in fields if f.get("fieldname")]

    # fieldname ASCII + không trùng
    seen = set()
    for f in fields:
        fn = f.get("fieldname")
        ft = f.get("fieldtype")
        if not fn:
            # layout field (Section/Column Break) đôi khi vẫn có fieldname; nếu thiếu, cảnh báo nhẹ
            if ft not in ("Section Break", "Column Break"):
                err(f"[{name}] field thiếu fieldname: {f.get('label')}")
            continue
        if not is_ascii(fn):
            err(f"[{name}] fieldname KHÔNG ASCII: {fn}")
        if fn in seen:
            err(f"[{name}] fieldname trùng: {fn}")
        seen.add(fn)
        # Link/Table/Select cần options
        if ft in ("Link", "Table") and not f.get("options"):
            err(f"[{name}] {ft} '{fn}' thiếu options")
        if ft == "Select" and not f.get("options"):
            warn(f"[{name}] Select '{fn}' không có options")
        if ft == "Dynamic Link":
            opt = f.get("options")
            if opt not in fieldnames:
                err(f"[{name}] Dynamic Link '{fn}' options='{opt}' không trỏ tới field trong doctype")

    # field_order khớp fields
    if set(field_order) != set(fieldnames):
        missing = set(fieldnames) - set(field_order)
        extra = set(field_order) - set(fieldnames)
        if missing:
            err(f"[{name}] field_order THIẾU: {sorted(missing)}")
        if extra:
            err(f"[{name}] field_order THỪA (không có field): {sorted(extra)}")

    # permission cho non-child
    if not dt.get("istable") and not dt.get("permissions"):
        err(f"[{name}] DocType không child nhưng KHÔNG có permission block")

    # module
    if dt.get("module") != "Tacchien":
        err(f"[{name}] module != Tacchien: {dt.get('module')}")

    return dt


def main() -> int:
    # 1) DocTypes
    doctypes: dict[str, dict] = {}
    if not os.path.isdir(DOCTYPE_DIR):
        err(f"Không thấy thư mục doctype: {DOCTYPE_DIR}")
    else:
        for sub in sorted(os.listdir(DOCTYPE_DIR)):
            d = os.path.join(DOCTYPE_DIR, sub)
            if not os.path.isdir(d) or sub == "__pycache__":
                continue
            jf = os.path.join(d, f"{sub}.json")
            if not os.path.exists(jf):
                err(f"[{sub}] thiếu file {sub}.json")
                continue
            dt = validate_doctype(jf)
            if dt:
                doctypes[dt.get("name")] = dt
            # __init__.py + controller
            if not os.path.exists(os.path.join(d, "__init__.py")):
                err(f"[{sub}] thiếu __init__.py")
            if not os.path.exists(os.path.join(d, f"{sub}.py")):
                warn(f"[{sub}] thiếu controller {sub}.py")

    # 2) Fixtures
    domain_names: set[str] = set()
    dom_fx = os.path.join(FIXTURES_DIR, "tc_domain.json")
    if os.path.exists(dom_fx):
        try:
            for rec in load_json(dom_fx):
                domain_names.add(rec.get("name"))
                if not is_ascii(rec.get("cluster", "")):
                    warn(f"[fixture TC Domain] cluster có dấu: {rec.get('name')}")
                if rec.get("pillar") not in ("bao_cao", "giam_sat"):
                    err(f"[fixture TC Domain] {rec.get('name')}: pillar không hợp lệ ({rec.get('pillar')})")
        except json.JSONDecodeError as exc:
            err(f"[JSON] tc_domain.json: {exc}")
    else:
        err("Thiếu fixtures/tc_domain.json")

    if len(domain_names) != 13:
        err(f"TC Domain seed = {len(domain_names)} (mong đợi 13)")

    rule_fx = os.path.join(FIXTURES_DIR, "tc_rule.json")
    if os.path.exists(rule_fx):
        try:
            rules = load_json(rule_fx)
        except json.JSONDecodeError as exc:
            err(f"[JSON] tc_rule.json: {exc}")
            rules = []
        codes = set()
        enabled_a = 0
        for r in rules:
            code = r.get("rule_code")
            if code in codes:
                err(f"[fixture TC Rule] rule_code trùng: {code}")
            codes.add(code)
            dom = r.get("domain")
            if domain_names and dom not in domain_names:
                err(f"[fixture TC Rule] {code}: domain '{dom}' không có trong TC Domain")
            # params JSON hợp lệ
            p = r.get("params", "{}")
            if isinstance(p, str):
                try:
                    json.loads(p)
                except json.JSONDecodeError:
                    err(f"[fixture TC Rule] {code}: params không phải JSON hợp lệ")
            mp = r.get("method_path", "")
            if not mp.startswith("tacchien."):
                err(f"[fixture TC Rule] {code}: method_path lạ: {mp}")
            if r.get("pillar") not in ("giam_sat", "bao_cao"):
                err(f"[fixture TC Rule] {code}: pillar không hợp lệ ({r.get('pillar')})")
            if r.get("enabled"):
                enabled_a += 1
        if len(rules) != 18:
            err(f"TC Rule seed = {len(rules)} (mong đợi 18)")
        # Batch A = 10 rule enabled (theo blueprint)
        if enabled_a != 10:
            warn(f"Rule enabled (Batch A) = {enabled_a} (blueprint: 10)")
    else:
        err("Thiếu fixtures/tc_rule.json")

    role_fx = os.path.join(FIXTURES_DIR, "role.json")
    if not os.path.exists(role_fx):
        err("Thiếu fixtures/role.json")

    # 3) __init__.py cho các package chính
    for pkg in ["", "api", "tc", "tc/rules", "tc/notify", "config", "tests", "tacchien", "tacchien/doctype"]:
        p = os.path.join(APP, pkg, "__init__.py")
        if not os.path.exists(p):
            err(f"Thiếu __init__.py: {os.path.relpath(p, ROOT)}")

    # Report
    print(f"DocTypes: {len(doctypes)} | Domain seed: {len(domain_names)}")
    for w in warns:
        print(f"  WARN  {w}")
    for e in errors:
        print(f"  ERROR {e}")
    print(f"\n{len(errors)} ERROR, {len(warns)} WARN")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
