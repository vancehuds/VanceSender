"""Pydantic schemas for VanceSender API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


# ── Preset schemas ─────────────────────────────────────────────────────────


class TextLine(BaseModel):
    type: Literal["me", "do"] = "me"
    content: str


class PresetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    texts: list[TextLine] = Field(default_factory=list)


class PresetUpdate(BaseModel):
    name: str | None = None
    texts: list[TextLine] | None = None


class PresetResponse(BaseModel):
    id: str
    name: str
    texts: list[TextLine]
    created_at: str
    updated_at: str


# ── Sender schemas ─────────────────────────────────────────────────────────


class SendSingleRequest(BaseModel):
    text: str = Field(..., min_length=1, description="完整的发送文本，如 /me 打开车门")


class SendBatchRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, description="待发送的文本列表")
    delay_between: int | None = Field(
        None, ge=200, le=30000, description="每条消息间隔(ms)，留空使用默认值"
    )


class SendResponse(BaseModel):
    success: bool
    text: str
    error: str | None = None


class SendStatusResponse(BaseModel):
    sending: bool
    progress: dict[str, Any] = Field(default_factory=dict)


# ── AI schemas ─────────────────────────────────────────────────────────────


class AIGenerateRequest(BaseModel):
    scenario: str = Field(..., min_length=1, description="场景描述")
    provider_id: str | None = Field(None, description="使用的AI服务商ID，留空使用默认")
    count: int | None = Field(None, ge=1, le=30, description="期望生成的条数")
    text_type: Literal["me", "do", "mixed"] = Field("mixed", description="文本类型")
    style: str | None = Field(
        None,
        min_length=1,
        max_length=120,
        description="自定义生成风格，如'冷峻电影感'",
    )


class AIGenerateResponse(BaseModel):
    texts: list[TextLine]
    provider_id: str


class AIRewriteRequest(BaseModel):
    texts: list[TextLine] = Field(
        ...,
        min_length=1,
        max_length=80,
        description="需要重写的文本列表",
    )
    provider_id: str | None = Field(None, description="使用的AI服务商ID，留空使用默认")
    style: str | None = Field(
        None,
        min_length=1,
        max_length=120,
        description="重写风格，如'克制、压迫感'",
    )
    requirements: str | None = Field(
        None,
        min_length=1,
        max_length=500,
        description="额外要求，如'保留动作顺序并强化环境描写'",
    )


class AIRewriteResponse(BaseModel):
    texts: list[TextLine]
    provider_id: str


# ── Provider schemas ───────────────────────────────────────────────────────


class ProviderCreate(BaseModel):
    id: str | None = Field(None, description="自定义ID，留空自动生成")
    name: str = Field(..., min_length=1)
    api_base: str = Field(..., min_length=1)
    api_key: str = ""
    model: str = "gpt-4o"


class ProviderUpdate(BaseModel):
    name: str | None = None
    api_base: str | None = None
    api_key: str | None = None
    model: str | None = None


class ProviderResponse(BaseModel):
    id: str
    name: str
    api_base: str
    api_key_set: bool
    model: str


# ── Settings schemas ───────────────────────────────────────────────────────


class SenderSettings(BaseModel):
    method: Literal["clipboard", "typing"] | None = None
    chat_open_key: str | None = Field(None, min_length=1, max_length=1)
    delay_open_chat: int | None = Field(None, ge=50, le=5000)
    delay_after_paste: int | None = Field(None, ge=50, le=5000)
    delay_after_send: int | None = Field(None, ge=50, le=5000)
    delay_between_lines: int | None = Field(None, ge=200, le=30000)
    focus_timeout: int | None = Field(None, ge=0, le=30000)
    retry_count: int | None = Field(None, ge=0, le=5)
    retry_interval: int | None = Field(None, ge=50, le=5000)
    typing_char_delay: int | None = Field(None, ge=0, le=200)


class ServerSettings(BaseModel):
    lan_access: bool | None = None
    token: str | None = None


class AISettings(BaseModel):
    default_provider: str | None = None
    system_prompt: str | None = None
    custom_headers: dict[str, str] | None = None


class QuickOverlaySettings(BaseModel):
    enabled: bool | None = None
    show_webui_send_status: bool | None = None
    compact_mode: bool | None = None
    trigger_hotkey: str | None = None
    mouse_side_button: str | None = None
    poll_interval_ms: int | None = Field(None, ge=20, le=200)


class SettingsResponse(BaseModel):
    server: dict[str, Any]
    sender: dict[str, Any]
    ai: dict[str, Any]
    quick_overlay: dict[str, Any]


class UpdateCheckResponse(BaseModel):
    success: bool
    current_version: str
    latest_version: str | None = None
    update_available: bool
    release_url: str | None = None
    published_at: str | None = None
    message: str
    error_type: str | None = None
    status_code: int | None = None


class PublicConfigResponse(BaseModel):
    success: bool
    visible: bool
    source_url: str | None = None
    title: str | None = None
    content: str | None = None
    message: str
    fetched_at: str | None = None
    link_url: str | None = None
    link_text: str | None = None
    error_type: str | None = None
    status_code: int | None = None


# ── Generic ────────────────────────────────────────────────────────────────


class MessageResponse(BaseModel):
    message: str
    success: bool = True


class ProviderTestResponse(BaseModel):
    message: str
    success: bool
    response: str | None = None
    error_type: str | None = None
    status_code: int | None = None
    request_id: str | None = None
    body: Any | None = None
