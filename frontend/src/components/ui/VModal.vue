<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="modelValue" class="v-modal-overlay" @click.self="closeOnOverlay && emit('update:modelValue', false)">
        <div class="v-modal" :class="[`v-modal--${size}`]" role="dialog" :aria-label="title">
          <!-- Header -->
          <div v-if="title || $slots.header" class="v-modal__header">
            <slot name="header">
              <h2 class="v-modal__title">{{ title }}</h2>
            </slot>
            <button v-if="closable" class="v-modal__close" @click="emit('update:modelValue', false)" aria-label="关闭">✕</button>
          </div>

          <!-- Body -->
          <div class="v-modal__body">
            <slot />
          </div>

          <!-- Footer -->
          <div v-if="$slots.footer" class="v-modal__footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title?: string
  size?: 'sm' | 'md' | 'lg' | 'full'
  closable?: boolean
  closeOnOverlay?: boolean
}>(), {
  title: '',
  size: 'md',
  closable: true,
  closeOnOverlay: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

// Lock body scroll when modal is open
watch(() => props.modelValue, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
})
</script>

<style scoped>
.v-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  z-index: var(--z-modal);
  padding: 20px;
}

.v-modal {
  background: var(--bg-elevated);
  border: 1px solid var(--glass-border);
  border-radius: var(--card-radius);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
  display: flex; flex-direction: column;
  max-height: 90vh;
  overflow: hidden;
}

.v-modal--sm { width: 380px; }
.v-modal--md { width: 520px; }
.v-modal--lg { width: 720px; }
.v-modal--full { width: 90vw; max-width: 1000px; }

.v-modal__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px 0;
}

.v-modal__title {
  font-size: var(--font-size-lg); font-weight: 600;
}

.v-modal__close {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 6px; color: var(--text-muted);
  font-size: 0.85rem; transition: all 0.15s ease;
}
.v-modal__close:hover { background: rgba(239, 68, 68, 0.15); color: var(--accent-danger); }

.v-modal__body {
  padding: 20px 24px; overflow-y: auto; flex: 1;
}

.v-modal__footer {
  padding: 16px 24px;
  border-top: 1px solid var(--glass-border);
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
}

/* Transition */
.modal-enter-active { transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
.modal-leave-active { transition: all 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .v-modal { transform: scale(0.9) translateY(20px); }
.modal-leave-to .v-modal { transform: scale(0.95); }

@media (max-width: 768px) {
  .v-modal--sm, .v-modal--md, .v-modal--lg { width: 100%; }
}
</style>
