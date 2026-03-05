<template>
  <div class="v-card glass-card bento-card" :style="{ '--anim-delay': '0.2s' }">
    <div class="card-header">
      <h2>
        <div class="card-icon-wrapper">
          <div class="icon-glow"></div>
          <svg class="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" />
          </svg>
        </div>
        运行情况
      </h2>
    </div>
    <div class="stats-grid">
      <div class="stat-item">
        <span class="stat-value">{{ stats.total_sent }}</span>
        <span class="stat-label">{{ t('home.totalSent') }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-value text-accent-success">{{ stats.success_rate }}%</span>
        <span class="stat-label">{{ t('home.successRate') }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ stats.total_batches }}</span>
        <span class="stat-label">{{ t('home.batchCount') }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-value text-accent-danger">{{ stats.total_failed }}</span>
        <span class="stat-label">{{ t('home.failedCount') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { AppStats } from '@/types/api'
const { t } = useI18n()
defineProps<{ stats: AppStats }>()
</script>

<style scoped>
.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.card-header h2 { display: flex; align-items: center; font-size: var(--font-size-base); font-weight: 600; }
.card-title-icon { position: relative; z-index: 1; }
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 16px; }
.stat-item { text-align: center; }
.stat-value { display: block; font-size: var(--font-size-xl); font-weight: 700; margin-bottom: 4px; }
.stat-label { font-size: var(--font-size-xs); color: var(--text-muted); }
@media (max-width: 768px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
