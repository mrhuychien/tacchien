"""Mapping kênh (Customer Group → MT/NPP/DL/Khac).

Gate 0 chốt: TÁI DÙNG từ app pkd. An toàn migrate: lazy-import + fallback —
nếu pkd chưa cài trên site thì tự dựng map từ TC Channel Map (root group) theo
cây nested set (lft/rgt). Cache 10' (cây group ít đổi; TC Settings.on_update xoá cache).

R2: path hàm mapping của pkd là GIẢ ĐỊNH; nếu pkd trả khác, chỉnh _from_pkd() 1 chỗ.
"""

from __future__ import annotations

import frappe

_CACHE_KEY = "tc_channel_map"
_CACHE_TTL = 600  # giây
_CHANNELS = ("MT", "NPP", "DL", "Khac")


def get_channel_map() -> dict[str, str]:
    """Trả {customer_group_name: kenh} cho MỌI nhóm khách. Cache 10'."""
    cached = frappe.cache().get_value(_CACHE_KEY)
    if cached is not None:
        return cached

    source = frappe.db.get_single_value("TC Settings", "channel_source") or "pkd"
    cmap = None
    if source == "pkd":
        cmap = _from_pkd()
    if not cmap:
        cmap = _from_settings()

    frappe.cache().set_value(_CACHE_KEY, cmap, expires_in_sec=_CACHE_TTL)
    return cmap


def channel_of(customer_group: str | None, cmap: dict | None = None) -> str:
    if not customer_group:
        return "Khac"
    cmap = cmap if cmap is not None else get_channel_map()
    return cmap.get(customer_group, "Khac")


def _from_pkd() -> dict | None:
    """Tái dùng mapping của pkd nếu cài. Lazy + guarded — KHÔNG để vỡ migrate."""
    try:
        fn = frappe.get_attr("pkd.api.channels.channel_map_by_group")
    except Exception:
        return None
    try:
        result = fn()
        if isinstance(result, dict) and result:
            return result
    except Exception:
        frappe.log_error("pkd channel map lỗi, fallback TC Channel Map", "tacchien channels")
    return None


def _from_settings() -> dict[str, str]:
    """Dựng map từ TC Channel Map (root → kênh) + cây nested set Customer Group."""
    cmap: dict[str, str] = {}
    rows = frappe.get_all(
        "TC Channel Map",
        filters={"parenttype": "TC Settings"},
        fields=["customer_group", "kenh"],
    )
    for row in rows:
        if row.kenh not in _CHANNELS:
            continue
        node = frappe.db.get_value(
            "Customer Group", row.customer_group, ["lft", "rgt"], as_dict=True
        )
        if not node:
            continue
        # Mọi nhóm con (lft..rgt) thuộc root này → cùng kênh.
        children = frappe.get_all(
            "Customer Group",
            filters={"lft": [">=", node.lft], "rgt": ["<=", node.rgt]},
            pluck="name",
        )
        for g in children:
            cmap.setdefault(g, row.kenh)
    return cmap
