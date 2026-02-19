"""Desktop shell helpers for embedded WebUI mode."""

from __future__ import annotations

import ctypes
import importlib
import importlib.util
import threading
from collections.abc import Callable
from typing import Any, Literal

from app.core.config import load_config, resolve_enable_tray_on_start

_CLOSE_ACTION_ASK = "ask"
_CLOSE_ACTION_MINIMIZE_TO_TRAY = "minimize_to_tray"
_CLOSE_ACTION_EXIT = "exit"
_CLOSE_ACTION_VALUES = {
    _CLOSE_ACTION_ASK,
    _CLOSE_ACTION_MINIMIZE_TO_TRAY,
    _CLOSE_ACTION_EXIT,
}

_window_lock = threading.Lock()
_desktop_window: object | None = None
_quick_panel_window: object | None = None
_quick_panel_window_url = ""
_quick_panel_return_hwnd = 0
_window_maximized = False
_exit_requested = False
_tray_controller: _TrayController | None = None
_tray_title = "VanceSender"
_user32 = ctypes.WinDLL("user32", use_last_error=True)


class _TrayController:
    """Manage system tray icon lifecycle and click actions."""

    def __init__(
        self,
        *,
        title: str,
        on_show: Callable[[], bool],
        on_exit: Callable[[], bool],
    ) -> None:
        self._title = title
        self._on_show = on_show
        self._on_exit = on_exit
        self._lock = threading.Lock()
        self._icon: object | None = None
        self._thread: threading.Thread | None = None

    def start(self) -> bool:
        """Start tray icon event loop in background thread."""
        with self._lock:
            if self._icon is not None:
                return True

            try:
                pystray = importlib.import_module("pystray")
            except Exception:
                return False

            icon_image = _create_tray_icon_image()
            if icon_image is None:
                return False

            try:
                menu = pystray.Menu(
                    pystray.MenuItem("打开主窗口", self._handle_show, default=True),
                    pystray.MenuItem("退出 VanceSender", self._handle_exit),
                )
                icon = pystray.Icon(
                    "vancesender",
                    icon_image,
                    self._title,
                    menu,
                )
            except Exception:
                return False

            self._icon = icon
            self._thread = threading.Thread(
                target=self._run,
                daemon=True,
                name="desktop-tray-loop",
            )
            self._thread.start()
            return True

    def stop(self) -> None:
        """Stop tray icon loop and release resources."""
        with self._lock:
            icon = self._icon
            thread = self._thread
            self._icon = None
            self._thread = None

        if icon is not None:
            stop_method = getattr(icon, "stop", None)
            if callable(stop_method):
                try:
                    stop_method()
                except Exception:
                    pass

        if (
            thread is not None
            and thread.is_alive()
            and thread is not threading.current_thread()
        ):
            thread.join(timeout=2)

    def _run(self) -> None:
        icon = None
        with self._lock:
            icon = self._icon

        if icon is None:
            return

        run_method = getattr(icon, "run", None)
        if not callable(run_method):
            return

        try:
            run_method()
        except Exception:
            return

    def _handle_show(self, *_: object) -> None:
        try:
            self._on_show()
        except Exception:
            return

    def _handle_exit(self, *_: object) -> None:
        try:
            self._on_exit()
        except Exception:
            return


def _set_desktop_window(window: object | None) -> None:
    """Store current desktop window handle for runtime controls."""
    global _desktop_window
    with _window_lock:
        _desktop_window = window


def _get_desktop_window() -> object | None:
    """Return current desktop window handle if available."""
    with _window_lock:
        return _desktop_window


def _set_quick_panel_window(window: object | None) -> None:
    """Store current quick-panel window handle for runtime controls."""
    global _quick_panel_window
    with _window_lock:
        _quick_panel_window = window


def _get_quick_panel_window() -> object | None:
    """Return current quick-panel window handle if available."""
    with _window_lock:
        return _quick_panel_window


def _set_quick_panel_window_url(url: str) -> None:
    """Persist current quick-panel URL to avoid redundant reloads."""
    global _quick_panel_window_url
    normalized = str(url or "").strip()
    with _window_lock:
        _quick_panel_window_url = normalized


