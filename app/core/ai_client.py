"""Multi-provider AI client — any OpenAI-compatible API endpoint."""

from __future__ import annotations

import re
from typing import Any, AsyncIterator

from openai import AsyncOpenAI

from app.core.config import load_config, get_provider_by_id


# ── Default system prompt (fallback) ──────────────────────────────────────

_DEFAULT_SYSTEM_PROMPT = (
    "你是一个FiveM角色扮演文本生成助手。用户会描述一个场景，"
    "你需要生成一系列/me和/do命令来描述这个场景。\n\n"
    "/me 用于描述角色自己的动作（第一人称视角，不带主语）\n"
    "/do 用于描述环境、结果、声音等客观事实\n\n"
    "规则：\n"
    "1. 每条文本不超过80个字符（不含/me或/do前缀）\n"
    "2. /me和/do交替或混合使用，形成自然的叙事节奏\n"
    "3. 描述要生动、具体、有画面感\n"
    "4. 保持简洁有力，避免冗长\n"
    "5. 确保动作和描述逻辑连贯\n\n"
    "输出格式：每行一条命令，以/me或/do开头，不要添加序号或其他标记。"
)


def _build_client(
    provider: dict[str, Any], cfg: dict[str, Any] | None = None
) -> AsyncOpenAI:
    """Create an AsyncOpenAI client for a given provider config.

    Applies ``ai.custom_headers`` from *cfg* so that callers can override the
    default SDK fingerprint headers (User-Agent, X-Stainless-*) which are
    blocked by some third-party API gateways / WAFs.
    """
    if cfg is None:
        cfg = load_config()
    custom_headers = cfg.get("ai", {}).get("custom_headers") or {}
    return AsyncOpenAI(
        api_key=provider.get("api_key") or "unused",
        base_url=provider.get("api_base", ""),
        default_headers=custom_headers if custom_headers else None,
    )


def _get_system_prompt(cfg: dict[str, Any] | None = None) -> str:
    if cfg is None:
        cfg = load_config()
    prompt = cfg.get("ai", {}).get("system_prompt", "")
    return prompt.strip() if prompt and prompt.strip() else _DEFAULT_SYSTEM_PROMPT


def _resolve_provider(
    provider_id: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Resolve a provider by id or fall back to the default.

    Returns (config, provider_dict).
    Raises ValueError when no provider can be resolved.
    """
    cfg = load_config()
    pid = provider_id or cfg.get("ai", {}).get("default_provider", "")
    if not pid:
        raise ValueError("未配置任何AI服务商，请先在设置中添加。")
    provider = get_provider_by_id(pid, cfg)
    if provider is None:
        raise ValueError(f"未找到ID为 '{pid}' 的AI服务商。")
    return cfg, provider


# ── Public functions ──────────────────────────────────────────────────────


async def generate_texts(
    scenario: str,
    provider_id: str | None = None,
    count: int | None = None,
    text_type: str = "mixed",
) -> list[dict[str, str]]:
    """Generate a list of /me + /do lines for a given scenario.

    Args:
        scenario: The scene description from the user.
        provider_id: Optional provider to use (falls back to default).
        count: Desired number of lines (hint in prompt).
        text_type: "me", "do", or "mixed".

    Returns:
        List of dicts: [{"type": "me"|"do", "content": "..."}]
    """
    cfg, provider = _resolve_provider(provider_id)
    client = _build_client(provider, cfg)
    system = _get_system_prompt(cfg)

    user_parts: list[str] = [f"场景描述：{scenario}"]
    if count:
        user_parts.append(f"请生成大约{count}条文本。")
    if text_type == "me":
        user_parts.append("只使用/me命令。")
    elif text_type == "do":
        user_parts.append("只使用/do命令。")

    response = await client.chat.completions.create(
        model=provider.get("model", "gpt-4o"),
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": "\n".join(user_parts)},
        ],
        temperature=0.8,
        max_tokens=2048,
    )

    raw = response.choices[0].message.content or ""
    return _parse_lines(raw)


async def generate_texts_stream(
    scenario: str,
    provider_id: str | None = None,
    count: int | None = None,
    text_type: str = "mixed",
) -> AsyncIterator[str]:
    """Streaming variant — yields raw text chunks."""
    cfg, provider = _resolve_provider(provider_id)
    client = _build_client(provider, cfg)
    system = _get_system_prompt(cfg)

    user_parts: list[str] = [f"场景描述：{scenario}"]
    if count:
        user_parts.append(f"请生成大约{count}条文本。")
    if text_type == "me":
        user_parts.append("只使用/me命令。")
    elif text_type == "do":
        user_parts.append("只使用/do命令。")

    stream = await client.chat.completions.create(
        model=provider.get("model", "gpt-4o"),
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": "\n".join(user_parts)},
        ],
        temperature=0.8,
        max_tokens=2048,
        stream=True,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content


async def test_provider(provider_id: str) -> dict[str, Any]:
    """Send a tiny request to verify that a provider is reachable."""
    cfg, provider = _resolve_provider(provider_id)
    client = _build_client(provider, cfg)
    try:
        resp = await client.chat.completions.create(
            model=provider.get("model", "gpt-4o"),
            messages=[{"role": "user", "content": "Hi"}],
            max_tokens=5,
        )
        return {"success": True, "response": resp.choices[0].message.content}
    except Exception as exc:
        detail: dict[str, Any] = {
            "success": False,
            "error": str(exc),
            "error_type": type(exc).__name__,
        }
        for key in ("status_code", "request_id", "code", "type", "param"):
            value = getattr(exc, key, None)
            if value is not None:
                detail[key] = value
        body = getattr(exc, "body", None)
        if body is not None:
            detail["body"] = (
                body
                if isinstance(body, (str, int, float, bool, dict, list))
                else str(body)
            )
        return detail


# ── Helpers ───────────────────────────────────────────────────────────────

_LINE_RE = re.compile(r"^/(me|do)\s+(.+)$", re.MULTILINE)


def _parse_lines(raw: str) -> list[dict[str, str]]:
    """Parse AI output into structured list."""
    results: list[dict[str, str]] = []
    for match in _LINE_RE.finditer(raw):
        results.append({"type": match.group(1), "content": match.group(2).strip()})
    return results
