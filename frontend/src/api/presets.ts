import { apiGet, apiPost, apiDelete } from './client'
import type { Preset } from '@/types/api'

export const presetsApi = {
    /** Get all presets */
    list() {
        return apiGet<Preset[]>('/presets')
    },

    /** Get a single preset by ID */
    get(id: string) {
        return apiGet<Preset>(`/presets/${id}`)
    },

    /** Create a new preset */
    create(data: { name: string; texts: Preset['texts']; tags?: string[] }) {
        return apiPost<Preset>('/presets', data)
    },

    /** Update an existing preset */
    update(id: string, data: Partial<Pick<Preset, 'name' | 'texts' | 'tags'>>) {
        return apiPost<Preset>(`/presets/${id}`, data)
    },

    /** Delete a preset */
    delete(id: string) {
        return apiDelete<void>(`/presets/${id}`)
    },

    /** Delete multiple presets */
    deleteMany(ids: string[]) {
        return apiPost<void>('/presets/batch-delete', { ids })
    },

    /** Reorder presets */
    reorder(ids: string[]) {
        return apiPost<void>('/presets/reorder', { ids })
    },

    /** Export all presets */
    exportAll() {
        return apiGet<Preset[]>('/presets/export')
    },

    /** Import presets */
    import(presets: Preset[]) {
        return apiPost<{ imported: number }>('/presets/import', presets)
    },
}