def _get_quick_panel_window_url() -> str:
    """Read cached quick-panel URL for reload checks."""
    with _window_lock:
        return str(_quick_panel_window_url)


def _set_quick_panel_return_hwnd(hwnd: int) -> None:
    """Store target hwnd used for quick-panel focus restore."""
    global _quick_panel_return_hwnd
    with _window_lock:
        _quick_panel_return_hwnd = max(0, int(hwnd))


def _get_quick_panel_return_hwnd() -> int:
    """Return target hwnd used for quick-panel focus restore."""
    with _window_lock:
        return int(_quick_panel_return_hwnd)


def _restore_quick_panel_return_focus() -> bool:
    """Restore foreground focus to remembered hwnd when possible."""
    hwnd = _get_quick_panel_return_hwnd()
    if hwnd <= 0:
        return False

    try:
        if not bool(_user32.IsWindow(hwnd)):
            return False
        return bool(_user32.SetForegroundWindow(hwnd))
    except Exception:
        return False


def _set_window_maximized(value: bool) -> None:
    """Persist current maximize state for custom titlebar controls."""
    global _window_maximized
    with _window_lock:
        _window_maximized = value


def _get_window_maximized() -> bool:
    """Read cached maximize state for desktop window."""
    with _window_lock:
        return _window_maximized


def _set_exit_requested(value: bool) -> None:
    """Store whether current close flow is explicit full-exit."""
    global _exit_requested
    with _window_lock:
        _exit_requested = value


def _is_exit_requested() -> bool:
    """Read whether current close flow is explicit full-exit."""
    with _window_lock:
        return _exit_requested


def _set_tray_controller(controller: _TrayController | None) -> None:
    """Persist current tray controller reference."""
    global _tray_controller
    with _window_lock:
        _tray_controller = controller


def _get_tray_controller() -> _TrayController | None:
    """Return current tray controller if started."""
    with _window_lock:
        return _tray_controller


def _set_tray_title(title: object) -> None:
    """Persist tray tooltip title for lazy tray startup."""
    global _tray_title
    normalized_title = ""
    if isinstance(title, str):
        normalized_title = title.strip()

    with _window_lock:
        _tray_title = normalized_title or "VanceSender"


def _get_tray_title() -> str:
    """Return current tray tooltip title."""
    with _window_lock:
        return _tray_title


def has_webview_support() -> bool:
    """Return whether pywebview is available in current runtime."""
    return importlib.util.find_spec("webview") is not None


def has_system_tray_support() -> bool:
    """Return whether runtime has required tray dependencies."""
    return (
        importlib.util.find_spec("pystray") is not None
        and importlib.util.find_spec("PIL") is not None
    )


def normalize_close_action(value: object) -> str:
    """Normalize close action value from config or API payload."""
    if not isinstance(value, str):
        return _CLOSE_ACTION_ASK

    lowered = value.strip().lower()
    if lowered in _CLOSE_ACTION_VALUES:
        return lowered
    return _CLOSE_ACTION_ASK


def is_desktop_window_active() -> bool:
    """Return whether a desktop embedded window is currently active."""
    return _get_desktop_window() is not None


def _create_tray_icon_image() -> object | None:
    """Create simple in-memory tray icon image."""
    try:
        image_module = importlib.import_module("PIL.Image")
        draw_module = importlib.import_module("PIL.ImageDraw")
    except Exception:
        return None

    image_cls = getattr(image_module, "new", None)
    draw_cls = getattr(draw_module, "Draw", None)
    if not callable(image_cls) or not callable(draw_cls):
        return None

    try:
        image = image_cls("RGBA", (64, 64), (0, 0, 0, 0))
        draw: Any = draw_cls(image)
        draw.rounded_rectangle((4, 4, 60, 60), radius=14, fill=(18, 24, 37, 255))
        draw.rounded_rectangle(
            (10, 10, 54, 54), radius=11, outline=(87, 224, 255, 255), width=3
        )
        draw.text((24, 18), "V", fill=(87, 224, 255, 255))
        return image
    except Exception:
        return None


def _show_desktop_window() -> bool:
    """Show previously hidden desktop window from tray."""
    window = _get_desktop_window()
    if window is None:
        return False

    shown = False
    for method_name in ("show", "restore"):
        method = getattr(window, method_name, None)
        if not callable(method):
            continue

        try:
            method()
        except Exception:
            continue
        shown = True

    if shown:
        _set_window_maximized(False)
    return shown


