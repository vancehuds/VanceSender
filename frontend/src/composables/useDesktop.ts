import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'

/**
 * Desktop shell composable — abstracts window controls.
 * Uses Tauri APIs when running in Tauri, falls back to custom events otherwise.
 */
export function useDesktop() {
    const appStore = useAppStore()
    const isDesktop = computed(() => appStore.isDesktop)
    const isMaximized = ref(false)
    const isTauri = computed(() => '__TAURI__' in window || '__TAURI_INTERNALS__' in window)

    async function getTauriWindow() {
        try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window')
            return getCurrentWindow()
        } catch {
            return null
        }
    }

    async function minimize() {
        const win = await getTauriWindow()
        if (win) {
            await win.minimize()
        } else {
            window.dispatchEvent(new CustomEvent('vs:window-action', { detail: 'minimize' }))
        }
    }

    async function toggleMaximize() {
        const win = await getTauriWindow()
        if (win) {
            await win.toggleMaximize()
            isMaximized.value = await win.isMaximized()
        } else {
            isMaximized.value = !isMaximized.value
            window.dispatchEvent(new CustomEvent('vs:window-action', { detail: 'toggleMaximize' }))
        }
    }

    async function close() {
        const win = await getTauriWindow()
        if (win) {
            await win.hide() // Hide to tray instead of close
        } else {
            window.dispatchEvent(new CustomEvent('vs:window-action', { detail: 'close' }))
        }
    }

    /** Open URL in default browser */
    async function openExternal(url: string) {
        if (isTauri.value) {
            try {
                const { open } = await import('@tauri-apps/plugin-shell')
                await open(url)
            } catch {
                window.open(url, '_blank')
            }
        } else {
            window.open(url, '_blank')
        }
    }

    return {
        isDesktop,
        isTauri,
        isMaximized,
        minimize,
        toggleMaximize,
        close,
        openExternal,
    }
}
