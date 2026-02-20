"""Relay client that bridges local API with remote relay server."""

from __future__ import annotations

import base64
import io
import json
import random
import socket
import threading
import time
from dataclasses import asdict, dataclass
from typing import Any

import httpx
import qrcode

from app.core.app_meta import APP_VERSION
from app.core.config import load_config, update_config


def _now_ts() -> int:
    return int(time.time())


def _normalize_server_url(raw: object) -> str:
    value = str(raw or "").strip()
    if not value:
        return ""
    if not value.startswith(("http://", "https://")):
        value = f"https://{value}"
    return value.rstrip("/")


def _decode_base64_url(raw: str) -> bytes:
    normalized = raw.replace("-", "+").replace("_", "/")
    padding = "=" * (-len(normalized) % 4)
    return base64.b64decode(normalized + padding)


def _encode_base64_url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _safe_int(value: object, fallback: int) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float, str)):
        try:
            return int(value)
        except (TypeError, ValueError):
            return fallback
    return fallback


@dataclass
class RelayRuntimeState:
    enabled: bool = False
    connected: bool = False
    running: bool = False
    server_url: str = ""
    session_public_id: str = ""
    pairing_url: str = ""
    pairing_code: str = ""
    pairing_expires_at: int = 0
    remote_webui_url: str = ""
    qr_image_base64: str = ""
    card_key_required_prompt_text: str = ""
    last_error: str = ""
    last_seen_at: int = 0


