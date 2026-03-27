"""Cloudflare Tunnel manager for VanceSender.

Provides external HTTPS access to the local WebUI via ``cloudflared``.
Supports two modes:

* **Quick tunnel** (default) — zero-config, generates a random
  ``*.trycloudflare.com`` URL.  No Cloudflare account needed.
* **Named tunnel** — uses a pre-configured tunnel token for a stable
  custom domain.  Requires a Cloudflare account and ``cloudflared tunnel
  create``.

Security enforcement:
  When a tunnel is active the module **requires** a non-empty Bearer
  token.  If no token is configured it auto-generates a secure random
  one and persists it to ``config.yaml``.
"""

from __future__ import annotations

import logging
import re
import secrets
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass, field
from typing import Literal

from app.core.config import load_config, update_config
from app.core.notifications import push_notification

_log = logging.getLogger(__name__)

# Regex to capture the quick-tunnel URL from cloudflared stdout/stderr
_QUICK_URL_RE = re.compile(
    r"https://[a-zA-Z0-9\-]+\.trycloudflare\.com"
)


@dataclass
class TunnelState:
    """Runtime state of the tunnel subprocess."""

    status: Literal["stopped", "starting", "running", "error"] = "stopped"
    mode: Literal["quick", "named", ""] = ""
    public_url: str = ""
    error: str = ""
    pid: int | None = None
    started_at: float = 0.0
    auto_generated_token: str = ""
    _process: subprocess.Popen | None = field(default=None, repr=False)
    _monitor_thread: threading.Thread | None = field(default=None, repr=False)


_lock = threading.Lock()
_state = TunnelState()


# ── Public API ────────────────────────────────────────────────────────────


def get_tunnel_status() -> dict:
    """Return a JSON-serialisable snapshot of the current tunnel state."""
    with _lock:
        return {
            "status": _state.status,
            "mode": _state.mode,
            "public_url": _state.public_url,
            "error": _state.error,
            "pid": _state.pid,
            "started_at": _state.started_at,
            "auto_generated_token": _state.auto_generated_token,
        }


def is_tunnel_active() -> bool:
    """Return True when a tunnel is running or starting."""
    with _lock:
        return _state.status in ("starting", "running")


def start_tunnel(
    local_port: int = 8730,
    mode: Literal["quick", "named"] = "quick",
    named_token: str = "",
) -> dict:
    """Start a Cloudflare Tunnel pointing at the local server.

    Returns the current tunnel status dict.  The tunnel URL becomes
    available asynchronously (watch ``status`` → ``"running"``).
    """
    with _lock:
        if _state.status in ("starting", "running"):
            return _snapshot_locked()

        # Pre-flight: ensure cloudflared binary is available
        cloudflared_bin = shutil.which("cloudflared")
        if cloudflared_bin is None:
            _state.status = "error"
            _state.error = (
                "未找到 cloudflared，请先安装: "
                "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
            )
            push_notification(_state.error, level="error")
            return _snapshot_locked()

        # Security: ensure a Bearer token is configured
        auto_token = _ensure_auth_token()

        _state.status = "starting"
        _state.mode = mode
        _state.public_url = ""
        _state.error = ""
        _state.auto_generated_token = auto_token
        _state.started_at = time.time()

    # Build command
    if mode == "named" and named_token:
        cmd = [cloudflared_bin, "tunnel", "run", "--token", named_token]
    else:
        cmd = [
            cloudflared_bin,
            "tunnel",
            "--url",
            f"http://127.0.0.1:{local_port}",
            "--no-autoupdate",
        ]

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
    except OSError as exc:
        with _lock:
            _state.status = "error"
            _state.error = f"启动 cloudflared 失败: {exc}"
            _state.pid = None
        push_notification(_state.error, level="error")
        return get_tunnel_status()

    with _lock:
        _state._process = process
        _state.pid = process.pid

    # Monitor thread reads cloudflared output for the public URL
    thread = threading.Thread(
        target=_monitor_process,
        args=(process, mode),
        daemon=True,
        name="cloudflared-monitor",
    )
    with _lock:
        _state._monitor_thread = thread
    thread.start()

    return get_tunnel_status()


