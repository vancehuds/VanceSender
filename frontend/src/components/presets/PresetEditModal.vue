<template>
  <VModal v-model="isOpen" :title="isNew ? '新建预设' : '编辑预设'" size="lg">
    <div class="edit-form">
      <div class="form-group">
        <label>预设名称</label>
        <input v-model="name" type="text" placeholder="输入预设名称..." />
      </div>
      <div class="form-group">
        <label>标签（逗号分隔）</label>
        <input v-model="tagsInput" type="text" placeholder="例如：日常,战斗" />
      </div>
      <div class="form-group">
        <label>文本内容（共 {{ texts.length }} 条）</label>
        <div class="text-list">
          <div v-for="(item, idx) in texts" :key="idx" class="text-row">
            <select v-model="item.type" class="type-select">
              <option value="me">/me</option>
              <option value="do">/do</option>
            </select>
            <input v-model="item.content" type="text" class="content-input" placeholder="文本内容..." />
            <button class="rm-btn" @click="texts.splice(idx, 1)">✕</button>
          </div>
          <button class="add-btn" @click="texts.push({ type: 'me', content: '' })">+ 添加一条</button>
        </div>
      </div>
    </div>
    <template #footer>
      <VButton variant="ghost" @click="isOpen = false">取消</VButton>
      <VButton variant="primary" :disabled="!name.trim() || texts.length === 0" @click="save">保存</VButton>
    </template>
  </VModal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import VModal from '@/components/ui/VModal.vue'
import VButton from '@/components/ui/VButton.vue'
import type { Preset, TextItem, TextType } from '@/types/api'

const isOpen = defineModel<boolean>({ default: false })

const props = defineProps<{
  preset?: Preset | null
  isNew?: boolean
}>()

const emit = defineEmits<{
  save: [data: { name: string; texts: TextItem[]; tags: string[] }]
}>()

const name = ref('')
const tagsInput = ref('')
const texts = ref<{ type: TextType; content: string }[]>([])

watch(isOpen, (open) => {
  if (open) {
    if (props.preset) {
      name.value = props.preset.name
      tagsInput.value = props.preset.tags?.join(', ') || ''
      texts.value = props.preset.texts.map(t => ({ ...t }))
    } else {
      name.value = ''
      tagsInput.value = ''
      texts.value = [{ type: 'me', content: '' }]
    }
  }
})

function save() {
  const tags = tagsInput.value.split(/[,，]/).map(t => t.trim()).filter(t => t.length > 0)
  const validTexts = texts.value.filter(t => t.content.trim().length > 0)
  emit('save', { name: name.value.trim(), texts: validTexts, tags })
  isOpen.value = false
}
</script>

<style scoped>
.edit-form { display: flex; flex-direction: column; gap: 14px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: var(--font-size-sm); color: var(--text-secondary); font-weight: 500; }
.form-group input[type="text"] { width: 100%; }
.text-list { display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow-y: auto; }
.text-row { display: flex; gap: 8px; align-items: center; }
.type-select { width: 80px; padding: 6px; font-size: var(--font-size-xs); }
.content-input { flex: 1; padding: 8px 12px; }
.rm-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 6px; color: var(--text-muted); font-size: 0.75rem; transition: all 0.15s; flex-shrink: 0; }
.rm-btn:hover { background: rgba(239,68,68,0.15); color: var(--accent-danger); }
.add-btn { padding: 8px; border-radius: 8px; font-size: var(--font-size-sm); color: var(--text-secondary); background: rgba(0,0,0,0.15); transition: all 0.2s; }
.add-btn:hover { background: rgba(0,0,0,0.25); color: var(--text-main); }
</style>
