"""Overlay status dispatch helpers.

This module decouples API routes from the Tk overlay implementation.
Routes can publish status text without importing quick_overlay directly.
"""

from __future__ import annotations

import threading
from collections.abc import Callable

OverlayStatusHandler = Callable[[str, bool], None]

_handler_lock = threading.Lock()
_status_handler: OverlayStatusHandler | None = None


def register_overlay_status_handler(handler: OverlayStatusHandler | None) -> None:
    """Register or clear the active overlay status handler."""
    global _status_handler
    with _handler_lock:
        _status_handler = handler


def push_overlay_status(text: str, final: bool) -> None:
    """Push one status message to overlay when handler is available."""
    with _handler_lock:
        handler = _status_handler

    if handler is None:
        return

    try:
        handler(text, final)
    except Exception:
        # Overlay is best-effort only; never break API flow.
        return
