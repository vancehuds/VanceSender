<template>
  <Teleport to="body">
    <TransitionGroup name="toast" tag="div" class="toast-container">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast-item"
        :class="[`toast-${toast.type}`]"
        @click="removeToast(toast.id)"
      >
        <span class="toast-icon">{{ iconMap[toast.type || 'info'] }}</span>
        <span class="toast-message">{{ toast.message }}</span>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup lang="ts">
import { useToast } from '@/composables/useToast'

const { toasts, removeToast } = useToast()

const iconMap: Record<string, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
}
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-radius: 10px;
  background: rgba(15, 20, 36, 0.9);
  backdrop-filter: blur(16px);
  border: 1px solid var(--glass-border);
  color: var(--text-main);
  font-size: var(--font-size-sm);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  pointer-events: auto;
  cursor: pointer;
  max-width: 380px;
}

.toast-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

.toast-success {
  border-left: 3px solid var(--accent-success);
}

.toast-success .toast-icon {
  color: var(--accent-success);
}

.toast-error {
  border-left: 3px solid var(--accent-danger);
}

.toast-error .toast-icon {
  color: var(--accent-danger);
}

.toast-warning {
  border-left: 3px solid var(--accent-warning);
}

.toast-warning .toast-icon {
  color: var(--accent-warning);
}

.toast-info {
  border-left: 3px solid var(--accent-cyan);
}

.toast-info .toast-icon {
  color: var(--accent-cyan);
}

/* Toast transitions */
.toast-enter-active {
  transition: all 0.3s var(--ease-spring);
}

.toast-leave-active {
  transition: all 0.2s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(40px) scale(0.9);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(40px);
}

.toast-move {
  transition: transform 0.3s ease;
}
</style>
