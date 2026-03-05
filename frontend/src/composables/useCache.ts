import { ref, type Ref } from 'vue'

interface CacheEntry<T> {
    data: T
    timestamp: number
}

interface UseCacheOptions {
    /** Time-to-live in milliseconds. Default: 5 minutes */
    ttl?: number
    /** Unique key for localStorage persistence */
    persistKey?: string
}

/**
 * Simple reactive cache with TTL and optional localStorage persistence.
 * Wraps an async fetch function, returning cached data if still fresh.
 */
export function useCache<T>(
    fetchFn: () => Promise<T>,
    options: UseCacheOptions = {}
) {
    const { ttl = 5 * 60 * 1000, persistKey } = options

    const data = ref<T | null>(null) as Ref<T | null>
    const isLoading = ref(false)
    const error = ref<string | null>(null)

    let cache: CacheEntry<T> | null = null

    // Restore from localStorage if available
    if (persistKey) {
        try {
            const stored = localStorage.getItem(`vs-cache:${persistKey}`)
            if (stored) {
                const parsed: CacheEntry<T> = JSON.parse(stored)
                if (Date.now() - parsed.timestamp < ttl) {
                    cache = parsed
                    data.value = parsed.data
                } else {
                    localStorage.removeItem(`vs-cache:${persistKey}`)
                }
            }
        } catch {
            // ignore corrupt cache
        }
    }

    function isFresh(): boolean {
        return cache !== null && (Date.now() - cache.timestamp) < ttl
    }

    async function fetch(force = false): Promise<T> {
        if (!force && isFresh()) {
            data.value = cache!.data
            return cache!.data
        }

        isLoading.value = true
        error.value = null

        try {
            const result = await fetchFn()
            cache = { data: result, timestamp: Date.now() }
            data.value = result

            if (persistKey) {
                try {
                    localStorage.setItem(`vs-cache:${persistKey}`, JSON.stringify(cache))
                } catch {
                    // localStorage full or unavailable
                }
            }

            return result
        } catch (err) {
            error.value = (err as Error).message || '加载失败'
            throw err
        } finally {
            isLoading.value = false
        }
    }

    function invalidate() {
        cache = null
        data.value = null
        if (persistKey) {
            localStorage.removeItem(`vs-cache:${persistKey}`)
        }
    }

    return {
        data,
        isLoading,
        error,
        fetch,
        invalidate,
        isFresh,
    }
}
