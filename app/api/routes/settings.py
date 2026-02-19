"""Settings & provider management routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.api.schemas import (
    AISettings,
    DesktopWindowActionRequest,
    DesktopWindowStateResponse,
    LaunchSettings,
    MessageResponse,
    PublicConfigResponse,
    ProviderCreate,
    ProviderResponse,
    ProviderUpdate,
    QuickOverlaySettings,
    SenderSettings,
    ServerSettings,
    SettingsResponse,
    UpdateCheckResponse,
)
from app.core.app_meta import APP_VERSION, GITHUB_REPOSITORY
from app.core.config import (
    add_provider,
    delete_provider,
    get_providers,
    load_config,
    save_config,
    update_config,
    update_provider,
)
from app.core.desktop_shell import (
    get_desktop_window_state as get_desktop_shell_state,
    perform_window_action,
)
from app.core.network import get_lan_ipv4_addresses
from app.core.public_config import fetch_github_public_config
from app.core.update_checker import check_github_update

router = APIRouter()


# ── General settings ──────────────────────────────────────────────────────


@router.get("", response_model=SettingsResponse)
async def get_settings(request: Request):
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
    launch_raw = cfg.get("launch", {})
    launch_section = launch_raw if isinstance(launch_raw, dict) else {}
    launch_section = {
        "open_webui_on_start": bool(launch_section.get("open_webui_on_start", False)),
        "open_intro_on_first_start": bool(
            launch_section.get("open_intro_on_first_start", True)
        ),
        "show_console_on_start": bool(
            launch_section.get("show_console_on_start", False)
        ),
    }

    server_host = str(
        getattr(
            request.app.state, "runtime_host", server_section.get("host", "127.0.0.1")
        )
    )
    server_port_raw = getattr(
        request.app.state, "runtime_port", server_section.get("port", 8730)
    )
    try:
        server_port = int(server_port_raw)
    except (TypeError, ValueError):
        server_port = 8730

    runtime_lan_access = bool(getattr(request.app.state, "runtime_lan_access", False))
    if not runtime_lan_access:
        runtime_lan_access = (
            bool(server_section.get("lan_access")) or server_host == "0.0.0.0"
        )

    server_section["host"] = server_host
    server_section["port"] = server_port
    server_section["lan_access"] = runtime_lan_access

    runtime_lan_ipv4_list_raw = getattr(request.app.state, "runtime_lan_ipv4_list", [])
    lan_ipv4_list: list[str] = []
    if isinstance(runtime_lan_ipv4_list_raw, list):
        for item in runtime_lan_ipv4_list_raw:
            if not isinstance(item, str):
                continue
            value = item.strip()
            if not value or value in lan_ipv4_list:
                continue
            lan_ipv4_list.append(value)

    if runtime_lan_access and not lan_ipv4_list:
        lan_ipv4_list = get_lan_ipv4_addresses()
    elif not runtime_lan_access:
        lan_ipv4_list = []

    lan_url_list = [f"http://{lan_ipv4}:{server_port}" for lan_ipv4 in lan_ipv4_list]
    lan_docs_url_list = [f"{lan_url}/docs" for lan_url in lan_url_list]

    server_section["lan_ipv4_list"] = lan_ipv4_list
    server_section["lan_urls"] = lan_url_list
    server_section["lan_docs_urls"] = lan_docs_url_list

    # Backward compatibility (single-value fields)
    server_section["lan_ipv4"] = lan_ipv4_list[0] if lan_ipv4_list else ""
    server_section["lan_url"] = lan_url_list[0] if lan_url_list else ""
    server_section["lan_docs_url"] = lan_docs_url_list[0] if lan_docs_url_list else ""

    browser_host = "127.0.0.1" if server_host in {"0.0.0.0", "::"} else server_host
    server_section["webui_url"] = f"http://{browser_host}:{server_port}"
    server_section["docs_url"] = f"{server_section['webui_url']}/docs"

    server_section["app_version"] = APP_VERSION
    server_section["token_set"] = bool(server_section.get("token"))
    desktop_window_state = get_desktop_shell_state()
    server_section["desktop_shell_active"] = desktop_window_state["active"]
    server_section["desktop_shell_maximized"] = desktop_window_state["maximized"]
    server_section["ui_mode"] = (
        "desktop" if desktop_window_state["active"] else "browser"
    )
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
        launch=launch_section,
        sender=cfg.get("sender", {}),
        ai=ai_section,
        quick_overlay=cfg.get("quick_overlay", {}),
    )


@router.get("/desktop-window", response_model=DesktopWindowStateResponse)
async def get_desktop_window_state_route():
    """获取内嵌桌面窗口状态。"""
    state = get_desktop_shell_state()
    return DesktopWindowStateResponse(
        active=state["active"], maximized=state["maximized"]
    )


@router.post("/desktop-window/action", response_model=DesktopWindowStateResponse)
async def post_desktop_window_action(body: DesktopWindowActionRequest):
    """执行内嵌桌面窗口控制动作。"""
    state = get_desktop_shell_state()
    if not state["active"]:
        raise HTTPException(status_code=400, detail="当前未启用桌面内嵌窗口")

    if body.action == "toggle_maximize":
        success = (
            perform_window_action("restore")
            if state["maximized"]
            else perform_window_action("maximize")
        )
    elif body.action == "minimize":
        success = perform_window_action("minimize")
    else:
        success = perform_window_action("close")

    if not success:
        raise HTTPException(status_code=400, detail="窗口控制失败，请稍后重试")

    updated_state = get_desktop_shell_state()
    return DesktopWindowStateResponse(
        active=updated_state["active"],
        maximized=updated_state["maximized"],
    )


@router.get("/update-check", response_model=UpdateCheckResponse)
async def check_update():
    """检查 GitHub 是否有新版本。"""
    result = await check_github_update(
        current_version=APP_VERSION,
        repository=GITHUB_REPOSITORY,
    )
    return UpdateCheckResponse(
        success=result.success,
        current_version=result.current_version,
        latest_version=result.latest_version,
        update_available=result.update_available,
        release_url=result.release_url,
        published_at=result.published_at,
        message=result.message,
        error_type=result.error_type,
        status_code=result.status_code,
    )


@router.get("/public-config", response_model=PublicConfigResponse)
async def get_public_config():
    """获取 GitHub 远程公共配置（远程关闭或失败时默认不显示）。"""
    result = await fetch_github_public_config(load_config())
    return PublicConfigResponse(
        success=result.success,
        visible=result.visible,
        source_url=result.source_url,
        title=result.title,
        content=result.content,
        message=result.message,
        fetched_at=result.fetched_at,
        link_url=result.link_url,
        link_text=result.link_text,
        error_type=result.error_type,
        status_code=result.status_code,
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


@router.put("/launch", response_model=MessageResponse)
async def update_launch_settings(body: LaunchSettings):
    """更新启动行为设置。"""
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        return MessageResponse(message="没有需要更新的设置", success=False)

    update_config({"launch": patch})
    return MessageResponse(message="启动设置已更新，重启后生效")


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


@router.put("/quick-overlay", response_model=MessageResponse)
async def update_quick_overlay_settings(body: QuickOverlaySettings):
    """更新快捷悬浮窗设置。"""
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        return MessageResponse(message="没有需要更新的设置", success=False)

    if "trigger_hotkey" in patch:
        patch["trigger_hotkey"] = str(patch["trigger_hotkey"]).strip().lower()

    if "mouse_side_button" in patch:
        patch["mouse_side_button"] = str(patch["mouse_side_button"]).strip().lower()

    update_config({"quick_overlay": patch})
    return MessageResponse(message="快捷悬浮窗设置已更新，重启后生效")


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
