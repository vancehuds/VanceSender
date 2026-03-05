import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { DesktopContext } from '@/types/api'

const DESKTOP_SESSION_KEY = 'vs_desktop_client'

export const useAppStore = defineStore('app', () => {
    // --- Desktop context ---
    const desktopContext = ref<DesktopContext>({ isDesktop: false })

    function initDesktopContext() {
        // Read from URL params (set by pywebview/tauri launcher)
        const params = new URLSearchParams(window.location.search)
        const isDesktop = params.get('vs_desktop') === '1' || sessionStorage.getItem(DESKTOP_SESSION_KEY) === '1'
        const token = params.get('vs_token') || undefined

        if (isDesktop) {
            sessionStorage.setItem(DESKTOP_SESSION_KEY, '1')
        }

        desktopContext.value = { isDesktop, token }
    }

    const isDesktop = computed(() => desktopContext.value.isDesktop)

    // --- Auth state ---
    const isAuthenticated = ref(false)
    const authRequired = ref(false)

    // --- UI state ---
    const sidebarCollapsed = ref(false)
    const isMobile = ref(window.innerWidth < 768)

    function toggleSidebar() {
        sidebarCollapsed.value = !sidebarCollapsed.value
    }

    function updateMobileState() {
        isMobile.value = window.innerWidth < 768
    }

    return {
        // Desktop
        desktopContext,
        isDesktop,
        initDesktopContext,
        // Auth
        isAuthenticated,
        authRequired,
        // UI
        sidebarCollapsed,
        isMobile,
        toggleSidebar,
        updateMobileState,
    }
})
