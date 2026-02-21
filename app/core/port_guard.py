"""Startup port occupancy guard utilities."""

from __future__ import annotations

import csv
import errno
import os
import socket
import subprocess
import sys
import time
from dataclasses import dataclass

from app.core.notifications import push_notification


_WINDOWS_LISTEN_STATES = {"LISTENING", "侦听"}
_DIALOG_TITLE = "VanceSender"
_WINDOWS_MESSAGE_BOX_OK = 0x00000000
_WINDOWS_MESSAGE_BOX_YESNO = 0x00000004
_WINDOWS_MESSAGE_BOX_ICON_ERROR = 0x00000010
_WINDOWS_MESSAGE_BOX_ICON_WARNING = 0x00000030
_WINDOWS_MESSAGE_BOX_ICON_INFORMATION = 0x00000040
_WINDOWS_MESSAGE_BOX_TOPMOST = 0x00040000
_WINDOWS_DIALOG_RESULT_YES = 6


@dataclass(frozen=True)
class PortOccupier:
    """Port occupier information discovered from system network table."""

    pid: int
    process_name: str | None
    local_address: str | None


def _is_port_bindable(host: str, port: int) -> bool:
    """Return True if the target host:port can be bound right now."""
    try:
        addr_info_list = socket.getaddrinfo(
            host,
            port,
            family=socket.AF_UNSPEC,
            type=socket.SOCK_STREAM,
            proto=socket.IPPROTO_TCP,
        )
    except socket.gaierror:
        # Host parse issue should be handled by uvicorn startup path.
        return True

    checked_sockaddrs: set[tuple[int, tuple[object, ...]]] = set()
    eaddrinuse = {getattr(errno, "EADDRINUSE", None), 10048}

    for family, socktype, proto, _canonname, sockaddr in addr_info_list:
        if not isinstance(sockaddr, tuple):
            continue

        sockaddr_key = (family, tuple(sockaddr))
        if sockaddr_key in checked_sockaddrs:
            continue
        checked_sockaddrs.add(sockaddr_key)

        sock = socket.socket(family, socktype, proto)
        try:
            sock.bind(sockaddr)
            return True
        except OSError as exc:
            if exc.errno in eaddrinuse or getattr(exc, "winerror", None) in eaddrinuse:
                return False
            continue
        finally:
            sock.close()

    return True


def _extract_port_from_local_address(local_address: str) -> int | None:
    """Extract TCP port from netstat local address column."""
    parts = local_address.rsplit(":", 1)
    if len(parts) != 2:
        return None

    port_text = parts[1].strip()
    if not port_text.isdigit():
        return None

    try:
        return int(port_text)
    except ValueError:
        return None


def _run_command(command: list[str]) -> subprocess.CompletedProcess[str]:
    """Run a shell command in text mode with safe defaults."""
    return subprocess.run(
        command,
        capture_output=True,
        text=True,
        errors="replace",
        check=False,
    )


def _can_use_console_prompt() -> bool:
    """Return True when current runtime has an interactive console stdin."""
    stdin = getattr(sys, "stdin", None)
    return bool(
        stdin is not None
        and callable(getattr(stdin, "isatty", None))
        and stdin.isatty()
    )


def _show_windows_dialog(message: str, *, style: int) -> int | None:
    """Show native Win32 MessageBox and return selected button id."""
    if sys.platform != "win32":
        return None

    try:
        import ctypes

        return int(ctypes.windll.user32.MessageBoxW(0, message, _DIALOG_TITLE, style))
    except Exception as exc:
        print(f"⚠ 启动提示弹窗失败: {exc}")
        return None


