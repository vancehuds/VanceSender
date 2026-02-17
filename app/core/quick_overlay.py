"""Windows global quick-send overlay module.

This module provides:
- Global trigger by configured hotkey combination and/or mouse side button
- A topmost popup for preset selection and quick send
- A non-activating top-right status overlay window
"""

from __future__ import annotations

import ctypes
import json
import queue
import threading
from typing import Any

import tkinter as tk
from tkinter import ttk

from app.core.config import PRESETS_DIR, load_config
from app.core.sender import sender

user32 = ctypes.WinDLL("user32", use_last_error=True)

VK_SHIFT = 0x10
VK_CONTROL = 0x11
VK_MENU = 0x12
VK_LWIN = 0x5B
VK_RWIN = 0x5C
VK_XBUTTON1 = 0x05
VK_XBUTTON2 = 0x06

GWL_EXSTYLE = -20
WS_EX_TOOLWINDOW = 0x00000080
WS_EX_NOACTIVATE = 0x08000000

HWND_TOPMOST = -1

SWP_NOSIZE = 0x0001
SWP_NOMOVE = 0x0002
SWP_NOACTIVATE = 0x0010
SWP_FRAMECHANGED = 0x0020
SWP_SHOWWINDOW = 0x0040

SW_SHOWNOACTIVATE = 4

DEFAULT_HOTKEY = "f8"

_SPECIAL_KEYS: dict[str, int] = {
    "space": 0x20,
    "enter": 0x0D,
    "return": 0x0D,
    "tab": 0x09,
    "esc": 0x1B,
    "escape": 0x1B,
    "up": 0x26,
    "down": 0x28,
    "left": 0x25,
    "right": 0x27,
    "home": 0x24,
    "end": 0x23,
    "pageup": 0x21,
    "pagedown": 0x22,
    "insert": 0x2D,
    "delete": 0x2E,
}

_MODIFIER_KEYS: dict[str, int] = {
    "shift": VK_SHIFT,
    "ctrl": VK_CONTROL,
    "control": VK_CONTROL,
    "alt": VK_MENU,
    "win": VK_LWIN,
    "meta": VK_LWIN,
    "super": VK_LWIN,
}


def _is_vk_pressed(vk: int) -> bool:
    return bool(user32.GetAsyncKeyState(vk) & 0x8000)


def _parse_key_token(token: str) -> int | None:
    lowered = token.strip().lower()
    if not lowered:
        return None

    if lowered in _SPECIAL_KEYS:
        return _SPECIAL_KEYS[lowered]

    if lowered.startswith("f") and lowered[1:].isdigit():
        idx = int(lowered[1:])
        if 1 <= idx <= 24:
            return 0x6F + idx

    if len(lowered) == 1:
        upper = lowered.upper()
        if ("A" <= upper <= "Z") or ("0" <= upper <= "9"):
            return ord(upper)

    return None


def _parse_hotkey(hotkey: str) -> list[int]:
    if not hotkey:
        return []

    keys: list[int] = []
    seen: set[int] = set()

    for raw_token in hotkey.split("+"):
        token = raw_token.strip().lower()
        if not token:
            continue

        vk = _MODIFIER_KEYS.get(token)
        if vk is None:
            vk = _parse_key_token(token)
        if vk is None or vk in seen:
            continue

        seen.add(vk)
        keys.append(vk)

    return keys


def _parse_mouse_side_button(button: str | None) -> int | None:
    if not button:
        return None

    normalized = button.strip().lower()
    if normalized in {"x1", "mouse4", "side1", "back"}:
        return VK_XBUTTON1
    if normalized in {"x2", "mouse5", "side2", "forward"}:
        return VK_XBUTTON2
    return None


