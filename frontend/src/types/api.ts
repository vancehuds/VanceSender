// --- Text types ---
export type TextType = 'me' | 'do'

export interface TextItem {
    type: TextType
    content: string
}

// --- Preset ---
export interface Preset {
    id: string
    name: string
    texts: TextItem[]
    tags?: string[]
    created_at?: string
    updated_at?: string
}

// --- Send ---
export interface SendRequest {
    texts: TextItem[]
    delay_between_lines?: number
}

export interface SendProgress {
    current: number
    total: number
    status: 'sending' | 'paused' | 'cancelled' | 'done' | 'error'
}

export interface SendHistoryItem {
    id: string
    texts: TextItem[]
    timestamp: string
    success_count: number
    fail_count: number
    duration_ms: number
}

// --- AI ---
export interface AIGenerateRequest {
    scenario: string
    style?: string
    text_type?: 'mixed' | 'me' | 'do'
    count?: number
    temperature?: number
    provider_id?: string
}

export interface AIGenerateResult {
    texts: TextItem[]
    provider_id: string
    model: string
}

export interface AIHistoryItem {
    id: string
    scenario: string
    style?: string
    texts: TextItem[]
    timestamp: string
    starred: boolean
    provider_id?: string
}

// --- AI Provider ---
export interface AIProvider {
    id: string
    name: string
    base_url: string
    api_key: string
    model: string
    enabled: boolean
}

// --- Settings ---
export interface SenderSettings {
    method: 'clipboard' | 'typing'
    chat_key: string
    delay_open_chat: number
    delay_after_paste: number
    delay_after_send: number
    focus_timeout: number
    retry_count: number
    retry_interval: number
    delay_between_lines: number
    typing_char_delay?: number
}

export interface ServerSettings {
    host: string
    port: number
    lan_access: boolean
    token: string
}

export interface OverlaySettings {
    enabled: boolean
    hotkey: string
    compact_mode: boolean
    show_webui_send_status: boolean
    mouse_side_button: boolean
    poll_interval_ms: number
    bg_opacity: number
    accent_color: string
    font_size: number
}

export interface LaunchSettings {
    open_webui_on_start: boolean
    show_console_on_start: boolean
    enable_tray_on_start: boolean | 'auto'
    intro_seen: boolean
    open_intro_on_first_start: boolean
}

export interface AllSettings {
    sender: SenderSettings
    server: ServerSettings
    ai: {
        providers: AIProvider[]
        active_provider: string
        system_prompt: string
        custom_templates?: SceneTemplate[]
    }
    overlay: OverlaySettings
    launch: LaunchSettings
}

// --- Stats ---
export interface AppStats {
    total_sent: number
    total_success: number
    total_failed: number
    total_batches: number
    success_rate: number
    most_used_presets: { name: string; count: number }[]
}

// --- Scene Template ---
export interface SceneTemplate {
    id: string
    name: string
    icon: string
    scenario: string
    style?: string
}

// --- Update ---
export interface UpdateCheckResult {
    current_version: string
    latest_version: string
    update_available: boolean
    release_url?: string
    release_notes?: string
}

// --- Desktop ---
export interface DesktopContext {
    isDesktop: boolean
    token?: string
}

// --- Public Config ---
export interface PublicConfig {
    visible: boolean
    title?: string
    content?: string
    link_url?: string
    link_text?: string
}