def _hide_desktop_window_to_tray() -> bool:
    """Hide desktop window so app keeps running in system tray."""
    window = _get_desktop_window()
    if window is None:
        return False

    if not _ensure_tray_controller_started():
        return False

    for method_name in ("hide", "minimize"):
        method = getattr(window, method_name, None)
        if not callable(method):
            continue

        try:
            method()
        except Exception:
            continue

        _set_window_maximized(False)
        return True

    return False


def _close_desktop_window(force_exit: bool = True) -> bool:
    """Destroy desktop window and quit app process loop."""
    window = _get_desktop_window()
    if window is None:
        return False

    destroy_method = getattr(window, "destroy", None)
    if not callable(destroy_method):
        return False

    if force_exit:
        _set_exit_requested(True)

    quick_panel_window = _get_quick_panel_window()
    if quick_panel_window is not None:
        quick_panel_destroy = getattr(quick_panel_window, "destroy", None)
        if callable(quick_panel_destroy):
            try:
                quick_panel_destroy()
            except Exception:
                pass
        _set_quick_panel_window(None)
        _set_quick_panel_window_url("")
        _set_quick_panel_return_hwnd(0)

    _stop_tray_controller()

    try:
        destroy_method()
    except Exception:
        _set_exit_requested(False)
        return False

    _set_desktop_window(None)
    _set_window_maximized(False)
    return True


def _launch_config_from_input(
    launch_options: dict[str, object] | None,
) -> dict[str, object]:
    """Resolve launch config dictionary from optional input."""
    if isinstance(launch_options, dict):
        return launch_options

    cfg = load_config()
    launch_section = cfg.get("launch", {})
    return launch_section if isinstance(launch_section, dict) else {}


def _resolve_launch_tray_preferences(
    launch_options: dict[str, object] | None,
) -> tuple[bool, str]:
    """Resolve startup tray and close policy values from launch config."""
    launch_cfg = _launch_config_from_input(launch_options)

    enable_tray_on_start = resolve_enable_tray_on_start(launch_cfg)
    close_action = normalize_close_action(
        launch_cfg.get("close_action", _CLOSE_ACTION_ASK)
    )
    return enable_tray_on_start, close_action


def _ask_close_action_and_maybe_remember(window: object) -> str:
    """Ask user close behavior once (no remembered choice here)."""
    confirm_method = getattr(window, "create_confirmation_dialog", None)
    if not callable(confirm_method):
        return _CLOSE_ACTION_MINIMIZE_TO_TRAY

    try:
        should_exit = bool(
            confirm_method(
                "关闭 VanceSender",
                "点击“是”将彻底关闭应用。\n点击“否”将最小化到系统托盘。",
            )
        )
    except Exception:
        return _CLOSE_ACTION_MINIMIZE_TO_TRAY

    selected_action = (
        _CLOSE_ACTION_EXIT if should_exit else _CLOSE_ACTION_MINIMIZE_TO_TRAY
    )

    return selected_action


def _resolve_requested_close_action() -> str:
    """Resolve effective close action (ask/minimize/exit)."""
    _, close_action = _resolve_launch_tray_preferences(None)
    if close_action != _CLOSE_ACTION_ASK:
        return close_action

    window = _get_desktop_window()
    if window is None:
        return _CLOSE_ACTION_EXIT
    return _ask_close_action_and_maybe_remember(window)


def request_desktop_window_close() -> bool:
    """Apply close policy for user-triggered close requests."""
    action = _resolve_requested_close_action()
    if action == _CLOSE_ACTION_EXIT:
        return _close_desktop_window(force_exit=True)

    if _hide_desktop_window_to_tray():
        return True

    return _close_desktop_window(force_exit=True)


def _on_desktop_window_closing() -> bool:
    """Handle native window close event with policy support.

    Return True to continue closing, False to cancel close.
    """
    if _is_exit_requested():
        _stop_tray_controller()
        return True

    action = _resolve_requested_close_action()
    if action == _CLOSE_ACTION_MINIMIZE_TO_TRAY and _hide_desktop_window_to_tray():
        return False

    _set_exit_requested(True)
    _stop_tray_controller()
    return True


