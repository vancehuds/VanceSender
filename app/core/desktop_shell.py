"""Desktop shell helpers for embedded WebUI mode."""

from __future__ import annotations

import importlib
import importlib.util
import threading
from typing import Literal

_window_lock = threading.Lock()
_desktop_window: object | None = None
_window_maximized = False


def _set_desktop_window(window: object | None) -> None:
    """Store current desktop window handle for runtime controls."""
    global _desktop_window
    with _window_lock:
        _desktop_window = window


def _get_desktop_window() -> object | None:
    """Return current desktop window handle if available."""
    with _window_lock:
        return _desktop_window


def _set_window_maximized(value: bool) -> None:
    """Persist current maximize state for custom titlebar controls."""
    global _window_maximized
    with _window_lock:
        _window_maximized = value


def _get_window_maximized() -> bool:
    """Read cached maximize state for desktop window."""
    with _window_lock:
        return _window_maximized


def has_webview_support() -> bool:
    """Return whether pywebview is available in current runtime."""
    return importlib.util.find_spec("webview") is not None


def is_desktop_window_active() -> bool:
    """Return whether a desktop embedded window is currently active."""
    return _get_desktop_window() is not None


def perform_window_action(
    action: Literal["minimize", "maximize", "restore", "close"],
) -> bool:
    """Perform a window action for currently active desktop shell window."""
    window = _get_desktop_window()
    if window is None:
        return False

    method_name = {
        "minimize": "minimize",
        "maximize": "maximize",
        "restore": "restore",
        "close": "destroy",
    }.get(action)
    if method_name is None:
        return False

    method = getattr(window, method_name, None)
    if not callable(method):
        return False

    try:
        method()
    except Exception:
        return False

    if action == "maximize":
        _set_window_maximized(True)
    elif action in {"restore", "minimize", "close"}:
        _set_window_maximized(False)

    if action == "close":
        _set_desktop_window(None)

    return True


def get_desktop_window_state() -> dict[str, bool]:
    """Return active/maximized state for custom window titlebar UI."""
    return {
        "active": is_desktop_window_active(),
        "maximized": _get_window_maximized(),
    }


def open_desktop_window(start_url: str, title: str) -> bool:
    """Open embedded desktop window and block until user closes it."""
    try:
        webview = importlib.import_module("webview")
    except Exception:
        return False

    try:
        window = webview.create_window(
            title,
            url=start_url,
            width=1280,
            height=860,
            min_size=(1080, 700),
            resizable=True,
            text_select=True,
            frameless=True,
            easy_drag=True,
        )
    except Exception:
        return False

    _set_desktop_window(window)
    _set_window_maximized(False)
    try:
        webview.start(debug=False)
    finally:
        _set_desktop_window(None)
        _set_window_maximized(False)
    return True
