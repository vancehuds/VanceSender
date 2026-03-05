import { ref } from 'vue'
import { getToken } from '@/api/client'
import type { TextItem, TextType } from '@/types/api'

export interface StreamGenerateOptions {
    scenario: string
    style?: string
    text_type?: 'mixed' | 'me' | 'do'
    count?: number
    temperature?: number
}

/**
 * Composable for streaming AI text generation via SSE.
 * Progressively adds generated text items as they arrive.
 */
export function useAIStream() {
    const isStreaming = ref(false)
    const streamedTexts = ref<TextItem[]>([])
    const streamError = ref<string | null>(null)
    const abortController = ref<AbortController | null>(null)

    async function startStream(options: StreamGenerateOptions) {
        isStreaming.value = true
        streamedTexts.value = []
        streamError.value = null
        abortController.value = new AbortController()

        const token = getToken()
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        }
        if (token) headers['Authorization'] = `Bearer ${token}`

        try {
            const response = await fetch('/api/v1/ai/generate/stream', {
                method: 'POST',
                headers,
                body: JSON.stringify(options),
                signal: abortController.value.signal,
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const reader = response.body?.getReader()
            if (!reader) throw new Error('No response body')

            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || '' // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6).trim()
                        if (data === '[DONE]') continue

                        try {
                            const parsed = JSON.parse(data)
                            if (parsed.type === 'text') {
                                streamedTexts.value.push({
                                    type: (parsed.text_type || 'me') as TextType,
                                    content: parsed.content,
                                })
                            } else if (parsed.type === 'error') {
                                streamError.value = parsed.message
                            }
                        } catch {
                            // Skip non-JSON SSE lines
                        }
                    }
                }
            }
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                streamError.value = (err as Error).message || '流式生成失败'
            }
        } finally {
            isStreaming.value = false
            abortController.value = null
        }
    }

    function cancelStream() {
        abortController.value?.abort()
        isStreaming.value = false
    }

    return {
        isStreaming,
        streamedTexts,
        streamError,
        startStream,
        cancelStream,
    }
}
