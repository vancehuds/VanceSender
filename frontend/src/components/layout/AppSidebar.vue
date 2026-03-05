<template>
  <nav class="sidebar" :class="{ collapsed: appStore.sidebarCollapsed }">
    <div class="brand" @click="router.push('/')">
      <div class="logo-icon">
        <svg viewBox="0 0 256 256" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
          <polygon points="180,76 76,128 116,140" fill="currentColor" />
          <polygon points="180,76 116,140 128,180" fill="currentColor" />
          <polygon points="116,140 128,180 110,160" fill="currentColor" />
        </svg>
      </div>
      <span v-show="!appStore.sidebarCollapsed" class="logo-text">VanceSender</span>
    </div>

    <ul class="nav-links">
      <li
        v-for="item in navItems"
        :key="item.route"
        class="nav-item"
        :class="{ active: currentRoute === item.route }"
        :data-nav="item.id"
        @click="router.push(item.route)"
      >
        <span class="icon" v-html="item.icon"></span>
        <span v-show="!appStore.sidebarCollapsed" class="label">{{ item.label }}</span>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const appStore = useAppStore()

const currentRoute = computed(() => route.path)

const navItems = computed(() => [
  {
    id: 'home',
    route: '/',
    label: t('nav.home'),
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11.5L12 4l9 7.5"></path><path d="M5 10.5V20h14v-9.5"></path><path d="M9 20v-5h6v5"></path></svg>',
  },
  {
    id: 'send',
    route: '/send',
    label: t('nav.send'),
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"></path></svg>',
  },
  {
    id: 'quick-send',
    route: '/quick-send',
    label: t('nav.quickSend'),
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"></path></svg>',
  },
  {
    id: 'ai',
    route: '/ai',
    label: t('nav.ai'),
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path><path d="M12 12L2.1 12a10.1 10.1 0 0 0 1.9 4"></path><path d="M12 12l4.5 7.8"></path></svg>',
  },
  {
    id: 'presets',
    route: '/presets',
    label: t('nav.presets'),
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>',
  },
  {
    id: 'settings',
    route: '/settings',
    label: t('nav.settings'),
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',
  },
])
</script>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  background: var(--bg-secondary);
  border-right: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
  padding: 16px 12px;
  transition: width 0.3s var(--ease-out);
  z-index: var(--z-sidebar);
  overflow-y: auto;
  overflow-x: hidden;
}

.sidebar.collapsed {
  width: var(--sidebar-collapsed-width);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px 20px;
  cursor: pointer;
}

.logo-icon {
  color: var(--accent-primary);
  flex-shrink: 0;
}

.logo-text {
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--text-main);
  white-space: nowrap;
}

.nav-links {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  white-space: nowrap;
}

.nav-item:hover {
  background: rgba(148, 163, 184, 0.08);
  color: var(--text-main);
}

.nav-item.active {
  background: var(--accent-primary-glow);
  color: var(--accent-primary);
  font-weight: 500;
}

.nav-item .icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-item .icon :deep(svg) {
  width: 20px;
  height: 20px;
}

.nav-item .label {
  font-size: var(--font-size-sm);
}

/* Mobile: hide sidebar */
@media (max-width: 768px) {
  .sidebar {
    display: none;
  }
}
</style>
