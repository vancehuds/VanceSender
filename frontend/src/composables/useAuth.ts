import { ref, onMounted, onUnmounted } from 'vue'
import { getToken, setToken, clearToken } from '@/api/client'
import { useAppStore } from '@/stores/app'

export function useAuth() {
    const appStore = useAppStore()
    const showAuthGate = ref(false)
    const tokenInput = ref('')
    const authError = ref('')

    function handleAuthFailure() {
        showAuthGate.value = true
        appStore.isAuthenticated = false
    }

    async function submitToken() {
        const token = tokenInput.value.trim()
        if (!token) {
            authError.value = '请输入 Token'
            return
        }

        setToken(token)
        authError.value = ''

        try {
            // Verify token by hitting a simple endpoint
            const response = await fetch('/api/v1/stats', {
                headers: { Authorization: `Bearer ${token}` },
            })
            if (response.ok) {
                showAuthGate.value = false
                appStore.isAuthenticated = true
                appStore.authRequired = true
            } else if (response.status === 401) {
                clearToken()
                authError.value = 'Token 错误，请重新输入'
            }
        } catch {
            // Server unreachable — proceed, errors will surface later
            showAuthGate.value = false
        }
    }

    function initAuth() {
        // Check desktop context token
        if (appStore.desktopContext.token) {
            setToken(appStore.desktopContext.token)
        }

        // Listen for auth failures from API client
        window.addEventListener('vs:auth-failure', handleAuthFailure)
    }

    function cleanupAuth() {
        window.removeEventListener('vs:auth-failure', handleAuthFailure)
    }

    onMounted(initAuth)
    onUnmounted(cleanupAuth)

    return {
        showAuthGate,
        tokenInput,
        authError,
        submitToken,
        isAuthenticated: () => !!getToken(),
    }
}
