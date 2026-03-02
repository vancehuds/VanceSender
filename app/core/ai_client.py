"""Multi-provider AI client — any OpenAI-compatible API endpoint."""

from __future__ import annotations

import json
import re
import threading
from typing import Any, AsyncIterator

from openai import AsyncOpenAI

from app.core.config import load_config, get_provider_by_id


# ── Default system prompt (fallback) ──────────────────────────────────────

_DEFAULT_SYSTEM_PROMPT = (
    "你是 FiveM 角色扮演文本生成助手。用户会描述一个场景，"
    "你需要生成一系列 /me 和 /do 命令来描述该场景。\n\n"
    "定义与边界：\n"
    "1. /me 只用于描述自己角色的动作、表情、语气、意图（第一人称视角，不带主语）。\n"
    "2. /do 只用于描述环境、可观察状态、声音与客观信息。\n"
    "3. 严禁替他人写动作、心理、决定或结论；严禁出现“强制对方执行某动作”的表述。\n"
    "4. 涉及互动或冲突时，只写自己的尝试与现场状态，不直接判定对方被命中、被控制、被制服。\n"
    "5. 结果描述要可回应、可博弈，不要写成不可反驳的单方面结论。\n\n"
    "写作规则：\n"
    "1. 每条文本不超过80个字符（不含 /me 或 /do 前缀）。\n"
    "2. /me 和 /do 交替或混合使用，形成自然叙事节奏。\n"
    "3. 描述具体有画面感，同时保持简洁。\n"
    "4. 前后逻辑连贯，避免自相矛盾。\n\n"
    "输出格式：每行一条命令，以 /me 或 /do 开头，不要编号，不要额外说明。"
)

_REWRITE_SYSTEM_PROMPT = (
    "你是一个FiveM角色扮演文本重写助手。"
    "你会收到一组/me和/do文本，并按要求重写。"
    "重写时必须遵守：/me只写自己角色动作，/do只写客观状态，"
    "不得替他人行动或写强制他人的结果。"
    "必须保持条数、顺序和type与输入一致，"
    "且只能返回JSON数组，不要返回任何额外说明。"
)



# ── Client cache (keyed by api_base + api_key + custom_headers hash) ────────

_client_cache_lock = threading.Lock()
_client_cache: dict[str, AsyncOpenAI] = {}


def _client_cache_key(provider: dict[str, Any], custom_headers: dict[str, str] | None) -> str:
    """Build a deterministic cache key for a provider + header combo."""
    api_base = provider.get("api_base", "")
    api_key = provider.get("api_key", "")
    header_str = json.dumps(custom_headers, sort_keys=True) if custom_headers else ""
    return f"{api_base}|{api_key}|{header_str}"


def invalidate_client_cache() -> None:
    """Clear all cached AsyncOpenAI clients.

    Should be called whenever provider config or custom_headers change
    (add / update / delete provider, update AI settings) so that stale
    clients with outdated credentials or headers are discarded.
    """
    with _client_cache_lock:
        for client in _client_cache.values():
            try:
                client.close()  # type: ignore[union-attr]
            except Exception:
                pass
        _client_cache.clear()


# ── Fullwidth → ASCII normalisation table ──────────────────────────────
# Users sometimes paste URLs / keys from Chinese-IME contexts where
# certain ASCII-range characters silently become their fullwidth Unicode
# equivalents (e.g. ： → :).  HTTP headers and URLs are ASCII-only, so
# we normalise these transparently before handing them to httpx.

_FULLWIDTH_TABLE = str.maketrans(
    {
        "\uff1a": ":",   # ：→ :
        "\uff0f": "/",   # ／→ /
        "\uff0e": ".",   # ．→ .
        "\uff1d": "=",   # ＝→ =
        "\uff1f": "?",   # ？→ ?
        "\uff06": "&",   # ＆→ &
        "\uff20": "@",   # ＠→ @
        "\uff03": "#",   # ＃→ #
        "\uff05": "%",   # ％→ %
        "\uff0b": "+",   # ＋→ +
        "\uff0d": "-",   # －→ -
        "\uff3f": "_",   # ＿→ _
        "\u3000": " ",   # 　→ (space)
    }
)


def _sanitize_ascii(value: str) -> str:
    """Normalise fullwidth chars → ASCII and strip remaining non-ASCII.

    This prevents UnicodeEncodeError when httpx tries to encode URLs or
    HTTP header values with the ``ascii`` codec.
    """
    value = value.translate(_FULLWIDTH_TABLE)
    # Drop any remaining non-ASCII characters (shouldn't be in URLs/keys)
    return value.encode("ascii", errors="ignore").decode("ascii").strip()


def _build_client(
    provider: dict[str, Any], cfg: dict[str, Any] | None = None
) -> AsyncOpenAI:
    """Return a cached AsyncOpenAI client for a given provider config.

    Clients are cached per unique (api_base, api_key, custom_headers)
    combination to avoid creating short-lived connections on every request.
    """
    if cfg is None:
        cfg = load_config()
    custom_headers = cfg.get("ai", {}).get("custom_headers") or {}
    key = _client_cache_key(provider, custom_headers or None)

    with _client_cache_lock:
        cached = _client_cache.get(key)
        if cached is not None:
            return cached

    api_key = _sanitize_ascii(provider.get("api_key") or "unused")
    api_base = _sanitize_ascii(provider.get("api_base", ""))

    safe_headers: dict[str, str] | None = None
    if custom_headers:
        safe_headers = {
            _sanitize_ascii(k): _sanitize_ascii(v)
            for k, v in custom_headers.items()
        }

    client = AsyncOpenAI(
        api_key=api_key,
        base_url=api_base,
        default_headers=safe_headers if safe_headers else None,
    )

    with _client_cache_lock:
        _client_cache[key] = client

    return client