class RelayClient:
    """Background polling client for VanceSender relay service."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._state = RelayRuntimeState()

    def start(self) -> None:
        """Start relay background loop."""
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return
            self._stop_event.clear()
            self._thread = threading.Thread(
                target=self._run_loop,
                name="vancesender-relay-client",
                daemon=True,
            )
            self._thread.start()
            self._state.running = True

    def stop(self) -> None:
        """Stop relay background loop."""
        with self._lock:
            thread = self._thread
            self._thread = None
            self._state.running = False
        self._stop_event.set()
        if thread is not None and thread.is_alive():
            thread.join(timeout=3)

    def get_status(self) -> dict[str, Any]:
        """Return current relay runtime + config status."""
        cfg = load_config()
        relay_cfg = cfg.get("relay", {}) if isinstance(cfg.get("relay"), dict) else {}
        with self._lock:
            payload = asdict(self._state)

        payload["enabled"] = bool(relay_cfg.get("enabled", False))
        payload["server_url"] = _normalize_server_url(relay_cfg.get("server_url", ""))
        payload["card_key_set"] = bool(str(relay_cfg.get("card_key", "")).strip())
        payload["session_public_id"] = (
            payload["session_public_id"]
            or str(relay_cfg.get("session_public_id", "")).strip()
        )
        payload["pairing_url"] = (
            payload["pairing_url"] or str(relay_cfg.get("pairing_url", "")).strip()
        )
        payload["pairing_code"] = (
            payload["pairing_code"] or str(relay_cfg.get("pairing_code", "")).strip()
        )
        payload["pairing_expires_at"] = int(
            payload["pairing_expires_at"]
            or _safe_int(relay_cfg.get("pairing_expires_at", 0), 0)
        )
        payload["remote_webui_url"] = (
            payload["remote_webui_url"]
            or str(relay_cfg.get("remote_webui_url", "")).strip()
        )
        return payload

    def refresh_pairing(self) -> None:
        """Drop current relay session so next loop re-registers and regenerates QR/code."""
        update_config(
            {
                "relay": {
                    "session_public_id": "",
                    "device_token": "",
                    "pairing_url": "",
                    "pairing_code": "",
                    "pairing_expires_at": 0,
                    "remote_webui_url": "",
                }
            }
        )

        with self._lock:
            self._state.connected = False
            self._state.session_public_id = ""
            self._state.pairing_url = ""
            self._state.pairing_code = ""
            self._state.pairing_expires_at = 0
            self._state.remote_webui_url = ""
            self._state.qr_image_base64 = ""
            self._state.card_key_required_prompt_text = ""

    def _set_error(self, message: str) -> None:
        with self._lock:
            self._state.connected = False
            self._state.last_error = message

    def _set_state(self, **kwargs: Any) -> None:
        with self._lock:
            for key, value in kwargs.items():
                if hasattr(self._state, key):
                    setattr(self._state, key, value)

    def _backoff_with_jitter(self, failure_streak: int) -> float:
        level = max(failure_streak, 1)
        cap = min(30.0, float(2 ** min(level, 6)))
        return random.uniform(0.5, cap)

    def _build_qr_image_base64(self, content: str) -> str:
        if not content:
            return ""
        qr = qrcode.QRCode(border=2, box_size=6)
        qr.add_data(content)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        output = io.BytesIO()
        img.save(output, "PNG")
        return base64.b64encode(output.getvalue()).decode("ascii")

    def _clear_session(self) -> None:
        update_config(
            {
                "relay": {
                    "session_public_id": "",
                    "device_token": "",
                    "pairing_url": "",
                    "pairing_code": "",
                    "pairing_expires_at": 0,
                    "remote_webui_url": "",
                }
            }
        )
        self._set_state(
            connected=False,
            session_public_id="",
            pairing_url="",
            pairing_code="",
            pairing_expires_at=0,
            remote_webui_url="",
            qr_image_base64="",
            card_key_required_prompt_text="",
        )

    def _register_session(self, server_url: str, relay_cfg: dict[str, Any]) -> bool:
        payload = {
            "device_name": f"VanceSender-{socket.gethostname()}",
            "card_key": str(relay_cfg.get("card_key", "")).strip(),
            "client_version": APP_VERSION,
        }

        try:
            response = httpx.post(
                f"{server_url}/api/v1/device/sessions",
                json=payload,
                timeout=20.0,
            )
        except Exception:
            self._set_error("中继注册失败，请检查网络或服务器状态")
            return False

        try:
            payload_json = response.json() if response.content else {}
        except ValueError:
            payload_json = {}
        if response.status_code >= 400 or not payload_json.get("success", False):
            message = str(payload_json.get("message", "中继注册被拒绝"))
            code = str(payload_json.get("code", "")).strip().upper()
            popup_text = str(payload_json.get("popup_text", "")).strip()
            if code == "CARD_KEY_REQUIRED" and popup_text:
                self._set_state(card_key_required_prompt_text=popup_text)
            else:
                self._set_state(card_key_required_prompt_text="")
            self._set_error(message)
            return False

        session_public_id = str(payload_json.get("session_public_id", "")).strip()
        device_token = str(payload_json.get("device_token", "")).strip()
        pairing_url = str(payload_json.get("pairing_url", "")).strip()
        pairing_code = str(payload_json.get("pairing_code", "")).strip().upper()
        pairing_expires_at = _safe_int(payload_json.get("pairing_expires_at"), 0)
        remote_webui_url = str(payload_json.get("remote_webui_url", "")).strip()

        if not session_public_id or not device_token:
            self._set_error("中继注册响应缺少关键信息")
            return False

        qr_base64 = self._build_qr_image_base64(pairing_url)

        update_config(
            {
                "relay": {
                    "session_public_id": session_public_id,
                    "device_token": device_token,
                    "pairing_url": pairing_url,
                    "pairing_code": pairing_code,
                    "pairing_expires_at": pairing_expires_at,
                    "remote_webui_url": remote_webui_url,
                }
            }
        )

        self._set_state(
            connected=True,
            last_error="",
            session_public_id=session_public_id,
            pairing_url=pairing_url,
            pairing_code=pairing_code,
            pairing_expires_at=pairing_expires_at,
            remote_webui_url=remote_webui_url,
            qr_image_base64=qr_base64,
            card_key_required_prompt_text="",
            last_seen_at=_now_ts(),
        )
        return True

    def _execute_local_request(
        self,
        request_data: dict[str, Any],
        config: dict[str, Any],
    ) -> dict[str, Any]:
        request_id = str(request_data.get("id", "")).strip()
        method = str(request_data.get("method", "GET")).upper().strip()
        path = str(request_data.get("path", "")).strip()

        if not request_id:
            return {
                "request_id": "",
                "status": 400,
                "headers": {"content-type": "application/json"},
                "body_base64": _encode_base64_url(
                    json.dumps({"detail": "missing request id"}).encode("utf-8")
                ),
            }

        allowed_path = (
            path == "/"
            or path.startswith("/api/v1/")
            or path.startswith("/static/")
            or path in {"/docs", "/redoc", "/openapi.json", "/favicon.ico"}
        )

        if not allowed_path:
            return {
                "request_id": request_id,
                "status": 400,
                "headers": {"content-type": "application/json"},
                "body_base64": _encode_base64_url(
                    json.dumps({"detail": "invalid path"}).encode("utf-8")
                ),
            }

        query = request_data.get("query", {})
        query_params: dict[str, str] = {}
        if isinstance(query, dict):
            for key, value in query.items():
                query_params[str(key)] = str(value)

        body_raw = str(request_data.get("body_base64", "") or "").strip()
        body_bytes = b""
        if body_raw:
            try:
                body_bytes = _decode_base64_url(body_raw)
            except Exception:
                body_bytes = b""

        req_headers = request_data.get("headers", {})
        forward_headers: dict[str, str] = {}
        if isinstance(req_headers, dict):
            for key, value in req_headers.items():
                key_text = str(key).strip().lower()
                if key_text in {
                    "content-type",
                    "accept",
                    "if-none-match",
                    "if-modified-since",
                    "range",
                }:
                    forward_headers[key_text] = str(value)

        local_token_raw = config.get("server", {}).get("token", "")
        local_token = (
            local_token_raw.strip() if isinstance(local_token_raw, str) else ""
        )
        if local_token:
            forward_headers["authorization"] = f"Bearer {local_token}"

        local_port = _safe_int(config.get("server", {}).get("port", 8730), 8730)
        target_url = f"http://127.0.0.1:{local_port}{path}"

        try:
            response = httpx.request(
                method,
                target_url,
                params=query_params,
                headers=forward_headers,
                content=body_bytes if body_bytes else None,
                timeout=35.0,
            )
            relay_headers: dict[str, str] = {
                "content-type": response.headers.get(
                    "content-type", "application/octet-stream"
                )
            }
            for key in ("cache-control", "etag", "last-modified"):
                value = response.headers.get(key)
                if value:
                    relay_headers[key] = value

            return {
                "request_id": request_id,
                "status": int(response.status_code),
                "headers": relay_headers,
                "body_base64": _encode_base64_url(response.content or b""),
            }
        except Exception:
            error_payload = json.dumps({"detail": "local request failed"}).encode(
                "utf-8"
            )
            return {
                "request_id": request_id,
                "status": 502,
                "headers": {"content-type": "application/json"},
                "body_base64": _encode_base64_url(error_payload),
            }

    def _poll_once(
        self, server_url: str, device_token: str, cfg: dict[str, Any]
    ) -> bool:
        headers = {
            "Authorization": f"Bearer {device_token}",
            "Content-Type": "application/json",
        }

        try:
            response = httpx.post(
                f"{server_url}/api/v1/device/poll",
                headers=headers,
                json={"max_wait_seconds": 25},
                timeout=35.0,
            )
        except Exception:
            self._set_error("中继轮询失败，请稍后重试")
            return False

        if response.status_code in {401, 403}:
            self._clear_session()
            self._set_error("中继会话失效，请重新配对")
            return False

        try:
            payload = response.json() if response.content else {}
        except ValueError:
            payload = {}
        if response.status_code >= 400 or not payload.get("success", False):
            self._set_error(str(payload.get("message", "中继轮询失败")))
            return False

        request_data = payload.get("request")
        if not isinstance(request_data, dict):
            self._set_state(
                connected=True,
                last_error="",
                card_key_required_prompt_text="",
                last_seen_at=_now_ts(),
            )
            return True

        response_payload = self._execute_local_request(request_data, cfg)
        try:
            write_response = httpx.post(
                f"{server_url}/api/v1/device/respond",
                headers=headers,
                json=response_payload,
                timeout=15.0,
            )
        except Exception:
            self._set_error("中继回传失败，请稍后重试")
            return False

        if write_response.status_code in {401, 403}:
            self._clear_session()
            self._set_error("中继会话失效，请重新配对")
            return False

        try:
            write_payload = write_response.json() if write_response.content else {}
        except ValueError:
            write_payload = {}
        if write_response.status_code >= 400 or not write_payload.get("success", False):
            self._set_error(str(write_payload.get("message", "中继回传失败")))
            return False

        self._set_state(
            connected=True,
            last_error="",
            card_key_required_prompt_text="",
            last_seen_at=_now_ts(),
        )
        return True

    def _run_loop(self) -> None:
        failure_streak = 0
        while not self._stop_event.is_set():
            try:
                cfg = load_config()
                relay_raw = cfg.get("relay")
                relay_cfg = relay_raw if isinstance(relay_raw, dict) else {}
                enabled = bool(relay_cfg.get("enabled", False))
                server_url = _normalize_server_url(relay_cfg.get("server_url", ""))

                self._set_state(enabled=enabled, server_url=server_url)

                if not enabled:
                    self._set_state(connected=False, last_error="")
                    failure_streak = 0
                    time.sleep(1.0)
                    continue

                if not server_url:
                    self._set_error("请先配置中继服务器地址")
                    failure_streak = min(failure_streak + 1, 8)
                    time.sleep(self._backoff_with_jitter(failure_streak))
                    continue

                device_token_raw = relay_cfg.get("device_token", "")
                device_token = (
                    device_token_raw.strip()
                    if isinstance(device_token_raw, str)
                    else ""
                )

                if not device_token:
                    registered = self._register_session(server_url, relay_cfg)
                    if registered:
                        failure_streak = 0
                        time.sleep(0.2)
                    else:
                        failure_streak = min(failure_streak + 1, 8)
                        time.sleep(self._backoff_with_jitter(failure_streak))
                    continue

                polled = self._poll_once(server_url, device_token, cfg)
                if not polled:
                    failure_streak = min(failure_streak + 1, 8)
                    time.sleep(self._backoff_with_jitter(failure_streak))
                else:
                    failure_streak = 0
            except Exception:
                self._set_error("中继异常，请稍后重试")
                failure_streak = min(failure_streak + 1, 8)
                time.sleep(self._backoff_with_jitter(failure_streak))


relay_client = RelayClient()
