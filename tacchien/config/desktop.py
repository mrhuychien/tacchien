from __future__ import annotations

from frappe import _


def get_data():
    return [
        {
            "module_name": "Tacchien",
            "type": "module",
            "label": _("Tác chiến"),
            "icon": "octicon octicon-radio-tower",
            "color": "#ef4444",
        }
    ]