# ── Shared error detail extraction ─────────────────────────────────────


def extract_api_error_details(
    exc: Exception, *, provider_id: str | None = None
) -> dict[str, object]:
    """Extract structured error details from an API/AI exception.

    Used by both AI routes and test_provider to avoid duplicated logic.
    """
    detail: dict[str, object] = {
        "message": str(exc),
        "error_type": type(exc).__name__,
    }
    if provider_id:
        detail["provider_id"] = provider_id

    for key in ("status_code", "request_id", "code", "type", "param"):
        value = getattr(exc, key, None)
        if value is not None:
            detail[key] = value

    body = getattr(exc, "body", None)
    if body is not None:
        detail["body"] = (
            body if isinstance(body, (str, int, float, bool, dict, list)) else str(body)
        )

    response = getattr(exc, "response", None)
    if response is not None:
        response_status = getattr(response, "status_code", None)
        if response_status is not None:
            detail["response_status"] = response_status

    return detail


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


def _build_generate_user_prompt(
    scenario: str,
    count: int | None = None,
    text_type: str = "mixed",
    style: str | None = None,
) -> str:
    """Build the user-message prompt for AI text generation."""
    parts: list[str] = [f"场景描述：{scenario}"]
    if count:
        parts.append(f"请生成大约{count}条文本。")
    if text_type == "me":
        parts.append("只使用/me命令。")
    elif text_type == "do":
        parts.append("只使用/do命令。")
    if style and style.strip():
        parts.append(f"请使用以下风格：{style.strip()}。")
    return "\n".join(parts)


# ── Public functions ──────────────────────────────────────────────────────


async def generate_texts(
    scenario: str,
    provider_id: str | None = None,
    count: int | None = None,
    text_type: str = "mixed",
    style: str | None = None,
) -> tuple[list[dict[str, str]], str]:
    """Generate a list of /me + /do lines for a given scenario.

    Args:
        scenario: The scene description from the user.
        provider_id: Optional provider to use (falls back to default).
        count: Desired number of lines (hint in prompt).
        text_type: "me", "do", or "mixed".
        style: Optional style hint for generation tone.

    Returns:
        Tuple of (texts, resolved_provider_id) where texts is
        [{"type": "me"|"do", "content": "..."}].
    """
    cfg, provider = _resolve_provider(provider_id)
    resolved_pid = provider.get("id", "")
    client = _build_client(provider, cfg)
    system = _get_system_prompt(cfg)

    user_prompt = _build_generate_user_prompt(scenario, count, text_type, style)

    response = await client.chat.completions.create(
        model=provider.get("model", "gpt-4o"),
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.8,
        max_tokens=2048,
    )

    raw = (response.choices[0].message.content or "") if response.choices else ""
    return _parse_lines(raw), resolved_pid


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

    user_prompt = _build_generate_user_prompt(scenario, count, text_type, style)

    stream = await client.chat.completions.create(
        model=provider.get("model", "gpt-4o"),
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.8,
        max_tokens=2048,
        stream=True,
    )

    async for chunk in stream:
        if not chunk.choices:
            continue
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
        detail = extract_api_error_details(exc)
        return {"success": False, **detail}


async def rewrite_texts(
    texts: list[dict[str, str]],
    provider_id: str | None = None,
    style: str | None = None,
    requirements: str | None = None,
) -> tuple[list[dict[str, str]], str]:
    """Rewrite existing RP lines while preserving order and type.

    Returns:
        Tuple of (rewritten_texts, resolved_provider_id).
    """
    cfg, provider = _resolve_provider(provider_id)
    resolved_pid = provider.get("id", "")
    client = _build_client(provider, cfg)
    system = _REWRITE_SYSTEM_PROMPT

    source_lines: list[str] = []
    for item in texts:
        item_type = item.get("type")
        item_content = item.get("content")
        if item_type not in ("me", "do", "b", "e") or not isinstance(item_content, str):
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

    if not response.choices:
        raise RuntimeError("AI重写返回格式异常，无有效响应。")
    raw = response.choices[0].message.content or ""
    parsed = _parse_rewrite_payload(raw, expected_count=len(source_lines))

    rewritten: list[dict[str, str]] = []
    for idx, item in enumerate(parsed):
        expected_type = texts[idx].get("type")
        safe_type = expected_type if expected_type in ("me", "do", "b", "e") else item["type"]
        rewritten.append({"type": safe_type, "content": item["content"]})
    return rewritten, resolved_pid


# ── Helpers ───────────────────────────────────────────────────────────────

_LINE_RE = re.compile(r"^(?:\d+\.\s*)?/(me|do|b|e)\s+(.+)$", re.MULTILINE)


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
        if item_type not in ("me", "do", "b", "e") or not isinstance(content, str):
            raise RuntimeError("AI重写返回格式异常，type/content字段不正确。")
        safe_content = content.strip()
        if not safe_content:
            raise RuntimeError("AI重写返回了空文本内容。")
        results.append({"type": item_type, "content": safe_content})
    return results
