"""AI text generation routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.api.schemas import (
    AIGenerateRequest,
    AIGenerateResponse,
    AIRewriteRequest,
    AIRewriteResponse,
    ProviderTestResponse,
    TextLine,
)
from app.core.ai_client import (
    generate_texts,
    generate_texts_stream,
    rewrite_texts,
    test_provider,
)
from app.core.config import load_config

router = APIRouter()


def _build_error_detail(
    exc: Exception, provider_id: str | None = None
) -> dict[str, object]:
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


def _format_test_error(result: dict[str, object]) -> str:
    parts: list[str] = []
    error = result.get("error")
    if error:
        parts.append(str(error))
    error_type = result.get("error_type")
    if error_type:
        parts.append(f"type={error_type}")
    status_code = result.get("status_code")
    if status_code is not None:
        parts.append(f"status={status_code}")
    request_id = result.get("request_id")
    if request_id:
        parts.append(f"request_id={request_id}")
    body = result.get("body")
    if body:
        parts.append(f"body={body}")
    return " | ".join(parts) if parts else "未知错误"


@router.post("/generate", response_model=AIGenerateResponse)
async def ai_generate(body: AIGenerateRequest):
    """使用AI生成一套/me和/do文本。"""
    try:
        cfg = load_config()
        provider_id = body.provider_id or cfg.get("ai", {}).get("default_provider", "")
        texts = await generate_texts(
            scenario=body.scenario,
            provider_id=body.provider_id,
            count=body.count,
            text_type=body.text_type,
            style=body.style,
        )

        validated_texts: list[TextLine] = []
        for item in texts:
            item_type = item.get("type")
            item_content = item.get("content")
            if item_type in ("me", "do") and isinstance(item_content, str):
                validated_texts.append(TextLine(type=item_type, content=item_content))

        return AIGenerateResponse(
            texts=validated_texts,
            provider_id=provider_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=_build_error_detail(exc, provider_id=body.provider_id),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "AI服务请求失败",
                **_build_error_detail(exc, provider_id=body.provider_id),
            },
        )


@router.post("/generate/stream")
async def ai_generate_stream(body: AIGenerateRequest):
    """流式生成AI文本（SSE）。"""
    try:

        async def event_gen():
            async for chunk in generate_texts_stream(
                scenario=body.scenario,
                provider_id=body.provider_id,
                count=body.count,
                text_type=body.text_type,
                style=body.style,
            ):
                yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(event_gen(), media_type="text/event-stream")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/rewrite", response_model=AIRewriteResponse)
async def ai_rewrite(body: AIRewriteRequest):
    """使用AI重写单条或多条文本。"""
    try:
        cfg = load_config()
        provider_id = body.provider_id or cfg.get("ai", {}).get("default_provider", "")
        rewritten = await rewrite_texts(
            texts=[item.model_dump() for item in body.texts],
            provider_id=body.provider_id,
            style=body.style,
            requirements=body.requirements,
        )

        validated_texts: list[TextLine] = []
        for item in rewritten:
            item_type = item.get("type")
            item_content = item.get("content")
            if item_type in ("me", "do") and isinstance(item_content, str):
                validated_texts.append(TextLine(type=item_type, content=item_content))

        if len(validated_texts) != len(body.texts):
            raise RuntimeError("AI重写结果与输入条数不一致。")

        return AIRewriteResponse(texts=validated_texts, provider_id=provider_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=_build_error_detail(exc, provider_id=body.provider_id),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "AI服务请求失败",
                **_build_error_detail(exc, provider_id=body.provider_id),
            },
        )


@router.post("/test/{provider_id}", response_model=ProviderTestResponse)
async def test_ai_provider(provider_id: str):
    """测试AI服务商连接。"""
    try:
        result = await test_provider(provider_id)
        if result["success"]:
            return ProviderTestResponse(
                message=f"连接成功: {result.get('response', '')}",
                success=True,
                response=(
                    result.get("response")
                    if isinstance(result.get("response"), str)
                    else str(result.get("response", ""))
                ),
            )

        error_type_raw = result.get("error_type")
        status_code_raw = result.get("status_code")
        request_id_raw = result.get("request_id")
        return ProviderTestResponse(
            message=f"连接失败: {_format_test_error(result)}",
            success=False,
            error_type=(str(error_type_raw) if error_type_raw else None),
            status_code=(status_code_raw if isinstance(status_code_raw, int) else None),
            request_id=(str(request_id_raw) if request_id_raw else None),
            body=result.get("body"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
