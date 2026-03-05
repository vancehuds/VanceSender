<template>
  <div class="v-card glass-card bento-card" :style="{ '--anim-delay': '0.3s' }">
    <div class="card-header">
      <h2>
        <div class="card-icon-wrapper">
          <div class="icon-glow glow-green"></div>
          <svg class="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </div>
        版本检查
      </h2>
      <span class="status-badge">{{ status }}</span>
    </div>
    <div class="update-meta">
      <div class="update-v-item">
        <span class="v-label">{{ t('home.currentVersion') }}</span>
        <strong class="v-val">{{ currentVersion }}</strong>
      </div>
      <div class="update-v-sep"></div>
      <div class="update-v-item">
        <span class="v-label">{{ t('home.latestVersion') }}</span>
        <strong class="v-val">{{ latestVersion }}</strong>
      </div>
    </div>
    <div class="update-actions">
      <label class="inline-checkbox">
        <input :checked="includePrerelease" type="checkbox" @change="emit('update:includePrerelease', ($event.target as HTMLInputElement).checked)" />
        <span>{{ t('home.includePrerelease') }}</span>
      </label>
      <VButton variant="outline" size="sm" @click="emit('check')">{{ t('home.checkUpdate') }}</VButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import VButton from '@/components/ui/VButton.vue'
const { t } = useI18n()

defineProps<{
  currentVersion: string
  latestVersion: string
  status: string
  includePrerelease: boolean
}>()

const emit = defineEmits<{
  check: []
  'update:includePrerelease': [value: boolean]
}>()
</script>

<style scoped>
.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.card-header h2 { display: flex; align-items: center; font-size: var(--font-size-base); font-weight: 600; }
.card-title-icon { position: relative; z-index: 1; }
.status-badge { font-size: var(--font-size-xs); padding: 3px 10px; border-radius: 20px; background: rgba(148,163,184,0.1); color: var(--text-muted); }
.update-meta { display: flex; align-items: center; gap: 16px; margin: 14px 0; }
.update-v-item { display: flex; flex-direction: column; gap: 2px; }
.v-label { font-size: var(--font-size-xs); color: var(--text-muted); }
.v-val { font-size: var(--font-size-sm); }
.update-v-sep { width: 1px; height: 28px; background: var(--glass-border); }
.update-actions { display: flex; align-items: center; gap: 12px; }
.inline-checkbox { display: flex; align-items: center; gap: 6px; font-size: var(--font-size-xs); color: var(--text-secondary); cursor: pointer; }
.inline-checkbox input { accent-color: var(--accent-primary); }
</style>