def stop_tunnel() -> dict:
    """Stop a running tunnel.  Idempotent."""
    with _lock:
        process = _state._process
        if process is None:
            _state.status = "stopped"
            return _snapshot_locked()

    # Terminate outside the lock to avoid deadlock with monitor thread
    try:
        process.terminate()
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=3)
    except Exception:
        pass

    with _lock:
        _state.status = "stopped"
        _state.public_url = ""
        _state._process = None
        _state._monitor_thread = None
        _state.pid = None
        return _snapshot_locked()


# ── Internals ─────────────────────────────────────────────────────────────


def _snapshot_locked() -> dict:
    """Return status dict — caller MUST hold ``_lock``."""
    return {
        "status": _state.status,
        "mode": _state.mode,
        "public_url": _state.public_url,
        "error": _state.error,
        "pid": _state.pid,
        "started_at": _state.started_at,
        "auto_generated_token": _state.auto_generated_token,
    }


def _ensure_auth_token() -> str:
    """Ensure a Bearer token is configured; auto-generate if missing.

    Returns the auto-generated token (empty string if one was already set).
    Must be called **outside** ``_lock`` or before the tunnel starts.
    """
    cfg = load_config()
    existing_token = cfg.get("server", {}).get("token", "").strip()
    if existing_token:
        return ""

    # Auto-generate a secure random token
    new_token = secrets.token_urlsafe(32)
    update_config({"server": {"token": new_token}})

    # Invalidate the auth cache so new token takes effect immediately
    from app.api.auth import invalidate_token_cache

    invalidate_token_cache()

    _log.warning(
        "隧道安全: 未检测到 Token，已自动生成安全令牌。"
    )
    push_notification(
        f"已自动生成访问令牌用于隧道安全保护，请妥善保存: {new_token[:8]}...",
        level="warning",
    )
    return new_token


def _monitor_process(
    process: subprocess.Popen,
    mode: str,
) -> None:
    """Read cloudflared output and update tunnel state."""
    url_found = False

    def _read_stream(stream, stream_name: str) -> None:
        nonlocal url_found
        if stream is None:
            return
        try:
            for line in stream:
                line = line.strip()
                if not line:
                    continue
                _log.debug("[cloudflared %s] %s", stream_name, line)

                # For quick tunnels, look for the trycloudflare.com URL
                if not url_found and mode == "quick":
                    match = _QUICK_URL_RE.search(line)
                    if match:
                        url = match.group(0)
                        with _lock:
                            _state.public_url = url
                            _state.status = "running"
                        url_found = True
                        _log.info("隧道已就绪: %s", url)

                # Named tunnels log "Connection registered" when ready
                if not url_found and mode == "named":
                    if "connection" in line.lower() and "registered" in line.lower():
                        with _lock:
                            _state.status = "running"
                        url_found = True

                # Detect error patterns
                if "error" in line.lower() or "failed" in line.lower():
                    with _lock:
                        if _state.status == "starting":
                            _state.error = line
        except Exception:
            pass

    # Read both stdout and stderr in separate threads
    stderr_thread = threading.Thread(
        target=_read_stream,
        args=(process.stderr, "stderr"),
        daemon=True,
        name="cloudflared-stderr",
    )
    stderr_thread.start()
    _read_stream(process.stdout, "stdout")
    stderr_thread.join(timeout=2)

    # Process exited — update state
    return_code = process.wait()
    with _lock:
        if _state._process is process:
            if return_code != 0 and _state.status != "stopped":
                _state.status = "error"
                if not _state.error:
                    _state.error = f"cloudflared 异常退出 (code={return_code})"
                push_notification(_state.error, level="error")
            elif _state.status not in ("stopped", "error"):
                _state.status = "stopped"
            _state._process = None
            _state.pid = None
