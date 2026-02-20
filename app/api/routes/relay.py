"""Relay routes for secure remote access bridging."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.schemas import (
    MessageResponse,
    RelaySettingsUpdateRequest,
    RelayStatusResponse,
)
from app.core.config import update_config
from app.core.relay_client import relay_client

router = APIRouter()


def _normalize_server_url(raw: object) -> str:
    value = str(raw or "").strip()
    if not value:
        return ""
    if not value.startswith(("http://", "https://")):
        value = f"https://{value}"
    return value.rstrip("/")


@router.get("/status", response_model=RelayStatusResponse)
async def get_relay_status():
    """获取中继服务当前状态。"""
    return RelayStatusResponse(**relay_client.get_status())


@router.put("/settings", response_model=MessageResponse)
async def update_relay_settings(body: RelaySettingsUpdateRequest):
    """更新中继设置。"""
    patch = body.model_dump(exclude_unset=True)
    relay_patch: dict[str, object] = {}

    if "enabled" in patch:
        relay_patch["enabled"] = bool(patch.get("enabled"))

    if "server_url" in patch:
        relay_patch["server_url"] = _normalize_server_url(patch.get("server_url"))

    if patch.get("clear_card_key"):
        relay_patch["card_key"] = ""
    elif "card_key" in patch:
        relay_patch["card_key"] = str(patch.get("card_key") or "").strip()

    if relay_patch:
        update_config({"relay": relay_patch})

    if "enabled" in relay_patch and not bool(relay_patch["enabled"]):
        relay_client.refresh_pairing()

    if "server_url" in relay_patch or "card_key" in relay_patch:
        relay_client.refresh_pairing()

    return MessageResponse(message="中继设置已更新")


@router.post("/refresh-pairing", response_model=MessageResponse)
async def refresh_relay_pairing():
    """手动刷新二维码与配对码。"""
    relay_client.refresh_pairing()
    return MessageResponse(message="已触发配对信息刷新")
