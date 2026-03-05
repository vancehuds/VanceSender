<template>
  <VModal v-model="isOpen" title="保存为预设" size="sm">
    <div class="save-form">
      <div class="form-group">
        <label>预设名称</label>
        <input
          ref="nameRef"
          v-model="presetName"
          type="text"
          placeholder="输入预设名称..."
          @keydown.enter="save"
        />
      </div>
      <div class="form-group">
        <label>标签（可选，逗号分隔）</label>
        <input v-model="tagsInput" type="text" placeholder="例如：日常,战斗,医疗" />
      </div>
      <p class="save-info">将保存 <strong>{{ textCount }}</strong> 条文本</p>
    </div>
    <template #footer>
      <VButton variant="ghost" @click="isOpen = false">取消</VButton>
      <VButton variant="primary" :disabled="!presetName.trim()" @click="save">保存</VButton>
    </template>
  </VModal>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import VModal from '@/components/ui/VModal.vue'
import VButton from '@/components/ui/VButton.vue'

const isOpen = defineModel<boolean>({ default: false })

defineProps<{
  textCount: number
}>()

const emit = defineEmits<{
  save: [name: string, tags: string[]]
}>()

const presetName = ref('')
const tagsInput = ref('')
const nameRef = ref<HTMLInputElement>()

function save() {
  if (!presetName.value.trim()) return
  const tags = tagsInput.value
    .split(/[,，]/)
    .map(t => t.trim())
    .filter(t => t.length > 0)
  emit('save', presetName.value.trim(), tags)
  presetName.value = ''
  tagsInput.value = ''
  isOpen.value = false
}

watch(isOpen, (open) => {
  if (open) nextTick(() => nameRef.value?.focus())
})
</script>

<style scoped>
.save-form { display: flex; flex-direction: column; gap: 14px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: var(--font-size-sm); color: var(--text-secondary); font-weight: 500; }
.form-group input { width: 100%; }
.save-info { font-size: var(--font-size-sm); color: var(--text-muted); }
</style>
