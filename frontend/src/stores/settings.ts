import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { settingsApi } from '@/api/settings'
import type { AllSettings, AIProvider, SenderSettings, ServerSettings, OverlaySettings } from '@/types/api'

export const useSettingsStore = defineStore('settings', () => {
    const isLoading = ref(false)
    const isDirty = ref(false)
    const lastSaved = ref<Date | null>(null)

    const sender = reactive<SenderSettings>({
        method: 'clipboard',
        chat_key: 't',
        delay_open_chat: 100,
        delay_after_paste: 50,
        delay_after_send: 50,
        focus_timeout: 5000,
        retry_count: 2,
        retry_interval: 300,
        delay_between_lines: 1500,
    })

    const server = reactive<ServerSettings>({
        host: '127.0.0.1',
        port: 8730,
        lan_access: false,
        token: '',
    })

    const overlay = reactive<OverlaySettings>({
        enabled: false,
        hotkey: 'F2',
        compact_mode: false,
        show_webui_send_status: true,
        mouse_side_button: false,
        poll_interval_ms: 200,
        bg_opacity: 0.85,
        accent_color: '#6c5ce7',
        font_size: 14,
    })

    const aiProviders = ref<AIProvider[]>([])
    const activeProvider = ref('')
    const systemPrompt = ref('')

    async function fetchSettings() {
        isLoading.value = true
        try {
            const s = await settingsApi.getAll()
            applySettings(s)
            isDirty.value = false
        } finally {
            isLoading.value = false
        }
    }

    function applySettings(s: AllSettings) {
        Object.assign(sender, s.sender || {})
        Object.assign(server, s.server || {})
        Object.assign(overlay, s.overlay || {})
        aiProviders.value = s.ai?.providers || []
        activeProvider.value = s.ai?.active_provider || ''
        systemPrompt.value = s.ai?.system_prompt || ''
    }

    async function saveSettings() {
        const data = {
            sender: { ...sender },
            server: { ...server },
            overlay: { ...overlay },
            ai: {
                providers: aiProviders.value,
                active_provider: activeProvider.value,
                system_prompt: systemPrompt.value,
            },
        }
        const result = await settingsApi.save(data)
        applySettings(result)
        isDirty.value = false
        lastSaved.value = new Date()
    }

    function markDirty() {
        isDirty.value = true
    }

    return {
        isLoading,
        isDirty,
        lastSaved,
        sender,
        server,
        overlay,
        aiProviders,
        activeProvider,
        systemPrompt,
        fetchSettings,
        saveSettings,
        markDirty,
    }
})
