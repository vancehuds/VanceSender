"""WebSocket relay client for VanceSenderServer.

Connects to VanceSenderServer via WebSocket, receives proxied API
requests, executes them against the local FastAPI instance, and
sends responses back through the tunnel.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from typing import Any

log = logging.getLogger("relay")


class RelayClient:
    """WebSocket relay client that runs in a background thread."""

    def __init__(self, config: dict[str, Any], local_port: int) -> None:
        self.server_url: str = config.get("server_url", "")
        self.license_key: str = config.get("license_key", "")
        self.client_name: str = config.get("client_name", "") or f"Client-{self.license_key[:4] if self.license_key else 'unknown'}"
        self.auto_reconnect: bool = config.get("auto_reconnect", True)
        self.reconnect_interval: int = config.get("reconnect_interval", 5)
        self.heartbeat_interval: int = config.get("heartbeat_interval", 25)
        self.local_base: str = f"http://127.0.0.1:{local_port}"
        self.local_token: str = config.get("_local_token", "")

        self._running = False
        self._connected = False
        self._disconnected_by_user = False
        self._last_error: str | None = None
        self._connected_since: float | None = None
        self._thread: threading.Thread | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._ws: Any = None  # Active websocket reference

    # --- Public API ---

    def start(self) -> None:
        """Start the relay client in a background daemon thread."""
        if self._running:
            return
        self._running = True
        self._disconnected_by_user = False
        self._thread = threading.Thread(target=self._run_event_loop, daemon=True, name="relay-client")
        self._thread.start()
        log.info("中转客户端线程已启动")

    def stop(self) -> None:
        """Gracefully stop the relay client."""
        self._running = False
        self._close_ws_sync()
        if self._loop and self._loop.is_running():
            self._loop.call_soon_threadsafe(self._loop.stop)
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)
        log.info("中转客户端已停止")

    @property
    def status(self) -> dict[str, Any]:
        """Return current connection status for API/frontend."""
        return {
            "enabled": True,
            "connected": self._connected,
            "server_url": self.server_url,
            "client_name": self.client_name,
            "last_error": self._last_error,
            "connected_since": (
                time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(self._connected_since))
                if self._connected_since
                else None
            ),
        }

    def reconnect(self) -> None:
        """Trigger a reconnection attempt by closing current WS (loop auto-reconnects)."""
        self._disconnected_by_user = False
        self._close_ws_sync()

    def disconnect(self) -> None:
        """Disconnect from the server (but keep the thread alive)."""
        self._disconnected_by_user = True
        self._close_ws_sync()

    # --- Internal ---

    def _close_ws_sync(self) -> None:
        """Close the active websocket from any thread."""
        ws = self._ws
        if ws is not None and self._loop and self._loop.is_running():
            asyncio.run_coroutine_threadsafe(self._close_ws_async(ws), self._loop)

    @staticmethod
    async def _close_ws_async(ws: Any) -> None:
        """Close websocket asynchronously."""
        try:
            await ws.close()
        except Exception:
            pass

    def _run_event_loop(self) -> None:
        """Run the asyncio event loop in the background thread."""
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        try:
            self._loop.run_until_complete(self._connect_loop())
        except Exception as exc:
            log.error("中转客户端事件循环异常: %s", exc)
        finally:
            self._loop.close()

    async def _connect_loop(self) -> None:
        """Main connection loop with auto-reconnect."""
        try:
            import websockets
        except ImportError:
            self._last_error = "缺少 websockets 库，请安装: pip install websockets"
            log.error(self._last_error)
            return

        while self._running:
            if self._disconnected_by_user:
                await asyncio.sleep(1)
                continue

            try:
                url = self.server_url
                if "?" in url:
                    url += f"&key={self.license_key}&name={self.client_name}"
                else:
                    url += f"?key={self.license_key}&name={self.client_name}"

                log.info("正在连接中转服务器: %s", self.server_url)
                async with websockets.connect(url, ping_interval=None) as ws:
                    self._ws = ws
                    # Read welcome message
                    welcome = await asyncio.wait_for(ws.recv(), timeout=10)
                    welcome_data = json.loads(welcome)
                    if "error" in welcome_data:
                        self._last_error = welcome_data["error"]
                        log.error("连接被拒绝: %s", self._last_error)
                        break  # Don't retry on auth failure

                    self._connected = True
                    self._connected_since = time.time()
                    self._last_error = None
                    log.info("✓ 已连接到中转服务器 (client_id: %s)", welcome_data.get("client_id"))

                    # Start heartbeat task
                    heartbeat_task = asyncio.create_task(self._heartbeat_loop(ws))

                    try:
                        async for raw_msg in ws:
                            if not self._running:
                                break
                            try:
                                msg = json.loads(raw_msg)
                                await self._handle_message(ws, msg)
                            except json.JSONDecodeError:
                                log.warning("收到无效 JSON 消息")
                    finally:
                        heartbeat_task.cancel()
                        self._connected = False
                        self._connected_since = None
                        self._ws = None

            except Exception as exc:
                self._connected = False
                self._connected_since = None
                self._ws = None
                self._last_error = str(exc)
                log.warning("中转连接断开: %s", exc)

            if not self._running or not self.auto_reconnect:
                break

            if self._disconnected_by_user:
                continue

            log.info("将在 %d 秒后重连...", self.reconnect_interval)
            await asyncio.sleep(self.reconnect_interval)

    async def _heartbeat_loop(self, ws: Any) -> None:
        """Periodically send ping to keep the connection alive."""
        try:
            while self._running and self._connected:
                await asyncio.sleep(self.heartbeat_interval)
                await ws.send(json.dumps({"type": "pong"}))
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            log.warning("心跳发送失败: %s", exc)

    async def _handle_message(self, ws: Any, msg: dict[str, Any]) -> None:
        """Dispatch incoming messages from the server."""
        msg_type = msg.get("type")

        if msg_type == "ping":
            await ws.send(json.dumps({"type": "pong"}))

        elif msg_type == "request":
            asyncio.create_task(self._forward_request(ws, msg))

        else:
            log.debug("收到未知消息类型: %s", msg_type)

    async def _forward_request(self, ws: Any, req: dict[str, Any]) -> None:
        """Forward a proxied request to local FastAPI and return the response."""
        try:
            import httpx
        except ImportError:
            log.error("缺少 httpx 库，请安装: pip install httpx")
            await self._send_error_response(ws, req["id"], 500, "客户端缺少 httpx 库")
            return

        req_id = req["id"]
        method = req.get("method", "GET").upper()
        path = req.get("path", "/")
        headers = req.get("headers", {})
        body = req.get("body")

        # Add local auth token if configured
        if self.local_token:
            headers["Authorization"] = f"Bearer {self.local_token}"

        url = f"{self.local_base}{path}"

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                kwargs: dict[str, Any] = {"method": method, "url": url, "headers": headers}

                if body is not None:
                    if isinstance(body, dict):
                        kwargs["json"] = body
                    elif isinstance(body, str):
                        kwargs["content"] = body
                    else:
                        kwargs["content"] = json.dumps(body)

                resp = await client.request(**kwargs)

                # Check if it's an SSE response
                content_type = resp.headers.get("content-type", "")
                if "text/event-stream" in content_type:
                    await self._handle_sse_response(ws, req_id, method, url, headers, body)
                    return

                # Regular response
                resp_headers = dict(resp.headers)
                resp_body = resp.content

                await ws.send(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "status": resp.status_code,
                    "headers": {k: v for k, v in resp_headers.items()
                                if k.lower() in ("content-type", "x-request-id")},
                    "body": json.loads(resp_body) if resp_body else None,
                }, ensure_ascii=False))

        except Exception as exc:
            log.error("转发请求失败 [%s %s]: %s", method, path, exc)
            await self._send_error_response(ws, req_id, 502, f"本地 API 调用失败: {exc}")

    async def _handle_sse_response(
        self, ws: Any, req_id: str, method: str, url: str,
        headers: dict[str, str], body: Any
    ) -> None:
        """Handle SSE streaming responses by forwarding events one by one."""
        try:
            import httpx

            async with httpx.AsyncClient(timeout=120) as client:
                kwargs: dict[str, Any] = {"method": method, "url": url, "headers": headers}
                if body is not None:
                    if isinstance(body, dict):
                        kwargs["json"] = body
                    else:
                        kwargs["content"] = json.dumps(body) if not isinstance(body, str) else body

                async with client.stream(**kwargs) as resp:
                    async for line in resp.aiter_lines():
                        if not self._running:
                            break
                        if line.startswith("data: "):
                            await ws.send(json.dumps({
                                "type": "sse_event",
                                "id": req_id,
                                "data": line[6:],  # strip "data: " prefix
                            }))

            # Signal end of SSE stream
            await ws.send(json.dumps({"type": "sse_end", "id": req_id}))

        except Exception as exc:
            log.error("SSE 流处理失败: %s", exc)
            await ws.send(json.dumps({"type": "sse_end", "id": req_id}))

    async def _send_error_response(self, ws: Any, req_id: str, status: int, message: str) -> None:
        """Send an error response back to the server."""
        try:
            await ws.send(json.dumps({
                "type": "response",
                "id": req_id,
                "status": status,
                "headers": {"content-type": "application/json"},
                "body": {"error": message},
            }, ensure_ascii=False))
        except Exception:
            pass

# Module-level singleton for access from API routes
_relay_client: RelayClient | None = None


def get_relay_client() -> RelayClient | None:
    """Return the global relay client instance."""
    return _relay_client


def set_relay_client(client: RelayClient | None) -> None:
    """Set the global relay client instance."""
    global _relay_client
    _relay_client = client
