"""In-memory send history for VanceSender.

Stores recent send results in a thread-safe ring buffer.
No persistence — history is cleared on restart.
"""

from __future__ import annotations

import threading
import uuid
from collections import deque
from datetime import UTC, datetime
from typing import Any

_MAX_HISTORY = 200
_history: deque[dict[str, Any]] = deque(maxlen=_MAX_HISTORY)
_lock = threading.Lock()


def record_send(
    text: str,
    source: str = "webui",
    success: bool = True,
    error: str | None = None,
) -> None:
    """Record a single send result into the history buffer."""
    entry = {
        "id": uuid.uuid4().hex[:8],
        "text": text,
        "source": source,
        "success": success,
        "error": error,
        "timestamp": datetime.now(UTC).isoformat(),
    }
    with _lock:
        _history.appendleft(entry)


def get_history(limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
    """Return a page of history entries (newest first)."""
    with _lock:
        items = list(_history)
    return items[offset : offset + limit]


def get_total() -> int:
    """Return total number of history entries."""
    with _lock:
        return len(_history)


def clear_history() -> None:
    """Clear all history entries."""
    with _lock:
        _history.clear()
