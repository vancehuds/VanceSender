"""VanceSender — FiveM /me /do text sender with AI generation.

Usage:
    python main.py              # Start on 127.0.0.1:8730
    python main.py --lan        # Start on 0.0.0.0:8730 (LAN access)
    python main.py --port 9000  # Custom port
    python main.py --no-webview # Disable embedded desktop window
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import errno
import multiprocessing
import os
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.api.routes import api_router
from app.core.app_meta import APP_NAME, APP_VERSION, GITHUB_REPOSITORY
from app.core.config import load_config, resolve_enable_tray_on_start, update_config
from app.core.desktop_shell import (
    has_system_tray_support,
    has_webview_support,
    open_desktop_window,
)
from app.core.network import get_lan_ipv4_addresses
from app.core.public_config import fetch_github_public_config_sync
from app.core.relay_client import relay_client
from app.core.runtime_paths import get_bundle_root

WEB_DIR = get_bundle_root() / "app" / "web"


def _is_ignorable_proactor_disconnect(context: dict[str, object]) -> bool:
    """Check whether callback exception is the known Proactor disconnect noise."""
    exc = context.get("exception")
    if not isinstance(exc, ConnectionResetError):
        return False

    if getattr(exc, "winerror", None) != 10054:
        return False

    marker = "_ProactorBasePipeTransport._call_connection_lost"
    handle_text = str(context.get("handle", ""))
    message = str(context.get("message", ""))
    return marker in handle_text or marker in message


def _install_asyncio_exception_filter() -> None:
    """Suppress noisy WinError 10054 callback tracebacks from Proactor shutdown."""
    loop = asyncio.get_running_loop()
    previous_handler = loop.get_exception_handler()

    def _exception_handler(
        current_loop: asyncio.AbstractEventLoop,
        context: dict[str, object],
    ) -> None:
        if _is_ignorable_proactor_disconnect(context):
            return

        if previous_handler is not None:
            previous_handler(current_loop, context)
            return

        current_loop.default_exception_handler(context)

    loop.set_exception_handler(_exception_handler)


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        _install_asyncio_exception_filter()
        relay_client.start()
        try:
            yield
        finally:
            relay_client.stop()

    app = FastAPI(
        title=APP_NAME,
        description="FiveM /me /do 文本发送器 & AI生成工具",
        version=APP_VERSION,
        lifespan=lifespan,
    )

    # CORS — allow LAN devices
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # API routes
    app.include_router(api_router)

    # Serve frontend static files
    if WEB_DIR.exists():
        app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")

        @app.get("/")
        async def serve_index():
            return FileResponse(str(WEB_DIR / "index.html"))

    return app


app = create_app()

_DEVNULL_STREAMS: list[object] = []
_CONSOLE_STREAMS: list[object] = []


def _attach_runtime_console_window() -> bool:
    """Attach a Win32 console dynamically for frozen windowed builds."""
    if sys.platform != "win32":
        return False

    if not getattr(sys, "frozen", False):
        return False

    try:
        import ctypes

        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        has_console = bool(kernel32.GetConsoleWindow())
        if not has_console and kernel32.AllocConsole() == 0:
            return False

        stdout = open("CONOUT$", "w", encoding="utf-8", errors="replace", buffering=1)
        stderr = open("CONOUT$", "w", encoding="utf-8", errors="replace", buffering=1)
        stdin = open("CONIN$", "r", encoding="utf-8", errors="replace")

        sys.stdout = stdout
        sys.stderr = stderr
        sys.stdin = stdin
        _CONSOLE_STREAMS.extend([stdout, stderr, stdin])
        return True
    except Exception:
        return False


def _ensure_standard_streams() -> None:
    """Ensure stdout/stderr exist for windowed execution mode."""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is not None:
            continue

        devnull_stream = open(os.devnull, "w", encoding="utf-8", errors="replace")
        setattr(sys, stream_name, devnull_stream)
        _DEVNULL_STREAMS.append(devnull_stream)


def _prepare_runtime_console(cfg: dict[str, object]) -> None:
    """Initialize runtime console behavior according to launch settings."""
    launch_section = cfg.get("launch")
    launch_cfg = launch_section if isinstance(launch_section, dict) else {}
    show_console_on_start = bool(launch_cfg.get("show_console_on_start", False))

    if show_console_on_start:
        _attach_runtime_console_window()

    _ensure_standard_streams()


def _configure_console_encoding() -> None:
    """Avoid UnicodeEncodeError on non-UTF8 Windows shells."""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is None:
            continue

        reconfigure = getattr(stream, "reconfigure", None)
        if not callable(reconfigure):
            continue

        try:
            reconfigure(encoding="utf-8", errors="replace")
        except (ValueError, OSError):
            try:
                reconfigure(errors="replace")
            except (ValueError, OSError):
                continue


def _has_visible_console_window() -> bool:
    """Check whether current process has a visible Win32 console window."""
    if sys.platform != "win32":
        return True

    try:
        import ctypes

        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        return bool(kernel32.GetConsoleWindow())
    except Exception:
        return True


def _show_windows_warning_dialog(title: str, lines: list[str]) -> None:
    """Show a Windows warning dialog when console output is unavailable."""
    if sys.platform != "win32":
        return

    try:
        import ctypes

        MB_OK = 0x00000000
        MB_ICONWARNING = 0x00000030
        MB_SETFOREGROUND = 0x00010000
        message = "\n".join(lines)
        ctypes.windll.user32.MessageBoxW(  # type: ignore[attr-defined]
            None,
            message,
            title,
            MB_OK | MB_ICONWARNING | MB_SETFOREGROUND,
        )
    except Exception:
        return


def _is_port_occupied(host: str, port: int) -> bool:
    """Check whether the startup TCP port is already occupied."""
    bind_host = "0.0.0.0" if host in {"0.0.0.0", "::"} else host
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind((bind_host, port))
            return False
        except OSError as exc:
            if exc.errno == getattr(errno, "EADDRINUSE", None):
                return True
            if exc.errno == 10048:
                return True
            return False


def _find_windows_listening_pids(port: int) -> list[int]:
    """Find listening Windows PIDs occupying the given port."""
    if sys.platform != "win32":
        return []

    try:
        result = subprocess.run(
            ["netstat", "-ano", "-p", "tcp"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    except OSError:
        return []

    target_port = str(port)
    pid_set: set[int] = set()
    for line in result.stdout.splitlines():
        columns = line.split()
        if len(columns) < 5:
            continue
        if columns[0].upper() != "TCP":
            continue
        if columns[3].upper() not in {"LISTENING", "侦听"}:
            continue
        if columns[1].rpartition(":")[2] != target_port:
            continue
        if not columns[4].isdigit():
            continue

        pid_set.add(int(columns[4]))

    return sorted(pid_set)


def _resolve_windows_process_name(pid: int) -> str | None:
    """Resolve process name for a Windows PID."""
    if sys.platform != "win32":
        return None

    try:
        result = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    except OSError:
        return None

    rows = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if not rows:
        return None
    if rows[0].startswith("INFO:"):
        return None

    try:
        parsed_row = next(csv.reader([rows[0]]), [])
    except Exception:
        return None

    if not parsed_row:
        return None

    process_name = parsed_row[0].strip()
    return process_name or None


def _print_port_occupancy_guidance(host: str, port: int) -> None:
    """Print actionable guidance when startup port is occupied."""
    scope = "全部网卡" if host in {"0.0.0.0", "::"} else host
    message_lines = [
        f"⚠ 端口 {port} 已被占用，服务无法启动。",
        f"  当前监听地址: {scope}",
    ]

    occupying_pids = _find_windows_listening_pids(port)
    if occupying_pids:
        pid_text = "、".join(str(pid) for pid in occupying_pids)
        message_lines.append(f"  检测到占用进程 PID: {pid_text}")
        for pid in occupying_pids[:3]:
            process_name = _resolve_windows_process_name(pid)
            if process_name:
                message_lines.append(f"    PID {pid}: {process_name}")

    if sys.platform == "win32":
        message_lines.append("  你可以按下面步骤解除占用：")
        message_lines.append(f"    1) netstat -ano | findstr :{port}")
        message_lines.append("    2) taskkill /PID <PID> /F")
        if len(occupying_pids) == 1:
            message_lines.append(f"       例如: taskkill /PID {occupying_pids[0]} /F")
    else:
        message_lines.append("  你可以按下面步骤排查并解除占用：")
        message_lines.append(f"    1) lsof -i :{port}")
        message_lines.append("    2) kill -9 <PID>")

    fallback_port = 9000 if port == 8730 else port + 1
    message_lines.extend(
        [
            "  或改用其他端口启动：",
            f"    python main.py --port {fallback_port}",
            f"    start.bat --port {fallback_port}",
        ]
    )

    for line in message_lines:
        print(line)

    if not _has_visible_console_window():
        _show_windows_warning_dialog(
            title=f"{APP_NAME} 启动失败",
            lines=message_lines,
        )


def _ensure_startup_port_available(host: str, port: int) -> None:
    """Abort startup early when the target port is occupied."""
    if not _is_port_occupied(host, port):
        return

    _print_port_occupancy_guidance(host, port)
    raise SystemExit(1)


def _build_local_web_base_url(host: str, port: int) -> str:
    """Return browser-friendly local base URL for startup links."""
    browser_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
    return f"http://{browser_host}:{port}"


def _append_query_params(url: str, params: dict[str, str]) -> str:
    """Append query params to URL while preserving existing query string."""
    parsed = urlsplit(url)
    merged_items = dict(parse_qsl(parsed.query, keep_blank_values=True))

    for key, value in params.items():
        normalized_key = str(key).strip()
        normalized_value = str(value).strip()
        if not normalized_key or not normalized_value:
            continue
        merged_items[normalized_key] = normalized_value

    merged_query = urlencode(merged_items)
    return urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            merged_query,
            parsed.fragment,
        )
    )


def _resolve_intro_start_url(
    cfg: dict[str, object], base_url: str
) -> tuple[str | None, bool]:
    """Resolve intro page startup URL and whether intro should be marked as seen."""
    launch_section = cfg.get("launch")
    launch_cfg = launch_section if isinstance(launch_section, dict) else {}

    open_intro_on_first_start = bool(launch_cfg.get("open_intro_on_first_start", False))
    intro_seen = bool(launch_cfg.get("intro_seen", False))
    if open_intro_on_first_start and not intro_seen:
        return f"{base_url}/static/intro.html", True
    return None, False


def _collect_startup_browser_urls(
    cfg: dict[str, object],
    base_url: str,
    intro_url: str | None,
) -> list[str]:
    """Collect external browser URLs based on launch settings."""
    launch_section = cfg.get("launch")
    launch_cfg = launch_section if isinstance(launch_section, dict) else {}
    open_webui_on_start = bool(launch_cfg.get("open_webui_on_start", False))

    if not open_webui_on_start:
        return []

    urls: list[str] = []
    if intro_url:
        urls.append(intro_url)
    urls.append(base_url)
    return urls


def _start_uvicorn_in_background(
    host: str, port: int
) -> tuple[uvicorn.Server, threading.Thread]:
    """Start uvicorn server on background thread and wait for readiness."""
    config = uvicorn.Config(
        app,
        host=host,
        port=port,
        reload=False,
        log_level="info",
    )
    server = uvicorn.Server(config)
    thread = threading.Thread(
        target=server.run,
        daemon=True,
        name="embedded-uvicorn-server",
    )
    thread.start()

    deadline = time.time() + 15
    while time.time() < deadline:
        if getattr(server, "started", False):
            return server, thread

        if not thread.is_alive():
            break

        time.sleep(0.05)

    server.should_exit = True
    raise RuntimeError("服务启动失败，无法打开内嵌窗口")


def _stop_uvicorn_background(server: uvicorn.Server, thread: threading.Thread) -> None:
    """Stop background uvicorn server gracefully."""
    server.should_exit = True
    if thread.is_alive():
        thread.join(timeout=5)


def _open_urls_in_browser(urls: list[str], delay_seconds: float = 0.9) -> None:
    """Open startup pages in default browser after a short delay."""
    if not urls:
        return

    def _worker() -> None:
        if delay_seconds > 0:
            time.sleep(delay_seconds)
        for url in urls:
            try:
                webbrowser.open_new_tab(url)
            except Exception:
                continue

    threading.Thread(
        target=_worker,
        daemon=True,
        name="startup-browser-opener",
    ).start()


def main() -> None:
    parser = argparse.ArgumentParser(description="VanceSender Server")
    parser.add_argument("--lan", action="store_true", help="启用局域网访问 (0.0.0.0)")
    parser.add_argument("--port", type=int, default=None, help="服务端口")
    parser.add_argument(
        "--no-webview",
        action="store_true",
        help="禁用内嵌桌面窗口，仅使用浏览器访问 WebUI",
    )
    args = parser.parse_args()

    cfg = load_config()
    _prepare_runtime_console(cfg)
    _configure_console_encoding()

    server_token_raw = cfg.get("server", {}).get("token", "")
    server_token = server_token_raw.strip() if isinstance(server_token_raw, str) else ""

    server_cfg = cfg.get("server", {})
    launch_section = cfg.get("launch")
    launch_cfg = launch_section if isinstance(launch_section, dict) else {}

    try:
        public_config_result = fetch_github_public_config_sync(cfg)
    except Exception:
        from app.core.public_config import GitHubPublicConfigResult

        public_config_result = GitHubPublicConfigResult(
            success=False,
            visible=False,
            source_url=None,
            title=None,
            content=None,
            message="远程配置获取异常",
        )

    lan_access = bool(server_cfg.get("lan_access"))
    if args.lan:
        lan_access = True

    host = "0.0.0.0" if lan_access else server_cfg.get("host", "127.0.0.1")
    try:
        port = int(args.port or server_cfg.get("port", 8730))
    except (TypeError, ValueError):
        port = 8730

    _ensure_startup_port_available(host, port)

    runtime_lan_access = host == "0.0.0.0"
    lan_ipv4_list = get_lan_ipv4_addresses() if runtime_lan_access else []
    lan_url_list = [f"http://{lan_ipv4}:{port}" for lan_ipv4 in lan_ipv4_list]
    lan_docs_url_list = [f"{lan_url}/docs" for lan_url in lan_url_list]
    local_web_base_url = _build_local_web_base_url(host, port)
    intro_url, should_mark_intro_seen = _resolve_intro_start_url(
        cfg, local_web_base_url
    )
    startup_browser_urls = _collect_startup_browser_urls(
        cfg,
        local_web_base_url,
        intro_url,
    )
    webview_available = has_webview_support()
    use_desktop_shell = not args.no_webview and webview_available
    desktop_start_url = intro_url or local_web_base_url

    quick_overlay_module = None
    try:
        from app.core.quick_overlay import create_quick_overlay_module

        quick_overlay_module = create_quick_overlay_module(
            cfg,
            web_base_url=local_web_base_url,
            desktop_token=server_token,
        )
        if quick_overlay_module is not None:
            quick_overlay_module.start()
    except Exception as exc:
        print(f"⚠ 快捷悬浮窗模块启动失败: {exc}")

    if use_desktop_shell:
        desktop_launch_params: dict[str, str] = {"vs_desktop": "1"}
        if server_token:
            desktop_launch_params["vs_token"] = server_token
        desktop_start_url = _append_query_params(
            desktop_start_url, desktop_launch_params
        )

    intro_will_be_shown = should_mark_intro_seen and (
        use_desktop_shell or bool(startup_browser_urls)
    )

    app.state.runtime_host = host
    app.state.runtime_port = port
    app.state.runtime_lan_access = runtime_lan_access
    app.state.runtime_lan_ipv4_list = lan_ipv4_list

    github_repository_url = f"https://github.com/{GITHUB_REPOSITORY}"

    # Persist LAN flag if changed via CLI
    if args.lan and not server_cfg.get("lan_access"):
        update_config({"server": {"lan_access": True, "host": "0.0.0.0"}})

    if intro_will_be_shown:
        update_config({"launch": {"intro_seen": True}})

    open_webui_on_start = bool(launch_cfg.get("open_webui_on_start", False))
    show_console_on_start = bool(launch_cfg.get("show_console_on_start", False))
    enable_tray_on_start = resolve_enable_tray_on_start(launch_cfg)
    tray_supported = has_system_tray_support()
    ui_mode_text = "桌面内嵌窗口" if use_desktop_shell else "浏览器模式"

    print(f"""
