#!/usr/bin/env bash
# Verify-before-ship KHÔNG cần bench: py_compile + node --check + validator (+ harness).
# Dùng: bash scripts/verify_all.sh   (thêm HARNESS=1 để chạy Chromium harness)
set -u
cd "$(dirname "$0")/.."
fail=0

echo "== py_compile =="
if python3 -m py_compile $(find tacchien scripts -name '*.py'); then echo "  OK"; else echo "  FAIL"; fail=1; fi

echo "== node --check (JS) =="
if command -v node >/dev/null 2>&1; then
  for f in $(find tacchien/public tests/browser -name '*.js' 2>/dev/null); do
    node --check "$f" || { echo "  FAIL $f"; fail=1; }
  done
  [ $fail -eq 0 ] && echo "  OK"
else
  echo "  (node không có — bỏ qua)"
fi

echo "== validator fixtures/doctype (gồm __init__.py package) =="
python3 scripts/validate_shipped_docs.py | tail -1
python3 scripts/validate_shipped_docs.py >/dev/null 2>&1 || fail=1

if [ "${HARNESS:-0}" = "1" ]; then
  echo "== Chromium harness =="
  node tests/browser/server.mjs >/tmp/tc_harness_srv.log 2>&1 & SRV=$!
  sleep 1
  node tests/browser/drive.mjs || fail=1
  kill $SRV 2>/dev/null
fi

find . -name __pycache__ -type d -prune -exec rm -rf {} + 2>/dev/null
echo
[ $fail -eq 0 ] && echo "✅ VERIFY PASS" || echo "❌ VERIFY FAIL"
exit $fail
