<template>
  <div class="panel">
    <header class="panel-header">
      <h1>{{ t('ai.title') }}</h1>
    </header>

    <div class="ai-container">
      <div class="ai-bento-layout">
        <!-- Scene Card -->
        <div class="bento-card glass-card" style="--anim-delay: 0.1s">
          <h3 class="sub-title"><span>✍️</span> {{ t('ai.sceneAndPrompt') }}</h3>
          <div class="form-group">
            <label>{{ t('ai.scenario') }}</label>
            <textarea v-model="scenario" :placeholder="t('ai.scenarioPlaceholder')" rows="5"></textarea>
          </div>
          <div class="form-group">
            <label>{{ t('ai.style') }}</label>
            <input v-model="style" type="text" :placeholder="t('ai.stylePlaceholder')" />
          </div>
        </div>

        <!-- Settings Card -->
        <div class="bento-card glass-card" style="--anim-delay: 0.2s">
          <h3 class="sub-title"><span>⚙️</span> {{ t('ai.settings') }}</h3>
          <div class="form-group">
            <label>{{ t('ai.textType') }}</label>
            <select v-model="textType"><option value="mixed">混合</option><option value="me">仅 /me</option><option value="do">仅 /do</option></select>
          </div>
          <div class="form-group">
            <label>{{ t('ai.count') }}</label>
            <input v-model.number="count" type="number" placeholder="自动" min="1" max="20" />
          </div>
          <div class="form-group">
            <label>{{ t('ai.temperature') }} <span class="accent">{{ temperature }}</span></label>
            <input v-model.number="temperature" type="range" min="0" max="2" step="0.1" style="width:100%; accent-color: var(--accent-cyan);" />
          </div>
          <button class="btn btn-primary btn-block glow-effect" :disabled="!scenario.trim() || isGenerating" @click="generate" style="margin-top:20px; padding:14px; font-size:1.05rem;">
            <span>✨</span> {{ isGenerating ? t('ai.generating') : t('ai.generate') }}
          </button>
        </div>
      </div>

      <!-- Preview -->
      <div class="bento-card glass-card" style="--anim-delay: 0.3s">
        <div class="results-header">
          <h3 class="sub-title" style="margin:0">{{ t('ai.preview') }}</h3>
          <button class="btn btn-sm btn-secondary" :disabled="generatedTexts.length === 0" @click="importToSend">{{ t('ai.importToSend') }}</button>
        </div>
        <div v-if="generatedTexts.length === 0" class="empty-state"><div class="empty-icon">✨</div><p>{{ t('ai.waitingGenerate') }}</p></div>
        <div v-for="(item, idx) in generatedTexts" :key="idx" class="text-item">
          <span class="tt" :class="'t-' + item.type">/{{ item.type }}</span>
          <span class="tc">{{ item.content }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'
import { useSenderStore } from '@/stores/sender'
import { aiApi } from '@/api/ai'
import type { TextItem } from '@/types/api'

const { t } = useI18n()
const { showToast } = useToast()
const senderStore = useSenderStore()

const scenario = ref('')
const style = ref('')
const textType = ref<'mixed' | 'me' | 'do'>('mixed')
const count = ref<number | undefined>(undefined)
const temperature = ref(0.8)
const isGenerating = ref(false)
const generatedTexts = ref<TextItem[]>([])

async function generate() {
  if (!scenario.value.trim()) return
  isGenerating.value = true
  generatedTexts.value = []
  try {
    const result = await aiApi.generate({ scenario: scenario.value, style: style.value || undefined, text_type: textType.value, count: count.value || undefined, temperature: temperature.value })
    generatedTexts.value = result.texts as TextItem[]
    showToast({ message: `生成了 ${result.texts.length} 条文本`, type: 'success' })
  } catch { showToast({ message: 'AI 生成失败', type: 'error' }) }
  finally { isGenerating.value = false }
}

function importToSend() {
  generatedTexts.value.forEach(item => senderStore.addText(item))
  showToast({ message: `已导入 ${generatedTexts.value.length} 条`, type: 'success' })
}
</script>

<style scoped>
.panel { padding: 24px 32px; max-width: var(--content-max-width); margin: 0 auto; }
.panel-header { margin-bottom: 24px; }
.panel-header h1 { font-size: var(--font-size-2xl); font-weight: 700; }
.ai-container { display: flex; flex-direction: column; gap: 20px; }
.ai-bento-layout { display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; }
.sub-title { font-size: var(--font-size-base); font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
.form-group { margin-bottom: 14px; }
.form-group label { display: block; font-size: var(--font-size-sm); font-weight: 500; margin-bottom: 6px; color: var(--text-secondary); }
.form-group textarea, .form-group input[type="text"], .form-group input[type="number"], .form-group select { width: 100%; }
.form-group textarea { resize: none; }
.accent { color: var(--accent-cyan); font-weight: 400; font-size: var(--font-size-sm); }
.results-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.text-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 14px; background: rgba(0,0,0,0.15); border-radius: 10px; margin-bottom: 6px; }
.tt { font-size: var(--font-size-xs); font-weight: 600; padding: 2px 8px; border-radius: 6px; flex-shrink: 0; }
.t-me { background: rgba(34,211,238,0.15); color: var(--accent-cyan); }
.t-do { background: rgba(167,139,250,0.15); color: var(--accent-purple); }
.tc { flex: 1; font-size: var(--font-size-sm); word-break: break-word; }
.empty-state { text-align: center; padding: 40px 20px; color: var(--text-muted); }
.empty-icon { font-size: 2rem; margin-bottom: 8px; }
.btn { padding: 8px 18px; border-radius: var(--btn-radius); font-size: var(--font-size-sm); font-weight: 500; transition: var(--btn-transition); display: inline-flex; align-items: center; gap: 6px; }
.btn-primary { background: var(--accent-primary); color: white; }
.btn-primary:hover { background: var(--accent-primary-hover); }
.btn-secondary { background: rgba(108,92,231,0.15); color: var(--accent-primary); border: 1px solid rgba(108,92,231,0.3); }
.btn-sm { padding: 5px 12px; font-size: var(--font-size-xs); }
.btn-block { width: 100%; justify-content: center; }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
@media (max-width: 768px) { .panel { padding: 16px; } .ai-bento-layout { grid-template-columns: 1fr; } }
</style>
