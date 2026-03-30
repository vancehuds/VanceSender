"""Cloudflare Tunnel management routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.api.schemas import (
    CloudflaredInstallProgressResponse,
    CloudflaredInstallResponse,
    CloudflaredStatusResponse,
    MessageResponse,
    TunnelStartRequest,
    TunnelStatusResponse,
)
from app.core.tunnel import (
    cancel_install,
    get_cloudflared_status,
    get_install_progress,
    get_tunnel_status,
    install_cloudflared,
    start_tunnel,
    stop_tunnel,
)

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

    named_token = body.named_token.strip()
    if body.mode == "named" and not named_token:
        raise HTTPException(status_code=400, detail="named 模式需要提供有效的隧道令牌")

    port = int(getattr(request.app.state, "runtime_port", 8730))
    result = start_tunnel(
        local_port=port,
        mode=body.mode,
        named_token=named_token,
        auto_install=body.auto_install,
    )
    return TunnelStatusResponse(**result)


@router.post("/stop", response_model=MessageResponse)
async def tunnel_stop():
    """停止 Cloudflare 隧道。"""
    stop_tunnel()
    return MessageResponse(message="隧道已停止")


# ── Cloudflared Installation ────────────────────────────────────────────────


@router.get("/cloudflared", response_model=CloudflaredStatusResponse)
async def cloudflared_status():
    """获取 cloudflared 安装状态。

    返回 cloudflared 是否已安装、版本号、安装路径等信息。
    如果未安装，can_auto_install 字段指示是否支持自动安装。
    """
    status = get_cloudflared_status()
    return CloudflaredStatusResponse(
        installed=status.installed,
        version=status.version,
        path=status.path,
        is_bundled=status.is_bundled,
        can_auto_install=status.can_auto_install,
        platform_key=status.platform_key,
    )


@router.post("/cloudflared/install", response_model=CloudflaredInstallResponse)
async def cloudflared_install():
    """开始安装 cloudflared。

    从 GitHub Releases 下载适合当前平台的 cloudflared 二进制文件，
    安装到运行时目录的 bin 子目录中。

    安装在后台线程进行，使用 /cloudflared/install-progress 端点查询进度。
    """
    result = install_cloudflared()
    return CloudflaredInstallResponse(
        status=result["status"],
        message=result["message"],
    )


@router.get("/cloudflared/install-progress", response_model=CloudflaredInstallProgressResponse)
async def cloudflared_install_progress():
    """获取 cloudflared 安装进度。

    返回当前安装状态、进度百分比、下载字节数等信息。
    """
    progress = get_install_progress()
    return CloudflaredInstallProgressResponse(
        status=progress.status,
        progress_percent=progress.progress_percent,
        message=progress.message,
        error=progress.error,
        downloaded_bytes=progress.downloaded_bytes,
        total_bytes=progress.total_bytes,
    )


@router.post("/cloudflared/install-cancel", response_model=MessageResponse)
async def cloudflared_install_cancel():
    """取消正在进行的 cloudflared 安装。"""
    result = cancel_install()
    return MessageResponse(
        message=result["message"],
        success=result["status"] == "cancelled",
    )
