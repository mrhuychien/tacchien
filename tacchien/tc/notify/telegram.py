"""Telegram Bot API notifier (đã chốt: Bot API trực tiếp, token trong TC Settings).

send_signal chạy trong background job (frappe.enqueue) — retry 3 lần backoff.
Không hardcode token/chat_id; đọc từ TC Settings (Password field giải mã runtime).
"""

from __future__ import annotations

import time

import frappe

from tacchien.tc.notify.base import format_signal

_API = "https://api.telegram.org/bot{token}/sendMessage"
_RETRY_BACKOFF = [2, 4, 8]  # giây


def _credentials():
    settings = frappe.get_cached_doc("TC Settings")
    token = settings.get_password("telegram_bot_token", raise_exception=False)
    chat_id = settings.telegram_chat_id
    return token, chat_id


def send_text(text: str) -> bool:
    """Gửi 1 tin. Trả True nếu thành công. Retry 3 lần backoff."""
    token, chat_id = _credentials()
    if not token or not chat_id:
        frappe.log_error("TC Settings thiếu telegram_bot_token/chat_id", "tacchien telegram")
        return False

    import requests

    url = _API.format(token=token)
    payload = {"chat_id": chat_id, "text": text, "disable_web_page_preview": True}
    last_err = None
    for attempt, backoff in enumerate([0] + _RETRY_BACKOFF):
        if backoff:
            time.sleep(backoff)
        try:
            resp = requests.post(url, json=payload, timeout=10)
            if resp.ok:
                return True
            last_err = f"HTTP {resp.status_code}: {resp.text[:200]}"
        except Exception as exc:  # noqa: BLE001
            last_err = str(exc)
    frappe.log_error(f"Telegram gửi thất bại sau {len(_RETRY_BACKOFF)+1} lần: {last_err}", "tacchien telegram")
    return False


def send_signal(signal_name: str):
    """Enqueue target cho P1 (gọi từ TC Signal.after_insert)."""
    signal = frappe.get_doc("TC Signal", signal_name)
    send_text(format_signal(signal))
