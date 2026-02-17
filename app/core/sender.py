"""Keyboard sender for FiveM — robust T -> input -> Enter via SendInput."""

from __future__ import annotations

import asyncio
import ctypes
import ctypes.wintypes as wintypes
import time
import threading
from typing import Any, Callable

import pyperclip

# ── Windows API constants ──────────────────────────────────────────────────

INPUT_KEYBOARD = 1
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004

VK_RETURN = 0x0D
VK_T = 0x54
VK_V = 0x56
VK_CONTROL = 0x11
VK_SHIFT = 0x10
VK_MENU = 0x12

DEFAULT_FOCUS_TIMEOUT_MS = 5000
DEFAULT_RETRY_COUNT = 2
DEFAULT_RETRY_INTERVAL_MS = 300
DEFAULT_TYPING_CHAR_DELAY_MS = 18
FOREGROUND_POLL_INTERVAL_MS = 100

user32 = ctypes.WinDLL("user32", use_last_error=True)


# ── ctypes structs ─────────────────────────────────────────────────────────


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]


class _INPUT_UNION(ctypes.Union):
    _fields_ = [("ki", KEYBDINPUT), ("_pad", ctypes.c_byte * 24)]


class INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("union", _INPUT_UNION)]


# ── Low-level key helpers ─────────────────────────────────────────────────


def _send_key(vk: int, up: bool = False) -> None:
    inp = INPUT()
    inp.type = INPUT_KEYBOARD
    inp.union.ki.wVk = vk
    inp.union.ki.dwFlags = KEYEVENTF_KEYUP if up else 0
    _ = ctypes.set_last_error(0)
    sent = user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
    if sent != 1:
        raise OSError(ctypes.get_last_error(), "SendInput failed")


def _send_unicode_key(unit: int, up: bool = False) -> None:
    inp = INPUT()
    inp.type = INPUT_KEYBOARD
    inp.union.ki.wVk = 0
    inp.union.ki.wScan = unit
    inp.union.ki.dwFlags = KEYEVENTF_UNICODE | (KEYEVENTF_KEYUP if up else 0)
    _ = ctypes.set_last_error(0)
    sent = user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
    if sent != 1:
        raise OSError(ctypes.get_last_error(), "SendInput unicode failed")


def _press(vk: int, hold: float = 0.04) -> None:
    _send_key(vk)
    time.sleep(hold)
    _send_key(vk, up=True)


def _ctrl_v() -> None:
    _send_key(VK_CONTROL)
    time.sleep(0.03)
    _press(VK_V)
    time.sleep(0.03)
    _send_key(VK_CONTROL, up=True)


def _is_key_pressed(vk: int) -> bool:
    return bool(user32.GetAsyncKeyState(vk) & 0x8000)


def _release_pressed_modifiers() -> None:
    for vk in (VK_CONTROL, VK_SHIFT, VK_MENU):
        if _is_key_pressed(vk):
            _send_key(vk, up=True)
            time.sleep(0.01)


def _chat_open_vk(chat_open_key: str) -> int:
    if not chat_open_key:
        return VK_T

    key = chat_open_key.strip()
    if not key:
        return VK_T

    upper = key[0].upper()
    if "A" <= upper <= "Z" or "0" <= upper <= "9":
        return ord(upper)
    return VK_T


def _foreground_window_title() -> str:
    hwnd = user32.GetForegroundWindow()
    if not hwnd:
        return ""
    length = user32.GetWindowTextLengthW(hwnd)
    if length <= 0:
        return ""
    buffer = ctypes.create_unicode_buffer(length + 1)
    user32.GetWindowTextW(hwnd, buffer, length + 1)
    return buffer.value


def _is_fivem_window_title(title: str) -> bool:
    lower_title = title.lower()
    if not lower_title:
        return False
    return any(
        token in lower_title for token in ("fivem", "cfx.re", "citizenfx", "gta v")
    )


def _wait_for_fivem_foreground(timeout_ms: int) -> tuple[bool, str]:
    timeout = max(0, int(timeout_ms))
    start = time.monotonic()
    last_title = ""

    while True:
        last_title = _foreground_window_title()
        if _is_fivem_window_title(last_title):
            return True, last_title

        elapsed_ms = int((time.monotonic() - start) * 1000)
        if elapsed_ms >= timeout:
            return False, last_title
        time.sleep(FOREGROUND_POLL_INTERVAL_MS / 1000)


def _type_text(text: str, char_delay_ms: int) -> None:
    delay = max(0, int(char_delay_ms)) / 1000
    units = text.encode("utf-16-le")
    for idx in range(0, len(units), 2):
        unit = int.from_bytes(units[idx : idx + 2], "little")
        _send_unicode_key(unit)
        _send_unicode_key(unit, up=True)
        if delay > 0:
            time.sleep(delay)


# ── Sender class ──────────────────────────────────────────────────────────


