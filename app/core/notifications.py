"""In-memory notification store for surfacing warnings to the WebUI.

Notifications are lightweight warning/error messages that accumulate in
memory and can be retrieved (and cleared) by the frontend via API.  This
replaces raw ``print()`` warnings so that users running in GUI mode still
see important messages.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any

_logger = logging.getLogger(__name__)

_MAX_NOTIFICATIONS = 50


@dataclass(slots=True)
class Notification:
    level: str  # "warning" | "error" | "info"
    message: str
    timestamp: float = field(default_factory=time.time)


_lock = threading.Lock()
_store: list[Notification] = []


def push_notification(message: str, *, level: str = "warning") -> None:
    """Append a notification and log it at the appropriate level.

    The message is stored for the frontend AND printed via logging so it
    still appears in the console when available.
    """
    entry = Notification(level=level, message=message)

    with _lock:
        _store.append(entry)
        if len(_store) > _MAX_NOTIFICATIONS:
            _store[:] = _store[-_MAX_NOTIFICATIONS:]

    log_level = {
        "error": logging.ERROR,
        "warning": logging.WARNING,
        "info": logging.INFO,
    }.get(level, logging.WARNING)
    _logger.log(log_level, "%s", message)


def get_notifications(*, clear: bool = False) -> list[dict[str, Any]]:
    """Return all stored notifications as serializable dicts.

    When *clear* is True the store is emptied after reading.
    """
    with _lock:
        items = [
            {
                "level": n.level,
                "message": n.message,
                "timestamp": n.timestamp,
            }
            for n in _store
        ]
        if clear:
            _store.clear()
    return items
