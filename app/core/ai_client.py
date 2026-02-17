"""Multi-provider AI client — any OpenAI-compatible API endpoint."""

from __future__ import annotations

import json
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

_REWRITE_SYSTEM_PROMPT = (
    "你是一个FiveM角色扮演文本重写助手。"
    "你会收到一组/me和/do文本，并按要求重写。"
    "必须保持条数、顺序和type与输入一致，"
    "且只能返回JSON数组，不要返回任何额外说明。"
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
    style: str | None = None,
) -> list[dict[str, str]]:
    """Generate a list of /me + /do lines for a given scenario.

    Args:
        scenario: The scene description from the user.
        provider_id: Optional provider to use (falls back to default).
        count: Desired number of lines (hint in prompt).
        text_type: "me", "do", or "mixed".
        style: Optional style hint for generation tone.

    Returns:
        List of dicts: [{"type": "me"|"do", "content": "..."}]
    """
    cfg, provider = _resolve_provider(provider_id)
    client = _build_client(provider, cfg)
    system = _REWRITE_SYSTEM_PROMPT

    user_parts: list[str] = [f"场景描述：{scenario}"]
    if count:
        user_parts.append(f"请生成大约{count}条文本。")
    if text_type == "me":
        user_parts.append("只使用/me命令。")
    elif text_type == "do":
        user_parts.append("只使用/do命令。")
    if style and style.strip():
        user_parts.append(f"请使用以下风格：{style.strip()}。")

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
    style: str | None = None,
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
    if style and style.strip():
        user_parts.append(f"请使用以下风格：{style.strip()}。")

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


async def rewrite_texts(
    texts: list[dict[str, str]],
    provider_id: str | None = None,
    style: str | None = None,
    requirements: str | None = None,
) -> list[dict[str, str]]:
    """Rewrite existing RP lines while preserving order and type."""
    cfg, provider = _resolve_provider(provider_id)
    client = _build_client(provider, cfg)
    system = _get_system_prompt(cfg)

    source_lines: list[str] = []
    for item in texts:
        item_type = item.get("type")
        item_content = item.get("content")
        if item_type not in ("me", "do") or not isinstance(item_content, str):
            raise ValueError("重写文本格式不正确。")
        content = item_content.strip()
        if not content:
            raise ValueError("重写文本内容不能为空。")
        source_lines.append(f"/{item_type} {content}")

    prompt_parts = [
        "请重写下面这组 FiveM RP 文本。",
        "硬性规则：",
        "1. 输出条数必须与输入完全一致。",
        "2. 每条的 type 必须与对应输入一致（me 对应 /me，do 对应 /do）。",
        "3. 保持原有顺序。",
        "4. 只输出 JSON 数组，不要 Markdown，不要解释，不要多余字段。",
        '5. JSON 格式必须是: [{"type":"me","content":"..."}, ...]。',
    ]
    if style and style.strip():
        prompt_parts.append(f"风格要求：{style.strip()}")
    if requirements and requirements.strip():
        prompt_parts.append(f"具体要求：{requirements.strip()}")

    prompt_parts.append("输入文本：")
    for idx, line in enumerate(source_lines, start=1):
        prompt_parts.append(f"{idx}. {line}")

    response = await client.chat.completions.create(
        model=provider.get("model", "gpt-4o"),
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": "\n".join(prompt_parts)},
        ],
        temperature=0.7,
        max_tokens=2048,
    )

    raw = response.choices[0].message.content or ""
    parsed = _parse_rewrite_payload(raw, expected_count=len(source_lines))

    rewritten: list[dict[str, str]] = []
    for idx, item in enumerate(parsed):
        expected_type = texts[idx].get("type")
        safe_type = expected_type if expected_type in ("me", "do") else item["type"]
        rewritten.append({"type": safe_type, "content": item["content"]})
    return rewritten


# ── Helpers ───────────────────────────────────────────────────────────────

_LINE_RE = re.compile(r"^/(me|do)\s+(.+)$", re.MULTILINE)


def _parse_lines(raw: str) -> list[dict[str, str]]:
    """Parse AI output into structured list."""
    results: list[dict[str, str]] = []
    for match in _LINE_RE.finditer(raw):
        results.append({"type": match.group(1), "content": match.group(2).strip()})
    return results


def _parse_rewrite_payload(raw: str, expected_count: int) -> list[dict[str, str]]:
    """Parse rewrite response JSON array and validate shape/count."""
    text = raw.strip()
    start = text.find("[")
    end = text.rfind("]")
    if start < 0 or end < 0 or end <= start:
        raise RuntimeError("AI重写返回格式异常，缺少JSON数组。")

    try:
        payload = json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        raise RuntimeError("AI重写返回格式异常，JSON解析失败。") from exc

    if not isinstance(payload, list):
        raise RuntimeError("AI重写返回格式异常，结果不是数组。")
    if len(payload) != expected_count:
        raise RuntimeError("AI重写返回条数与输入不一致。")

    results: list[dict[str, str]] = []
    for item in payload:
        if not isinstance(item, dict):
            raise RuntimeError("AI重写返回格式异常，数组元素必须是对象。")
        item_type = item.get("type")
        content = item.get("content")
        if item_type not in ("me", "do") or not isinstance(content, str):
            raise RuntimeError("AI重写返回格式异常，type/content字段不正确。")
        safe_content = content.strip()
        if not safe_content:
            raise RuntimeError("AI重写返回了空文本内容。")
        results.append({"type": item_type, "content": safe_content})
    return results
