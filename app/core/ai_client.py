"""Multi-provider AI client — any OpenAI-compatible API endpoint."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import threading
from typing import Any, AsyncIterator

from openai import AsyncOpenAI

from app.core.config import load_config, get_provider_by_id

log = logging.getLogger(__name__)

# ── Retry configuration ───────────────────────────────────────────────────────
_RETRYABLE_STATUS_CODES = {429, 500, 502, 503}
_MAX_RETRIES = 2
_RETRY_BASE_DELAY = 1.0  # seconds, exponentially backed off


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
    "输出格式（必须严格遵守）：\n"
    '只输出一个JSON数组，不要输出任何其他文字。格式如下：\n'
    '[{"type":"me","content":"缓缓推开了房门"}, '
    '{"type":"do","content":"门轴发出吱呀的响声"}]\n\n'
    "如果你无法输出JSON，则每行一条命令，以 /me 或 /do 开头，不要编号，不要额外说明。"
)

# ── Few-shot examples (injected as user→assistant pairs) ──────────────────

_FEWSHOT_MIXED = (
    '场景描述：一名警察在路边拦停一辆可疑车辆进行检查\n请生成5条文本。\n'
    '输出JSON数组，格式：[{"type":"me","content":"..."}, ...]',
    '[{"type":"me","content":"抬手示意前方车辆靠边停车，右手搭在腰间对讲机上"},'
    '{"type":"do","content":"警灯闪烁的巡逻车缓缓停在目标车辆后方"},'
    '{"type":"me","content":"走向驾驶座车窗，微微弯腰敲了敲玻璃"},'
    '{"type":"do","content":"车窗缓缓降下，车内飘出一股淡淡的烟味"},'
    '{"type":"me","content":"出示警徽，语气平稳地要求对方提供驾照和行驶证"}]',
)

_FEWSHOT_ME_ONLY = (
    '场景描述：角色在酒吧独自喝酒\n请生成3条文本。\n'
    '只使用/me命令（type全部为me）。\n'
    '输出JSON数组，格式：[{"type":"me","content":"..."}, ...]',
    '[{"type":"me","content":"端起威士忌杯轻轻晃了晃，看着琥珀色的液体旋转"},'
    '{"type":"me","content":"仰头将杯中酒一饮而尽，眉头微微皱了一下"},'
    '{"type":"me","content":"将空杯推向吧台内侧，食指轻叩桌面示意再来一杯"}]',
)

_FEWSHOT_DO_ONLY = (
    '场景描述：暴雨中的城市街道\n请生成3条文本。\n'
    '只使用/do命令（type全部为do）。\n'
    '输出JSON数组，格式：[{"type":"do","content":"..."}, ...]',
    '[{"type":"do","content":"豆大的雨点砸在柏油路面上，溅起一层白蒙蒙的水雾"},'
    '{"type":"do","content":"路灯昏黄的光线在积水中拉出长长的倒影"},'
    '{"type":"do","content":"远处传来一声闷雷，整条街道在雨幕中若隐若现"}]',
)

_FEWSHOT_MAP: dict[str, tuple[str, str]] = {
    "mixed": _FEWSHOT_MIXED,
    "me": _FEWSHOT_ME_ONLY,
    "do": _FEWSHOT_DO_ONLY,
}

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


def _get_fallback_providers(
    cfg: dict[str, Any],
    exclude_id: str = "",
) -> list[dict[str, Any]]:
    """Return a list of fallback providers from config, excluding the given ID."""
    fallback_ids = cfg.get("ai", {}).get("fallback_providers", [])
    if not isinstance(fallback_ids, list):
        return []
    result = []
    for fid in fallback_ids:
        if fid == exclude_id:
            continue
        p = get_provider_by_id(fid, cfg)
        if p is not None:
            result.append(p)
    return result


def _build_generate_user_prompt(
    scenario: str,
    count: int | None = None,
    text_type: str = "mixed",
    style: str | None = None,
) -> str:
    """Build the user-message prompt for AI text generation."""
    parts: list[str] = [f"场景描述：{scenario}"]
    effective_count = count or 5
    parts.append(f"请生成{effective_count}条文本。")
    if text_type == "me":
        parts.append("只使用/me命令（type全部为me）。")
    elif text_type == "do":
        parts.append("只使用/do命令（type全部为do）。")
    if style and style.strip():
        parts.append(f"请使用以下风格：{style.strip()}。")
    parts.append(
        '输出JSON数组，格式：[{"type":"me","content":"..."}, ...]'
    )
    return "\n".join(parts)


def _estimate_max_tokens(count: int | None) -> int:
    """Dynamically estimate max_tokens based on desired line count."""
    n = count or 5
    return max(512, min(4096, n * 200))


def _build_generate_messages(
    system: str,
    user_prompt: str,
    text_type: str = "mixed",
) -> list[dict[str, str]]:
    """Build the full messages array with few-shot example injection."""
    messages: list[dict[str, str]] = [{"role": "system", "content": system}]

    # Inject one few-shot example pair matched by text_type
    fewshot = _FEWSHOT_MAP.get(text_type, _FEWSHOT_MIXED)
    messages.append({"role": "user", "content": fewshot[0]})
    messages.append({"role": "assistant", "content": fewshot[1]})

    # Actual user request
    messages.append({"role": "user", "content": user_prompt})
    return messages


# ── Public functions ──────────────────────────────────────────────────────


async def generate_texts(
    scenario: str,
    provider_id: str | None = None,
    count: int | None = None,
    text_type: str = "mixed",
    style: str | None = None,
    temperature: float | None = None,
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
    max_tokens = _estimate_max_tokens(count)
    messages = _build_generate_messages(system, user_prompt, text_type)
    temp = temperature if temperature is not None else 0.8

    # Try primary provider, then fallback chain
    providers_to_try = [(provider, client, resolved_pid)]
    for fb_provider in _get_fallback_providers(cfg, exclude_id=resolved_pid):
        fb_client = _build_client(fb_provider, cfg)
        providers_to_try.append(
            (fb_provider, fb_client, fb_provider.get("id", ""))
        )

    last_error: Exception | None = None
    for prov, cli, pid in providers_to_try:
        try:
            response = await _call_with_retry(
                cli,
                model=prov.get("model", "gpt-4o"),
                messages=messages,
                temperature=temp,
                max_tokens=max_tokens,
            )
            raw = (response.choices[0].message.content or "") if response.choices else ""
            texts = _parse_generate_output(raw)
            texts = _postprocess_texts(texts)
            if pid != resolved_pid:
                log.info("Fallback to provider '%s' succeeded", pid)
            return texts, pid
        except Exception as exc:
            log.warning("Provider '%s' failed: %s", pid, exc)
            last_error = exc
            continue

    # All providers failed — raise the last error
    raise last_error  # type: ignore[misc]


async def generate_texts_stream(
    scenario: str,
    provider_id: str | None = None,
    count: int | None = None,
    text_type: str = "mixed",
    style: str | None = None,
    temperature: float | None = None,
) -> AsyncIterator[str]:
    """Streaming variant — yields raw text chunks."""
    cfg, provider = _resolve_provider(provider_id)
    client = _build_client(provider, cfg)
    system = _get_system_prompt(cfg)

    user_prompt = _build_generate_user_prompt(scenario, count, text_type, style)
    max_tokens = _estimate_max_tokens(count)
    messages = _build_generate_messages(system, user_prompt, text_type)

    stream = await client.chat.completions.create(
        model=provider.get("model", "gpt-4o"),
        messages=messages,
        temperature=temperature if temperature is not None else 0.8,
        max_tokens=max_tokens,
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
    temperature: float | None = None,
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

    max_tokens = _estimate_max_tokens(len(source_lines))

    response = await _call_with_retry(
        client,
        model=provider.get("model", "gpt-4o"),
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": "\n".join(prompt_parts)},
        ],
        temperature=temperature if temperature is not None else 0.7,
        max_tokens=max_tokens,
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


# ── Retry helper ──────────────────────────────────────────────────────────


async def _call_with_retry(
    client: AsyncOpenAI,
    **kwargs: Any,
) -> Any:
    """Call chat.completions.create with automatic retry on transient errors.

    Retries up to _MAX_RETRIES times on 429 / 5xx status codes using
    exponential backoff (1s -> 2s).
    """
    last_exc: Exception | None = None
    for attempt in range(_MAX_RETRIES + 1):
        try:
            return await client.chat.completions.create(**kwargs)
        except Exception as exc:
            status = getattr(exc, "status_code", None)
            if status in _RETRYABLE_STATUS_CODES and attempt < _MAX_RETRIES:
                delay = _RETRY_BASE_DELAY * (2 ** attempt)
                log.warning(
                    "AI API returned %s, retrying in %.1fs (attempt %d/%d)",
                    status, delay, attempt + 1, _MAX_RETRIES,
                )
                await asyncio.sleep(delay)
                last_exc = exc
                continue
            raise
    # Should never reach here, but just in case
    raise last_exc  # type: ignore[misc]


# ── Helpers ───────────────────────────────────────────────────────────────

_LINE_RE = re.compile(r"^(?:\d+\.\s*)?/(me|do|b|e)\s+(.+)$", re.MULTILINE)
_MAX_CONTENT_LEN = 80


def _parse_lines(raw: str) -> list[dict[str, str]]:
    """Parse AI output using /me /do line regex (legacy fallback)."""
    results: list[dict[str, str]] = []
    for match in _LINE_RE.finditer(raw):
        results.append({"type": match.group(1), "content": match.group(2).strip()})
    return results


def _try_parse_json_array(raw: str) -> list[dict[str, str]] | None:
    """Try to extract and parse a JSON array from the raw response.

    Returns a list of {type, content} dicts or None if parsing fails.
    """
    text = raw.strip()
    start = text.find("[")
    end = text.rfind("]")
    if start < 0 or end < 0 or end <= start:
        return None

    try:
        payload = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None

    if not isinstance(payload, list) or len(payload) == 0:
        return None

    results: list[dict[str, str]] = []
    for item in payload:
        if not isinstance(item, dict):
            return None
        item_type = item.get("type")
        content = item.get("content")
        if not isinstance(content, str):
            return None
        # Normalise type — accept common variants
        if item_type in ("me", "do", "b", "e"):
            pass
        elif item_type in ("/me", "/do", "/b", "/e"):
            item_type = item_type[1:]
        else:
            return None  # unexpected type -> abort JSON parse
        safe_content = content.strip()
        if not safe_content:
            continue  # skip empty items silently
        results.append({"type": item_type, "content": safe_content})
    return results if results else None


def _parse_generate_output(raw: str) -> list[dict[str, str]]:
    """Parse AI generation output: try JSON first, fall back to regex."""
    # 1. Try structured JSON parse
    json_result = _try_parse_json_array(raw)
    if json_result:
        log.debug("Parsed AI output as JSON (%d items)", len(json_result))
        return json_result

    # 2. Fall back to regex line parsing
    log.debug("JSON parse failed, falling back to regex")
    return _parse_lines(raw)


def _postprocess_texts(
    texts: list[dict[str, str]],
) -> list[dict[str, str]]:
    """Post-process generated texts for quality.

    - Truncate content exceeding _MAX_CONTENT_LEN at a natural break
    - Remove exact duplicate lines
    - Strip leading/trailing whitespace
    """
    seen: set[str] = set()
    result: list[dict[str, str]] = []
    for item in texts:
        content = item["content"].strip()
        if not content:
            continue

        # Truncate at a natural boundary if too long
        if len(content) > _MAX_CONTENT_LEN:
            content = _smart_truncate(content, _MAX_CONTENT_LEN)

        # Deduplicate
        dedup_key = f"{item['type']}:{content}"
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        result.append({"type": item["type"], "content": content})
    return result


def _smart_truncate(text: str, max_len: int) -> str:
    """Truncate text at a natural boundary (punctuation or space)."""
    if len(text) <= max_len:
        return text
    # Try to find a natural break point
    for sep in ("\u3002", "\uff0c", "\u3001", "\uff1b", " ", ".", ","):
        idx = text.rfind(sep, 0, max_len)
        if idx > max_len // 2:  # only use if reasonably far in
            return text[: idx + 1].rstrip()
    # Hard truncate as last resort
    return text[:max_len]


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
