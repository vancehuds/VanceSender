"""Desktop shell helpers for embedded WebUI mode."""

from __future__ import annotations

import importlib
import importlib.util
import threading
from collections.abc import Callable
from pathlib import Path
from typing import Any, Literal

from app.core.config import load_config, resolve_enable_tray_on_start, update_config
from app.core.runtime_paths import get_bundle_root, get_runtime_root

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
_window_maximized = False
_exit_requested = False
_tray_controller: _TrayController | None = None
_tray_title = "VanceSender"
_ICON_PNG_NAME = "ICON.PNG"
_ICON_ICO_NAME = "ICON.ico"


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


def _get_bundle_icon_png_path() -> Path:
    """Return bundled ICON.PNG absolute path."""
    return get_bundle_root() / _ICON_PNG_NAME


def _get_bundle_icon_ico_path() -> Path:
    """Return bundled ICON.ico absolute path."""
    return get_bundle_root() / _ICON_ICO_NAME


def _get_runtime_icon_ico_path() -> Path:
    """Return writable runtime ICON.ico path for generated fallback."""
    return get_runtime_root() / _ICON_ICO_NAME


def _create_fallback_tray_icon_image() -> object | None:
    """Create fallback in-memory tray icon when ICON.PNG is unavailable."""
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


def _export_icon_png_to_ico(source_png: Path, target_ico: Path) -> bool:
    """Convert ICON.PNG to ICON.ico for APIs requiring ICO format."""
    try:
        image_module = importlib.import_module("PIL.Image")
    except Exception:
        return False

    open_method = getattr(image_module, "open", None)
    if not callable(open_method):
        return False

    source_image: object | None = None
    try:
        target_ico.parent.mkdir(parents=True, exist_ok=True)
        source_image = open_method(str(source_png))
        converted = getattr(source_image, "convert", None)
        image_to_save = converted("RGBA") if callable(converted) else source_image
        save_method = getattr(image_to_save, "save", None)
        if not callable(save_method):
            return False

        save_method(
            str(target_ico),
            format="ICO",
            sizes=[
                (16, 16),
                (24, 24),
                (32, 32),
                (48, 48),
                (64, 64),
                (128, 128),
                (256, 256),
            ],
        )
    except Exception:
        return False
    finally:
        if source_image is not None:
            close_method = getattr(source_image, "close", None)
            if callable(close_method):
                try:
                    close_method()
                except Exception:
                    pass

    return target_ico.exists()


def _resolve_webview_icon_path() -> str | None:
    """Resolve icon path suitable for webview.start(icon=...) calls."""
    bundle_ico_path = _get_bundle_icon_ico_path()
    if bundle_ico_path.exists():
        return str(bundle_ico_path)

    icon_png_path = _get_bundle_icon_png_path()
    if not icon_png_path.exists():
        return None

    runtime_ico_path = _get_runtime_icon_ico_path()
    should_regenerate = not runtime_ico_path.exists()
    if not should_regenerate:
        try:
            should_regenerate = (
                runtime_ico_path.stat().st_mtime < icon_png_path.stat().st_mtime
            )
        except OSError:
            should_regenerate = False

    if should_regenerate and not _export_icon_png_to_ico(
        icon_png_path, runtime_ico_path
    ):
        return None

    if runtime_ico_path.exists():
        return str(runtime_ico_path)
    return None


def _create_tray_icon_image() -> object | None:
    """Create tray icon image from bundled ICON.PNG with safe fallback."""
    try:
        image_module = importlib.import_module("PIL.Image")
    except Exception:
        return None

    open_method = getattr(image_module, "open", None)
    if not callable(open_method):
        return _create_fallback_tray_icon_image()

    icon_png_path = _get_bundle_icon_png_path()
    if not icon_png_path.exists():
        return _create_fallback_tray_icon_image()

    source_image: object | None = None
    try:
        source_image = open_method(str(icon_png_path))
        converted = getattr(source_image, "convert", None)
        if callable(converted):
            return converted("RGBA")

        copy_method = getattr(source_image, "copy", None)
        if callable(copy_method):
            return copy_method()

        return source_image
    except Exception:
        return _create_fallback_tray_icon_image()
    finally:
        if source_image is not None:
            close_method = getattr(source_image, "close", None)
            if callable(close_method):
                try:
                    close_method()
                except Exception:
                    pass


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

    start_tray_on_launch = resolve_enable_tray_on_start(launch_cfg)
    close_action = normalize_close_action(
        launch_cfg.get("close_action", _CLOSE_ACTION_ASK)
    )
    return start_tray_on_launch, close_action


def _ask_close_action_and_maybe_remember(window: object) -> str:
    """Ask user close behavior and optionally persist as remembered choice."""
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

    remember_choice = False
    try:
        remember_choice = bool(
            confirm_method(
                "记住本次选择",
                "是否记住本次关闭行为？可在设置中随时修改。",
            )
        )
    except Exception:
        remember_choice = False

    if remember_choice:
        update_config({"launch": {"close_action": selected_action}})

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
        "easy_drag": True,
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
        webview_start_kwargs: dict[str, object] = {"debug": False}
        webview_icon_path = _resolve_webview_icon_path()
        if webview_icon_path:
            webview_start_kwargs["icon"] = webview_icon_path
        webview.start(**webview_start_kwargs)
    finally:
        _stop_tray_controller()
        _set_desktop_window(None)
        _set_window_maximized(False)
        _set_exit_requested(False)
    return True
