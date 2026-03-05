<template>
  <Teleport to="body">
    <Transition name="onboarding">
      <div v-if="visible" class="onboarding-overlay" @click.self="skip">
        <!-- Spotlight -->
        <div
          v-if="currentStep.target"
          class="spotlight"
          :style="spotlightStyle"
        ></div>

        <!-- Tooltip card -->
        <div class="onboarding-card glass-card" :style="cardStyle">
          <div class="onboarding-header">
            <span class="step-indicator">{{ currentIndex + 1 }} / {{ steps.length }}</span>
            <button class="skip-btn" @click="skip">跳过</button>
          </div>
          <h3 class="onboarding-title">{{ currentStep.title }}</h3>
          <p class="onboarding-desc">{{ currentStep.description }}</p>
          <div class="onboarding-progress">
            <div
              v-for="(_, i) in steps" :key="i"
              class="progress-dot"
              :class="{ active: i === currentIndex, done: i < currentIndex }"
            ></div>
          </div>
          <div class="onboarding-actions">
            <button v-if="currentIndex > 0" class="btn-back" @click="prev">上一步</button>
            <button class="btn-next" @click="next">
              {{ currentIndex === steps.length - 1 ? '完成' : '下一步' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

export interface OnboardingStep {
  title: string
  description: string
  target?: string // CSS selector for spotlight element
  position?: 'top' | 'bottom' | 'left' | 'right'
}

const props = withDefaults(defineProps<{
  steps: OnboardingStep[]
  storageKey?: string
}>(), {
  storageKey: 'vs-onboarding-done',
})

const emit = defineEmits<{
  complete: []
  skip: []
}>()

const visible = ref(false)
const currentIndex = ref(0)

const currentStep = computed(() => props.steps[currentIndex.value])

const spotlightStyle = ref<Record<string, string>>({})
const cardStyle = ref<Record<string, string>>({})

function updatePositions() {
  const step = currentStep.value
  if (!step.target) {
    spotlightStyle.value = { display: 'none' }
    cardStyle.value = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    }
    return
  }

  const el = document.querySelector(step.target)
  if (!el) {
    spotlightStyle.value = { display: 'none' }
    cardStyle.value = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    }
    return
  }

  const rect = el.getBoundingClientRect()
  const pad = 8

  spotlightStyle.value = {
    top: `${rect.top - pad}px`,
    left: `${rect.left - pad}px`,
    width: `${rect.width + pad * 2}px`,
    height: `${rect.height + pad * 2}px`,
  }

  const pos = step.position || 'bottom'
  const cardW = 340

  switch (pos) {
    case 'bottom':
      cardStyle.value = {
        position: 'fixed',
        top: `${rect.bottom + 16}px`,
        left: `${Math.max(16, rect.left + rect.width / 2 - cardW / 2)}px`,
      }
      break
    case 'top':
      cardStyle.value = {
        position: 'fixed',
        bottom: `${window.innerHeight - rect.top + 16}px`,
        left: `${Math.max(16, rect.left + rect.width / 2 - cardW / 2)}px`,
      }
      break
    case 'right':
      cardStyle.value = {
        position: 'fixed',
        top: `${rect.top}px`,
        left: `${rect.right + 16}px`,
      }
      break
    case 'left':
      cardStyle.value = {
        position: 'fixed',
        top: `${rect.top}px`,
        right: `${window.innerWidth - rect.left + 16}px`,
      }
      break
  }
}

function next() {
  if (currentIndex.value < props.steps.length - 1) {
    currentIndex.value++
    nextTick(updatePositions)
  } else {
    complete()
  }
}

function prev() {
  if (currentIndex.value > 0) {
    currentIndex.value--
    nextTick(updatePositions)
  }
}

function skip() {
  visible.value = false
  localStorage.setItem(props.storageKey, 'true')
  emit('skip')
}

function complete() {
  visible.value = false
  localStorage.setItem(props.storageKey, 'true')
  emit('complete')
}

function start() {
  const done = localStorage.getItem(props.storageKey)
  if (done) return
  currentIndex.value = 0
  visible.value = true
  nextTick(updatePositions)
}

watch(visible, (v) => {
  if (v) {
    window.addEventListener('resize', updatePositions)
  } else {
    window.removeEventListener('resize', updatePositions)
  }
})

onMounted(() => {
  // Auto-start after a short delay
  setTimeout(start, 1000)
})

onUnmounted(() => {
  window.removeEventListener('resize', updatePositions)
})

defineExpose({ start })
</script>

<style scoped>
.onboarding-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.65);
  z-index: 9999;
}

.spotlight {
  position: fixed;
  border-radius: 12px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.65);
  z-index: 10000;
  pointer-events: none;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.onboarding-card {
  width: 340px;
  z-index: 10001;
  padding: 20px 24px;
  animation: onboarding-pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes onboarding-pop {
  from { opacity: 0; transform: scale(0.9) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.onboarding-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px;
}

.step-indicator {
  font-size: var(--font-size-xs); color: var(--accent-primary); font-weight: 600;
}

.skip-btn {
  font-size: var(--font-size-xs); color: var(--text-muted);
  transition: color 0.15s;
}
.skip-btn:hover { color: var(--text-main); }

.onboarding-title {
  font-size: var(--font-size-lg); font-weight: 600; margin-bottom: 6px;
}

.onboarding-desc {
  font-size: var(--font-size-sm); color: var(--text-secondary); line-height: 1.5;
  margin-bottom: 16px;
}

.onboarding-progress {
  display: flex; gap: 6px; margin-bottom: 16px;
}

.progress-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: rgba(148, 163, 184, 0.2);
  transition: all 0.25s ease;
}

.progress-dot.active {
  background: var(--accent-primary);
  transform: scale(1.3);
}

.progress-dot.done {
  background: var(--accent-success);
}

.onboarding-actions {
  display: flex; gap: 8px; justify-content: flex-end;
}

.btn-back {
  padding: 6px 16px; border-radius: 8px;
  font-size: var(--font-size-sm); color: var(--text-secondary);
}
.btn-back:hover { color: var(--text-main); background: rgba(148,163,184,0.08); }

.btn-next {
  padding: 6px 20px; border-radius: 8px;
  font-size: var(--font-size-sm); font-weight: 500;
  background: var(--accent-primary); color: white;
  transition: background 0.15s;
}
.btn-next:hover { background: var(--accent-primary-hover); }

/* Transition */
.onboarding-enter-active { transition: opacity 0.3s ease; }
.onboarding-leave-active { transition: opacity 0.2s ease; }
.onboarding-enter-from, .onboarding-leave-to { opacity: 0; }
</style>
