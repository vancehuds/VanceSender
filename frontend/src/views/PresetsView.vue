<template>
  <div class="panel">
    <header class="panel-header">
      <h1>{{ t('presets.title') }}</h1>
      <div class="header-actions">
        <button v-if="presetsStore.selectionMode" class="btn btn-danger btn-sm" @click="batchDelete">
          {{ t('presets.deleteSelected') }} ({{ presetsStore.selectedIds.size }})
        </button>
        <button v-if="presetsStore.selectionMode" class="btn btn-ghost btn-sm" @click="presetsStore.clearSelection()">
          {{ t('presets.cancelSelect') }}
        </button>
        <button v-else class="btn btn-ghost btn-sm" @click="presetsStore.selectionMode = true">
          {{ t('presets.multiSelect') }}
        </button>
        <button class="btn btn-secondary btn-sm" @click="triggerImport">{{ t('presets.importBtn') }}</button>
        <button class="btn btn-ghost btn-sm" @click="exportAll">{{ t('presets.exportAll') }}</button>
        <button class="btn btn-ghost btn-sm" @click="presetsStore.fetchPresets()">↻</button>
        <input ref="fileInput" type="file" accept=".json" class="hidden" @change="handleFileImport" />
      </div>
    </header>

    <!-- Tag Filter -->
    <div v-if="presetsStore.allTags.length" class="tag-filter-bar">
      <button
        v-for="tag in presetsStore.allTags" :key="tag"
        class="tag-pill" :class="{ active: presetsStore.selectedTags.includes(tag) }"
        @click="presetsStore.toggleTag(tag)"
      >{{ tag }}</button>
      <button v-if="presetsStore.selectedTags.length" class="tag-pill tag-clear" @click="presetsStore.clearTagFilter()">清除筛选</button>
    </div>

    <!-- Presets Grid -->
    <div class="presets-grid">
      <div v-if="presetsStore.isLoading" class="loading-spinner"></div>
      <div v-else-if="presetsStore.filteredPresets.length === 0" class="empty-state">
        <p>{{ t('presets.emptyState') }}</p>
      </div>
      <div
        v-for="preset in presetsStore.filteredPresets" :key="preset.id"
        class="preset-card glass-card"
        :class="{ selected: presetsStore.selectedIds.has(preset.id) }"
        @click="presetsStore.selectionMode ? presetsStore.toggleSelection(preset.id) : loadPreset(preset)"
      >
        <div v-if="presetsStore.selectionMode" class="select-check">
          <input type="checkbox" :checked="presetsStore.selectedIds.has(preset.id)" />
        </div>
        <div class="preset-info">
          <h3>{{ preset.name }}</h3>
          <span class="preset-count">{{ preset.texts.length }} 条文本</span>
        </div>
        <div v-if="preset.tags?.length" class="preset-tags">
          <span v-for="tag in preset.tags" :key="tag" class="mini-tag">{{ tag }}</span>
        </div>
        <div class="preset-actions" @click.stop>
          <button class="btn-icon-sm" title="删除" @click="deletePreset(preset.id)">🗑️</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { usePresetsStore } from '@/stores/presets'
import { useSenderStore } from '@/stores/sender'
import { useToast } from '@/composables/useToast'
import { presetsApi } from '@/api/presets'
import type { Preset } from '@/types/api'

const { t } = useI18n()
const router = useRouter()
const presetsStore = usePresetsStore()
const senderStore = useSenderStore()
const { showToast } = useToast()
const fileInput = ref<HTMLInputElement>()

function loadPreset(preset: Preset) {
  senderStore.loadPreset(preset.id, preset.name, preset.texts)
  showToast({ message: `已加载预设: ${preset.name}`, type: 'success' })
  router.push('/send')
}

async function deletePreset(id: string) {
  try {
    await presetsApi.delete(id)
    await presetsStore.fetchPresets()
    showToast({ message: '已删除', type: 'success' })
  } catch { showToast({ message: '删除失败', type: 'error' }) }
}

async function batchDelete() {
  const ids = Array.from(presetsStore.selectedIds)
  if (!ids.length) return
  try {
    await presetsApi.deleteMany(ids)
    presetsStore.clearSelection()
    await presetsStore.fetchPresets()
    showToast({ message: `已删除 ${ids.length} 个预设`, type: 'success' })
  } catch { showToast({ message: '批量删除失败', type: 'error' }) }
}

function triggerImport() { fileInput.value?.click() }

async function handleFileImport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    const presets = Array.isArray(data) ? data : [data]
    await presetsApi.import(presets)
    await presetsStore.fetchPresets()
    showToast({ message: `已导入 ${presets.length} 个预设`, type: 'success' })
  } catch { showToast({ message: '导入失败', type: 'error' }) }
}

async function exportAll() {
  try {
    const data = await presetsApi.exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'presets.json'; a.click()
    URL.revokeObjectURL(url)
  } catch { showToast({ message: '导出失败', type: 'error' }) }
}

onMounted(() => { presetsStore.fetchPresets() })
</script>

<style scoped>
.panel { padding: 24px 32px; max-width: var(--content-max-width); margin: 0 auto; }
.panel-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
.panel-header h1 { font-size: var(--font-size-2xl); font-weight: 700; }
.header-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.hidden { display: none; }
.tag-filter-bar { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; }
.tag-pill { padding: 5px 14px; border-radius: 20px; font-size: var(--font-size-xs); background: rgba(0,0,0,0.2); color: var(--text-secondary); transition: all 0.2s; cursor: pointer; }
.tag-pill.active { background: var(--accent-primary-glow); color: var(--accent-primary); border: 1px solid var(--accent-primary); }
.tag-pill.tag-clear { color: var(--accent-danger); }
.presets-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.preset-card { padding: 16px 20px; cursor: pointer; transition: all 0.2s ease; display: flex; flex-direction: column; gap: 8px; }
.preset-card:hover { border-color: var(--accent-primary); }
.preset-card.selected { border-color: var(--accent-primary); background: rgba(108,92,231,0.1); }
.select-check { position: absolute; top: 12px; right: 12px; }
.preset-info h3 { font-size: var(--font-size-base); font-weight: 600; margin-bottom: 2px; }
.preset-count { font-size: var(--font-size-xs); color: var(--text-muted); }
.preset-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.mini-tag { padding: 2px 8px; border-radius: 10px; font-size: 0.65rem; background: rgba(148,163,184,0.1); color: var(--text-muted); }
.preset-actions { display: flex; gap: 6px; margin-top: auto; }
.btn-icon-sm { padding: 4px; border-radius: 6px; font-size: 0.8rem; transition: background 0.15s; }
.btn-icon-sm:hover { background: rgba(239,68,68,0.15); }
.empty-state { text-align: center; padding: 60px 20px; color: var(--text-muted); grid-column: 1 / -1; }
.btn { padding: 8px 18px; border-radius: var(--btn-radius); font-size: var(--font-size-sm); font-weight: 500; transition: var(--btn-transition); display: inline-flex; align-items: center; gap: 6px; }
.btn-primary { background: var(--accent-primary); color: white; }
.btn-secondary { background: rgba(108,92,231,0.15); color: var(--accent-primary); border: 1px solid rgba(108,92,231,0.3); }
.btn-ghost { color: var(--text-secondary); }
.btn-ghost:hover { color: var(--text-main); background: rgba(148,163,184,0.08); }
.btn-danger { background: var(--accent-danger); color: white; }
.btn-sm { padding: 5px 12px; font-size: var(--font-size-xs); }
@media (max-width: 768px) { .panel { padding: 16px; } .presets-grid { grid-template-columns: 1fr; } }
</style>
