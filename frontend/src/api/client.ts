import { ofetch, type FetchOptions } from 'ofetch'

/** True when running inside a Tauri desktop shell. */
const IS_TAURI = '__TAURI_INTERNALS__' in window || '__TAURI__' in window

const TOKEN_KEY = 'vs_token'

// ── Dynamic backend origin resolution ────────────────────────────────────

/**
 * Resolves the backend origin (e.g. `http://127.0.0.1:8730`).
 *
 * - In Tauri: calls the `get_backend_port` command to read the real port.
 * - In browser: returns empty string (relative URLs via Vite proxy / same-origin).
 */
async function resolveOrigin(): Promise<string> {
    if (!IS_TAURI) return ''
    try {
        const { invoke } = await import('@tauri-apps/api/core')
        const port: number = await invoke('get_backend_port')
        return `http://127.0.0.1:${port}`
    } catch {
        // Fallback to default port if command fails
        return 'http://127.0.0.1:8730'
    }
}

/** Promise that resolves to the backend origin string once. */
const backendOriginPromise: Promise<string> = resolveOrigin()

/** Cached synchronous value — set as soon as the promise resolves. */
let _backendOrigin: string = IS_TAURI ? 'http://127.0.0.1:8730' : ''
backendOriginPromise.then(v => { _backendOrigin = v })

/**
 * Synchronous getter — returns the resolved origin immediately.
 * Safe to use after the first API call (origin resolves in <1ms).
 */
export function getBackendOrigin(): string {
    return _backendOrigin
}

/** Async getter — guarantees the origin is resolved. */
export async function ensureBackendOrigin(): Promise<string> {
    return backendOriginPromise
}

// ── Token helpers ────────────────────────────────────────────────────────

/** Get stored auth token */
export function getToken(): string | null {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY)
}

/** Store auth token */
export function setToken(token: string) {
    sessionStorage.setItem(TOKEN_KEY, token)
}

/** Clear stored auth token */
export function clearToken() {
    sessionStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_KEY)
}

// ── API client ───────────────────────────────────────────────────────────

/** Auth-aware API client */
export const api = ofetch.create({
    retry: 0,
    async onRequest({ options }) {
        // Ensure base URL is resolved before every request
        const origin = await backendOriginPromise
        options.baseURL = `${origin}/api/v1`

        const token = getToken()
        if (token) {
            const headers = new Headers(options.headers)
            headers.set('Authorization', `Bearer ${token}`)
            options.headers = headers
        }
    },
    onResponseError({ response }) {
        if (response.status === 401) {
            clearToken()
            // Auth failure will be handled by the composable
            window.dispatchEvent(new CustomEvent('vs:auth-failure'))
        }
    },
})

/** Type-safe GET helper */
export function apiGet<T>(url: string, options?: FetchOptions<'json'>) {
    return api<T>(url, { method: 'GET', ...options })
}

/** Type-safe POST helper */
export function apiPost<T>(url: string, body?: Record<string, any>, options?: FetchOptions<'json'>) {
    return api<T>(url, { method: 'POST', body, ...options })
}

/** Type-safe PUT helper */
export function apiPut<T>(url: string, body?: Record<string, any>, options?: FetchOptions<'json'>) {
    return api<T>(url, { method: 'PUT', body, ...options })
}

/** Type-safe DELETE helper */
export function apiDelete<T>(url: string, options?: FetchOptions<'json'>) {
    return api<T>(url, { method: 'DELETE', ...options })
}

/** Type-safe PATCH helper */
export function apiPatch<T>(url: string, body?: Record<string, any>, options?: FetchOptions<'json'>) {
    return api<T>(url, { method: 'PATCH', body, ...options })
}
