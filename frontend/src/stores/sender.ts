import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TextItem } from '@/types/api'

export const useSenderStore = defineStore('sender', () => {
    const texts = ref<TextItem[]>([])
    const isSending = ref(false)
    const sendTaskId = ref<string | null>(null)
    const sendProgress = ref({ current: 0, total: 0 })
    const delay = ref(1500)

    // Current loaded preset tracking
    const currentPresetId = ref<string | null>(null)
    const currentPresetName = ref<string | null>(null)
    const hasUnsavedChanges = ref(false)

    const totalCount = computed(() => texts.value.length)
    const isEmpty = computed(() => texts.value.length === 0)

    function setTexts(newTexts: TextItem[]) {
        texts.value = [...newTexts]
    }

    function addText(item: TextItem) {
        texts.value.push(item)
        hasUnsavedChanges.value = true
    }

    function removeText(index: number) {
        texts.value.splice(index, 1)
        hasUnsavedChanges.value = true
    }

    function updateText(index: number, item: TextItem) {
        texts.value[index] = { ...item }
        hasUnsavedChanges.value = true
    }

    function moveText(fromIndex: number, toIndex: number) {
        const item = texts.value.splice(fromIndex, 1)[0]
        texts.value.splice(toIndex, 0, item)
        hasUnsavedChanges.value = true
    }

    function clearTexts() {
        texts.value = []
        currentPresetId.value = null
        currentPresetName.value = null
        hasUnsavedChanges.value = false
    }

    function loadPreset(id: string, name: string, presetTexts: TextItem[]) {
        texts.value = [...presetTexts]
        currentPresetId.value = id
        currentPresetName.value = name
        hasUnsavedChanges.value = false
    }

    return {
        texts,
        isSending,
        sendTaskId,
        sendProgress,
        delay,
        currentPresetId,
        currentPresetName,
        hasUnsavedChanges,
        totalCount,
        isEmpty,
        setTexts,
        addText,
        removeText,
        updateText,
        moveText,
        clearTexts,
        loadPreset,
    }
})
