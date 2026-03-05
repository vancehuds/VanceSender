"""AI generation history persistence for VanceSender.

Stores AI generation results as individual JSON files under ``data/ai_history/``.
Supports listing, starring, deleting, and auto-cleanup of old entries.

Performance: Uses an in-memory index cache to avoid re-reading all JSON files
on every list_history call. The index is invalidated when the directory mtime
changes, or when mutations (save/star/delete) occur.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.config import DATA_DIR

log = logging.getLogger(__name__)

AI_HISTORY_DIR = DATA_DIR / "ai_history"
_MAX_UNSTARRED = 100

# ── In-memory index cache ─────────────────────────────────────────────────

_index_lock = threading.Lock()
_index_cache: list[dict[str, Any]] | None = None  # sorted desc by timestamp
_index_dir_mtime: float = 0.0  # last known mtime of AI_HISTORY_DIR


def _ensure_dir() -> None:
    AI_HISTORY_DIR.mkdir(parents=True, exist_ok=True)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _write_json(path: Path, data: dict[str, Any]) -> None:
    """Atomic JSON write via temp-file + rename."""
    _ensure_dir()
    fd, tmp = tempfile.mkstemp(suffix=".tmp", prefix="aih_", dir=str(AI_HISTORY_DIR))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, str(path))
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _invalidate_cache() -> None:
    """Mark the index cache as stale so it will be rebuilt on next read."""
    global _index_cache
    with _index_lock:
        _index_cache = None


def _get_dir_mtime() -> float:
    """Get the directory mtime, or 0 if it doesn't exist."""
    try:
        return AI_HISTORY_DIR.stat().st_mtime
    except OSError:
        return 0.0


def _rebuild_index() -> list[dict[str, Any]]:
    """Read all JSON files and build sorted index. Called under lock."""
    _ensure_dir()
    entries: list[dict[str, Any]] = []
    for fp in AI_HISTORY_DIR.glob("gen_*.json"):
        try:
            with open(fp, encoding="utf-8") as f:
                entries.append(json.load(f))
        except (json.JSONDecodeError, OSError):
            continue
    entries.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
    return entries


def _get_index() -> list[dict[str, Any]]:
    """Get the cached index, rebuilding if stale or missing."""
    global _index_cache, _index_dir_mtime

    current_mtime = _get_dir_mtime()

    with _index_lock:
        if _index_cache is not None and current_mtime == _index_dir_mtime:
            return _index_cache

        log.debug("Rebuilding AI history index (mtime changed)")
        _index_cache = _rebuild_index()
        _index_dir_mtime = current_mtime
        return _index_cache


# ── Public API ────────────────────────────────────────────────────────────


def save_generation(
    scenario: str,
    style: str,
    text_type: str,
    provider_id: str,
    texts: list[dict[str, str]],
) -> dict[str, Any]:
    """Save a new AI generation result. Returns the saved entry."""
    _ensure_dir()
    gen_id = f"gen_{uuid.uuid4().hex[:8]}"
    entry = {
        "id": gen_id,
        "scenario": scenario,
        "style": style,
        "text_type": text_type,
        "provider_id": provider_id,
        "texts": texts,
        "starred": False,
        "timestamp": _now_iso(),
    }
    _write_json(AI_HISTORY_DIR / f"{gen_id}.json", entry)
    _invalidate_cache()
    _auto_cleanup()
    return entry


def list_history(limit: int = 20, offset: int = 0) -> tuple[list[dict[str, Any]], int]:
    """List AI history entries sorted by timestamp descending.

    Uses an in-memory index cache for fast repeated reads.
    Returns (items, total_count).
    """
    entries = _get_index()
    total = len(entries)
    return entries[offset : offset + limit], total


def toggle_star(gen_id: str) -> dict[str, Any] | None:
    """Toggle the starred status of an entry. Returns updated entry or None."""
    path = AI_HISTORY_DIR / f"{gen_id}.json"
    if not path.exists():
        return None
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        data["starred"] = not data.get("starred", False)
        _write_json(path, data)
        _invalidate_cache()
        return data
    except (json.JSONDecodeError, OSError):
        return None


def delete_entry(gen_id: str) -> bool:
    """Delete a single history entry."""
    path = AI_HISTORY_DIR / f"{gen_id}.json"
    if path.exists():
        path.unlink()
        _invalidate_cache()
        return True
    return False


def clear_unstarred() -> int:
    """Delete all non-starred entries. Returns count deleted."""
    _ensure_dir()
    count = 0
    for fp in AI_HISTORY_DIR.glob("gen_*.json"):
        try:
            with open(fp, encoding="utf-8") as f:
                data = json.load(f)
            if not data.get("starred", False):
                fp.unlink()
                count += 1
        except (json.JSONDecodeError, OSError):
            continue
    if count > 0:
        _invalidate_cache()
    return count


def _auto_cleanup() -> None:
    """Keep at most _MAX_UNSTARRED non-starred entries (delete oldest)."""
    _ensure_dir()
    unstarred: list[tuple[str, Path]] = []
    for fp in AI_HISTORY_DIR.glob("gen_*.json"):
        try:
            with open(fp, encoding="utf-8") as f:
                data = json.load(f)
            if not data.get("starred", False):
                unstarred.append((data.get("timestamp", ""), fp))
        except (json.JSONDecodeError, OSError):
            continue

    if len(unstarred) <= _MAX_UNSTARRED:
        return

    # Sort oldest first, delete excess
    unstarred.sort(key=lambda x: x[0])
    to_delete = len(unstarred) - _MAX_UNSTARRED
    deleted = 0
    for _, fp in unstarred[:to_delete]:
        try:
            fp.unlink()
            deleted += 1
        except OSError:
            pass
    if deleted > 0:
        _invalidate_cache()
