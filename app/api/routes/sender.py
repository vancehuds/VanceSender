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
from app.core.overlay_status import push_overlay_status
from app.core.sender import sender

router = APIRouter()


def _sender_delays(cfg: dict[str, Any]) -> dict[str, Any]:
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


def _webui_overlay_enabled(cfg: dict[str, Any]) -> bool:
    overlay_cfg = cfg.get("quick_overlay", {})
    return bool(overlay_cfg.get("enabled", True)) and bool(
        overlay_cfg.get("show_webui_send_status", True)
    )


def _push_webui_overlay_status(enabled: bool, text: str, final: bool) -> None:
    if not enabled:
        return
    push_overlay_status(text, final)


def _overlay_message_from_progress(progress: dict[str, Any]) -> tuple[str | None, bool]:
    status = str(progress.get("status", ""))
    if status == "sending":
        index = int(progress.get("index", 0)) + 1
        total = int(progress.get("total", 0))
        return (f"WebUI 发送中 {index}/{total}", False)

    if status == "line_result":
        if progress.get("success", False):
            return (None, False)
        index = int(progress.get("index", 0)) + 1
        error = str(progress.get("error", "未知错误"))
        return (f"WebUI 第 {index} 条失败: {error}", False)

    if status == "completed":
        success_count = int(progress.get("success", 0))
        failed_count = int(progress.get("failed", 0))
        return (
            f"WebUI 发送完成：成功 {success_count} 条，失败 {failed_count} 条",
            True,
        )

    if status == "cancelled":
        return ("WebUI 发送已取消", True)

    if status == "error":
        error = str(progress.get("error", "未知错误"))
        return (f"WebUI 发送失败: {error}", True)

    return (None, False)


@router.post("", response_model=SendResponse)
async def send_single(body: SendSingleRequest):
    """发送单条文本到FiveM。"""
    cfg = load_config()
    overlay_enabled = _webui_overlay_enabled(cfg)

    if sender.is_sending:
        _push_webui_overlay_status(
            overlay_enabled,
            "WebUI 单条发送被拒绝：正在批量发送中",
            True,
        )
        return SendResponse(
            success=False, text=body.text, error="正在批量发送中，请等待完成或取消"
        )

    sender_options = _sender_delays(cfg)
    sender_options.pop("delay_between", None)

    _push_webui_overlay_status(overlay_enabled, "WebUI 单条发送中...", False)
    result = await sender.send_single_async(body.text, **sender_options)

    if result.get("success"):
        _push_webui_overlay_status(overlay_enabled, "WebUI 单条发送完成", True)
    else:
        error = str(result.get("error", "未知错误"))
        _push_webui_overlay_status(
            overlay_enabled,
            f"WebUI 单条发送失败: {error}",
            True,
        )

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
    cfg = load_config()
    overlay_enabled = _webui_overlay_enabled(cfg)

    if not sender.try_claim_batch():
        _push_webui_overlay_status(
            overlay_enabled,
            "WebUI 批量发送被拒绝：已有任务进行中",
            True,
        )
        return StreamingResponse(
            iter(
                [
                    f"data: {json.dumps({'status': 'error', 'error': '已有批量发送任务进行中'})}\n\n"
                ]
            ),
            media_type="text/event-stream",
        )

    sender_options = _sender_delays(cfg)
    delay_between = body.delay_between or sender_options.get("delay_between", 1500)
    sender_options.pop("delay_between", None)

    _push_webui_overlay_status(
        overlay_enabled,
        f"WebUI 批量发送开始，共 {len(body.texts)} 条",
        False,
    )

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
                    overlay_text, overlay_final = _overlay_message_from_progress(p)
                    if overlay_text is not None:
                        _push_webui_overlay_status(
                            overlay_enabled,
                            overlay_text,
                            overlay_final,
                        )
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
    cfg = load_config()
    overlay_enabled = _webui_overlay_enabled(cfg)

    if sender.cancel():
        _push_webui_overlay_status(overlay_enabled, "WebUI 已请求取消发送", False)
        return MessageResponse(message="已发送取消请求")
    return MessageResponse(message="当前没有正在进行的批量发送", success=False)


@router.get("/status", response_model=SendStatusResponse)
async def send_status():
    """获取当前发送状态。"""
    return SendStatusResponse(sending=sender.is_sending, progress=sender.progress)
