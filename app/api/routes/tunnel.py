"""Cloudflare Tunnel management routes."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.schemas import (
    MessageResponse,
    TunnelStartRequest,
    TunnelStatusResponse,
)
from app.core.tunnel import get_tunnel_status, start_tunnel, stop_tunnel

router = APIRouter()


@router.get("", response_model=TunnelStatusResponse)
async def tunnel_status():
    """获取隧道状态。"""
    return TunnelStatusResponse(**get_tunnel_status())


@router.post("/start", response_model=TunnelStatusResponse)
async def tunnel_start(request: Request, body: TunnelStartRequest | None = None):
    """启动 Cloudflare 隧道。

    启动时会自动检查 Bearer Token:
    - 如果已配置 Token，直接使用
    - 如果未配置，自动生成安全随机 Token 并保存到配置文件
    """
    if body is None:
        body = TunnelStartRequest()

    port = int(getattr(request.app.state, "runtime_port", 8730))
    result = start_tunnel(
        local_port=port,
        mode=body.mode,
        named_token=body.named_token,
    )
    return TunnelStatusResponse(**result)


@router.post("/stop", response_model=MessageResponse)
async def tunnel_stop():
    """停止 Cloudflare 隧道。"""
    stop_tunnel()
    return MessageResponse(message="隧道已停止")
