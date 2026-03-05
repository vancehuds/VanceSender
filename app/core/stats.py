"""Send statistics tracking for VanceSender.

Tracks total sends, success/fail counts, preset usage, and daily counts.
Persists to ``data/stats.json`` with in-memory cache and periodic flush.
"""

from __future__ import annotations

import json
import os
import tempfile
import threading
from datetime import UTC, datetime
from typing import Any

from app.core.config import DATA_DIR

STATS_FILE = DATA_DIR / "stats.json"
_lock = threading.Lock()
_stats: dict[str, Any] | None = None
_dirty_count = 0
_FLUSH_EVERY = 10  # Write to disk every N operations


def _ensure_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _load() -> dict[str, Any]:
    """Load stats from disk or return empty structure."""
    global _stats
    if _stats is not None:
        return _stats

    _ensure_dir()
    if STATS_FILE.exists():
        try:
            with open(STATS_FILE, encoding="utf-8") as f:
                _stats = json.load(f)
                return _stats
        except (json.JSONDecodeError, OSError):
            pass

    _stats = _empty_stats()
    return _stats


def _empty_stats() -> dict[str, Any]:
    return {
        "total_sent": 0,
        "total_success": 0,
        "total_failed": 0,
        "total_batches": 0,
        "preset_usage": {},
        "daily_counts": {},
    }


def _save() -> None:
    """Write stats to disk atomically."""
    if _stats is None:
        return
    _ensure_dir()
    try:
        fd, tmp = tempfile.mkstemp(suffix=".tmp", prefix="stats_", dir=str(DATA_DIR))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(_stats, f, ensure_ascii=False, indent=2)
            os.replace(tmp, str(STATS_FILE))
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise
    except OSError:
        pass


def record_send(success: bool, preset_name: str | None = None) -> None:
    """Record a single send result."""
    global _dirty_count

    with _lock:
        stats = _load()
        stats["total_sent"] += 1
        if success:
            stats["total_success"] += 1
        else:
            stats["total_failed"] += 1

        # Daily count
        today = datetime.now(UTC).strftime("%Y-%m-%d")
        dc = stats.setdefault("daily_counts", {})
        dc[today] = dc.get(today, 0) + 1

        # Trim daily_counts to last 30 days
        if len(dc) > 30:
            sorted_days = sorted(dc.keys())
            for d in sorted_days[: len(dc) - 30]:
                dc.pop(d, None)

        # Preset usage
        if preset_name:
            pu = stats.setdefault("preset_usage", {})
            pu[preset_name] = pu.get(preset_name, 0) + 1

        _dirty_count += 1
        if _dirty_count >= _FLUSH_EVERY:
            _save()
            _dirty_count = 0


def record_batch() -> None:
    """Record a batch send event."""
    with _lock:
        stats = _load()
        stats["total_batches"] += 1


def get_stats() -> dict[str, Any]:
    """Return a summary of send statistics."""
    with _lock:
        stats = _load()
        # Build most-used presets top 5
        pu = stats.get("preset_usage", {})
        top_presets = sorted(pu.items(), key=lambda x: x[1], reverse=True)[:5]
        most_used = [{"name": name, "count": count} for name, count in top_presets]

        return {
            "total_sent": stats.get("total_sent", 0),
            "total_success": stats.get("total_success", 0),
            "total_failed": stats.get("total_failed", 0),
            "total_batches": stats.get("total_batches", 0),
            "success_rate": (
                round(stats["total_success"] / stats["total_sent"] * 100, 1) if stats.get("total_sent", 0) > 0 else 0
            ),
            "most_used_presets": most_used,
            "daily_counts": stats.get("daily_counts", {}),
        }


def reset_stats() -> None:
    """Reset all statistics."""
    global _stats, _dirty_count
    with _lock:
        _stats = _empty_stats()
        _dirty_count = 0
        _save()


def flush() -> None:
    """Force write pending stats to disk."""
    global _dirty_count
    with _lock:
        _save()
        _dirty_count = 0
