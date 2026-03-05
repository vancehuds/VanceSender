<template>
  <div class="v-progress" :class="{ 'v-progress--active': active }">
    <div class="v-progress__info" v-if="showInfo">
      <div class="v-progress__status">
        <div v-if="active" class="pulse-dot"></div>
        <span class="v-progress__text"><slot>{{ text }}</slot></span>
      </div>
      <slot name="action" />
    </div>
    <div class="v-progress__track">
      <div class="v-progress__fill" :style="{ width: percent + '%' }">
        <div class="v-progress__glow"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  current?: number
  total?: number
  percent?: number
  text?: string
  active?: boolean
  showInfo?: boolean
}>(), {
  current: 0,
  total: 0,
  text: '',
  active: false,
  showInfo: true,
})

const percent = computed(() => {
  if (props.percent !== undefined) return Math.min(100, Math.max(0, props.percent))
  return props.total > 0 ? Math.round((props.current / props.total) * 100) : 0
})
</script>

<style scoped>
.v-progress__info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.v-progress__status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-sm);
}

.v-progress__track {
  height: 4px;
  background: rgba(148, 163, 184, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.v-progress__fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-primary), var(--accent-cyan));
  border-radius: 2px;
  transition: width 0.3s ease;
  position: relative;
}

.v-progress__glow {
  position: absolute;
  right: 0;
  top: -4px;
  bottom: -4px;
  width: 20px;
  background: var(--accent-primary);
  filter: blur(8px);
  opacity: 0;
  transition: opacity 0.3s;
}

.v-progress--active .v-progress__glow {
  opacity: 0.6;
  animation: progress-pulse 2s ease-in-out infinite;
}

@keyframes progress-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.7; }
}
</style>
