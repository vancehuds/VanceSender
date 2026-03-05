<template>
  <VModal v-model="isOpen" title="编辑文本" size="md">
    <div class="edit-form">
      <div class="form-group">
        <label>类型</label>
        <select v-model="editType">
          <option value="me">/me</option>
          <option value="do">/do</option>
        </select>
      </div>
      <div class="form-group">
        <label>内容</label>
        <textarea
          ref="contentRef"
          v-model="editContent"
          rows="4"
          placeholder="输入文本内容..."
          @keydown.ctrl.enter="save"
        ></textarea>
      </div>
    </div>
    <template #footer>
      <VButton variant="ghost" @click="isOpen = false">取消</VButton>
      <VButton variant="primary" @click="save">保存</VButton>
    </template>
  </VModal>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import VModal from '@/components/ui/VModal.vue'
import VButton from '@/components/ui/VButton.vue'
import type { TextItem, TextType } from '@/types/api'

const isOpen = defineModel<boolean>({ default: false })

const props = defineProps<{
  item: TextItem | null
  index: number
}>()

const emit = defineEmits<{
  save: [index: number, item: TextItem]
}>()

const editType = ref<TextType>('me')
const editContent = ref('')
const contentRef = ref<HTMLTextAreaElement>()

watch(isOpen, (open) => {
  if (open && props.item) {
    editType.value = props.item.type
    editContent.value = props.item.content
    nextTick(() => contentRef.value?.focus())
  }
})

function save() {
  emit('save', props.index, { type: editType.value, content: editContent.value })
  isOpen.value = false
}
</script>

<style scoped>
.edit-form { display: flex; flex-direction: column; gap: 14px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: var(--font-size-sm); color: var(--text-secondary); font-weight: 500; }
.form-group select, .form-group textarea { width: 100%; }
.form-group textarea { resize: vertical; min-height: 80px; }
</style>
