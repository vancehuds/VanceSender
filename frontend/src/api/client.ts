import { ofetch, type FetchOptions } from 'ofetch'

const API_BASE = '/api/v1'
const TOKEN_KEY = 'vs_token'

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

/** Auth-aware API client */
export const api = ofetch.create({
    baseURL: API_BASE,
    retry: 0,
    onRequest({ options }) {
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
export function apiGet<T>(url: string, options?: FetchOptions) {
    return api<T>(url, { method: 'GET', ...options })
}

/** Type-safe POST helper */
export function apiPost<T>(url: string, body?: unknown, options?: FetchOptions) {
    return api<T>(url, { method: 'POST', body, ...options })
}

/** Type-safe PUT helper */
export function apiPut<T>(url: string, body?: unknown, options?: FetchOptions) {
    return api<T>(url, { method: 'PUT', body, ...options })
}

/** Type-safe DELETE helper */
export function apiDelete<T>(url: string, options?: FetchOptions) {
    return api<T>(url, { method: 'DELETE', ...options })
}

/** Type-safe PATCH helper */
export function apiPatch<T>(url: string, body?: unknown, options?: FetchOptions) {
    return api<T>(url, { method: 'PATCH', body, ...options })
}
