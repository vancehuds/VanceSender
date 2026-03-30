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

Auto-installation:
  If cloudflared is not found, the module can automatically download
  and install it from GitHub releases.  The binary is stored in the
  runtime directory for portable use.
"""

from __future__ import annotations

import logging
import os
import platform
import re
import secrets
import shutil
import stat
import subprocess
import sys
import tarfile
import threading
import time
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import httpx

from app.core.config import load_config, update_config
from app.core.notifications import push_notification
from app.core.runtime_paths import get_runtime_root

_log = logging.getLogger(__name__)

# Regex to capture the quick-tunnel URL from cloudflared stdout/stderr
_QUICK_URL_RE = re.compile(
    r"https://[a-zA-Z0-9\-]+\.trycloudflare\.com"
)

# Cloudflared download configuration
CLOUDFLARED_GITHUB_REPO = "cloudflare/cloudflared"
CLOUDFLARED_RELEASES_API = f"https://api.github.com/repos/{CLOUDFLARED_GITHUB_REPO}/releases/latest"
CLOUDFLARED_RELEASES_URL = f"https://github.com/{CLOUDFLARED_GITHUB_REPO}/releases"

# Platform-specific binary names and asset patterns
_CLOUDFLARED_PLATFORMS = {
    "windows-x64": {
        "binary": "cloudflared.exe",
        "asset_pattern": r"cloudflared-windows-amd64\.exe",
        "extract_type": "direct",
    },
    "windows-x86": {
        "binary": "cloudflared.exe",
        "asset_pattern": r"cloudflared-windows-386\.exe",
        "extract_type": "direct",
    },
    "linux-x64": {
        "binary": "cloudflared",
        "asset_pattern": r"cloudflared-linux-amd64",
        "extract_type": "direct",
    },
    "linux-x86": {
        "binary": "cloudflared",
        "asset_pattern": r"cloudflared-linux-386",
        "extract_type": "direct",
    },
    "linux-arm64": {
        "binary": "cloudflared",
        "asset_pattern": r"cloudflared-linux-arm64",
        "extract_type": "direct",
    },
    "darwin-x64": {
        "binary": "cloudflared",
        "asset_pattern": r"cloudflared-darwin-amd64(?:\.tgz|\.tar\.gz)",
        "extract_type": "tgz",
    },
    "darwin-arm64": {
        "binary": "cloudflared",
        "asset_pattern": r"cloudflared-darwin-arm64(?:\.tgz|\.tar\.gz)",
        "extract_type": "tgz",
    },
}


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


@dataclass
class CloudflaredStatus:
    """Status of cloudflared binary availability."""

    installed: bool = False
    version: str = ""
    path: str = ""
    is_bundled: bool = False  # True if downloaded to runtime dir
    can_auto_install: bool = False
    platform_key: str = ""


@dataclass
class InstallProgress:
    """Progress information for cloudflared installation."""

    status: Literal["idle", "downloading", "extracting", "verifying", "completed", "cancelled", "error"] = "idle"
    progress_percent: float = 0.0
    message: str = ""
    error: str = ""
    downloaded_bytes: int = 0
    total_bytes: int = 0


class InstallCancelledError(Exception):
    """Raised when cloudflared installation is cancelled."""


_lock = threading.Lock()
_state = TunnelState()
_install_progress = InstallProgress()
_install_lock = threading.Lock()
_install_thread: threading.Thread | None = None
_install_cancel_event = threading.Event()


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
    auto_install: bool = False,
) -> dict:
    """Start a Cloudflare Tunnel pointing at the local server.

    Returns the current tunnel status dict.  The tunnel URL becomes
    available asynchronously (watch ``status`` → ``"running"``).

    Args:
        local_port: Local server port to tunnel to.
        mode: Tunnel mode - "quick" for random URL, "named" for custom domain.
        named_token: Token for named tunnel (required if mode="named").
        auto_install: If True, automatically trigger cloudflared installation when not found.
                      Default is False - frontend should ask user first.
    """
    named_token = named_token.strip()
    if mode == "named" and not named_token:
        with _lock:
            _state.status = "error"
            _state.mode = mode
            _state.public_url = ""
            _state.error = "named 模式需要提供有效的隧道令牌"
            _state.pid = None
            _state.auto_generated_token = ""
            _state.started_at = 0.0
            return _snapshot_locked()

    cloudflared_bin: str | None = None
    should_install = False

    with _lock:
        if _state.status in ("starting", "running"):
            return _snapshot_locked()

        # Pre-flight: ensure cloudflared binary is available
        cloudflared_bin = _find_cloudflared_binary()

        if cloudflared_bin is None:
            if auto_install and _get_platform_key() in _CLOUDFLARED_PLATFORMS:
                should_install = True
            else:
                _state.status = "error"
                _state.mode = mode
                _state.public_url = ""
                _state.error = (
                    "未找到 cloudflared，请先安装: "
                    "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
                )
                _state.pid = None
                _state.auto_generated_token = ""
                _state.started_at = 0.0
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

    if should_install:
        install_result = install_cloudflared()
        if install_result["status"] == "started":
            install_message = "未找到 cloudflared，已开始后台安装，请安装完成后重试启动隧道"
            install_level = "warning"
        elif install_result["status"] == "already_in_progress":
            install_message = "未找到 cloudflared，后台安装已在进行中，请安装完成后重试启动隧道"
            install_level = "warning"
        else:
            install_message = f"未找到 cloudflared，且自动安装未能启动: {install_result['message']}"
            install_level = "error"

        with _lock:
            _state.status = "error"
            _state.mode = mode
            _state.public_url = ""
            _state.error = install_message
            _state.pid = None
            _state.auto_generated_token = ""
            _state.started_at = 0.0
            snapshot = _snapshot_locked()

        push_notification(install_message, level=install_level)
        return snapshot

    assert cloudflared_bin is not None

    # Build command
    if mode == "named":
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


# ── Cloudflared Installation API ────────────────────────────────────────────


def get_cloudflared_status() -> CloudflaredStatus:
    """Check if cloudflared is available and return its status."""
    platform_key = _get_platform_key()
    can_auto_install = platform_key in _CLOUDFLARED_PLATFORMS

    # First, check if cloudflared is in PATH
    system_bin = shutil.which("cloudflared")
    if system_bin:
        version = _get_cloudflared_version(system_bin)
        return CloudflaredStatus(
            installed=True,
            version=version,
            path=system_bin,
            is_bundled=False,
            can_auto_install=can_auto_install,
            platform_key=platform_key,
        )

    # Check if we have a bundled installation
    bundled_bin = _get_bundled_cloudflared_path()
    if bundled_bin and bundled_bin.exists():
        version = _get_cloudflared_version(str(bundled_bin))
        return CloudflaredStatus(
            installed=True,
            version=version,
            path=str(bundled_bin),
            is_bundled=True,
            can_auto_install=can_auto_install,
            platform_key=platform_key,
        )

    return CloudflaredStatus(
        installed=False,
        version="",
        path="",
        is_bundled=False,
        can_auto_install=can_auto_install,
        platform_key=platform_key,
    )


def get_install_progress() -> InstallProgress:
    """Get the current installation progress."""
    with _install_lock:
        return InstallProgress(
            status=_install_progress.status,
            progress_percent=_install_progress.progress_percent,
            message=_install_progress.message,
            error=_install_progress.error,
            downloaded_bytes=_install_progress.downloaded_bytes,
            total_bytes=_install_progress.total_bytes,
        )


def install_cloudflared() -> dict:
    """Download and install cloudflared automatically.

    Returns a dict with installation status.  The installation runs
    in a background thread; use get_install_progress() to monitor progress.
    """
    global _install_thread

    thread = threading.Thread(
        target=_install_cloudflared_worker,
        daemon=True,
        name="cloudflared-installer",
    )

    with _install_lock:
        if _install_thread is not None and _install_thread.is_alive():
            return {
                "status": "already_in_progress",
                "message": "安装已在进行中",
            }

        _install_cancel_event.clear()
        _install_progress.status = "downloading"
        _install_progress.progress_percent = 0.0
        _install_progress.message = "正在准备安装..."
        _install_progress.error = ""
        _install_progress.downloaded_bytes = 0
        _install_progress.total_bytes = 0
        _install_thread = thread

    thread.start()

    return {
        "status": "started",
        "message": "安装已开始",
    }


def cancel_install() -> dict:
    """Cancel an ongoing installation (best effort)."""
    with _install_lock:
        if _install_thread is None or not _install_thread.is_alive():
            return {
                "status": "not_in_progress",
                "message": "没有正在进行的安装",
            }

        _install_cancel_event.set()
        _install_progress.status = "cancelled"
        _install_progress.error = ""
        _install_progress.message = "安装已取消"

    return {
        "status": "cancelled",
        "message": "安装已取消",
    }


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



def _check_install_cancelled() -> None:
    """Raise when the current installation has been cancelled."""
    if _install_cancel_event.is_set():
        raise InstallCancelledError("用户取消安装")


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


# ── Cloudflared Installation Internals ──────────────────────────────────────


def _get_platform_key() -> str:
    """Get the platform key for cloudflared download."""
    system = platform.system().lower()
    machine = platform.machine().lower()

    # Normalize machine architecture
    if machine in ("x86_64", "amd64"):
        arch = "x64"
    elif machine in ("i386", "i686", "x86"):
        arch = "x86"
    elif machine in ("arm64", "aarch64"):
        arch = "arm64"
    else:
        arch = machine

    return f"{system}-{arch}"


def _get_bundled_cloudflared_path() -> Path | None:
    """Get the path to the bundled cloudflared binary."""
    platform_key = _get_platform_key()
    if platform_key not in _CLOUDFLARED_PLATFORMS:
        return None

    binary_name = _CLOUDFLARED_PLATFORMS[platform_key]["binary"]
    runtime_root = get_runtime_root()
    return runtime_root / "bin" / binary_name


def _get_cloudflared_version(binary_path: str) -> str:
    """Get the version of a cloudflared binary."""
    try:
        result = subprocess.run(
            [binary_path, "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            # Output format: "cloudflared version X.Y.Z"
            output = result.stdout.strip()
            parts = output.split()
            if len(parts) >= 3:
                return parts[2]
            return output
    except Exception as e:
        _log.debug("Failed to get cloudflared version: %s", e)
    return ""


def _find_cloudflared_binary() -> str | None:
    """Find the cloudflared binary, checking both system PATH and bundled location."""
    # First, check system PATH
    system_bin = shutil.which("cloudflared")
    if system_bin:
        return system_bin

    # Then check bundled location
    bundled_bin = _get_bundled_cloudflared_path()
    if bundled_bin and bundled_bin.exists():
        return str(bundled_bin)

    return None


def _install_cloudflared_worker() -> None:
    """Background worker that downloads and installs cloudflared."""
    global _install_progress, _install_thread

    downloaded_asset_path: Path | None = None
    installed_binary_path: Path | None = None

    try:
        _check_install_cancelled()

        platform_key = _get_platform_key()
        if platform_key not in _CLOUDFLARED_PLATFORMS:
            with _install_lock:
                _install_progress.status = "error"
                _install_progress.error = f"不支持的平台: {platform_key}"
                _install_progress.message = "安装失败: 不支持的平台"
            return

        platform_info = _CLOUDFLARED_PLATFORMS[platform_key]
        binary_name = platform_info["binary"]
        asset_pattern = platform_info["asset_pattern"]
        extract_type = platform_info["extract_type"]

        with _install_lock:
            _install_progress.message = "正在获取最新版本信息..."

        release_info = _fetch_latest_release_info()
        _check_install_cancelled()
        if not release_info:
            with _install_lock:
                _install_progress.status = "error"
                _install_progress.error = "无法获取版本信息"
                _install_progress.message = "安装失败: 无法获取版本信息"
            return

        download_url = None
        asset_name = ""
        for asset in release_info.get("assets", []):
            name = asset.get("name", "")
            if re.fullmatch(asset_pattern, name):
                download_url = asset.get("browser_download_url")
                asset_name = name
                break

        if not download_url or not asset_name:
            with _install_lock:
                _install_progress.status = "error"
                _install_progress.error = f"找不到适合 {platform_key} 的下载包"
                _install_progress.message = "安装失败: 找不到下载包"
            return

        runtime_root = get_runtime_root()
        bin_dir = runtime_root / "bin"
        bin_dir.mkdir(parents=True, exist_ok=True)

        downloaded_asset_path = bin_dir / asset_name
        installed_binary_path = bin_dir / binary_name

        assert downloaded_asset_path is not None
        assert installed_binary_path is not None

        with _install_lock:
            _install_progress.message = f"正在下载 {asset_name}..."

        _download_file(download_url, downloaded_asset_path)
        _check_install_cancelled()

        with _install_lock:
            if extract_type != "direct":
                _install_progress.status = "extracting"
                _install_progress.message = "正在解压..."
            else:
                _install_progress.message = "正在准备二进制文件..."

        assert downloaded_asset_path is not None
        assert installed_binary_path is not None

        if extract_type == "zip":
            _extract_zip(downloaded_asset_path, bin_dir, binary_name)
        elif extract_type == "tgz":
            _extract_tgz(downloaded_asset_path, bin_dir, binary_name)
        elif extract_type == "direct":
            if installed_binary_path.exists():
                installed_binary_path.unlink()
            downloaded_asset_path.replace(installed_binary_path)
        else:
            raise ValueError(f"不支持的安装类型: {extract_type}")

        _check_install_cancelled()

        if sys.platform != "win32":
            os.chmod(
                str(installed_binary_path),
                os.stat(str(installed_binary_path)).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH,
            )

        if downloaded_asset_path.exists():
            try:
                downloaded_asset_path.unlink()
            except Exception:
                pass

        with _install_lock:
            _install_progress.status = "verifying"
            _install_progress.message = "正在验证安装..."

        _check_install_cancelled()
        version = _get_cloudflared_version(str(installed_binary_path))
        _check_install_cancelled()
        if not version:
            with _install_lock:
                _install_progress.status = "error"
                _install_progress.error = "安装验证失败: 无法获取版本"
                _install_progress.message = "安装失败: 验证失败"
            return

        with _install_lock:
            _install_progress.status = "completed"
            _install_progress.progress_percent = 100.0
            _install_progress.message = f"安装成功! cloudflared {version} 已就绪"
            _install_progress.error = ""

        _log.info("cloudflared %s 安装成功: %s", version, installed_binary_path)
        push_notification(f"cloudflared {version} 安装成功!", level="success")

    except InstallCancelledError:
        _log.info("cloudflared 安装已取消")
        if downloaded_asset_path and downloaded_asset_path.exists():
            try:
                downloaded_asset_path.unlink()
            except Exception:
                pass
        with _install_lock:
            _install_progress.status = "cancelled"
            _install_progress.error = ""
            _install_progress.message = "安装已取消"
    except Exception as e:
        _log.error("cloudflared 安装失败: %s", e)
        with _install_lock:
            _install_progress.status = "error"
            _install_progress.error = str(e)
            _install_progress.message = f"安装失败: {e}"
        push_notification(f"cloudflared 安装失败: {e}", level="error")
    finally:
        with _install_lock:
            current_thread = threading.current_thread()
            if _install_thread is current_thread:
                _install_thread = None


def _fetch_latest_release_info() -> dict | None:
    """Fetch the latest release info from GitHub API."""
    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(
                CLOUDFLARED_RELEASES_API,
                headers={"Accept": "application/vnd.github.v3+json"},
                follow_redirects=True,
            )
            response.raise_for_status()
            return response.json()
    except Exception as e:
        _log.error("获取 cloudflared 版本信息失败: %s", e)
        return None


def _download_file(url: str, dest: Path) -> None:
    """Download a file with progress tracking."""
    global _install_progress

    _check_install_cancelled()

    try:
        with httpx.Client(timeout=300.0, follow_redirects=True) as client:
            with client.stream("GET", url) as response:
                response.raise_for_status()

                total_bytes = int(response.headers.get("content-length", 0))
                downloaded = 0

                with open(dest, "wb") as f:
                    for chunk in response.iter_bytes(chunk_size=8192):
                        _check_install_cancelled()
                        if not chunk:
                            continue

                        f.write(chunk)
                        downloaded += len(chunk)

                        with _install_lock:
                            _install_progress.downloaded_bytes = downloaded
                            _install_progress.total_bytes = total_bytes
                            if total_bytes > 0:
                                _install_progress.progress_percent = (downloaded / total_bytes) * 90  # Reserve 10% for extraction

        _check_install_cancelled()
    except InstallCancelledError:
        raise
    except Exception as e:
        _log.error("下载失败: %s", e)
        raise


def _extract_zip(archive_path: Path, dest_dir: Path, binary_name: str) -> None:
    """Extract a ZIP archive and find the binary."""
    try:
        with zipfile.ZipFile(archive_path, "r") as zf:
            for name in zf.namelist():
                # The binary might be at root or in a subdirectory
                if name.endswith(binary_name) or name.endswith("/" + binary_name):
                    # Extract to a temp location first
                    zf.extract(name, dest_dir)
                    extracted_path = dest_dir / name
                    final_path = dest_dir / binary_name

                    # Move to final location if needed
                    if extracted_path != final_path:
                        if final_path.exists():
                            final_path.unlink()
                        extracted_path.rename(final_path)

                    # Clean up empty directories
                    try:
                        parent = extracted_path.parent
                        if parent != dest_dir and parent.exists():
                            parent.rmdir()
                    except Exception:
                        pass

                    return

        raise FileNotFoundError(f"在压缩包中找不到 {binary_name}")
    except Exception as e:
        _log.error("解压 ZIP 失败: %s", e)
        raise


def _extract_tgz(archive_path: Path, dest_dir: Path, binary_name: str) -> None:
    """Extract a TGZ/TAR.GZ archive and find the binary."""
    try:
        with tarfile.open(archive_path, "r:gz") as tf:
            for member in tf.getmembers():
                # The binary might be at root or in a subdirectory
                if member.name.endswith(binary_name) or "/" + binary_name in member.name:
                    # Extract to a temp location first
                    tf.extract(member, dest_dir)
                    extracted_path = dest_dir / member.name
                    final_path = dest_dir / binary_name

                    # Move to final location if needed
                    if extracted_path != final_path:
                        if final_path.exists():
                            final_path.unlink()
                        extracted_path.rename(final_path)

                    # Clean up empty directories
                    try:
                        parent = extracted_path.parent
                        while parent != dest_dir and parent.exists():
                            parent.rmdir()
                            parent = parent.parent
                    except Exception:
                        pass

                    return

        raise FileNotFoundError(f"在压缩包中找不到 {binary_name}")
    except Exception as e:
        _log.error("解压 TGZ 失败: %s", e)
        raise
