<template>
  <VModal v-model="isOpen" :title="t('send.importBtn')" size="lg">
    <div class="import-modal">
      <p class="import-hint">每行一条文本。以 <code>/me</code> 或 <code>/do</code> 开头指定类型，否则默认为 <code>/me</code>。</p>
      <div class="import-default-type">
        <label>默认类型：</label>
        <select v-model="defaultType">
          <option value="me">/me</option>
          <option value="do">/do</option>
        </select>
      </div>
      <textarea
        ref="textareaRef"
        v-model="rawText"
        class="import-textarea"
        placeholder="在此粘贴或输入文本..."
        rows="14"
        @keydown.ctrl.enter="doImport"
      ></textarea>
      <p class="import-count">解析到 <strong>{{ parsedItems.length }}</strong> 条文本</p>
    </div>

    <template #footer>
      <VButton variant="ghost" @click="isOpen = false">{{ t('common.cancel') }}</VButton>
      <VButton variant="primary" :disabled="parsedItems.length === 0" @click="doImport">
        导入 {{ parsedItems.length }} 条
      </VButton>
    </template>
  </VModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import VModal from '@/components/ui/VModal.vue'
import VButton from '@/components/ui/VButton.vue'
import type { TextItem, TextType } from '@/types/api'

const { t } = useI18n()

const isOpen = defineModel<boolean>({ default: false })
const emit = defineEmits<{ import: [items: TextItem[]] }>()

const rawText = ref('')
const defaultType = ref<TextType>('me')
const textareaRef = ref<HTMLTextAreaElement>()

const parsedItems = computed<TextItem[]>(() => {
  if (!rawText.value.trim()) return []
  return rawText.value
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      if (line.startsWith('/me ')) return { type: 'me' as TextType, content: line.slice(4) }
      if (line.startsWith('/do ')) return { type: 'do' as TextType, content: line.slice(4) }
      return { type: defaultType.value, content: line }
    })
})

function doImport() {
  if (parsedItems.value.length === 0) return
  emit('import', parsedItems.value)
  rawText.value = ''
  isOpen.value = false
}

watch(isOpen, (open) => {
  if (open) nextTick(() => textareaRef.value?.focus())
})
</script>

<style scoped>
.import-modal { display: flex; flex-direction: column; gap: 12px; }
.import-hint { font-size: var(--font-size-sm); color: var(--text-secondary); }
.import-hint code { padding: 2px 6px; border-radius: 4px; background: rgba(0,0,0,0.2); color: var(--accent-cyan); font-size: 0.85em; }
.import-default-type { display: flex; align-items: center; gap: 8px; font-size: var(--font-size-sm); }
.import-default-type select { padding: 4px 10px; }
.import-textarea { width: 100%; resize: vertical; min-height: 200px; font-family: inherit; font-size: var(--font-size-sm); }
.import-count { font-size: var(--font-size-sm); color: var(--text-muted); }
</style>
