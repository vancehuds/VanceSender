"""Configuration manager for VanceSender."""

from __future__ import annotations

import os
import tempfile
import uuid
from typing import Any

import yaml

from app.core.notifications import push_notification
from app.core.runtime_paths import get_runtime_root


RUNTIME_ROOT = get_runtime_root()
CONFIG_PATH = RUNTIME_ROOT / "config.yaml"
DATA_DIR = RUNTIME_ROOT / "data"
PRESETS_DIR = DATA_DIR / "presets"


def _ensure_dirs() -> None:
    PRESETS_DIR.mkdir(parents=True, exist_ok=True)


def load_config() -> dict[str, Any]:
    """Load configuration from YAML file."""
    _ensure_dirs()
    if not CONFIG_PATH.exists():
        return _default_config()
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
    except yaml.YAMLError:
        push_notification("config.yaml 格式错误，已回退到默认配置。")
        return _default_config()
    except OSError:
        push_notification("config.yaml 读取失败，已回退到默认配置。")
        return _default_config()
    if not isinstance(cfg, dict):
        push_notification("config.yaml 内容不是有效的配置字典，已回退到默认配置。")
        return _default_config()
    return _merge_defaults(cfg)


def save_config(cfg: dict[str, Any]) -> None:
    """Save configuration to YAML file (atomic write via temp + rename)."""
    _ensure_dirs()
    try:
        fd, tmp_path = tempfile.mkstemp(
            suffix=".tmp",
            prefix="config_",
            dir=str(CONFIG_PATH.parent),
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                yaml.dump(
                    cfg, f, default_flow_style=False,
                    allow_unicode=True, sort_keys=False,
                )
            os.replace(tmp_path, str(CONFIG_PATH))
        except BaseException:
            # Clean up temp file on any write/rename failure
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise
    except OSError as exc:
        push_notification(f"配置保存失败: {exc}", level="error")


def update_config(patch: dict[str, Any]) -> dict[str, Any]:
    """Merge patch into existing config and save."""
    cfg = load_config()
    _deep_merge(cfg, patch)
    save_config(cfg)
    return cfg


def _deep_merge(base: dict, override: dict) -> None:
    for key, value in override.items():
        if key in base and isinstance(base[key], dict) and isinstance(value, dict):
            _deep_merge(base[key], value)
        else:
            base[key] = value


def _default_config() -> dict[str, Any]:
    return {
        "server": {
            "host": "127.0.0.1",
            "port": 8730,
            "lan_access": False,
            "token": "",
        },
        "launch": {
            "open_webui_on_start": False,
            "open_intro_on_first_start": False,
            "intro_seen": False,
            "show_console_on_start": False,
            "enable_tray_on_start": True,
            "close_action": "ask",
        },
        "sender": {
            "method": "clipboard",
            "chat_open_key": "t",
            "delay_open_chat": 450,
            "delay_after_paste": 160,
            "delay_after_send": 260,
            "delay_between_lines": 1800,
            "focus_timeout": 8000,
            "retry_count": 3,
            "retry_interval": 450,
            "typing_char_delay": 18,
        },
        "quick_overlay": {
            "enabled": True,
            "show_webui_send_status": True,
            "compact_mode": False,
            "trigger_hotkey": "f7",
            "mouse_side_button": "",
            "poll_interval_ms": 40,
        },
        "public_config": {
            "source_url": "",
            "timeout_seconds": 5,
            "cache_ttl_seconds": 120,
        },
        "ai": {
            "providers": [],
            "default_provider": "",
            "system_prompt": "",
            "custom_headers": {
                "User-Agent": "python-httpx/0.28.1",
                "X-Stainless-Lang": "",
                "X-Stainless-Package-Version": "",
                "X-Stainless-OS": "",
                "X-Stainless-Arch": "",
                "X-Stainless-Runtime": "",
                "X-Stainless-Runtime-Version": "",
            },
        },
    }


def _merge_defaults(cfg: dict[str, Any]) -> dict[str, Any]:
    defaults = _default_config()
    result = defaults.copy()
    _deep_merge(result, cfg)

    launch_raw = cfg.get("launch", {})
    launch_section = result.get("launch", {})
    if isinstance(launch_section, dict):
        if (
            isinstance(launch_raw, dict)
            and "enable_tray_on_start" not in launch_raw
            and "start_minimized_to_tray" in launch_raw
        ):
            launch_section["enable_tray_on_start"] = bool(
                launch_raw.get("start_minimized_to_tray")
            )
        launch_section.pop("start_minimized_to_tray", None)

    return result


def resolve_enable_tray_on_start(launch_cfg: dict[str, Any] | None) -> bool:
    """Resolve launch tray switch with backward-compatible legacy key support."""
    if not isinstance(launch_cfg, dict):
        return True

    if "enable_tray_on_start" in launch_cfg:
        return bool(launch_cfg.get("enable_tray_on_start", True))

    return bool(launch_cfg.get("start_minimized_to_tray", True))


# ---------------------------------------------------------------------------
# Provider helpers
# ---------------------------------------------------------------------------


def get_providers(cfg: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    if cfg is None:
        cfg = load_config()
    return cfg.get("ai", {}).get("providers", [])


def get_provider_by_id(
    provider_id: str, cfg: dict[str, Any] | None = None
) -> dict[str, Any] | None:
    for p in get_providers(cfg):
        if p.get("id") == provider_id:
            return p
    return None


def add_provider(provider: dict[str, Any]) -> dict[str, Any]:
    cfg = load_config()
    if "id" not in provider or not provider["id"]:
        provider["id"] = uuid.uuid4().hex[:8]
    providers = cfg.setdefault("ai", {}).setdefault("providers", [])
    providers.append(provider)
    if not cfg["ai"].get("default_provider"):
        cfg["ai"]["default_provider"] = provider["id"]
    save_config(cfg)
    return provider


def update_provider(provider_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    cfg = load_config()
    providers = cfg.get("ai", {}).get("providers", [])
    for i, p in enumerate(providers):
        if p.get("id") == provider_id:
            p.update(patch)
            p["id"] = provider_id  # prevent id overwrite
            providers[i] = p
            save_config(cfg)
            return p
    return None


def delete_provider(provider_id: str) -> bool:
    cfg = load_config()
    providers = cfg.get("ai", {}).get("providers", [])
    new_providers = [p for p in providers if p.get("id") != provider_id]
    if len(new_providers) == len(providers):
        return False
    cfg["ai"]["providers"] = new_providers
    if cfg["ai"].get("default_provider") == provider_id:
        cfg["ai"]["default_provider"] = new_providers[0]["id"] if new_providers else ""
    save_config(cfg)
    return True
