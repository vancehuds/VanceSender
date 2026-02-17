"""Settings & provider management routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.api.schemas import (
    AISettings,
    MessageResponse,
    ProviderCreate,
    ProviderResponse,
    ProviderUpdate,
    SenderSettings,
    ServerSettings,
    SettingsResponse,
)
from app.core.config import (
    add_provider,
    delete_provider,
    get_providers,
    load_config,
    save_config,
    update_config,
    update_provider,
)

router = APIRouter()


# ── General settings ──────────────────────────────────────────────────────


@router.get("", response_model=SettingsResponse)
async def get_settings():
    """获取全部设置。"""
    cfg = load_config()
    ai_section = dict(cfg.get("ai", {}))
    # 隐藏provider中的api_key原文
    providers = ai_section.get("providers", [])
    ai_section["providers"] = [
        {**p, "api_key_set": bool(p.get("api_key"))} for p in providers
    ]
    for p in ai_section["providers"]:
        p.pop("api_key", None)
    server_section = dict(cfg.get("server", {}))
    server_section["token_set"] = bool(server_section.get("token"))
    server_section["risk_no_token_with_lan"] = (
        bool(server_section.get("lan_access")) and not server_section["token_set"]
    )
    if server_section["risk_no_token_with_lan"]:
        server_section["security_warning"] = (
            "已开启局域网访问且未设置 Token，局域网内设备可直接访问 API。"
        )
    else:
        server_section["security_warning"] = ""
    server_section.pop("token", None)
    return SettingsResponse(
        server=server_section,
        sender=cfg.get("sender", {}),
        ai=ai_section,
    )


@router.put("/sender", response_model=MessageResponse)
async def update_sender_settings(body: SenderSettings):
    """更新发送设置。"""
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        return MessageResponse(message="没有需要更新的设置", success=False)
    update_config({"sender": patch})
    return MessageResponse(message="发送设置已更新")


@router.put("/server", response_model=MessageResponse)
async def update_server_settings(body: ServerSettings):
    """更新服务器设置（如LAN访问）。需要重启生效。"""
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        return MessageResponse(message="没有需要更新的设置", success=False)
    if "lan_access" in patch:
        host = "0.0.0.0" if patch["lan_access"] else "127.0.0.1"
        patch["host"] = host
    update_config({"server": patch})
    return MessageResponse(message="服务器设置已更新，部分配置需重启生效")


@router.put("/ai", response_model=MessageResponse)
async def update_ai_settings(body: AISettings):
    """更新AI设置（默认Provider、系统提示词、自定义请求头）。"""
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        return MessageResponse(message="没有需要更新的设置", success=False)

    default_provider = patch.get("default_provider")
    if default_provider:
        providers = get_providers()
        if not any(p.get("id") == default_provider for p in providers):
            raise HTTPException(
                status_code=400,
                detail=f"默认服务商 '{default_provider}' 不存在",
            )

    # custom_headers must fully replace (not deep-merge) so that deleted
    # keys are actually removed from the config.
    custom_headers = patch.pop("custom_headers", None)

    if patch:
        update_config({"ai": patch})

    if custom_headers is not None:
        cfg = load_config()
        cfg.setdefault("ai", {})["custom_headers"] = custom_headers
        save_config(cfg)

    return MessageResponse(message="AI设置已更新")


# ── Provider CRUD ─────────────────────────────────────────────────────────


@router.get("/providers", response_model=list[ProviderResponse])
async def list_providers():
    """列出所有AI服务商。"""
    providers = get_providers()
    return [
        ProviderResponse(
            id=p["id"],
            name=p.get("name", ""),
            api_base=p.get("api_base", ""),
            api_key_set=bool(p.get("api_key")),
            model=p.get("model", ""),
        )
        for p in providers
    ]


@router.post("/providers", response_model=ProviderResponse, status_code=201)
async def create_provider(body: ProviderCreate):
    """添加AI服务商。"""
    p = add_provider(body.model_dump())
    return ProviderResponse(
        id=p["id"],
        name=p["name"],
        api_base=p["api_base"],
        api_key_set=bool(p.get("api_key")),
        model=p["model"],
    )


@router.put("/providers/{provider_id}", response_model=ProviderResponse)
async def update_provider_route(provider_id: str, body: ProviderUpdate):
    """更新AI服务商配置。"""
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    p = update_provider(provider_id, patch)
    if p is None:
        raise HTTPException(status_code=404, detail=f"服务商 '{provider_id}' 不存在")
    return ProviderResponse(
        id=p["id"],
        name=p["name"],
        api_base=p["api_base"],
        api_key_set=bool(p.get("api_key")),
        model=p["model"],
    )


@router.delete("/providers/{provider_id}", response_model=MessageResponse)
async def delete_provider_route(provider_id: str):
    """删除AI服务商。"""
    if delete_provider(provider_id):
        return MessageResponse(message=f"服务商 '{provider_id}' 已删除")
    raise HTTPException(status_code=404, detail=f"服务商 '{provider_id}' 不存在")
