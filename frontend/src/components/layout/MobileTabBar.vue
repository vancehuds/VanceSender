<template>
  <nav class="mobile-tabbar">
    <button
      v-for="item in tabItems"
      :key="item.route"
      class="tab-item"
      :class="{ active: currentRoute === item.route }"
      @click="router.push(item.route)"
    >
      <span class="tab-icon" v-html="item.icon"></span>
      <span class="tab-label">{{ item.label }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const currentRoute = computed(() => route.path)

const tabItems = computed(() => [
  {
    route: '/',
    label: t('nav.home'),
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M3 11.5L12 4l9 7.5"/><path d="M5 10.5V20h14v-9.5"/></svg>',
  },
  {
    route: '/send',
    label: t('nav.send'),
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
  },
  {
    route: '/ai',
    label: t('nav.ai'),
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/></svg>',
  },
  {
    route: '/presets',
    label: t('nav.presets'),
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/></svg>',
  },
  {
    route: '/settings',
    label: t('nav.settings'),
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15 1.65 1.65 0 0 0 3.09 14H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  },
])
</script>

<style scoped>
.mobile-tabbar {
  display: none;
}

@media (max-width: 768px) {
  .mobile-tabbar {
    display: flex;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: var(--mobile-tabbar-height);
    background: rgba(15, 20, 36, 0.9);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-top: 1px solid var(--glass-border);
    z-index: var(--z-sidebar);
    padding: 0 8px;
    padding-bottom: env(safe-area-inset-bottom, 0);
  }

  .tab-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px 0;
    color: var(--text-muted);
    transition: color 0.2s ease;
  }

  .tab-item.active {
    color: var(--accent-primary);
  }

  .tab-icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tab-icon :deep(svg) {
    width: 20px;
    height: 20px;
  }

  .tab-label {
    font-size: 0.65rem;
    font-weight: 500;
  }
}
</style>