def _bind_window_closing_event(window: object) -> None:
    """Bind native window closing event to tray close policy handler."""
    events = getattr(window, "events", None)
    if events is None:
        return

    closing_event = getattr(events, "closing", None)
    if closing_event is None:
        return

    try:
        closing_event += _on_desktop_window_closing
    except Exception:
        return


def _stop_tray_controller() -> None:
    """Stop and clear running tray controller if any."""
    controller = _get_tray_controller()
    _set_tray_controller(None)
    if controller is None:
        return

    controller.stop()


def _start_tray_controller(title: str) -> bool:
    """Start tray icon loop for desktop shell runtime."""
    _set_tray_title(title)
    _stop_tray_controller()

    if not has_system_tray_support():
        return False

    controller = _TrayController(
        title=title,
        on_show=lambda: perform_window_action("show"),
        on_exit=lambda: perform_window_action("exit"),
    )
    if not controller.start():
        return False

    _set_tray_controller(controller)
    return True


def _ensure_tray_controller_started() -> bool:
    """Ensure tray controller is available before hiding to tray."""
    if _get_tray_controller() is not None:
        return True

    return _start_tray_controller(title=_get_tray_title())


def perform_window_action(
    action: Literal[
        "minimize",
        "maximize",
        "restore",
        "close",
        "request_close",
        "hide_to_tray",
        "show",
        "exit",
    ],
) -> bool:
    """Perform a window action for currently active desktop shell window."""
    if action == "request_close":
        return request_desktop_window_close()
    if action == "hide_to_tray":
        return _hide_desktop_window_to_tray()
    if action == "show":
        return _show_desktop_window()
    if action in {"close", "exit"}:
        return _close_desktop_window(force_exit=True)

    window = _get_desktop_window()
    if window is None:
        return False

    method_name = {
        "minimize": "minimize",
        "maximize": "maximize",
        "restore": "restore",
    }.get(action)
    if method_name is None:
        return False

    method = getattr(window, method_name, None)
    if not callable(method):
        return False

    try:
        method()
    except Exception:
        return False

    if action == "maximize":
        _set_window_maximized(True)
    elif action in {"restore", "minimize"}:
        _set_window_maximized(False)

    return True


def get_desktop_window_state() -> dict[str, bool]:
    """Return active/maximized state for custom window titlebar UI."""
    return {
        "active": is_desktop_window_active(),
        "maximized": _get_window_maximized(),
    }


def preload_quick_panel_window(start_url: str, title: str) -> bool:
    """Pre-create hidden quick-send panel window for hotkey instant show."""
    if not is_desktop_window_active():
        return False

    normalized_url = str(start_url).strip()
    if not normalized_url:
        return False

    normalized_title = str(title).strip() or "VanceSender 快捷发送"

    quick_panel_window = _get_quick_panel_window()
    if quick_panel_window is not None:
        if _get_quick_panel_window_url() != normalized_url:
            load_url_method = getattr(quick_panel_window, "load_url", None)
            if callable(load_url_method):
                try:
                    load_url_method(normalized_url)
                    _set_quick_panel_window_url(normalized_url)
                except Exception:
                    pass

        hide_method = getattr(quick_panel_window, "hide", None)
        if callable(hide_method):
            try:
                hide_method()
            except Exception:
                pass
        return True

    try:
        webview = importlib.import_module("webview")
    except Exception:
        return False

    window_kwargs: dict[str, object] = {
        "url": normalized_url,
        "width": 640,
        "height": 780,
        "min_size": (500, 560),
        "resizable": True,
        "text_select": True,
        "frameless": True,
        "easy_drag": False,
        "on_top": True,
        "hidden": True,
    }

    try:
        quick_panel_window = webview.create_window(normalized_title, **window_kwargs)
    except TypeError:
        # Older runtime may not support hidden param.
        window_kwargs.pop("hidden", None)
        try:
            quick_panel_window = webview.create_window(
                normalized_title, **window_kwargs
            )
        except Exception:
            return False
    except Exception:
        return False

    _set_quick_panel_window(quick_panel_window)
    _set_quick_panel_window_url(normalized_url)

    hide_method = getattr(quick_panel_window, "hide", None)
    if callable(hide_method):
        try:
            hide_method()
        except Exception:
            pass

    return True