╔══════════════════════════════════════════════╗
║           {APP_NAME} v{APP_VERSION}                 ║
║  FiveM /me /do 文本发送器 & AI生成工具       ║
╠══════════════════════════════════════════════╣
║  UI模式:   {ui_mode_text:<32}║
║  本地访问:  http://127.0.0.1:{port:<5}            ║
║  API文档:   http://127.0.0.1:{port:<5}/docs       ║""")

    if runtime_lan_access:
        if lan_url_list:
            for index, lan_url in enumerate(lan_url_list):
                suffix = "" if len(lan_url_list) == 1 else str(index + 1)
                print(f"║  局域网{suffix}:   {lan_url}")
                print(f"║  LAN文档{suffix}:  {lan_docs_url_list[index]}")
        else:
            print(f"║  局域网:    http://<your-ip>:{port:<5}           ║")

    if server_token:
        masked = server_token[:4] + "*" * min(8, len(server_token) - 4)
        print(f"║  认证:     Token {masked}")
    else:
        print(f"║  认证:     未启用")
    print(f"║  浏览器启动: {'开启' if open_webui_on_start else '关闭'}")
    print(f"║  控制台日志: {'开启' if show_console_on_start else '关闭'}")
    print(f"║  启动托盘: {'开启' if enable_tray_on_start else '关闭'}")
    print(f"║  托盘支持: {'可用' if tray_supported else '不可用'}")
    if not args.no_webview and not webview_available:
        print(f"║  提示:     未检测到 pywebview，已回退浏览器模式")
    if enable_tray_on_start and not tray_supported:
        print("║  提示:     未检测到系统托盘依赖，将禁用托盘驻留")
    print(f"║  GitHub:   {github_repository_url}")
    print(f"╚══════════════════════════════════════════════╝")
    print()

    if public_config_result.visible and public_config_result.content:
        if public_config_result.title:
            print(f"📢 {public_config_result.title}")
        else:
            print("📢 远程公告")

        for line in public_config_result.content.splitlines():
            print(f"  {line}")

        if public_config_result.link_url:
            link_text = public_config_result.link_text or "查看详情"
            print(f"  {link_text}: {public_config_result.link_url}")

        print()

    if runtime_lan_access and not server_token:
        print("⚠ 风险提示: 当前已开启局域网访问且未设置 Token。")
        print("  局域网内任意设备都可访问 API，建议尽快设置 Token 并重启服务。")
        print()

    try:
        if use_desktop_shell:
            try:
                server, server_thread = _start_uvicorn_in_background(host, port)
            except RuntimeError as exc:
                print(f"⚠ {exc}，将回退为浏览器模式。")
            else:
                if startup_browser_urls:
                    _open_urls_in_browser(startup_browser_urls)

                opened = open_desktop_window(
                    start_url=desktop_start_url,
                    title=f"{APP_NAME} v{APP_VERSION}",
                    launch_options=launch_cfg,
                )
                _stop_uvicorn_background(server, server_thread)
                if opened:
                    return

                print("⚠ 内嵌窗口启动失败，将回退为浏览器模式。")

        if startup_browser_urls:
            _open_urls_in_browser(startup_browser_urls)

        uvicorn.run(
            app,
            host=host,
            port=port,
            reload=False,
            log_level="info",
        )
    finally:
        if quick_overlay_module is not None:
            quick_overlay_module.stop()


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
