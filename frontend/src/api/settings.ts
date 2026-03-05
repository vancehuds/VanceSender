import { apiGet, apiPost, apiPut, apiDelete } from './client'
import type { AllSettings, AIProvider, UpdateCheckResult, PublicConfig } from '@/types/api'

export const settingsApi = {
    /** Get all settings */
    getAll() {
        return apiGet<AllSettings>('/settings')
    },

    /** Save settings (partial update) */
    save(data: Record<string, unknown>) {
        return apiPost<AllSettings>('/settings', data)
    },

    /** Check for updates */
    checkUpdate(includePrerelease = false) {
        const params = includePrerelease ? '?include_prerelease=true' : ''
        return apiGet<UpdateCheckResult>(`/settings/check-update${params}`)
    },

    /** Get runtime info (host, port, lan, etc.) */
    runtimeInfo() {
        return apiGet<{
            host: string
            port: number
            lan_access: boolean
            lan_ipv4_list: string[]
            webview_available: boolean
            tray_supported: boolean
            version: string
            desktop_close_action?: string
        }>('/settings/runtime-info')
    },

    /** Get public config (remote announcements) */
    publicConfig() {
        return apiGet<PublicConfig>('/settings/public-config')
    },

    /** Get AI providers */
    getProviders() {
        return apiGet<AIProvider[]>('/settings/providers')
    },

    /** Add AI provider */
    addProvider(data: Omit<AIProvider, 'id'>) {
        return apiPost<AIProvider>('/settings/providers', data)
    },

    /** Update AI provider */
    updateProvider(id: string, data: Partial<AIProvider>) {
        return apiPut<AIProvider>(`/settings/providers/${id}`, data)
    },

    /** Delete AI provider */
    deleteProvider(id: string) {
        return apiDelete<void>(`/settings/providers/${id}`)
    },

    /** Test AI provider connection */
    testProvider(id: string) {
        return apiPost<{ success: boolean; message: string; model?: string }>(`/settings/providers/${id}/test`)
    },
}
