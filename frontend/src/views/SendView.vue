<template>
  <div class="panel">
    <header class="panel-header">
      <h1>{{ t('send.title') }}</h1>
      <span v-if="senderStore.currentPresetName" class="preset-badge">
        📋 {{ senderStore.currentPresetName }}
        <span v-if="senderStore.hasUnsavedChanges" class="unsaved-dot" title="有未保存的修改"></span>
      </span>
    </header>

    <div class="send-container">
      <!-- Input Controls -->
      <VCard title="输入控制" :anim-delay="'0.1s'">
        <template #icon>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </template>
        <template #header-right>
          <div class="input-actions">
            <span class="hint">{{ t('send.importHint') }}</span>
            <VButton size="sm" variant="primary" @click="showImportModal = true">{{ t('send.importBtn') }}</VButton>
            <VButton size="sm" variant="ghost" @click="clearAllTexts">{{ t('send.clearBtn') }}</VButton>
          </div>
        </template>
      </VCard>

      <!-- Text List with Drag & Drop -->
      <div class="bento-card glass-card" style="--anim-delay: 0.2s">
        <div class="list-controls">
          <span class="list-count">共 <strong>{{ senderStore.totalCount }}</strong> 条文本</span>
          <div class="bulk-actions">
            <VButton size="sm" variant="ghost" @click="addNewItem">{{ t('send.addItem') }}</VButton>
            <VButton size="sm" variant="outline" :disabled="!senderStore.currentPresetId" @click="saveCurrentPreset">{{ t('send.saveCurrent') }}</VButton>
            <VButton size="sm" variant="outline" @click="showSaveModal = true">{{ t('send.saveAsPreset') }}</VButton>
          </div>
        </div>

        <div class="text-list">
          <VEmpty v-if="senderStore.isEmpty" icon="📝" :text="t('send.emptyState')" />
          <VueDraggable
            v-else
            v-model="senderStore.texts"
            :animation="200"
            handle=".drag-handle"
            ghost-class="drag-ghost"
            chosen-class="drag-chosen"
            class="drag-container"
          >
            <div
              v-for="(item, index) in senderStore.texts"
              :key="index"
              class="text-item"
            >
              <div class="drag-handle" title="拖拽排序">⠿</div>
              <div class="text-item-type">
                <select :value="item.type" @change="updateItemType(index, ($event.target as HTMLSelectElement).value as 'me' | 'do')">
                  <option value="me">/me</option>
                  <option value="do">/do</option>
                </select>
              </div>
              <div class="text-item-content" @dblclick="openEdit(index)">
                {{ item.content || '(空内容 — 双击编辑)' }}
              </div>
              <div class="text-item-actions">
                <button class="btn-icon-sm" title="编辑" @click="openEdit(index)">✏️</button>
                <button class="btn-icon-sm btn-icon-danger" title="删除" @click="senderStore.removeText(index)">✕</button>
              </div>
            </div>
          </VueDraggable>
        </div>
      </div>

      <!-- Send Bottom Bar -->
      <div class="bento-card glass-card send-bottom-bar" style="--anim-delay: 0.3s">
        <div class="sending-controls">
          <div class="delay-control">
            <label>{{ t('send.delay') }}</label>
            <input v-model.number="senderStore.delay" type="number" min="100" step="100" class="input-sm" />
          </div>

          <div v-if="senderStore.isSending" class="progress-area">
            <VProgressBar
              :current="senderStore.sendProgress.current"
              :total="senderStore.sendProgress.total"
              :active="true"
              :text="t('send.sending', { current: senderStore.sendProgress.current, total: senderStore.sendProgress.total })"
            >
              <template #action>
                <VButton size="sm" variant="danger" @click="cancelSend">{{ t('send.cancel') }}</VButton>
              </template>
            </VProgressBar>
          </div>

          <VButton
            v-else
            variant="primary"
            size="lg"
            glow
            class="send-btn"
            :disabled="senderStore.isEmpty"
            @click="sendAll"
          >
            {{ t('send.sendAll') }}
          </VButton>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <ImportTextModal v-model="showImportModal" @import="handleImport" />
    <EditTextModal
      v-model="showEditModal"
      :item="editItem"
      :index="editIndex"
      @save="handleEditSave"
    />
    <SavePresetModal
      v-model="showSaveModal"
      :text-count="senderStore.totalCount"
      @save="handleSavePreset"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueDraggable } from 'vue-draggable-plus'
import { useSenderStore } from '@/stores/sender'
import { useToast } from '@/composables/useToast'
import { senderApi } from '@/api/sender'
import { presetsApi } from '@/api/presets'
import VButton from '@/components/ui/VButton.vue'
import VCard from '@/components/ui/VCard.vue'
import VEmpty from '@/components/ui/VEmpty.vue'
import VProgressBar from '@/components/ui/VProgressBar.vue'
import ImportTextModal from '@/components/send/ImportTextModal.vue'
import EditTextModal from '@/components/send/EditTextModal.vue'
import SavePresetModal from '@/components/send/SavePresetModal.vue'
import type { TextItem, TextType } from '@/types/api'

const { t } = useI18n()
const senderStore = useSenderStore()
const { showToast } = useToast()

// Modal states
const showImportModal = ref(false)
const showEditModal = ref(false)
const showSaveModal = ref(false)
const editIndex = ref(0)
const editItem = ref<TextItem | null>(null)

function clearAllTexts() {
  senderStore.clearTexts()
  showToast({ message: '已清空', type: 'success' })
}

