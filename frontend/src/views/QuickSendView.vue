<template>
  <div class="panel">
    <header class="panel-header">
      <h1>{{ t('quickSend.title') }}</h1>
    </header>

    <div class="quick-send-container">
      <!-- Preset Selector -->
      <div class="bento-card glass-card toolbar-pill" style="--anim-delay: 0.1s">
        <div class="pill-content">
          <div class="pill-label">
            <div class="icon-glow glow-purple" style="width: 16px; height: 16px; filter: blur(6px);"></div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"
              style="position:relative; z-index:2; color:var(--accent-purple);">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
            </svg>
            <span>{{ t('quickSend.selectPreset') }}</span>
          </div>
          <div class="preset-controls">
            <select v-model="selectedPresetId" class="select-sm pill-select" @change="loadSelectedPreset">
              <option value="">暂无预设</option>
              <option v-for="preset in presetsStore.presets" :key="preset.id" :value="preset.id">
                {{ preset.name }}
              </option>
            </select>
            <button class="btn btn-sm btn-ghost btn-icon" title="刷新" @click="presetsStore.fetchPresets()">↻</button>
          </div>
        </div>
      </div>

      <!-- Quick Send List -->
      <div class="quick-send-list">
        <div v-if="loadedTexts.length === 0" class="empty-state small">
          <p>{{ t('quickSend.emptyState') }}</p>
        </div>
        <div
          v-for="(item, index) in loadedTexts"
          :key="index"
          class="quick-send-item glass-card"
          style="--anim-delay: 0s"
          @click="sendSingle(item, index)"
        >
          <span class="qs-type" :class="{ 'type-me': item.type === 'me', 'type-do': item.type === 'do' }">
            /{{ item.type }}
          </span>
          <span class="qs-content">{{ item.content }}</span>
          <span class="qs-action">发送 →</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePresetsStore } from '@/stores/presets'
import { useToast } from '@/composables/useToast'
import { senderApi } from '@/api/sender'
import type { TextItem } from '@/types/api'

const { t } = useI18n()
const presetsStore = usePresetsStore()
const { showToast } = useToast()

const selectedPresetId = ref('')
const loadedTexts = ref<TextItem[]>([])

function loadSelectedPreset() {
  const preset = presetsStore.presets.find(p => p.id === selectedPresetId.value)
  loadedTexts.value = preset ? [...preset.texts] : []
}

async function sendSingle(item: TextItem, _index: number) {
  try {
    await senderApi.send({ texts: [item] })
    showToast({ message: `已发送: /${item.type} ${item.content.slice(0, 30)}...`, type: 'success' })
  } catch {
    showToast({ message: '发送失败', type: 'error' })
  }
}

onMounted(() => {
  presetsStore.fetchPresets()
})
</script>

<style scoped>
.panel {
  padding: 24px 32px;
  max-width: var(--content-max-width);
  margin: 0 auto;
}

.panel-header {
  display: flex;
  align-items: center;
  margin-bottom: 24px;
}

.panel-header h1 {
  font-size: var(--font-size-2xl);
  font-weight: 700;
}

.quick-send-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar-pill {
  padding: 12px 18px;
}

.pill-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pill-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-secondary);
}

.preset-controls {
  display: flex;
  gap: 6px;
  align-items: center;
}

.select-sm, .pill-select {
  padding: 6px 12px;
  font-size: var(--font-size-sm);
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 8px;
  color: var(--text-main);
}

.quick-send-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quick-send-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.quick-send-item:hover {
  transform: translateX(4px);
  border-color: var(--accent-primary);
}

.qs-type {
  font-size: var(--font-size-xs);
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  flex-shrink: 0;
}

.type-me {
  background: rgba(34, 211, 238, 0.15);
  color: var(--accent-cyan);
}

.type-do {
  background: rgba(167, 139, 250, 0.15);
  color: var(--accent-purple);
}

.qs-content {
  flex: 1;
  font-size: var(--font-size-sm);
  word-break: break-word;
}

.qs-action {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.quick-send-item:hover .qs-action {
  opacity: 1;
  color: var(--accent-primary);
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-muted);
}

.btn { padding: 8px 18px; border-radius: var(--btn-radius); font-size: var(--font-size-sm); font-weight: 500; transition: var(--btn-transition); }
.btn-sm { padding: 5px 12px; font-size: var(--font-size-xs); }
.btn-ghost { color: var(--text-secondary); }
.btn-ghost:hover { color: var(--text-main); background: rgba(148,163,184,0.08); }
.btn-icon { padding: 5px 8px; }

@media (max-width: 768px) {
  .panel { padding: 16px; }
}
</style>