def _preset_lines(preset: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    raw_texts = preset.get("texts", [])
    if not isinstance(raw_texts, list):
        return lines

    for item in raw_texts:
        if not isinstance(item, dict):
            continue
        line_type = "do" if item.get("type") == "do" else "me"
        content = str(item.get("content", "")).strip()
        if not content:
            continue
        lines.append(f"/{line_type} {content}")

    return lines


class QuickOverlayModule:
    """Global trigger popup + non-focus status overlay."""

    def __init__(self, overlay_cfg: dict[str, Any]) -> None:
        hotkey_raw = str(
            overlay_cfg.get("trigger_hotkey", DEFAULT_HOTKEY) or ""
        ).strip()
        self._hotkey_label = hotkey_raw or DEFAULT_HOTKEY
        self._hotkey_vks = _parse_hotkey(self._hotkey_label)
        if not self._hotkey_vks:
            self._hotkey_label = DEFAULT_HOTKEY
            self._hotkey_vks = _parse_hotkey(DEFAULT_HOTKEY)

        self._mouse_button_label = str(
            overlay_cfg.get("mouse_side_button", "") or ""
        ).strip()
        self._mouse_side_vkey = _parse_mouse_side_button(self._mouse_button_label)

        poll_ms = int(overlay_cfg.get("poll_interval_ms", 40) or 40)
        self._poll_interval_ms = max(20, min(200, poll_ms))

        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._status_queue: queue.Queue[tuple[str, bool]] = queue.Queue()

        self._hotkey_active_last = False
        self._mouse_active_last = False

        self._root: tk.Tk | None = None
        self._popup: tk.Toplevel | None = None
        self._status_window: tk.Toplevel | None = None

        self._preset_combo: ttk.Combobox | None = None
        self._line_listbox: tk.Listbox | None = None
        self._status_var: tk.StringVar | None = None

        self._presets: list[dict[str, Any]] = []
        self._preset_ids: list[str] = []
        self._current_preset_id: str | None = None
        self._current_lines: list[str] = []

        self._status_hide_job: str | None = None
        self._last_foreground_hwnd = 0

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run,
            name="quick-overlay-ui",
            daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()

    def _run(self) -> None:
        try:
            self._root = tk.Tk()
            self._root.withdraw()

            self._build_popup_window()
            self._build_status_window()
            self._refresh_presets()

            self._root.after(self._poll_interval_ms, self._poll_triggers)
            self._root.after(80, self._drain_status_updates)
            self._root.mainloop()
        except Exception as exc:
            print(f"⚠ 快捷悬浮窗模块运行失败: {exc}")

    def _build_popup_window(self) -> None:
        if self._root is None:
            return

        popup = tk.Toplevel(self._root)
        popup.title("VanceSender 快速发送")
        popup.geometry("500x420")
        popup.resizable(False, False)
        popup.attributes("-topmost", True)
        popup.withdraw()
        popup.protocol("WM_DELETE_WINDOW", lambda: self._hide_popup(restore_focus=True))
        popup.bind("<Escape>", lambda _e: self._hide_popup(restore_focus=True))

        frame = ttk.Frame(popup, padding=12)
        frame.pack(fill="both", expand=True)

        head = ttk.Frame(frame)
        head.pack(fill="x")

        ttk.Label(head, text="预设").pack(side="left")
        combo = ttk.Combobox(head, state="readonly", width=38)
        combo.pack(side="left", padx=8, fill="x", expand=True)
        combo.bind("<<ComboboxSelected>>", self._on_preset_change)
        ttk.Button(head, text="刷新", command=self._refresh_presets).pack(side="left")

        trigger_hint = self._hotkey_label
        if self._mouse_side_vkey is not None and self._mouse_button_label:
            trigger_hint = f"{trigger_hint} / {self._mouse_button_label}"
        ttk.Label(frame, text=f"触发键: {trigger_hint}").pack(anchor="w", pady=(8, 6))

        list_frame = ttk.Frame(frame)
        list_frame.pack(fill="both", expand=True)

        listbox = tk.Listbox(
            list_frame,
            selectmode=tk.SINGLE,
            activestyle="none",
            exportselection=False,
        )
        listbox.pack(side="left", fill="both", expand=True)

        scrollbar = ttk.Scrollbar(list_frame, orient="vertical", command=listbox.yview)
        scrollbar.pack(side="right", fill="y")
        listbox.configure(yscrollcommand=scrollbar.set)

        actions = ttk.Frame(frame)
        actions.pack(fill="x", pady=(10, 0))
        ttk.Button(actions, text="发送选中", command=self._send_selected_line).pack(
            side="left", fill="x", expand=True
        )
        ttk.Button(actions, text="一键发送全部", command=self._send_all_lines).pack(
            side="left", fill="x", expand=True, padx=(8, 0)
        )

        self._popup = popup
        self._preset_combo = combo
        self._line_listbox = listbox

    def _build_status_window(self) -> None:
        if self._root is None:
            return

        status = tk.Toplevel(self._root)
        status.overrideredirect(True)
        status.attributes("-topmost", True)
        status.withdraw()

        body = tk.Frame(status, bg="#151b2b", bd=1, relief="solid")
        body.pack(fill="both", expand=True)

        status_var = tk.StringVar(value="任务状态")
        label = tk.Label(
            body,
            textvariable=status_var,
            bg="#151b2b",
            fg="#e6ecff",
            padx=14,
            pady=10,
            anchor="w",
            justify="left",
        )
        label.pack(fill="both", expand=True)

        self._status_window = status
        self._status_var = status_var

    def _poll_triggers(self) -> None:
        if self._root is None:
            return

        if self._stop_event.is_set():
            self._root.quit()
            return

        hotkey_active = bool(self._hotkey_vks) and all(
            _is_vk_pressed(vk) for vk in self._hotkey_vks
        )
        if hotkey_active and not self._hotkey_active_last:
            self._show_popup()
        self._hotkey_active_last = hotkey_active

        mouse_active = False
        if self._mouse_side_vkey is not None:
            mouse_active = _is_vk_pressed(self._mouse_side_vkey)
            if mouse_active and not self._mouse_active_last:
                self._show_popup()
        self._mouse_active_last = mouse_active

        self._root.after(self._poll_interval_ms, self._poll_triggers)

    def _drain_status_updates(self) -> None:
        if self._root is None:
            return

        while True:
            try:
                text, final = self._status_queue.get_nowait()
            except queue.Empty:
                break
            self._show_status(text, final=final)

        if self._stop_event.is_set():
            self._root.quit()
            return

        self._root.after(80, self._drain_status_updates)

    def _remember_foreground_window(self) -> None:
        self._last_foreground_hwnd = int(user32.GetForegroundWindow() or 0)

    def _restore_foreground_window(self) -> None:
        hwnd = self._last_foreground_hwnd
        self._last_foreground_hwnd = 0
        if hwnd and user32.IsWindow(hwnd):
            user32.SetForegroundWindow(hwnd)

    def _center_popup(self) -> None:
        if self._popup is None:
            return
        self._popup.update_idletasks()
        w = self._popup.winfo_width()
        h = self._popup.winfo_height()
        sw = self._popup.winfo_screenwidth()
        sh = self._popup.winfo_screenheight()
        x = max(0, (sw - w) // 2)
        y = max(0, (sh - h) // 2)
        self._popup.geometry(f"{w}x{h}+{x}+{y}")

    def _popup_visible(self) -> bool:
        if self._popup is None:
            return False
        try:
            return self._popup.state() != "withdrawn"
        except tk.TclError:
            return False

    def _show_popup(self) -> None:
        if self._popup is None:
            return
        if self._popup_visible():
            return

        self._remember_foreground_window()
        self._refresh_presets()
        self._center_popup()
        self._popup.deiconify()
        self._popup.lift()
        self._popup.attributes("-topmost", True)
        self._popup.focus_force()

    def _hide_popup(self, restore_focus: bool) -> None:
        if self._popup is not None:
            self._popup.withdraw()
        if restore_focus:
            self._restore_foreground_window()

    def _load_presets_from_disk(self) -> list[dict[str, Any]]:
        PRESETS_DIR.mkdir(parents=True, exist_ok=True)
        loaded: list[dict[str, Any]] = []
        for fp in sorted(PRESETS_DIR.glob("*.json"), key=lambda p: p.name.lower()):
            try:
                with open(fp, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except (OSError, json.JSONDecodeError):
                continue

            if not isinstance(data, dict):
                continue
            preset_id = str(data.get("id", "")).strip()
            name = str(data.get("name", "")).strip()
            if not preset_id or not name:
                continue
            loaded.append(data)
        return loaded

    def _refresh_presets(self) -> None:
        if self._preset_combo is None or self._line_listbox is None:
            return

        current_id = self._current_preset_id
        self._presets = self._load_presets_from_disk()
        self._preset_ids = [str(p.get("id", "")) for p in self._presets]

        options = [
            f"{p.get('name', '')} ({len(_preset_lines(p))}条)" for p in self._presets
        ]
        self._preset_combo["values"] = options

        if not self._presets:
            self._current_preset_id = None
            self._line_listbox.delete(0, tk.END)
            self._line_listbox.insert(tk.END, "暂无预设")
            self._current_lines = []
            return

        next_idx = 0
        if current_id and current_id in self._preset_ids:
            next_idx = self._preset_ids.index(current_id)

        self._preset_combo.current(next_idx)
        self._current_preset_id = self._preset_ids[next_idx]
        self._render_current_preset_lines()

    def _on_preset_change(self, _event: object | None = None) -> None:
        if self._preset_combo is None:
            return
        idx = self._preset_combo.current()
        if idx < 0 or idx >= len(self._preset_ids):
            return
        self._current_preset_id = self._preset_ids[idx]
        self._render_current_preset_lines()

    def _render_current_preset_lines(self) -> None:
        if self._line_listbox is None:
            return

        self._line_listbox.delete(0, tk.END)
        selected = next(
            (
                p
                for p in self._presets
                if str(p.get("id", "")) == self._current_preset_id
            ),
            None,
        )

        if selected is None:
            self._current_lines = []
            self._line_listbox.insert(tk.END, "预设不存在")
            return

        lines = _preset_lines(selected)
        self._current_lines = lines
        if not lines:
            self._line_listbox.insert(tk.END, "该预设暂无可发送文本")
            return

        for line in lines:
            self._line_listbox.insert(tk.END, line)

    def _sender_options(self) -> dict[str, Any]:
        cfg = load_config()
        sender_cfg = cfg.get("sender", {})
        return {
            "method": sender_cfg.get("method", "clipboard"),
            "chat_open_key": sender_cfg.get("chat_open_key", "t"),
            "delay_open": sender_cfg.get("delay_open_chat", 300),
            "delay_paste": sender_cfg.get("delay_after_paste", 100),
            "delay_send": sender_cfg.get("delay_after_send", 200),
            "focus_timeout": sender_cfg.get("focus_timeout", 5000),
            "retry_count": sender_cfg.get("retry_count", 2),
            "retry_interval": sender_cfg.get("retry_interval", 300),
            "typing_char_delay": sender_cfg.get("typing_char_delay", 18),
            "delay_between": sender_cfg.get("delay_between_lines", 1500),
        }

    def _send_selected_line(self) -> None:
        if not self._current_lines or self._line_listbox is None:
            self._enqueue_status("当前预设没有可发送文本", final=True)
            return

        selected = self._line_listbox.curselection()
        if not selected:
            self._enqueue_status("请先选择一条文本", final=True)
            return

        idx = selected[0]
        if idx < 0 or idx >= len(self._current_lines):
            self._enqueue_status("选择项无效", final=True)
            return

        text = self._current_lines[idx]
        self._hide_popup(restore_focus=True)
        self._enqueue_status("单条发送中...", final=False)

        worker = threading.Thread(
            target=self._run_single_send,
            args=(text,),
            daemon=True,
        )
        worker.start()

    def _send_all_lines(self) -> None:
        if not self._current_lines:
            self._enqueue_status("当前预设没有可发送文本", final=True)
            return

        texts = list(self._current_lines)
        self._hide_popup(restore_focus=True)
        self._enqueue_status(f"开始发送，共 {len(texts)} 条", final=False)

        worker = threading.Thread(
            target=self._run_batch_send,
            args=(texts,),
            daemon=True,
        )
        worker.start()

    def _run_single_send(self, text: str) -> None:
        if sender.is_sending:
            self._enqueue_status("已有发送任务进行中", final=True)
            return

        options = self._sender_options()
        options.pop("delay_between", None)

        result = sender.send_single(text, **options)
        if result.get("success"):
            self._enqueue_status("单条发送完成", final=True)
            return

        error = str(result.get("error", "未知错误"))
        self._enqueue_status(f"单条发送失败: {error}", final=True)

    def _run_batch_send(self, texts: list[str]) -> None:
        if not sender.try_claim_batch():
            self._enqueue_status("已有批量发送任务进行中", final=True)
            return

        options = self._sender_options()
        delay_between = int(options.pop("delay_between", 1500) or 1500)

        try:
            sender.send_batch_sync(
                texts,
                delay_between=delay_between,
                on_progress=self._on_batch_progress,
                **options,
            )
        except Exception as exc:
            self._enqueue_status(f"批量发送异常: {exc}", final=True)
        finally:
            sender.mark_idle()

    def _on_batch_progress(self, progress: dict[str, Any]) -> None:
        status = str(progress.get("status", ""))
        if status == "sending":
            index = int(progress.get("index", 0)) + 1
            total = int(progress.get("total", 0))
            self._enqueue_status(f"发送中 {index}/{total}", final=False)
            return

        if status == "line_result":
            if not progress.get("success", False):
                index = int(progress.get("index", 0)) + 1
                error = str(progress.get("error", "未知错误"))
                self._enqueue_status(f"第 {index} 条失败: {error}", final=False)
            return

        if status == "completed":
            success_count = int(progress.get("success", 0))
            failed_count = int(progress.get("failed", 0))
            self._enqueue_status(
                f"发送完成：成功 {success_count} 条，失败 {failed_count} 条",
                final=True,
            )
            return

        if status == "cancelled":
            self._enqueue_status("发送已取消", final=True)
            return

        if status == "error":
            error = str(progress.get("error", "未知错误"))
            self._enqueue_status(f"发送失败: {error}", final=True)

    def _enqueue_status(self, text: str, final: bool) -> None:
        self._status_queue.put((text, final))

    def _show_status(self, text: str, final: bool) -> None:
        if (
            self._root is None
            or self._status_window is None
            or self._status_var is None
        ):
            return

        if self._status_hide_job is not None:
            self._root.after_cancel(self._status_hide_job)
            self._status_hide_job = None

        self._status_var.set(text)

        width = 360
        height = 62
        screen_width = self._status_window.winfo_screenwidth()
        x = max(0, screen_width - width - 16)
        y = 16
        self._status_window.geometry(f"{width}x{height}+{x}+{y}")
        self._status_window.deiconify()
        self._status_window.lift()

        self._enforce_status_no_activate()

        if final:
            self._status_hide_job = self._root.after(3000, self._hide_status)

    def _hide_status(self) -> None:
        if self._status_window is not None:
            self._status_window.withdraw()
        self._status_hide_job = None

    def _enforce_status_no_activate(self) -> None:
        if self._status_window is None:
            return

        hwnd = int(self._status_window.winfo_id())
        if not hwnd:
            return

        ex_style = int(user32.GetWindowLongW(hwnd, GWL_EXSTYLE))
        desired_style = ex_style | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE
        if desired_style != ex_style:
            user32.SetWindowLongW(hwnd, GWL_EXSTYLE, desired_style)

        flags = (
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW
        )
        user32.SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, flags)
        user32.ShowWindow(hwnd, SW_SHOWNOACTIVATE)


def create_quick_overlay_module(cfg: dict[str, Any]) -> QuickOverlayModule | None:
    """Create module instance from config, or return None if disabled."""
    section = cfg.get("quick_overlay", {})
    enabled = bool(section.get("enabled", True))
    if not enabled:
        return None
    return QuickOverlayModule(section)
