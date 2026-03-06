import { ref } from 'vue'

export interface ToastOptions {
    message: string
    type?: 'success' | 'error' | 'info' | 'warning'
    duration?: number
}

interface ToastItem extends ToastOptions {
    id: number
}

let nextId = 0
const toasts = ref<ToastItem[]>([])

export function useToast() {
    function showToast(options: ToastOptions | string) {
        const opts = typeof options === 'string' ? { message: options } : options
        const toast: ToastItem = {
            id: nextId++,
            message: opts.message,
            type: opts.type || 'info',
            duration: opts.duration ?? 3000,
        }
        toasts.value.push(toast)

        if (toast.duration! > 0) {
            setTimeout(() => {
                removeToast(toast.id)
            }, toast.duration)
        }
    }

    function removeToast(id: number) {
        const idx = toasts.value.findIndex((t) => t.id === id)
        if (idx >= 0) toasts.value.splice(idx, 1)
    }

    return {
        toasts,
        showToast,
        removeToast,
    }
}
