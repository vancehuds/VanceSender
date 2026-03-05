import { apiGet, apiPost } from './client'
import type { SendRequest, SendHistoryItem } from '@/types/api'

export const senderApi = {
    /** Send texts to game */
    send(data: SendRequest) {
        return apiPost<{ task_id: string }>('/send', data)
    },

    /** Cancel an active send */
    cancel(taskId: string) {
        return apiPost<void>(`/send/${taskId}/cancel`)
    },

    /** Get send history */
    history() {
        return apiGet<SendHistoryItem[]>('/send/history')
    },

    /** Clear send history */
    clearHistory() {
        return apiPost<void>('/send/history/clear')
    },
}
