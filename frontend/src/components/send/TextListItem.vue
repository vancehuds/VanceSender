<template>
  <div
    class="text-item"
    :class="{ 'text-item--dragging': isDragging }"
    draggable="true"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    @dragover.prevent
    @drop="emit('drop', index)"
  >
    <div class="text-item__handle" title="拖拽排序">⠿</div>
    <div class="text-item__type">
      <select :value="item.type" @change="onTypeChange">
        <option value="me">/me</option>
        <option value="do">/do</option>
      </select>
    </div>
    <div class="text-item__content" @dblclick="emit('edit', index)">
      {{ item.content || '(空内容 — 双击编辑)' }}
    </div>
    <div class="text-item__actions">
      <button class="action-btn" title="编辑" @click="emit('edit', index)">✏️</button>
      <button class="action-btn action-btn--danger" title="删除" @click="emit('remove', index)">✕</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { TextItem, TextType } from '@/types/api'

const props = defineProps<{
  item: TextItem
  index: number
}>()

const emit = defineEmits<{
  'update:type': [index: number, type: TextType]
  edit: [index: number]
  remove: [index: number]
  dragstart: [index: number]
  drop: [index: number]
}>()

const isDragging = ref(false)

function onTypeChange(e: Event) {
  emit('update:type', props.index, (e.target as HTMLSelectElement).value as TextType)
}

function onDragStart(e: DragEvent) {
  isDragging.value = true
  e.dataTransfer?.setData('text/plain', String(props.index))
  emit('dragstart', props.index)
}

function onDragEnd() {
  isDragging.value = false
}
</script>

<style scoped>
.text-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 10px;
  transition: all 0.15s ease;
  cursor: default;
}

.text-item:hover {
  background: rgba(0, 0, 0, 0.25);
}

.text-item--dragging {
  opacity: 0.5;
  transform: scale(0.98);
}

.text-item__handle {
  cursor: grab;
  color: var(--text-muted);
  font-size: 0.9rem;
  padding: 0 2px;
  user-select: none;
}

.text-item__handle:active {
  cursor: grabbing;
}

.text-item__type select {
  padding: 4px 8px;
  font-size: var(--font-size-xs);
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 6px;
  color: var(--accent-cyan);
}

.text-item__content {
  flex: 1;
  font-size: var(--font-size-sm);
  word-break: break-word;
  cursor: text;
  min-height: 20px;
}

.text-item__actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.text-item:hover .text-item__actions {
  opacity: 1;
}

.action-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 0.75rem;
  color: var(--text-muted);
  transition: all 0.15s;
}

.action-btn:hover {
  background: rgba(148, 163, 184, 0.1);
  color: var(--text-main);
}

.action-btn--danger:hover {
  background: rgba(239, 68, 68, 0.15);
  color: var(--accent-danger);
}
</style>
