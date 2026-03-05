"""AI text generation routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.api.schemas import (
    AIGenerateRequest,
    AIGenerateResponse,
    AIRewriteRequest,
    AIRewriteResponse,
    MessageResponse,
    ProviderTestResponse,
    TextLine,
)
from app.core.ai_client import (
    _parse_generate_output,
    _postprocess_texts,
    extract_api_error_details,
    generate_texts,
    generate_texts_stream,
    rewrite_texts,
    test_provider,
)
from app.core.ai_history import (
    clear_unstarred,
    delete_entry,
    save_generation,
    toggle_star,
)
from app.core.ai_history import (
    list_history as list_ai_history,
)

router = APIRouter()


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
        texts, resolved_pid = await generate_texts(
            scenario=body.scenario,
            provider_id=body.provider_id,
            count=body.count,
            text_type=body.text_type,
            style=body.style,
            temperature=body.temperature,
        )

        validated_texts: list[TextLine] = []
        for item in texts:
            item_type = item.get("type")
            item_content = item.get("content")
            if item_type in ("me", "do", "e") and isinstance(item_content, str):
                validated_texts.append(TextLine(type=item_type, content=item_content))

        if len(validated_texts) == 0:
            raise RuntimeError("AI返回内容格式异常，未解析到有效文本。")

        # Save to AI generation history
        try:
            save_generation(
                scenario=body.scenario,
                style=body.style or "",
                text_type=body.text_type or "mixed",
                provider_id=resolved_pid,
                texts=[t.model_dump() for t in validated_texts],
            )
        except Exception:
            pass  # Don't fail the main request if history save fails

        return AIGenerateResponse(
            texts=validated_texts,
            provider_id=resolved_pid,
        )
    except UnicodeError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "请求编码错误，请检查服务商配置（API地址/密钥/自定义请求头）是否包含特殊字符",
                **extract_api_error_details(exc, provider_id=body.provider_id),
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=extract_api_error_details(exc, provider_id=body.provider_id),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "AI服务请求失败",
                **extract_api_error_details(exc, provider_id=body.provider_id),
            },
        )


@router.post("/generate/stream")
async def ai_generate_stream(body: AIGenerateRequest):
    """流式生成AI文本（SSE）。"""

    async def event_gen():
        accumulated = []
        try:
            async for chunk in generate_texts_stream(
                scenario=body.scenario,
                provider_id=body.provider_id,
                count=body.count,
                text_type=body.text_type,
                style=body.style,
                temperature=body.temperature,
            ):
                accumulated.append(chunk)
                yield f"data: {chunk}\n\n"

            # Save to history on successful completion
            try:
                raw_text = "".join(accumulated)
                texts = _parse_generate_output(raw_text)
                texts = _postprocess_texts(texts)
                if texts:
                    save_generation(
                        scenario=body.scenario,
                        style=body.style or "",
                        text_type=body.text_type or "mixed",
                        provider_id=body.provider_id or "",
                        texts=texts,
                    )
            except Exception:
                pass  # Don't fail stream if history save fails

            yield "data: [DONE]\n\n"
        except UnicodeError as exc:
            import json as _json

            yield f"data: {_json.dumps({'error': f'请求编码错误，请检查服务商配置是否包含特殊字符: {exc}'}, ensure_ascii=False)}\n\n"
        except ValueError as exc:
            import json as _json

            yield f"data: {_json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"
        except Exception as exc:
            import json as _json

            yield f"data: {_json.dumps({'error': f'AI服务请求失败: {exc}'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@router.post("/rewrite", response_model=AIRewriteResponse)
async def ai_rewrite(body: AIRewriteRequest):
    """使用AI重写单条或多条文本。"""
    try:
        rewritten, resolved_pid = await rewrite_texts(
            texts=[item.model_dump() for item in body.texts],
            provider_id=body.provider_id,
            style=body.style,
            requirements=body.requirements,
            temperature=body.temperature,
        )

        validated_texts: list[TextLine] = []
        for item in rewritten:
            item_type = item.get("type")
            item_content = item.get("content")
            if item_type in ("me", "do", "e") and isinstance(item_content, str):
                validated_texts.append(TextLine(type=item_type, content=item_content))

        if len(validated_texts) != len(body.texts):
            raise RuntimeError("AI重写结果与输入条数不一致。")

        return AIRewriteResponse(texts=validated_texts, provider_id=resolved_pid)
    except UnicodeError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "请求编码错误，请检查服务商配置（API地址/密钥/自定义请求头）是否包含特殊字符",
                **extract_api_error_details(exc, provider_id=body.provider_id),
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=extract_api_error_details(exc, provider_id=body.provider_id),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "AI服务请求失败",
                **extract_api_error_details(exc, provider_id=body.provider_id),
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


# ── AI Generation History ──────────────────────────────────────────────────


@router.get("/history")
async def get_ai_history(limit: int = 20, offset: int = 0):
    """获取AI生成历史。"""
    items, total = list_ai_history(limit=limit, offset=offset)
    return {"items": items, "total": total}


@router.post("/history/{gen_id}/star")
async def star_ai_history(gen_id: str):
    """切换收藏状态。"""
    result = toggle_star(gen_id)
    if result is None:
        raise HTTPException(status_code=404, detail="记录不存在")
    return result


@router.delete("/history/{gen_id}", response_model=MessageResponse)
async def delete_ai_history(gen_id: str):
    """删除单条AI生成历史。"""
    if delete_entry(gen_id):
        return MessageResponse(message="已删除")
    raise HTTPException(status_code=404, detail="记录不存在")


@router.delete("/history", response_model=MessageResponse)
async def clear_ai_history():
    """清空非收藏AI生成历史。"""
    count = clear_unstarred()
    return MessageResponse(message=f"已清空 {count} 条非收藏记录")
