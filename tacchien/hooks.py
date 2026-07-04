from __future__ import annotations

app_name = "tacchien"
app_title = "Tác chiến"
app_publisher = "RVHG"
app_description = "Màn hình tác chiến RVHG — signal war room"
app_email = "it@rvhg.local"
app_license = "mit"
app_version = "0.1.0"

# ---------------------------------------------------------------------------
# Install
# ---------------------------------------------------------------------------
after_install = "tacchien.install.after_install"

# ---------------------------------------------------------------------------
# Fixtures — seed danh mục & registry. Permissions gán trong install.py.
# ---------------------------------------------------------------------------
fixtures = [
    {"dt": "Role", "filters": [["name", "in", ["Tac Chien"]]]},
    {"dt": "TC Domain"},
    {"dt": "TC Rule"},
]

# ---------------------------------------------------------------------------
# Scheduler — chỉ MỘT cron mỗi phút cho dispatcher. Mọi lịch rule nằm trong
# TC Rule.params; dispatcher tự quyết rule nào đến hạn (brief §8, không rải cron).
# ---------------------------------------------------------------------------
scheduler_events = {
    "cron": {
        "* * * * *": ["tacchien.tc.dispatcher.tick"],
    },
}

# ---------------------------------------------------------------------------
# doc_events — RULE-SEC-01: thay đổi permission bởi user ngoài whitelist → P1.
# Handler tự guard try/except, không bao giờ chặn transaction gốc.
# ---------------------------------------------------------------------------
_perm_handler = "tacchien.tc.rules.security.on_perm_change"
doc_events = {
    # User: chỉ tạo mới / xoá (đổi mật khẩu, last_login... KHÔNG phải đổi quyền →
    # tránh false-positive). Gán/thu hồi role đi qua "Has Role" bên dưới.
    "User": {
        "after_insert": _perm_handler,
        "on_trash": _perm_handler,
    },
    "Has Role": {
        "after_insert": _perm_handler,
        "on_trash": _perm_handler,
    },
    "Custom DocPerm": {
        "after_insert": _perm_handler,
        "on_update": _perm_handler,
        "on_trash": _perm_handler,
    },
}

# ---------------------------------------------------------------------------
# Website route — SPA /tc phục vụ từ www/tc.html (hash routing phía client).
# ---------------------------------------------------------------------------
website_route_rules = [
    {"from_route": "/tc/<path:app_path>", "to_route": "tc"},
]
