import { apiGet } from './client'
import type { AppStats } from '@/types/api'

export const statsApi = {
    /** Get application stats */
    get() {
        return apiGet<AppStats>('/stats')
    },
}
