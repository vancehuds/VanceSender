"""VanceSender — FiveM /me /do text sender with AI generation.

Usage:
    python main.py              # Start on 127.0.0.1:8730
    python main.py --lan        # Start on 0.0.0.0:8730 (LAN access)
    python main.py --port 9000  # Custom port
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.api.routes import api_router
from app.core.config import load_config, update_config

WEB_DIR = Path(__file__).resolve().parent / "app" / "web"


def create_app() -> FastAPI:
    app = FastAPI(
        title="VanceSender",
        description="FiveM /me /do 文本发送器 & AI生成工具",
        version="1.0.0",
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


def main() -> None:
    parser = argparse.ArgumentParser(description="VanceSender Server")
    parser.add_argument("--lan", action="store_true", help="启用局域网访问 (0.0.0.0)")
    parser.add_argument("--port", type=int, default=None, help="服务端口")
    args = parser.parse_args()

    cfg = load_config()
    server_cfg = cfg.get("server", {})

    host = "0.0.0.0" if args.lan else server_cfg.get("host", "127.0.0.1")
    port = args.port or server_cfg.get("port", 8730)

    # Persist LAN flag if changed via CLI
    if args.lan and not server_cfg.get("lan_access"):
        update_config({"server": {"lan_access": True, "host": "0.0.0.0"}})

    print(f"""
╔══════════════════════════════════════════════╗
║           VanceSender v1.0.0                 ║
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

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