def open_or_focus_quick_panel_window(
    start_url: str,
    title: str,
    *,
    return_focus_hwnd: int = 0,
) -> bool:
    """Open or focus a frameless quick-send panel window."""
    if not is_desktop_window_active():
        return False

    normalized_url = str(start_url).strip()
    if not normalized_url:
        return False

    normalized_title = str(title).strip() or "VanceSender 快捷发送"
    if int(return_focus_hwnd) > 0:
        _set_quick_panel_return_hwnd(int(return_focus_hwnd))

    quick_panel_window = _get_quick_panel_window()
    if quick_panel_window is not None:
        if _get_quick_panel_window_url() != normalized_url:
            load_url_method = getattr(quick_panel_window, "load_url", None)
            if callable(load_url_method):
                try:
                    load_url_method(normalized_url)
                    _set_quick_panel_window_url(normalized_url)
                except Exception:
                    pass

        shown = False
        for method_name in ("show", "restore"):
            method = getattr(quick_panel_window, method_name, None)
            if not callable(method):
                continue

            try:
                method()
            except Exception:
                continue

            shown = True

        if shown:
            return True

        _set_quick_panel_window(None)
        _set_quick_panel_window_url("")

    if not preload_quick_panel_window(normalized_url, normalized_title):
        return False

    quick_panel_window = _get_quick_panel_window()
    if quick_panel_window is None:
        return False

    shown = False
    for method_name in ("show", "restore"):
        method = getattr(quick_panel_window, method_name, None)
        if not callable(method):
            continue

        try:
            method()
        except Exception:
            continue

        shown = True

    return shown


def perform_quick_panel_window_action(
    action: Literal["minimize", "close", "dismiss"],
) -> bool:
    """Perform a window action for quick-panel frameless window."""
    window = _get_quick_panel_window()
    if window is None:
        return False

    if action == "dismiss":
        hidden = False

        hide_method = getattr(window, "hide", None)
        if callable(hide_method):
            try:
                hide_method()
                hidden = True
            except Exception:
                hidden = False

        if not hidden:
            minimize_method = getattr(window, "minimize", None)
            if callable(minimize_method):
                try:
                    minimize_method()
                    hidden = True
                except Exception:
                    hidden = False

        if hidden:
            _ = _restore_quick_panel_return_focus()
        return hidden

    if action == "close":
        destroy_method = getattr(window, "destroy", None)
        if not callable(destroy_method):
            return False

        try:
            destroy_method()
        except Exception:
            return False

        _set_quick_panel_window(None)
        _set_quick_panel_window_url("")
        _ = _restore_quick_panel_return_focus()
        _set_quick_panel_return_hwnd(0)
        return True

    minimize_method = getattr(window, "minimize", None)
    if not callable(minimize_method):
        return False

    try:
        minimize_method()
    except Exception:
        return False

    return True


def open_desktop_window(
    start_url: str,
    title: str,
    launch_options: dict[str, object] | None = None,
) -> bool:
    """Open embedded desktop window and block until user closes it."""
    try:
        webview = importlib.import_module("webview")
    except Exception:
        return False

    start_tray_on_launch, _ = _resolve_launch_tray_preferences(launch_options)
    _set_tray_title(title)
    if start_tray_on_launch:
        _start_tray_controller(title=title)
    else:
        _stop_tray_controller()

    window_kwargs: dict[str, object] = {
        "url": start_url,
        "width": 1280,
        "height": 860,
        "min_size": (1080, 700),
        "resizable": True,
        "text_select": True,
        "frameless": True,
        "easy_drag": False,
    }
    try:
        window = webview.create_window(title, **window_kwargs)
    except Exception:
        _stop_tray_controller()
        return False

    _set_desktop_window(window)
    _set_window_maximized(False)
    _set_exit_requested(False)
    _bind_window_closing_event(window)

    try:
        webview.start(debug=False)
    finally:
        _stop_tray_controller()
        _set_desktop_window(None)
        _set_quick_panel_window(None)
        _set_quick_panel_window_url("")
        _set_quick_panel_return_hwnd(0)
        _set_window_maximized(False)
        _set_exit_requested(False)
    return True
