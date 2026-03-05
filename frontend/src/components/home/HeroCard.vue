<template>
  <div class="v-card glass-card bento-hero" :style="{ '--anim-delay': '0.1s' }">
    <div class="hero-blur-blob blob-1"></div>
    <div class="hero-blur-blob blob-2"></div>
    <div class="hero-content">
      <div class="hero-header-wrap">
        <h2 class="hero-title">{{ t('home.title') }} VanceSender</h2>
        <p class="hero-subtitle">{{ t('home.subtitle') }}</p>
      </div>
      <div class="hero-quick-info">
        <div class="info-pill" @click="emit('copy-url')">
          <span class="pill-label">本机访问</span>
          <span class="pill-value code">{{ localUrl }}</span>
        </div>
        <div class="info-pill" @click="emit('open-docs')">
          <span class="pill-label">API 文档</span>
          <span class="pill-value code">{{ docsUrl }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
defineProps<{ localUrl: string; docsUrl: string }>()
const emit = defineEmits<{ 'copy-url': []; 'open-docs': [] }>()
</script>

<style scoped>
.bento-hero { position: relative; overflow: hidden; grid-column: 1 / -1; }
.hero-content { position: relative; z-index: 1; }
.hero-title { font-size: var(--font-size-2xl); font-weight: 700; margin-bottom: 6px; }
.hero-subtitle { color: var(--text-secondary); font-size: var(--font-size-base); }
.hero-quick-info { display: flex; gap: 16px; margin-top: 20px; }
.info-pill { display: flex; flex-direction: column; gap: 4px; padding: 10px 16px; background: rgba(0,0,0,0.2); border-radius: 10px; cursor: pointer; transition: background 0.2s ease; }
.info-pill:hover { background: rgba(0,0,0,0.35); }
.pill-label { font-size: var(--font-size-xs); color: var(--text-muted); }
.pill-value { font-size: var(--font-size-sm); color: var(--accent-cyan); }
@media (max-width: 768px) { .hero-quick-info { flex-direction: column; gap: 8px; } }
</style>
