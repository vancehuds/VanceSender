import { ref, onMounted, onUnmounted } from 'vue'
import { useSenderStore } from '@/stores/sender'
import { getToken } from '@/api/client'

export function useWebSocket() {
    const ws = ref<WebSocket | null>(null)
    const isConnected = ref(false)
    const reconnectTimer = ref<number | null>(null)

    function getWsUrl() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
        const token = getToken()
        const tokenParam = token ? `?token=${encodeURIComponent(token)}` : ''
        return `${protocol}//${location.host}/api/v1/ws${tokenParam}`
    }

    function connect() {
        if (ws.value?.readyState === WebSocket.OPEN) return

        try {
            ws.value = new WebSocket(getWsUrl())

            ws.value.onopen = () => {
                isConnected.value = true
                if (reconnectTimer.value) {
                    clearTimeout(reconnectTimer.value)
                    reconnectTimer.value = null
                }
            }

            ws.value.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    handleMessage(data)
                } catch {
                    // ignore non-JSON messages
                }
            }

            ws.value.onclose = () => {
                isConnected.value = false
                scheduleReconnect()
            }

            ws.value.onerror = () => {
                isConnected.value = false
            }
        } catch {
            scheduleReconnect()
        }
    }

    function scheduleReconnect() {
        if (reconnectTimer.value) return
        reconnectTimer.value = window.setTimeout(() => {
            reconnectTimer.value = null
            connect()
        }, 3000)
    }

    function disconnect() {
        if (reconnectTimer.value) {
            clearTimeout(reconnectTimer.value)
            reconnectTimer.value = null
        }
        ws.value?.close()
        ws.value = null
        isConnected.value = false
    }

    function handleMessage(data: { type: string;[key: string]: unknown }) {
        const senderStore = useSenderStore()

        switch (data.type) {
            case 'send_progress':
                senderStore.sendProgress = {
                    current: data.current as number,
                    total: data.total as number,
                }
                break

            case 'send_complete':
                senderStore.isSending = false
                senderStore.sendTaskId = null
                break

            case 'send_error':
                senderStore.isSending = false
                break
        }
    }

    onMounted(connect)
    onUnmounted(disconnect)

    return {
        isConnected,
        connect,
        disconnect,
    }
}