class KeyboardSender:
    """Sends text to FiveM by simulating: T -> input -> Enter."""

    def __init__(self) -> None:
        self._cancel_event = threading.Event()
        self._send_lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._sending = False
        self._progress: dict[str, Any] = {}

    @property
    def is_sending(self) -> bool:
        with self._state_lock:
            return self._sending

    @property
    def progress(self) -> dict[str, Any]:
        return dict(self._progress)

    def _set_sending(self, value: bool) -> None:
        with self._state_lock:
            self._sending = value

    def try_claim_batch(self) -> bool:
        with self._state_lock:
            if self._sending:
                return False
            self._sending = True
            return True

    def mark_idle(self) -> None:
        self._set_sending(False)

    # ── public API ─────────────────────────────────────────────────────

    def send_single(
        self,
        text: str,
        method: str = "clipboard",
        chat_open_key: str = "t",
        delay_open: int = 300,
        delay_paste: int = 100,
        delay_send: int = 200,
        focus_timeout: int = DEFAULT_FOCUS_TIMEOUT_MS,
        retry_count: int = DEFAULT_RETRY_COUNT,
        retry_interval: int = DEFAULT_RETRY_INTERVAL_MS,
        typing_char_delay: int = DEFAULT_TYPING_CHAR_DELAY_MS,
    ) -> dict[str, Any]:
        """Send one line of text. Blocking. Returns result dict."""
        normalized_method = method if method in ("clipboard", "typing") else "clipboard"
        attempts = max(1, int(retry_count) + 1)
        last_error = "发送失败"
        clean_text = text.strip()

        if not clean_text:
            return {"success": False, "text": text, "error": "发送文本为空"}

        with self._send_lock:
            for attempt in range(1, attempts + 1):
                is_focused, current_title = _wait_for_fivem_foreground(focus_timeout)
                if not is_focused:
                    title = current_title or "未知窗口"
                    last_error = (
                        "未检测到 FiveM 在前台，"
                        f"当前窗口: {title}。请先切回 FiveM 后重试"
                    )
                else:
                    try:
                        self._send_once(
                            clean_text,
                            method=normalized_method,
                            chat_open_key=chat_open_key,
                            delay_open=delay_open,
                            delay_paste=delay_paste,
                            delay_send=delay_send,
                            typing_char_delay=typing_char_delay,
                        )
                        return {
                            "success": True,
                            "text": clean_text,
                            "attempt": attempt,
                            "method": normalized_method,
                        }
                    except Exception as exc:
                        last_error = str(exc)

                if attempt < attempts:
                    time.sleep(max(0, int(retry_interval)) / 1000)

        return {
            "success": False,
            "text": clean_text,
            "error": last_error,
            "attempts": attempts,
        }

    def _send_once(
        self,
        text: str,
        method: str,
        chat_open_key: str,
        delay_open: int,
        delay_paste: int,
        delay_send: int,
        typing_char_delay: int,
    ) -> None:
        _release_pressed_modifiers()
        _press(_chat_open_vk(chat_open_key))
        time.sleep(max(0, int(delay_open)) / 1000)

        if method == "typing":
            _type_text(text, typing_char_delay)
        else:
            pyperclip.copy(text)
            _ctrl_v()

        time.sleep(max(0, int(delay_paste)) / 1000)
        _press(VK_RETURN)
        time.sleep(max(0, int(delay_send)) / 1000)

    def send_batch_sync(
        self,
        texts: list[str],
        method: str = "clipboard",
        chat_open_key: str = "t",
        delay_open: int = 300,
        delay_paste: int = 100,
        delay_send: int = 200,
        delay_between: int = 1500,
        focus_timeout: int = DEFAULT_FOCUS_TIMEOUT_MS,
        retry_count: int = DEFAULT_RETRY_COUNT,
        retry_interval: int = DEFAULT_RETRY_INTERVAL_MS,
        typing_char_delay: int = DEFAULT_TYPING_CHAR_DELAY_MS,
        on_progress: Callable[[dict[str, Any]], None] | None = None,
    ) -> list[dict[str, Any]]:
        """Send multiple lines sequentially. Blocking. Supports cancellation."""
        self._cancel_event.clear()
        self._set_sending(True)
        results: list[dict[str, Any]] = []
        ok_count = 0

        try:
            total = len(texts)
            for idx, text in enumerate(texts):
                if self._cancel_event.is_set():
                    self._progress = {
                        "status": "cancelled",
                        "index": idx,
                        "total": total,
                    }
                    if on_progress:
                        on_progress(self._progress)
                    break

                self._progress = {
                    "status": "sending",
                    "index": idx,
                    "total": total,
                    "text": text,
                }
                if on_progress:
                    on_progress(self._progress)

                result = self.send_single(
                    text,
                    method=method,
                    chat_open_key=chat_open_key,
                    delay_open=delay_open,
                    delay_paste=delay_paste,
                    delay_send=delay_send,
                    focus_timeout=focus_timeout,
                    retry_count=retry_count,
                    retry_interval=retry_interval,
                    typing_char_delay=typing_char_delay,
                )
                result["index"] = idx
                results.append(result)

                if result.get("success"):
                    ok_count += 1

                if on_progress:
                    on_progress(
                        {
                            "status": "line_result",
                            "index": idx,
                            "total": total,
                            "success": result.get("success", False),
                            "error": result.get("error"),
                            "text": text,
                        }
                    )

                if idx < total - 1 and not self._cancel_event.is_set():
                    time.sleep(max(0, int(delay_between)) / 1000)

            if not self._cancel_event.is_set():
                failed_count = len(results) - ok_count
                self._progress = {
                    "status": "completed",
                    "total": total,
                    "sent": len(results),
                    "success": ok_count,
                    "failed": failed_count,
                }
                if on_progress:
                    on_progress(self._progress)
        finally:
            self._set_sending(False)

        return results

    async def send_single_async(self, text: str, **kwargs: Any) -> dict[str, Any]:
        """Async wrapper for send_single."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, lambda: self.send_single(text, **kwargs)
        )

    async def send_batch_async(
        self,
        texts: list[str],
        on_progress: Callable[[dict[str, Any]], None] | None = None,
        **kwargs: Any,
    ) -> list[dict[str, Any]]:
        """Async wrapper for send_batch_sync."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self.send_batch_sync(texts, on_progress=on_progress, **kwargs),
        )

    def cancel(self) -> bool:
        """Request cancellation of the current batch send."""
        if self.is_sending:
            self._cancel_event.set()
            return True
        return False


# ── Module-level singleton ────────────────────────────────────────────────

sender = KeyboardSender()
