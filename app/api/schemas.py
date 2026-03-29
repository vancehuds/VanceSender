"""Pydantic schemas for VanceSender API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# ── Preset schemas ─────────────────────────────────────────────────────────


class TextLine(BaseModel):
    type: Literal["me", "do", "b", "e"] = "me"
    content: str


class PresetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    texts: list[TextLine] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list, max_length=10)
    sort_order: int = 0


class PresetUpdate(BaseModel):
    name: str | None = None
    texts: list[TextLine] | None = None
    tags: list[str] | None = None
    sort_order: int | None = None


class PresetResponse(BaseModel):
    id: str
    name: str
    texts: list[TextLine]
    tags: list[str] = Field(default_factory=list)
    sort_order: int = 0
    created_at: str
    updated_at: str


# ── Sender schemas ─────────────────────────────────────────────────────────


class SendSingleRequest(BaseModel):
    text: str = Field(..., min_length=1, description="完整的发送文本，如 /me 打开车门")
    source: Literal["webui", "quick_panel"] = Field(
        "webui",
        description="发送来源标识：webui 或 quick_panel",
    )


class SendBatchRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, description="待发送的文本列表")
    delay_between: int | None = Field(
        None, ge=200, le=30000, description="每条消息间隔(ms)，留空使用默认值"
    )
    source: Literal["webui", "quick_panel"] = Field(
        "webui",
        description="发送来源标识：webui 或 quick_panel",
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
    temperature: float | None = Field(
        None,
        ge=0.0,
        le=2.0,
        description="生成温度(0-2)，值越高越有创意，留空使用默认0.8",
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
    temperature: float | None = Field(
        None,
        ge=0.0,
        le=2.0,
        description="生成温度(0-2)，值越高越有创意，留空使用默认0.7",
    )


class AIRewriteResponse(BaseModel):
    texts: list[TextLine]
    provider_id: str


# ── Conversation Tree (Advanced AI) schemas ────────────────────────────────


class ConvTreeInitRequest(BaseModel):
    scenario: str = Field(..., min_length=1, description="场景描述")
    plot_style: str | None = Field(
        None,
        max_length=120,
        description="剧情风格，控制AI生成文本的笔触和氛围，如'冷峻电影感'、'黑色幽默'",
    )
    provider_id: str | None = Field(None, description="AI服务商ID")
    temperature: float | None = Field(
        None, ge=0.0, le=2.0, description="生成温度"
    )


class ConvTreeNextRequest(BaseModel):
    scenario: str = Field(..., min_length=1, description="原始场景描述")
    conversation_history: list[dict[str, Any]] = Field(
        ..., description="对话历史 [{role: 'node'|'path', content: '...'}]"
    )
    chosen_reply: str = Field(..., min_length=1, description="对方的实际回复")
    plot_tendency: str | None = Field(
        None,
        max_length=200,
        description="剧情倾向，引导AI朝用户期望的方向发展剧情",
    )
    plot_style: str | None = Field(
        None,
        max_length=120,
        description="剧情风格，控制AI生成文本的笔触和氛围，如'冷峻电影感'、'黑色幽默'",
    )
    provider_id: str | None = Field(None, description="AI服务商ID")
    temperature: float | None = Field(
        None, ge=0.0, le=2.0, description="生成温度"
    )


class ConvTreeWrapupRequest(BaseModel):
    scenario: str = Field(..., min_length=1, description="原始场景描述")
    conversation_history: list[dict[str, Any]] = Field(
        ..., description="对话历史"
    )
    provider_id: str | None = Field(None, description="AI服务商ID")
    temperature: float | None = Field(
        None, ge=0.0, le=2.0, description="生成温度"
    )


class ConvTreePath(BaseModel):
    id: int
    label: str = Field(description="简短标签")
    content: str = Field(description="完整回复内容")


class ConvTreeResponse(BaseModel):
    node: list[TextLine]
    paths: list[ConvTreePath]
    provider_id: str


class ConvTreeWrapupResponse(BaseModel):
    node: list[TextLine]
    provider_id: str


# ── Provider schemas ───────────────────────────────────────────────────────


class ProviderCreate(BaseModel):
    id: str | None = Field(None, description="自定义ID，留空自动生成")
    name: str = Field(..., min_length=1)
    type: Literal["openai", "gemini"] = Field("openai", description="供应商类型")
    api_base: str = Field("", description="API地址（OpenAI类型必填，Gemini类型无需填写）")
    api_key: str = ""
    model: str = "gpt-4o"


class ProviderUpdate(BaseModel):
    name: str | None = None
    type: Literal["openai", "gemini"] | None = None
    api_base: str | None = None
    api_key: str | None = None
    model: str | None = None


class ProviderResponse(BaseModel):
    id: str
    name: str
    type: str = "openai"
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


class LaunchSettings(BaseModel):
    open_webui_on_start: bool | None = None
    open_intro_on_first_start: bool | None = None
    onboarding_done: bool | None = None
    show_console_on_start: bool | None = None
    enable_tray_on_start: bool | None = None
    # Deprecated input key, kept for backward compatibility.
    start_minimized_to_tray: bool | None = None
    close_action: Literal["ask", "minimize_to_tray", "exit"] | None = None


class DesktopWindowActionRequest(BaseModel):
    action: Literal[
        "minimize",
        "toggle_maximize",
        "close",
        "hide_to_tray",
        "exit",
    ]


class QuickPanelWindowActionRequest(BaseModel):
    action: Literal["minimize", "close", "dismiss"]


class DesktopWindowStateResponse(BaseModel):
    active: bool
    maximized: bool


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


class TunnelSettings(BaseModel):
    mode: Literal["quick", "named"] | None = None
    named_token: str | None = None
    auto_start: bool | None = None




class ServerSettingsResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    host: str = "127.0.0.1"
    port: int = 8730
    lan_access: bool = False
    token_set: bool = False
    app_version: str = ""
    webui_url: str = ""
    docs_url: str = ""
    ui_mode: str = "browser"
    desktop_shell_active: bool = False
    desktop_shell_maximized: bool = False
    system_tray_supported: bool = False
    lan_ipv4_list: list[str] = Field(default_factory=list)
    lan_urls: list[str] = Field(default_factory=list)
    lan_docs_urls: list[str] = Field(default_factory=list)
    risk_no_token_with_lan: bool = False
    security_warning: str = ""


class LaunchSettingsResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    open_webui_on_start: bool = False
    open_intro_on_first_start: bool = True
    onboarding_done: bool = False
    show_console_on_start: bool = False
    enable_tray_on_start: bool = True
    close_action: str = "ask"


class SenderSettingsResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    method: str = "clipboard"
    chat_open_key: str = "t"
    delay_open_chat: int = 450
    delay_after_paste: int = 160
    delay_after_send: int = 260
    delay_between_lines: int = 1800
    focus_timeout: int = 8000
    retry_count: int = 3
    retry_interval: int = 450
    typing_char_delay: int = 18


class AISettingsResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    default_provider: str = ""
    system_prompt: str = ""
    providers: list[dict[str, Any]] = Field(default_factory=list)
    custom_headers: dict[str, str] = Field(default_factory=dict)


class QuickOverlaySettingsResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    enabled: bool = True
    show_webui_send_status: bool = True
    compact_mode: bool = False
    trigger_hotkey: str = "f7"
    mouse_side_button: str = ""
    poll_interval_ms: int = 40


class TunnelSettingsResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    mode: str = "quick"
    named_token_set: bool = False
    auto_start: bool = False


class SettingsResponse(BaseModel):
    server: ServerSettingsResponse
    launch: LaunchSettingsResponse
    sender: SenderSettingsResponse
    ai: AISettingsResponse
    quick_overlay: QuickOverlaySettingsResponse
    tunnel: TunnelSettingsResponse


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


# ── Preset import/export ───────────────────────────────────────────────────


class PresetImportResponse(BaseModel):
    imported: int = Field(description="成功导入的预设数量")
    skipped: int = Field(description="跳过的预设数量（格式不合法等）")
    errors: list[str] = Field(default_factory=list, description="导入过程中的错误信息")
    message: str


class PresetBatchDeleteResponse(BaseModel):
    message: str
    deleted: int = Field(description="成功删除的预设数量")
    failed: int = Field(description="删除失败的预设数量")


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


# ── Notifications ──────────────────────────────────────────────────────────


# ── Tunnel schemas ─────────────────────────────────────────────────────────


class TunnelStartRequest(BaseModel):
    mode: Literal["quick", "named"] = Field("quick", description="隧道模式: quick=零配置 | named=自定义域名")
    named_token: str = Field("", description="named模式下的隧道令牌")


class TunnelStatusResponse(BaseModel):
    status: Literal["stopped", "starting", "running", "error"]
    mode: str = ""
    public_url: str = ""
    error: str = ""
    pid: int | None = None
    started_at: float = 0.0
    auto_generated_token: str = ""


# ── Notifications ──────────────────────────────────────────────────────────


class NotificationItem(BaseModel):
    level: str
    message: str
    timestamp: float


class NotificationsResponse(BaseModel):
    notifications: list[NotificationItem]
