"""Runtime path helpers for source and frozen execution modes."""

from __future__ import annotations

import os
import sys
from pathlib import Path


APP_NAME = "VanceSender"
SOURCE_ROOT = Path(__file__).resolve().parent.parent.parent


def get_bundle_root() -> Path:
    """Return base directory containing bundled read-only assets."""
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass)
        return Path(sys.executable).resolve().parent
    return SOURCE_ROOT


def get_runtime_root() -> Path:
    """Return writable runtime directory for config and user data."""
    if getattr(sys, "frozen", False):
        local_app_data = os.getenv("LOCALAPPDATA")
        if local_app_data:
            runtime_root = Path(local_app_data) / APP_NAME
        else:
            runtime_root = Path.home() / f".{APP_NAME.lower()}"
        runtime_root.mkdir(parents=True, exist_ok=True)
        return runtime_root
    return SOURCE_ROOT
