"""Desktop shell helpers for embedded WebUI mode."""

from __future__ import annotations

import importlib
import importlib.util


def has_webview_support() -> bool:
    """Return whether pywebview is available in current runtime."""
    return importlib.util.find_spec("webview") is not None


def open_desktop_window(start_url: str, title: str) -> bool:
    """Open embedded desktop window and block until user closes it."""
    try:
        webview = importlib.import_module("webview")
    except Exception:
        return False

    webview.create_window(
        title,
        url=start_url,
        width=1280,
        height=860,
        min_size=(1080, 700),
        resizable=True,
        text_select=True,
    )
    webview.start(debug=False)
    return True
