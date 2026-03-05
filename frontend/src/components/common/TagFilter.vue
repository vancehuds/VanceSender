<template>
  <div class="tag-filter-bar" v-if="tags.length > 0">
    <button
      v-for="tag in tags"
      :key="tag"
      class="tag-pill"
      :class="{ active: selected.includes(tag) }"
      @click="emit('toggle', tag)"
    >
      {{ tag }}
    </button>
    <button v-if="selected.length > 0" class="tag-pill tag-clear" @click="emit('clear')">
      清除筛选
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  tags: string[]
  selected: string[]
}>()

const emit = defineEmits<{
  toggle: [tag: string]
  clear: []
}>()
</script>

<style scoped>
.tag-filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
}

.tag-pill {
  padding: 5px 14px;
  border-radius: 20px;
  font-size: var(--font-size-xs);
  background: rgba(0, 0, 0, 0.2);
  color: var(--text-secondary);
  transition: all 0.2s ease;
  cursor: pointer;
  border: 1px solid transparent;
}

.tag-pill:hover {
  background: rgba(0, 0, 0, 0.3);
  color: var(--text-main);
}

.tag-pill.active {
  background: var(--accent-primary-glow);
  color: var(--accent-primary);
  border-color: var(--accent-primary);
}

.tag-pill.tag-clear {
  color: var(--accent-danger);
}

.tag-pill.tag-clear:hover {
  background: rgba(239, 68, 68, 0.1);
}
</style>