def _show_notification_dialog(message: str, *, level: str) -> None:
    """Show native warning/info/error dialog for non-console startup mode."""
    style = _WINDOWS_MESSAGE_BOX_OK | _WINDOWS_MESSAGE_BOX_TOPMOST
    if level == "error":
        style |= _WINDOWS_MESSAGE_BOX_ICON_ERROR
    elif level == "info":
        style |= _WINDOWS_MESSAGE_BOX_ICON_INFORMATION
    else:
        style |= _WINDOWS_MESSAGE_BOX_ICON_WARNING

    _show_windows_dialog(message, style=style)


def _notify_user(
    message: str, *, level: str, dialog_when_no_console: bool = False
) -> None:
    """Emit startup notification via print + in-memory store + optional dialog."""
    has_console_prompt = _can_use_console_prompt()
    if has_console_prompt:
        print(message)
    else:
        push_notification(message, level=level)

    if dialog_when_no_console and not has_console_prompt:
        _show_notification_dialog(message, level=level)


def _list_listening_entries_for_port(port: int) -> list[tuple[int, str]]:
    """Return (pid, local_address) entries that are listening on target port."""
    if sys.platform != "win32":
        return []

    result = _run_command(["netstat", "-ano", "-p", "tcp"])
    if result.returncode != 0:
        return []

    entries: list[tuple[int, str]] = []
    seen: set[tuple[int, str]] = set()

    for line in result.stdout.splitlines():
        stripped = line.strip()
        if not stripped:
            continue

        parts = stripped.split()
        if len(parts) < 4:
            continue

        protocol = parts[0].upper()
        if protocol != "TCP":
            continue

        local_address = parts[1]
        if _extract_port_from_local_address(local_address) != port:
            continue

        pid_text = parts[-1]
        if not pid_text.isdigit():
            continue

        state_text = parts[-2].upper() if len(parts) >= 5 else ""
        if state_text not in _WINDOWS_LISTEN_STATES:
            continue

        entry = (int(pid_text), local_address)
        if entry in seen:
            continue
        seen.add(entry)
        entries.append(entry)

    return entries


def _lookup_process_name(pid: int) -> str | None:
    """Get process name for pid via tasklist on Windows."""
    if sys.platform != "win32":
        return None

    result = _run_command(["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"])
    if result.returncode != 0:
        return None

    first_line = ""
    for line in result.stdout.splitlines():
        stripped = line.strip()
        if stripped:
            first_line = stripped
            break

    if not first_line or first_line.startswith("INFO:"):
        return None

    try:
        row = next(csv.reader([first_line]))
    except (csv.Error, StopIteration):
        return None

    if not row:
        return None

    process_name = row[0].strip().strip('"')
    return process_name or None


def _find_port_occupier(port: int) -> PortOccupier | None:
    """Discover the first listening process occupying target port."""
    for pid, local_address in _list_listening_entries_for_port(port):
        if pid == os.getpid():
            continue
        return PortOccupier(
            pid=pid,
            process_name=_lookup_process_name(pid),
            local_address=local_address,
        )
    return None


def _occupier_still_owns_port(occupier: PortOccupier, port: int) -> bool:
    """Re-check that pid still appears as listener for target port."""
    for pid, _local_address in _list_listening_entries_for_port(port):
        if pid == occupier.pid:
            return True
    return False