function addNewItem() {
  senderStore.addText({ type: 'me', content: '' })
}

function updateItemType(index: number, type: TextType) {
  const item = senderStore.texts[index]
  if (!item) return
  senderStore.updateText(index, { ...item, type })
}

function openEdit(index: number) {
  const item = senderStore.texts[index]
  if (!item) return
  editIndex.value = index
  editItem.value = { ...item }
  showEditModal.value = true
}

function handleEditSave(index: number, item: TextItem) {
  senderStore.updateText(index, item)
  showToast({ message: '已更新', type: 'success' })
}

function handleImport(items: TextItem[]) {
  items.forEach(item => senderStore.addText(item))
  showToast({ message: `已导入 ${items.length} 条文本`, type: 'success' })
}

async function saveCurrentPreset() {
  if (!senderStore.currentPresetId) return
  try {
    await presetsApi.update(senderStore.currentPresetId, {
      name: senderStore.currentPresetName!,
      texts: senderStore.texts,
    })
    senderStore.hasUnsavedChanges = false
    showToast({ message: '预设已保存', type: 'success' })
  } catch {
    showToast({ message: '保存失败', type: 'error' })
  }
}

async function handleSavePreset(name: string, tags: string[]) {
  try {
    await presetsApi.create({ name, texts: senderStore.texts, tags })
    showToast({ message: `预设 "${name}" 已保存`, type: 'success' })
  } catch {
    showToast({ message: '保存失败', type: 'error' })
  }
}

async function sendAll() {
  if (senderStore.isEmpty) return
  senderStore.isSending = true
  senderStore.sendProgress = { current: 0, total: senderStore.totalCount }

  try {
    const result = await senderApi.send({
      texts: senderStore.texts,
      delay_between_lines: senderStore.delay,
    })
    senderStore.sendTaskId = result.task_id
    showToast({ message: '发送请求已提交', type: 'success' })
  } catch {
    showToast({ message: '发送失败', type: 'error' })
    senderStore.isSending = false
  }
}

async function cancelSend() {
  if (senderStore.sendTaskId) {
    try {
      await senderApi.cancel(senderStore.sendTaskId)
      showToast({ message: '已取消发送', type: 'info' })
    } catch { /* ignore */ }
  }
  senderStore.isSending = false
}
</script>

<style scoped>
.panel { padding: 24px 32px; max-width: var(--content-max-width); margin: 0 auto; }
.panel-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
.panel-header h1 { font-size: var(--font-size-2xl); font-weight: 700; }
.preset-badge { display: flex; align-items: center; gap: 4px; font-size: var(--font-size-sm); color: var(--accent-cyan); padding: 4px 12px; background: rgba(0,188,212,0.08); border-radius: 20px; }
.unsaved-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent-warning); display: inline-block; }
.send-container { display: flex; flex-direction: column; gap: 16px; }
.input-actions { display: flex; align-items: center; gap: 10px; }
.hint { font-size: var(--font-size-xs); color: var(--text-muted); }
.list-controls { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.list-count { font-size: var(--font-size-sm); color: var(--text-secondary); }
.bulk-actions { display: flex; gap: 8px; }
.text-list { display: flex; flex-direction: column; min-height: 120px; }

/* Draggable */
.drag-container { display: flex; flex-direction: column; gap: 6px; }
.drag-ghost { opacity: 0.4; }
.drag-chosen { box-shadow: 0 0 0 2px var(--accent-primary); }
.drag-handle { cursor: grab; color: var(--text-muted); font-size: 0.9rem; padding: 0 2px; user-select: none; }
.drag-handle:active { cursor: grabbing; }

.text-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; background: rgba(0,0,0,0.15);
  border-radius: 10px; transition: background 0.15s ease;
}
.text-item:hover { background: rgba(0,0,0,0.25); }
.text-item-type select { padding: 4px 8px; font-size: var(--font-size-xs); background: var(--input-bg); border: 1px solid var(--input-border); border-radius: 6px; color: var(--accent-cyan); }
.text-item-content { flex: 1; font-size: var(--font-size-sm); word-break: break-word; cursor: text; min-height: 20px; }
.text-item-actions { display: flex; gap: 4px; opacity: 0; transition: opacity 0.15s; }
.text-item:hover .text-item-actions { opacity: 1; }
.btn-icon-sm { width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; border-radius: 6px; color: var(--text-muted); font-size: 0.75rem; transition: all 0.15s; }
.btn-icon-sm:hover { background: rgba(148,163,184,0.1); color: var(--text-main); }
.btn-icon-danger:hover { background: rgba(239,68,68,0.15); color: var(--accent-danger); }

/* Send Bottom Bar */
.send-bottom-bar { position: sticky; bottom: 0; z-index: 10; }
.sending-controls { display: flex; align-items: center; gap: 16px; }
.delay-control { display: flex; align-items: center; gap: 8px; }
.delay-control label { font-size: var(--font-size-sm); color: var(--text-secondary); white-space: nowrap; }
.input-sm { width: 100px; padding: 6px 10px; font-size: var(--font-size-sm); }
.progress-area { flex: 1; }
.send-btn { margin-left: auto; }

@media (max-width: 768px) {
  .panel { padding: 16px; }
  .input-actions { flex-wrap: wrap; }
  .list-controls { flex-direction: column; gap: 8px; align-items: flex-start; }
  .sending-controls { flex-direction: column; }
  .send-btn { width: 100%; }
}
</style>
