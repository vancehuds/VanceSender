import { defineStore } from 'pinia'
import { ref } from 'vue'
import { statsApi } from '@/api/stats'
import type { AppStats } from '@/types/api'

export const useStatsStore = defineStore('stats', () => {
    const isLoading = ref(false)
    const data = ref<AppStats>({
        total_sent: 0,
        total_success: 0,
        total_failed: 0,
        total_batches: 0,
        success_rate: 0,
        most_used_presets: [],
    })

    async function fetchStats() {
        isLoading.value = true
        try {
            data.value = await statsApi.get()
        } finally {
            isLoading.value = false
        }
    }

    return {
        isLoading,
        data,
        fetchStats,
    }
})
