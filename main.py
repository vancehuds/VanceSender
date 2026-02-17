"""VanceSender — FiveM /me /do text sender with AI generation.

Usage:
    python main.py              # Start on 127.0.0.1:8730
    python main.py --lan        # Start on 0.0.0.0:8730 (LAN access)
    python main.py --port 9000  # Custom port
"""

from __future__ import annotations

import argparse
import asyncio
import multiprocessing
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.api.routes import api_router
from app.core.app_meta import APP_NAME, APP_VERSION
from app.core.config import load_config, update_config
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
        yield

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


def main() -> None:
    _configure_console_encoding()

    parser = argparse.ArgumentParser(description="VanceSender Server")
    parser.add_argument("--lan", action="store_true", help="启用局域网访问 (0.0.0.0)")
    parser.add_argument("--port", type=int, default=None, help="服务端口")
    args = parser.parse_args()

    cfg = load_config()
    server_cfg = cfg.get("server", {})

    quick_overlay_module = None
    try:
        from app.core.quick_overlay import create_quick_overlay_module

        quick_overlay_module = create_quick_overlay_module(cfg)
        if quick_overlay_module is not None:
            quick_overlay_module.start()
    except Exception as exc:
        print(f"⚠ 快捷悬浮窗模块启动失败: {exc}")

    lan_access = bool(server_cfg.get("lan_access"))
    if args.lan:
        lan_access = True

    host = "0.0.0.0" if lan_access else server_cfg.get("host", "127.0.0.1")
    port = args.port or server_cfg.get("port", 8730)

    # Persist LAN flag if changed via CLI
    if args.lan and not server_cfg.get("lan_access"):
        update_config({"server": {"lan_access": True, "host": "0.0.0.0"}})

    print(f"""
╔══════════════════════════════════════════════╗
║           {APP_NAME} v{APP_VERSION}                 ║
║  FiveM /me /do 文本发送器 & AI生成工具       ║
╠══════════════════════════════════════════════╣
║  本地访问:  http://127.0.0.1:{port:<5}            ║
║  API文档:   http://127.0.0.1:{port:<5}/docs       ║""")

    if host == "0.0.0.0":
        print(f"║  局域网:    http://<your-ip>:{port:<5}           ║")

    token = cfg.get("server", {}).get("token", "")
    if token:
        masked = token[:4] + "*" * min(8, len(token) - 4)
        print(f"║  认证:     Token {masked}")
    else:
        print(f"║  认证:     未启用")
    print(f"╚══════════════════════════════════════════════╝")
    print()

    if host == "0.0.0.0" and not token:
        print("⚠ 风险提示: 当前已开启局域网访问且未设置 Token。")
        print("  局域网内任意设备都可访问 API，建议尽快设置 Token 并重启服务。")
        print()

    try:
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
