"""GitHub-based update checker."""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


_GITHUB_API_BASE = "https://api.github.com"
_GITHUB_API_HEADERS = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "VanceSender-UpdateChecker",
}
_REQUEST_TIMEOUT = 8.0
_NUMERIC_VERSION_RE = re.compile(r"^\d+(?:\.\d+)*$")


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


def _normalize_version(value: str) -> str:
    return str(value or "").strip().lstrip("vV")


def _to_numeric_version(value: str) -> tuple[int, ...] | None:
    normalized = _normalize_version(value)
    if not normalized or not _NUMERIC_VERSION_RE.fullmatch(normalized):
        return None
    return tuple(int(part) for part in normalized.split("."))


def _is_newer_version(current_version: str, latest_version: str) -> bool:
    current_numeric = _to_numeric_version(current_version)
    latest_numeric = _to_numeric_version(latest_version)

    if current_numeric is not None and latest_numeric is not None:
        max_len = max(len(current_numeric), len(latest_numeric))
        current_padded = current_numeric + (0,) * (max_len - len(current_numeric))
        latest_padded = latest_numeric + (0,) * (max_len - len(latest_numeric))
        return latest_padded > current_padded

    return _normalize_version(current_version) != _normalize_version(latest_version)


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


def _fetch_json(url: str) -> _GitHubResponse:
    request = Request(url, headers=_GITHUB_API_HEADERS)
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


def _build_success_result(
    current_version: str,
    latest_version: str,
    release_url: str | None,
    published_at: str | None,
    suffix: str = "",
) -> GitHubUpdateResult:
    update_available = _is_newer_version(current_version, latest_version)
    if update_available:
        message = f"发现新版本 v{latest_version}{suffix}"
    else:
        message = f"当前已是最新版本{suffix}"

    return GitHubUpdateResult(
        success=True,
        current_version=current_version,
        latest_version=latest_version,
        update_available=update_available,
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

    encoded_owner = quote(owner, safe="")
    encoded_repo = quote(repo, safe="")
    release_api = (
        f"{_GITHUB_API_BASE}/repos/{encoded_owner}/{encoded_repo}/releases/latest"
    )

    release_response = _fetch_json(release_api)
    if release_response.status_code == 200 and isinstance(
        release_response.payload, dict
    ):
        payload = release_response.payload
        latest_tag = payload.get("tag_name")
        if not isinstance(latest_tag, str) or not latest_tag.strip():
            return _build_failure_result(
                current_version=normalized_current,
                message="GitHub Release 缺少有效版本号",
                error_type="ValueError",
                status_code=200,
            )

        release_url = payload.get("html_url")
        published_at = payload.get("published_at")
        return _build_success_result(
            current_version=normalized_current,
            latest_version=_normalize_version(latest_tag),
            release_url=release_url if isinstance(release_url, str) else None,
            published_at=published_at if isinstance(published_at, str) else None,
        )

    if release_response.status_code == 404:
        tags_api = (
            f"{_GITHUB_API_BASE}/repos/{encoded_owner}/{encoded_repo}/tags?per_page=1"
        )
        tags_response = _fetch_json(tags_api)

        if tags_response.status_code == 200 and isinstance(tags_response.payload, list):
            if len(tags_response.payload) == 0:
                return _build_failure_result(
                    current_version=normalized_current,
                    message="GitHub 仓库暂无可用 Release 或 Tag",
                    status_code=404,
                )

            first_tag = tags_response.payload[0]
            if not isinstance(first_tag, dict):
                return _build_failure_result(
                    current_version=normalized_current,
                    message="GitHub Tag 数据格式异常",
                    error_type="ValueError",
                    status_code=200,
                )

            tag_name = first_tag.get("name")
            if not isinstance(tag_name, str) or not tag_name.strip():
                return _build_failure_result(
                    current_version=normalized_current,
                    message="GitHub Tag 缺少有效版本号",
                    error_type="ValueError",
                    status_code=200,
                )

            tags_page = f"https://github.com/{owner}/{repo}/tags"
            return _build_success_result(
                current_version=normalized_current,
                latest_version=_normalize_version(tag_name),
                release_url=tags_page,
                published_at=None,
                suffix="（基于标签）",
            )

        if tags_response.status_code in (403, 429):
            return _build_failure_result(
                current_version=normalized_current,
                message="GitHub API 访问频率受限，请稍后重试",
                error_type=tags_response.error_type,
                status_code=tags_response.status_code,
            )

        detail = (
            _extract_api_message(tags_response.payload)
            or tags_response.error_message
            or "请求 GitHub Tag 失败"
        )
        return _build_failure_result(
            current_version=normalized_current,
            message=f"检查更新失败: {detail}",
            error_type=tags_response.error_type,
            status_code=(
                tags_response.status_code if tags_response.status_code > 0 else None
            ),
        )

    if release_response.status_code in (403, 429):
        return _build_failure_result(
            current_version=normalized_current,
            message="GitHub API 访问频率受限，请稍后重试",
            error_type=release_response.error_type,
            status_code=release_response.status_code,
        )

    detail = (
        _extract_api_message(release_response.payload)
        or release_response.error_message
        or "请求 GitHub Release 失败"
    )
    return _build_failure_result(
        current_version=normalized_current,
        message=f"检查更新失败: {detail}",
        error_type=release_response.error_type,
        status_code=(
            release_response.status_code if release_response.status_code > 0 else None
        ),
    )


async def check_github_update(
    current_version: str, repository: str
) -> GitHubUpdateResult:
    """Check whether GitHub has a newer release/tag than current version."""
    return await asyncio.to_thread(
        _check_github_update_sync, current_version, repository
    )
