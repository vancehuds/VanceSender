<template>
  <div class="v-card glass-card bento-card" :style="{ '--anim-delay': '0.4s' }">
    <div class="card-header">
      <h2>
        <div class="card-icon-wrapper">
          <div class="icon-glow glow-purple"></div>
          <svg class="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        </div>
        {{ t('home.resources') }}
      </h2>
    </div>
    <div class="micro-cards">
      <a class="micro-card" v-for="link in links" :key="link.url" :href="link.url" target="_blank" rel="noopener noreferrer">
        <div class="mc-icon">{{ link.icon }}</div>
        <span class="mc-text">{{ link.label }}</span>
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

const links = computed(() => [
  { url: 'https://sender.vhuds.com/help.html', icon: '📖', label: t('home.docs') },
  { url: 'https://qm.qq.com/q/RNjqaPwYme', icon: '💬', label: t('home.joinGroup') },
  { url: 'https://sender.vhuds.com', icon: '🌐', label: t('home.website') },
  { url: 'https://github.com/vancehuds/VanceSender', icon: '⭐', label: t('home.repo') },
])
</script>

<style scoped>
.card-header { display: flex; align-items: center; margin-bottom: 12px; }
.card-header h2 { display: flex; align-items: center; font-size: var(--font-size-base); font-weight: 600; }
.card-title-icon { position: relative; z-index: 1; }
.micro-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.micro-card { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 10px; background: rgba(0,0,0,0.15); color: var(--text-secondary); transition: all 0.2s ease; text-decoration: none; }
.micro-card:hover { background: rgba(0,0,0,0.3); color: var(--text-main); transform: translateY(-1px); }
.mc-icon { font-size: 1.1rem; }
.mc-text { font-size: var(--font-size-sm); }
</style>
