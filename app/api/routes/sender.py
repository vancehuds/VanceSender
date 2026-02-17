"""Send text routes — single line & batch with SSE progress."""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.api.schemas import (
    MessageResponse,
    SendBatchRequest,
    SendSingleRequest,
    SendResponse,
    SendStatusResponse,
)
from app.core.config import load_config
from app.core.sender import sender

router = APIRouter()


def _sender_delays() -> dict[str, Any]:
    cfg = load_config()
    s = cfg.get("sender", {})
    return {
        "method": s.get("method", "clipboard"),
        "chat_open_key": s.get("chat_open_key", "t"),
        "delay_open": s.get("delay_open_chat", 300),
        "delay_paste": s.get("delay_after_paste", 100),
        "delay_send": s.get("delay_after_send", 200),
        "focus_timeout": s.get("focus_timeout", 5000),
        "retry_count": s.get("retry_count", 2),
        "retry_interval": s.get("retry_interval", 300),
        "typing_char_delay": s.get("typing_char_delay", 18),
        "delay_between": s.get("delay_between_lines", 1500),
    }


@router.post("", response_model=SendResponse)
async def send_single(body: SendSingleRequest):
    """发送单条文本到FiveM。"""
    if sender.is_sending:
        return SendResponse(
            success=False, text=body.text, error="正在批量发送中，请等待完成或取消"
        )
    sender_options = _sender_delays()
    sender_options.pop("delay_between", None)
    result = await sender.send_single_async(body.text, **sender_options)
    return SendResponse(**result)


@router.post("/batch")
async def send_batch(body: SendBatchRequest):
    """批量发送文本，返回SSE事件流。

    SSE事件格式:
    - data: {"status":"sending","index":0,"total":5,"text":"..."} — 正在发送第N条
    - data: {"status":"line_result","index":0,"success":true,...}  — 单条发送结果
    - data: {"status":"completed","total":5,"sent":5,...}         — 全部完成
    - data: {"status":"cancelled","index":3,"total":5}            — 被取消
    - data: {"status":"error","error":"..."}                       — 发送异常
    """
    if not sender.try_claim_batch():
        return StreamingResponse(
            iter(
                [
                    f"data: {json.dumps({'status': 'error', 'error': '已有批量发送任务进行中'})}\n\n"
                ]
            ),
            media_type="text/event-stream",
        )

    sender_options = _sender_delays()
    delay_between = body.delay_between or sender_options.get("delay_between", 1500)
    sender_options.pop("delay_between", None)

    progress_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def on_progress(p: dict[str, Any]) -> None:
        _ = loop.call_soon_threadsafe(progress_queue.put_nowait, p)

    async def run_batch() -> None:
        try:
            await sender.send_batch_async(
                body.texts,
                on_progress=on_progress,
                delay_between=delay_between,
                **sender_options,
            )
        except Exception as exc:
            sender.mark_idle()
            _ = loop.call_soon_threadsafe(
                progress_queue.put_nowait,
                {"status": "error", "error": str(exc)},
            )

    async def event_generator():
        task = asyncio.create_task(run_batch())
        try:
            while not task.done() or not progress_queue.empty():
                try:
                    p = await asyncio.wait_for(progress_queue.get(), timeout=0.5)
                    yield f"data: {json.dumps(p, ensure_ascii=False)}\n\n"
                    if p.get("status") in ("completed", "cancelled", "error"):
                        break
                except asyncio.TimeoutError:
                    continue
        finally:
            if not task.done():
                _ = task.cancel()

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/stop", response_model=MessageResponse)
async def stop_batch():
    """取消正在进行的批量发送。"""
    if sender.cancel():
        return MessageResponse(message="已发送取消请求")
    return MessageResponse(message="当前没有正在进行的批量发送", success=False)


@router.get("/status", response_model=SendStatusResponse)
async def send_status():
    """获取当前发送状态。"""
    return SendStatusResponse(sending=sender.is_sending, progress=sender.progress)
