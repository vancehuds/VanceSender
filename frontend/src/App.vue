<template>
  <div class="app-container" :class="{ 'sidebar-collapsed': appStore.sidebarCollapsed, 'is-mobile': appStore.isMobile }">
    <!-- Desktop Titlebar -->
    <DesktopTitlebar v-if="appStore.isDesktop" />

    <!-- Sidebar -->
    <AppSidebar />

    <!-- Main Content -->
    <main class="content">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- Mobile Tab Bar -->
    <MobileTabBar v-if="appStore.isMobile" />

    <!-- Toast Container -->
    <VToast />

    <!-- Auth Gate -->
    <AuthGate v-if="auth.showAuthGate.value" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useAuth } from '@/composables/useAuth'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import DesktopTitlebar from '@/components/layout/DesktopTitlebar.vue'
import MobileTabBar from '@/components/layout/MobileTabBar.vue'
import VToast from '@/components/ui/VToast.vue'
import AuthGate from '@/components/common/AuthGate.vue'

const appStore = useAppStore()
const auth = useAuth()

function handleResize() {
  appStore.updateMobileState()
}

onMounted(() => {
  appStore.initDesktopContext()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.app-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--bg-main);
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

.is-mobile .content {
  padding-bottom: 72px; /* Space for mobile tab bar */
}

/* Page transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