def _prompt_yes_no(question: str) -> bool:
    """Prompt user in console and parse a yes/no answer."""
    if not _can_use_console_prompt():
        result = _show_windows_dialog(
            question,
            style=(
                _WINDOWS_MESSAGE_BOX_YESNO
                | _WINDOWS_MESSAGE_BOX_ICON_WARNING
                | _WINDOWS_MESSAGE_BOX_TOPMOST
            ),
        )
        if result is None:
            _notify_user(
                "⚠ 当前启动环境不支持交互输入，已默认取消强制关闭。",
                level="warning",
                dialog_when_no_console=False,
            )
            return False
        return result == _WINDOWS_DIALOG_RESULT_YES

    while True:
        try:
            raw_answer = input(f"{question} [y/N]: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            return False

        if raw_answer in {"", "n", "no"}:
            return False
        if raw_answer in {"y", "yes"}:
            return True

        print("请输入 y 或 n。")


def _force_kill_pid(pid: int) -> tuple[bool, str | None]:
    """Force terminate a Windows process tree by pid."""
    if sys.platform != "win32":
        return False, "当前平台暂不支持自动强制关闭占用进程"

    result = _run_command(["taskkill", "/PID", str(pid), "/F", "/T"])
    if result.returncode == 0:
        return True, None

    output = (result.stderr or result.stdout or "").strip()
    return False, output or "taskkill 执行失败"


def _wait_for_port_release(host: str, port: int, timeout_seconds: float = 8.0) -> bool:
    """Wait until host:port is bindable after process termination."""
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if _is_port_bindable(host, port):
            return True
        time.sleep(0.2)
    return False


def _restart_current_process() -> bool:
    """Restart current Python/executable process in place."""
    exec_args = [sys.executable, *sys.argv[1:]]
    try:
        if sys.stdout is not None:
            sys.stdout.flush()
        if sys.stderr is not None:
            sys.stderr.flush()
        os.execv(sys.executable, exec_args)
    except OSError as exc:
        _notify_user(
            f"❌ 自动重启失败: {exc}",
            level="error",
            dialog_when_no_console=True,
        )
        return False

    return True


def ensure_startup_port_available(host: str, port: int) -> bool:
    """Ensure startup target port is available, optionally force-closing occupier."""
    if _is_port_bindable(host, port):
        return True

    _notify_user(
        f"⚠ 启动自检发现端口被占用: {host}:{port}",
        level="warning",
        dialog_when_no_console=False,
    )

    occupier = _find_port_occupier(port)
    if occupier is None:
        _notify_user(
            "❌ 未能识别占用该端口的进程，无法自动关闭。\n"
            "请手动释放端口，或通过 --port 指定其他端口后重试。",
            level="error",
            dialog_when_no_console=True,
        )
        return False

    process_name = occupier.process_name or "未知进程"
    _notify_user(
        f"  占用进程: {process_name} (PID {occupier.pid})",
        level="warning",
        dialog_when_no_console=False,
    )
    if occupier.local_address:
        _notify_user(
            f"  监听地址: {occupier.local_address}",
            level="warning",
            dialog_when_no_console=False,
        )

    prompt_text = (
        f"端口被占用: {host}:{port}\n占用进程: {process_name} (PID {occupier.pid})"
    )
    if occupier.local_address:
        prompt_text += f"\n监听地址: {occupier.local_address}"
    prompt_text += "\n\n是否强制关闭该进程并重新启动程序？"

    should_force_close = _prompt_yes_no(prompt_text)
    if not should_force_close:
        _notify_user(
            "已取消启动。你可以更换端口后重试。",
            level="info",
            dialog_when_no_console=True,
        )
        return False

    if not _occupier_still_owns_port(occupier, port):
        _notify_user(
            "⚠ 占用状态已变化，请重新启动程序后重试。",
            level="warning",
            dialog_when_no_console=True,
        )
        return False

    if occupier.pid == os.getpid():
        _notify_user(
            "❌ 占用进程为当前程序自身，已取消自动关闭。",
            level="error",
            dialog_when_no_console=True,
        )
        return False

    killed, error_message = _force_kill_pid(occupier.pid)
    if not killed:
        _notify_user(
            f"❌ 强制关闭失败: {error_message}",
            level="error",
            dialog_when_no_console=True,
        )
        return False

    if not _wait_for_port_release(host, port):
        _notify_user(
            "❌ 进程关闭后端口仍未释放，请稍后重试。",
            level="error",
            dialog_when_no_console=True,
        )
        return False

    _notify_user(
        "✅ 占用进程已关闭，正在重新启动程序...",
        level="info",
        dialog_when_no_console=False,
    )
    return _restart_current_process()
