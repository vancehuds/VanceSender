import { defineStore } from 'pinia'
import { ref } from 'vue'
import { aiApi } from '@/api/ai'
import type { TextItem, AIHistoryItem, SceneTemplate } from '@/types/api'

export const useAIStore = defineStore('ai', () => {
    // Generation state
    const scenario = ref('')
    const style = ref('')
    const textType = ref<'mixed' | 'me' | 'do'>('mixed')
    const count = ref<number | undefined>(undefined)
    const temperature = ref(0.8)
    const isGenerating = ref(false)
    const generatedTexts = ref<TextItem[]>([])

    // Templates
    const sceneTemplates = ref<SceneTemplate[]>([])

    // History
    const history = ref<AIHistoryItem[]>([])
    const historyLoading = ref(false)

    async function fetchTemplates() {
        try {
            sceneTemplates.value = await aiApi.templates()
        } catch {
            // templates may not be available
        }
    }

    async function generate() {
        if (!scenario.value.trim() || isGenerating.value) return

        isGenerating.value = true
        generatedTexts.value = []

        try {
            const result = await aiApi.generate({
                scenario: scenario.value,
                style: style.value || undefined,
                text_type: textType.value,
                count: count.value || undefined,
                temperature: temperature.value,
            })
            generatedTexts.value = result.texts as TextItem[]
            return result.texts.length
        } finally {
            isGenerating.value = false
        }
    }

    async function fetchHistory() {
        historyLoading.value = true
        try {
            history.value = await aiApi.history()
        } finally {
            historyLoading.value = false
        }
    }

    async function toggleStar(id: string) {
        await aiApi.toggleStar(id)
        const item = history.value.find(h => h.id === id)
        if (item) item.starred = !item.starred
    }

    async function clearUnstarredHistory() {
        await aiApi.clearUnstarredHistory()
        history.value = history.value.filter(h => h.starred)
    }

    function applyTemplate(tmpl: SceneTemplate) {
        scenario.value = tmpl.scenario
        if (tmpl.style) style.value = tmpl.style
    }

    function reset() {
        scenario.value = ''
        style.value = ''
        textType.value = 'mixed'
        count.value = undefined
        temperature.value = 0.8
        generatedTexts.value = []
    }

    return {
        scenario,
        style,
        textType,
        count,
        temperature,
        isGenerating,
        generatedTexts,
        sceneTemplates,
        history,
        historyLoading,
        fetchTemplates,
        generate,
        fetchHistory,
        toggleStar,
        clearUnstarredHistory,
        applyTemplate,
        reset,
    }
})
