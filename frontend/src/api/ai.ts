import { api, apiGet, apiPost, apiDelete } from './client'
import type { AIGenerateRequest, AIHistoryItem } from '@/types/api'

export const aiApi = {
    /** Generate AI text (streaming) */
    generateStream(data: AIGenerateRequest) {
        return api<ReadableStream>('/ai/generate', {
            method: 'POST',
            body: data,
            responseType: 'stream' as any,
        })
    },

    /** Generate AI text (non-streaming) */
    generate(data: AIGenerateRequest) {
        return apiPost<{ texts: { type: string; content: string }[] }>('/ai/generate', data)
    },

    /** Get scene templates */
    templates() {
        return apiGet<{ id: string; name: string; icon: string; scenario: string; style?: string }[]>('/ai/templates')
    },

    /** Get AI generation history */
    history() {
        return apiGet<AIHistoryItem[]>('/ai/history')
    },

    /** Toggle star on history item */
    toggleStar(id: string) {
        return apiPost<void>(`/ai/history/${id}/star`)
    },

    /** Delete a history item */
    deleteHistory(id: string) {
        return apiDelete<void>(`/ai/history/${id}`)
    },

    /** Clear non-starred history */
    clearUnstarredHistory() {
        return apiPost<void>('/ai/history/clear')
    },
}
