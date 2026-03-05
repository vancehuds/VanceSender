import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Preset } from '@/types/api'
import { presetsApi } from '@/api/presets'

export const usePresetsStore = defineStore('presets', () => {
    const presets = ref<Preset[]>([])
    const isLoading = ref(false)
    const selectedTags = ref<string[]>([])
    const selectionMode = ref(false)
    const selectedIds = ref<Set<string>>(new Set())

    const allTags = computed(() => {
        const tagSet = new Set<string>()
        presets.value.forEach((p) => {
            p.tags?.forEach((t) => tagSet.add(t))
        })
        return Array.from(tagSet).sort()
    })

    const filteredPresets = computed(() => {
        if (selectedTags.value.length === 0) return presets.value
        return presets.value.filter((p) =>
            selectedTags.value.some((tag) => p.tags?.includes(tag))
        )
    })

    async function fetchPresets() {
        isLoading.value = true
        try {
            presets.value = await presetsApi.list()
        } finally {
            isLoading.value = false
        }
    }

    function toggleTag(tag: string) {
        const idx = selectedTags.value.indexOf(tag)
        if (idx >= 0) {
            selectedTags.value.splice(idx, 1)
        } else {
            selectedTags.value.push(tag)
        }
    }

    function clearTagFilter() {
        selectedTags.value = []
    }

    function toggleSelection(id: string) {
        if (selectedIds.value.has(id)) {
            selectedIds.value.delete(id)
        } else {
            selectedIds.value.add(id)
        }
    }

    function clearSelection() {
        selectedIds.value.clear()
        selectionMode.value = false
    }

    return {
        presets,
        isLoading,
        selectedTags,
        selectionMode,
        selectedIds,
        allTags,
        filteredPresets,
        fetchPresets,
        toggleTag,
        clearTagFilter,
        toggleSelection,
        clearSelection,
    }
})
