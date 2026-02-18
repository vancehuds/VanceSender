"""GitHub-based update checker."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import threading
import time
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from packaging.version import InvalidVersion, Version


_GITHUB_API_BASE = "https://api.github.com"
_GITHUB_API_HEADERS = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "VanceSender-UpdateChecker",
}
_REQUEST_TIMEOUT = 10.0
_NUMERIC_VERSION_RE = re.compile(r"^\d+(?:\.\d+)*$")
_CACHE_TTL_SECONDS = 600.0


_logger = logging.getLogger(__name__)


@dataclass(slots=True)
class GitHubUpdateResult:
    success: bool
    current_version: str
    latest_version: str | None
    update_available: bool
    release_url: str | None
    published_at: str | None
    message: str
    error_type: str | None = None
    status_code: int | None = None


@dataclass(slots=True)
class _GitHubResponse:
    status_code: int
    payload: Any
    headers: dict[str, str]
    error_type: str | None = None
    error_message: str | None = None


@dataclass(slots=True)
class _VersionCompareResult:
    update_available: bool
    comparable: bool


@dataclass(slots=True)
class _UpdateCacheEntry:
    cache_key: str
    source_kind: str
    latest_version: str
    release_url: str | None
    published_at: str | None
    suffix: str
    last_modified: str | None
    etag: str | None
    fetched_at: float


_CACHE_LOCK = threading.Lock()
_CACHE_REFRESH_LOCK = threading.Lock()
_UPDATE_CACHE: dict[str, _UpdateCacheEntry] = {}
_RATE_LIMIT_UNTIL: dict[str, float] = {}


def _normalize_version(value: str) -> str:
    return str(value or "").strip().lstrip("vV")


def _to_numeric_version(value: str) -> tuple[int, ...] | None:
    normalized = _normalize_version(value)
    if not normalized or not _NUMERIC_VERSION_RE.fullmatch(normalized):
        return None
    return tuple(int(part) for part in normalized.split("."))


def _compare_versions(
    current_version: str, latest_version: str
) -> _VersionCompareResult:
    try:
        current_parsed = Version(current_version)
        latest_parsed = Version(latest_version)

        # 默认不把预发布当成稳定版用户的可升级版本。
        if latest_parsed.is_prerelease and not current_parsed.is_prerelease:
            return _VersionCompareResult(update_available=False, comparable=True)

        return _VersionCompareResult(
            update_available=latest_parsed > current_parsed,
            comparable=True,
        )
    except InvalidVersion:
        pass

    current_numeric = _to_numeric_version(current_version)
    latest_numeric = _to_numeric_version(latest_version)

    if current_numeric is not None and latest_numeric is not None:
        max_len = max(len(current_numeric), len(latest_numeric))
        current_padded = current_numeric + (0,) * (max_len - len(current_numeric))
        latest_padded = latest_numeric + (0,) * (max_len - len(latest_numeric))
        return _VersionCompareResult(
            update_available=latest_padded > current_padded,
            comparable=True,
        )

    return _VersionCompareResult(update_available=False, comparable=False)


def _safe_json_loads(raw_text: str) -> Any:
    if not raw_text:
        return {}
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        return raw_text


def _extract_api_message(payload: Any) -> str:
    if isinstance(payload, dict):
        message = payload.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()
    if isinstance(payload, str) and payload.strip():
        return payload.strip()
    return ""


def _parse_repository(repository: str) -> tuple[str, str]:
    raw = str(repository or "").strip()
    if not raw:
        raise ValueError("GitHub 仓库地址为空")

    if "github.com/" in raw:
        raw = raw.split("github.com/", 1)[1]

    cleaned = raw.strip().strip("/")
    if cleaned.endswith(".git"):
        cleaned = cleaned[:-4]

    parts = [part for part in cleaned.split("/") if part]
    if len(parts) < 2:
        raise ValueError("GitHub 仓库地址格式不正确")

    owner, repo = parts[0], parts[1]
    if not owner or not repo:
        raise ValueError("GitHub 仓库地址格式不正确")
    return owner, repo


def _cache_key(owner: str, repo: str) -> str:
    return f"{owner}/{repo}".lower()


def _is_cache_fresh(entry: _UpdateCacheEntry, now: float) -> bool:
    return (now - entry.fetched_at) <= _CACHE_TTL_SECONDS


def _get_cache_entry(cache_key: str) -> _UpdateCacheEntry | None:
    with _CACHE_LOCK:
        return _UPDATE_CACHE.get(cache_key)


def _set_cache_entry(entry: _UpdateCacheEntry) -> None:
    with _CACHE_LOCK:
        _UPDATE_CACHE[entry.cache_key] = entry
        _RATE_LIMIT_UNTIL.pop(entry.cache_key, None)


def _touch_cache_entry(cache_key: str, fetched_at: float) -> None:
    with _CACHE_LOCK:
        current = _UPDATE_CACHE.get(cache_key)
        if current is None:
            return
        current.fetched_at = fetched_at


def _get_rate_limited_until(cache_key: str) -> float:
    with _CACHE_LOCK:
        return _RATE_LIMIT_UNTIL.get(cache_key, 0.0)


def _set_rate_limited_until(cache_key: str, until: float) -> None:
    with _CACHE_LOCK:
        _RATE_LIMIT_UNTIL[cache_key] = until


def _build_conditional_headers(
    cache_entry: _UpdateCacheEntry | None,
    source_kind: str,
) -> dict[str, str]:
    if cache_entry is None or cache_entry.source_kind != source_kind:
        return {}

    if cache_entry.last_modified:
        return {"If-Modified-Since": cache_entry.last_modified}
    if cache_entry.etag:
        return {"If-None-Match": cache_entry.etag}
    return {}


def _extract_retry_delay_seconds(response: _GitHubResponse, now: float) -> float | None:
    retry_after = response.headers.get("retry-after")
    if retry_after:
        try:
            delay = float(retry_after)
        except (TypeError, ValueError):
            delay = None
        if delay is not None and delay >= 0:
            return delay

    remaining = response.headers.get("x-ratelimit-remaining")
    reset_raw = response.headers.get("x-ratelimit-reset")
    if remaining == "0" and reset_raw:
        try:
            reset_epoch = float(reset_raw)
        except (TypeError, ValueError):
            reset_epoch = None
        if reset_epoch is not None:
            return max(reset_epoch - now, 0.0)

    if response.status_code in (403, 429):
        return 60.0
    return None


def _update_rate_limit_window(
    cache_key: str,
    response: _GitHubResponse,
) -> None:
    now = time.time()
    retry_delay = _extract_retry_delay_seconds(response, now)
    if retry_delay is None:
        return

    until = now + retry_delay
    _set_rate_limited_until(cache_key, until)
    _logger.warning(
        "GitHub update check rate-limited for %s (status=%s, retry_after=%s, remaining=%s, reset=%s)",
        cache_key,
        response.status_code,
        response.headers.get("retry-after"),
        response.headers.get("x-ratelimit-remaining"),
        response.headers.get("x-ratelimit-reset"),
    )


def _get_header_value(headers: dict[str, str], key: str) -> str | None:
    value = headers.get(key)
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _fetch_json(
    url: str, *, extra_headers: dict[str, str] | None = None
) -> _GitHubResponse:
    request_headers = dict(_GITHUB_API_HEADERS)
    if extra_headers:
        request_headers.update(extra_headers)

    request = Request(url, headers=request_headers)
    try:
        with urlopen(request, timeout=_REQUEST_TIMEOUT) as response:
            status_code = int(response.getcode())
            body = response.read().decode("utf-8", errors="replace")
            headers = {key.lower(): value for key, value in response.headers.items()}
            return _GitHubResponse(
                status_code=status_code,
                payload=_safe_json_loads(body),
                headers=headers,
            )
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        headers = (
            {key.lower(): value for key, value in exc.headers.items()}
            if exc.headers is not None
            else {}
        )
        return _GitHubResponse(
            status_code=int(exc.code),
            payload=_safe_json_loads(body),
            headers=headers,
            error_type=type(exc).__name__,
            error_message=str(exc),
        )
    except URLError as exc:
        return _GitHubResponse(
            status_code=0,
            payload={},
            headers={},
            error_type=type(exc).__name__,
            error_message=str(exc.reason),
        )
    except TimeoutError as exc:
        return _GitHubResponse(
            status_code=0,
            payload={},
            headers={},
            error_type=type(exc).__name__,
            error_message=str(exc),
        )
    except Exception as exc:
        return _GitHubResponse(
            status_code=0,
            payload={},
            headers={},
            error_type=type(exc).__name__,
            error_message=str(exc),
        )


def _build_cache_entry(
    *,
    cache_key: str,
    source_kind: str,
    latest_version: str,
    release_url: str | None,
    published_at: str | None,
    suffix: str,
    response_headers: dict[str, str],
) -> _UpdateCacheEntry:
    return _UpdateCacheEntry(
        cache_key=cache_key,
        source_kind=source_kind,
        latest_version=latest_version,
        release_url=release_url,
        published_at=published_at,
        suffix=suffix,
        last_modified=_get_header_value(response_headers, "last-modified"),
        etag=_get_header_value(response_headers, "etag"),
        fetched_at=time.time(),
    )


def _build_success_result(
    current_version: str,
    latest_version: str,
    release_url: str | None,
    published_at: str | None,
    suffix: str = "",
) -> GitHubUpdateResult:
    compare_result = _compare_versions(current_version, latest_version)
    if compare_result.comparable and compare_result.update_available:
        message = f"发现新版本 v{latest_version}{suffix}"
    elif compare_result.comparable:
        message = f"当前已是最新版本{suffix}"
    else:
        message = f"已获取最新版本 v{latest_version}{suffix}，但无法可靠比较版本高低"

    return GitHubUpdateResult(
        success=True,
        current_version=current_version,
        latest_version=latest_version,
        update_available=compare_result.update_available,
        release_url=release_url,
        published_at=published_at,
        message=message,
    )


def _build_failure_result(
    *,
    current_version: str,
    message: str,
    error_type: str | None = None,
    status_code: int | None = None,
) -> GitHubUpdateResult:
    return GitHubUpdateResult(
        success=False,
        current_version=current_version,
        latest_version=None,
        update_available=False,
        release_url=None,
        published_at=None,
        message=message,
        error_type=error_type,
        status_code=status_code,
    )


def _build_result_from_cache(
    current_version: str,
    cache_entry: _UpdateCacheEntry,
) -> GitHubUpdateResult:
    return _build_success_result(
        current_version=current_version,
        latest_version=cache_entry.latest_version,
        release_url=cache_entry.release_url,
        published_at=cache_entry.published_at,
        suffix=cache_entry.suffix,
    )


def _fallback_to_cache_or_failure(
    *,
    current_version: str,
    cache_entry: _UpdateCacheEntry | None,
    message: str,
    error_type: str | None = None,
    status_code: int | None = None,
) -> GitHubUpdateResult:
    if cache_entry is not None:
        return _build_result_from_cache(current_version, cache_entry)

    return _build_failure_result(
        current_version=current_version,
        message=message,
        error_type=error_type,
        status_code=status_code,
    )


def _request_tags_latest(
    *,
    current_version: str,
    owner: str,
    repo: str,
    cache_key: str,
    cache_entry: _UpdateCacheEntry | None,
) -> GitHubUpdateResult:
    encoded_owner = quote(owner, safe="")
    encoded_repo = quote(repo, safe="")
    tags_api = (
        f"{_GITHUB_API_BASE}/repos/{encoded_owner}/{encoded_repo}/tags?per_page=1"
    )

    tags_headers = _build_conditional_headers(cache_entry, source_kind="tags")
    tags_response = _fetch_json(tags_api, extra_headers=tags_headers)

    if tags_response.status_code == 304:
        if cache_entry is not None and cache_entry.source_kind == "tags":
            _touch_cache_entry(cache_key, time.time())
            return _build_result_from_cache(current_version, cache_entry)
        tags_response = _fetch_json(tags_api)

    if tags_response.status_code == 200 and isinstance(tags_response.payload, list):
        if len(tags_response.payload) == 0:
            _logger.warning("GitHub tags list is empty for %s", cache_key)
            return _fallback_to_cache_or_failure(
                current_version=current_version,
                cache_entry=cache_entry,
                message="GitHub 仓库暂无可用 Release 或 Tag",
                status_code=404,
            )

        first_tag = tags_response.payload[0]
        if not isinstance(first_tag, dict):
            _logger.warning("GitHub tags payload format invalid for %s", cache_key)
            return _fallback_to_cache_or_failure(
                current_version=current_version,
                cache_entry=cache_entry,
                message="检查更新失败，请稍后重试",
                error_type="ValueError",
                status_code=200,
            )

        tag_name = first_tag.get("name")
        if not isinstance(tag_name, str) or not tag_name.strip():
            _logger.warning("GitHub tag missing valid name for %s", cache_key)
            return _fallback_to_cache_or_failure(
                current_version=current_version,
                cache_entry=cache_entry,
                message="检查更新失败，请稍后重试",
                error_type="ValueError",
                status_code=200,
            )

        normalized_tag = _normalize_version(tag_name)
        tags_page = f"https://github.com/{owner}/{repo}/tags"
        entry = _build_cache_entry(
            cache_key=cache_key,
            source_kind="tags",
            latest_version=normalized_tag,
            release_url=tags_page,
            published_at=None,
            suffix="（基于标签）",
            response_headers=tags_response.headers,
        )
        _set_cache_entry(entry)
        return _build_result_from_cache(current_version, entry)

    if tags_response.status_code in (403, 429):
        _update_rate_limit_window(cache_key, tags_response)
        return _fallback_to_cache_or_failure(
            current_version=current_version,
            cache_entry=cache_entry,
            message="GitHub API 访问频率受限，请稍后重试",
            error_type=tags_response.error_type,
            status_code=tags_response.status_code,
        )

    _logger.warning(
        "GitHub tags request failed for %s (status=%s, error_type=%s, detail=%s)",
        cache_key,
        tags_response.status_code,
        tags_response.error_type,
        _extract_api_message(tags_response.payload) or tags_response.error_message,
    )
    return _fallback_to_cache_or_failure(
        current_version=current_version,
        cache_entry=cache_entry,
        message="检查更新失败，请稍后重试",
        error_type=tags_response.error_type,
        status_code=(
            tags_response.status_code if tags_response.status_code > 0 else None
        ),
    )


def _request_release_latest(
    *,
    current_version: str,
    owner: str,
    repo: str,
    cache_key: str,
    cache_entry: _UpdateCacheEntry | None,
) -> GitHubUpdateResult:
    encoded_owner = quote(owner, safe="")
    encoded_repo = quote(repo, safe="")
    release_api = (
        f"{_GITHUB_API_BASE}/repos/{encoded_owner}/{encoded_repo}/releases/latest"
    )

    release_headers = _build_conditional_headers(cache_entry, source_kind="release")
    release_response = _fetch_json(release_api, extra_headers=release_headers)

    if release_response.status_code == 304:
        if cache_entry is not None and cache_entry.source_kind == "release":
            _touch_cache_entry(cache_key, time.time())
            return _build_result_from_cache(current_version, cache_entry)
        release_response = _fetch_json(release_api)

    if release_response.status_code == 200 and isinstance(
        release_response.payload, dict
    ):
        payload = release_response.payload
        latest_tag = payload.get("tag_name")
        if not isinstance(latest_tag, str) or not latest_tag.strip():
            _logger.warning("GitHub release missing tag_name for %s", cache_key)
            return _fallback_to_cache_or_failure(
                current_version=current_version,
                cache_entry=cache_entry,
                message="检查更新失败，请稍后重试",
                error_type="ValueError",
                status_code=200,
            )

        release_url = payload.get("html_url")
        published_at = payload.get("published_at")
        entry = _build_cache_entry(
            cache_key=cache_key,
            source_kind="release",
            latest_version=_normalize_version(latest_tag),
            release_url=release_url if isinstance(release_url, str) else None,
            published_at=published_at if isinstance(published_at, str) else None,
            suffix="",
            response_headers=release_response.headers,
        )
        _set_cache_entry(entry)
        return _build_result_from_cache(current_version, entry)

    if release_response.status_code == 404:
        return _request_tags_latest(
            current_version=current_version,
            owner=owner,
            repo=repo,
            cache_key=cache_key,
            cache_entry=cache_entry,
        )

    if release_response.status_code in (403, 429):
        _update_rate_limit_window(cache_key, release_response)
        return _fallback_to_cache_or_failure(
            current_version=current_version,
            cache_entry=cache_entry,
            message="GitHub API 访问频率受限，请稍后重试",
            error_type=release_response.error_type,
            status_code=release_response.status_code,
        )

    _logger.warning(
        "GitHub release request failed for %s (status=%s, error_type=%s, detail=%s)",
        cache_key,
        release_response.status_code,
        release_response.error_type,
        _extract_api_message(release_response.payload)
        or release_response.error_message,
    )
    return _fallback_to_cache_or_failure(
        current_version=current_version,
        cache_entry=cache_entry,
        message="检查更新失败，请稍后重试",
        error_type=release_response.error_type,
        status_code=(
            release_response.status_code if release_response.status_code > 0 else None
        ),
    )


def _check_github_update_sync(
    current_version: str, repository: str
) -> GitHubUpdateResult:
    normalized_current = _normalize_version(current_version)
    if not normalized_current:
        return _build_failure_result(
            current_version=current_version,
            message="当前版本为空，无法检查更新",
            error_type="ValueError",
        )

    try:
        owner, repo = _parse_repository(repository)
    except ValueError as exc:
        return _build_failure_result(
            current_version=normalized_current,
            message=str(exc),
            error_type=type(exc).__name__,
        )

    key = _cache_key(owner, repo)
    now = time.time()
    cached_entry = _get_cache_entry(key)
    if cached_entry is not None and _is_cache_fresh(cached_entry, now):
        return _build_result_from_cache(normalized_current, cached_entry)

    rate_limited_until = _get_rate_limited_until(key)
    if now < rate_limited_until:
        return _fallback_to_cache_or_failure(
            current_version=normalized_current,
            cache_entry=cached_entry,
            message="GitHub API 访问频率受限，请稍后重试",
            status_code=429,
        )

    with _CACHE_REFRESH_LOCK:
        now = time.time()
        cached_entry = _get_cache_entry(key)
        if cached_entry is not None and _is_cache_fresh(cached_entry, now):
            return _build_result_from_cache(normalized_current, cached_entry)

        rate_limited_until = _get_rate_limited_until(key)
        if now < rate_limited_until:
            return _fallback_to_cache_or_failure(
                current_version=normalized_current,
                cache_entry=cached_entry,
                message="GitHub API 访问频率受限，请稍后重试",
                status_code=429,
            )

        return _request_release_latest(
            current_version=normalized_current,
            owner=owner,
            repo=repo,
            cache_key=key,
            cache_entry=cached_entry,
        )


async def check_github_update(
    current_version: str, repository: str
) -> GitHubUpdateResult:
    """Check whether GitHub has a newer release/tag than current version."""
    return await asyncio.to_thread(
        _check_github_update_sync, current_version, repository
    )
