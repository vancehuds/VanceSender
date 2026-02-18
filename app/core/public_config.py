"""GitHub-hosted public config fetcher."""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Lock
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import yaml

from app.core.app_meta import GITHUB_REPOSITORY
from app.core.config import load_config


_DEFAULT_REMOTE_FILE_PATH = "public-config.yaml"
_DEFAULT_TIMEOUT_SECONDS = 5.0
_DEFAULT_CACHE_TTL_SECONDS = 120.0
_MAX_RESPONSE_BYTES = 64 * 1024
_REQUEST_HEADERS = {
    "Accept": "application/json, application/yaml, text/yaml, text/plain, */*;q=0.8",
    "User-Agent": "VanceSender-PublicConfig",
}


@dataclass(slots=True)
class GitHubPublicConfigResult:
    success: bool
    visible: bool
    source_url: str | None
    title: str | None
    content: str | None
    message: str
    fetched_at: str | None = None
    link_url: str | None = None
    link_text: str | None = None
    error_type: str | None = None
    status_code: int | None = None


@dataclass(slots=True)
class _CacheEntry:
    result: GitHubPublicConfigResult
    fetched_at_epoch: float


_CACHE_LOCK = Lock()
_RESULT_CACHE: dict[str, _CacheEntry] = {}


def _default_source_url() -> str:
    return (
        f"https://raw.githubusercontent.com/"
        f"{GITHUB_REPOSITORY}/main/{_DEFAULT_REMOTE_FILE_PATH}"
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_positive_float(value: object, default: float) -> float:
    if not isinstance(value, (int, float, str)):
        return default
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    if parsed <= 0:
        return default
    return parsed


def _parse_non_negative_float(value: object, default: float) -> float:
    if not isinstance(value, (int, float, str)):
        return default
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    if parsed < 0:
        return default
    return parsed


def _extract_runtime_options(
    cfg: dict[str, Any],
) -> tuple[str, float, float]:
    section_raw = cfg.get("public_config", {})
    section = section_raw if isinstance(section_raw, dict) else {}

    source_url_raw = section.get("source_url")
    source_url = str(source_url_raw).strip() if source_url_raw is not None else ""
    if not source_url:
        source_url = _default_source_url()

    timeout_seconds = _parse_positive_float(
        section.get("timeout_seconds", _DEFAULT_TIMEOUT_SECONDS),
        _DEFAULT_TIMEOUT_SECONDS,
    )
    cache_ttl_seconds = _parse_non_negative_float(
        section.get("cache_ttl_seconds", _DEFAULT_CACHE_TTL_SECONDS),
        _DEFAULT_CACHE_TTL_SECONDS,
    )
    return source_url, timeout_seconds, cache_ttl_seconds


def _is_http_url(url: str) -> bool:
    lowered = url.lower()
    return lowered.startswith("https://") or lowered.startswith("http://")


def _normalize_link(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    link = value.strip()
    if not link:
        return None
    if not _is_http_url(link):
        return None
    return link


def _stringify_content(value: object) -> str:
    if value is None:
        return ""

    if isinstance(value, str):
        return value.strip()

    if isinstance(value, (int, float, bool)):
        return str(value)

    if isinstance(value, (list, dict)):
        if len(value) == 0:
            return ""
        try:
            return json.dumps(value, ensure_ascii=False, indent=2).strip()
        except TypeError:
            return yaml.safe_dump(value, allow_unicode=True, sort_keys=False).strip()

    return str(value).strip()


def _coerce_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value

    if isinstance(value, (int, float)):
        return value != 0

    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off", ""}:
            return False

    return False


def _parse_remote_payload(
    raw_text: str,
) -> tuple[bool, str | None, str | None, str | None, str | None, str]:
    text = raw_text.strip()
    if not text:
        return False, None, None, None, None, "远程配置文件为空"

    try:
        payload = yaml.safe_load(text)
    except yaml.YAMLError:
        return False, None, None, None, None, "远程配置格式错误"

    if not isinstance(payload, dict):
        return False, None, None, None, None, "远程配置格式错误"

    remote_enabled = _coerce_bool(payload.get("enabled", False))
    if not remote_enabled:
        return False, None, None, None, None, "远程开关关闭"

    title_raw = payload.get("title")
    title = str(title_raw).strip() if isinstance(title_raw, str) else None
    title = title or None

    content = _stringify_content(payload.get("content"))
    if not content:
        fallback_payload = {
            key: value
            for key, value in payload.items()
            if key not in {"enabled", "title", "content", "link_url", "link_text"}
        }
        content = _stringify_content(fallback_payload)

    if not content:
        return False, title, None, None, None, "远程配置无可显示内容"

    link_url = _normalize_link(payload.get("link_url"))
    link_text_raw = payload.get("link_text")
    link_text = str(link_text_raw).strip() if isinstance(link_text_raw, str) else None
    link_text = link_text or None

    return True, title, content, link_url, link_text, "已获取远程公共配置"


def _build_failure(
    source_url: str,
    message: str,
    *,
    error_type: str | None = None,
    status_code: int | None = None,
) -> GitHubPublicConfigResult:
    return GitHubPublicConfigResult(
        success=False,
        visible=False,
        source_url=source_url,
        title=None,
        content=None,
        message=message,
        fetched_at=_now_iso(),
        error_type=error_type,
        status_code=status_code,
    )


def _read_cache(
    source_url: str, cache_ttl_seconds: float
) -> GitHubPublicConfigResult | None:
    if cache_ttl_seconds <= 0:
        return None

    with _CACHE_LOCK:
        entry = _RESULT_CACHE.get(source_url)
        if entry is None:
            return None
        if (time.time() - entry.fetched_at_epoch) > cache_ttl_seconds:
            _RESULT_CACHE.pop(source_url, None)
            return None
        return entry.result


def _store_cache(source_url: str, result: GitHubPublicConfigResult) -> None:
    with _CACHE_LOCK:
        _RESULT_CACHE[source_url] = _CacheEntry(
            result=result,
            fetched_at_epoch=time.time(),
        )


def fetch_github_public_config_sync(
    cfg: dict[str, Any] | None = None,
    *,
    force_refresh: bool = False,
) -> GitHubPublicConfigResult:
    """Fetch GitHub-hosted public config for CLI/WebUI display."""
    runtime_cfg = cfg if cfg is not None else load_config()
    source_url, timeout_seconds, cache_ttl_seconds = _extract_runtime_options(
        runtime_cfg
    )

    if not _is_http_url(source_url):
        return _build_failure(
            source_url, "public_config.source_url 仅支持 HTTP(S) 地址"
        )

    if not force_refresh:
        cached = _read_cache(source_url, cache_ttl_seconds)
        if cached is not None:
            return cached

    request = Request(source_url, headers=_REQUEST_HEADERS)

    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            status_code = int(response.getcode())
            body = response.read(_MAX_RESPONSE_BYTES + 1)
    except HTTPError as exc:
        return _build_failure(
            source_url,
            "获取远程配置失败",
            error_type=type(exc).__name__,
            status_code=int(exc.code),
        )
    except URLError as exc:
        return _build_failure(
            source_url,
            "获取远程配置失败",
            error_type=type(exc).__name__,
            status_code=0,
        )
    except TimeoutError as exc:
        return _build_failure(
            source_url,
            "获取远程配置超时",
            error_type=type(exc).__name__,
            status_code=0,
        )
    except Exception as exc:
        return _build_failure(
            source_url,
            "获取远程配置失败",
            error_type=type(exc).__name__,
            status_code=0,
        )

    if len(body) > _MAX_RESPONSE_BYTES:
        return _build_failure(source_url, "远程配置文件过大", status_code=200)

    raw_text = body.decode("utf-8", errors="replace")
    visible, title, content, link_url, link_text, message = _parse_remote_payload(
        raw_text
    )

    result = GitHubPublicConfigResult(
        success=True,
        visible=visible,
        source_url=source_url,
        title=title,
        content=content,
        message=message,
        fetched_at=_now_iso(),
        link_url=link_url,
        link_text=link_text,
        status_code=status_code,
    )
    _store_cache(source_url, result)
    return result


async def fetch_github_public_config(
    cfg: dict[str, Any] | None = None,
    *,
    force_refresh: bool = False,
) -> GitHubPublicConfigResult:
    """Async wrapper for fetching GitHub-hosted public config."""
    return await asyncio.to_thread(
        fetch_github_public_config_sync,
        cfg,
        force_refresh=force_refresh,
    )
