<template>
  <header class="desktop-titlebar" data-tauri-drag-region>
    <div class="titlebar-drag" data-tauri-drag-region>
      <div class="titlebar-brand">
        <div class="titlebar-logo">
          <svg viewBox="0 0 256 256" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
            <polygon points="180,76 76,128 116,140" fill="currentColor" />
            <polygon points="180,76 116,140 128,180" fill="currentColor" />
            <polygon points="116,140 128,180 110,160" fill="currentColor" />
          </svg>
        </div>
        <div class="titlebar-meta">
          <span class="titlebar-name">VanceSender</span>
          <span class="titlebar-sub">重新定义RP文本发送体验</span>
        </div>
      </div>
    </div>
    <div class="titlebar-actions">
      <button class="window-btn" title="最小化" @click="desktop.minimize()">
        <svg viewBox="0 0 12 12" width="12" height="12"><line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" stroke-width="1.2"/></svg>
      </button>
      <button class="window-btn" title="最大化" @click="desktop.toggleMaximize()">
        <svg v-if="!desktop.isMaximized.value" viewBox="0 0 12 12" width="12" height="12"><rect x="2" y="2" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
        <svg v-else viewBox="0 0 12 12" width="12" height="12"><rect x="3" y="1" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1"/><rect x="1" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1"/></svg>
      </button>
      <button class="window-btn window-btn-close" title="关闭" @click="desktop.close()">
        <svg viewBox="0 0 12 12" width="12" height="12"><line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" stroke-width="1.2"/><line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" stroke-width="1.2"/></svg>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useDesktop } from '@/composables/useDesktop'
const desktop = useDesktop()
</script>

<style scoped>
.desktop-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--titlebar-height);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--glass-border);
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: var(--z-titlebar);
  user-select: none;
}

.titlebar-drag {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0 12px;
  height: 100%;
}

.titlebar-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.titlebar-logo { color: var(--accent-primary); }

.titlebar-meta {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.titlebar-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-main);
}

.titlebar-sub {
  font-size: 0.68rem;
  color: var(--text-muted);
}

.titlebar-actions {
  display: flex;
  height: 100%;
}

.window-btn {
  width: 46px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: background 0.15s ease, color 0.15s ease;
}

.window-btn:hover {
  background: rgba(148, 163, 184, 0.1);
  color: var(--text-main);
}

.window-btn-close:hover {
  background: var(--accent-danger);
  color: white;
}
</style>
