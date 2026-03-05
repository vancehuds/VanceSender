<template>
  <div class="panel">
    <header class="panel-header">
      <h1>{{ t('settings.title') }}</h1>
      <div class="header-actions">
        <select v-model="language" class="lang-select" @change="switchLanguage">
          <option value="zh-CN">中文</option><option value="en">English</option>
        </select>
        <button class="btn btn-primary btn-sm" @click="saveAll">{{ t('settings.save') }}</button>
      </div>
    </header>

    <div class="settings-container">
      <!-- Sender Settings -->
      <div class="glass-card settings-section">
        <h2>{{ t('settings.sender') }}</h2>
        <div class="form-row">
          <div class="form-group"><label>{{ t('settings.method') }}</label>
            <select v-model="form.method"><option value="clipboard">{{ t('settings.clipboard') }}</option><option value="typing">{{ t('settings.typing') }}</option></select>
          </div>
          <div class="form-group"><label>{{ t('settings.chatKey') }}</label>
            <input v-model="form.chat_key" type="text" maxlength="1" />
          </div>
          <div class="form-group"><label>{{ t('settings.delayOpen') }}</label>
            <input v-model.number="form.delay_open_chat" type="number" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>{{ t('settings.delayPaste') }}</label>
            <input v-model.number="form.delay_after_paste" type="number" />
          </div>
          <div class="form-group"><label>{{ t('settings.delaySend') }}</label>
            <input v-model.number="form.delay_after_send" type="number" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>{{ t('settings.focusTimeout') }}</label>
            <input v-model.number="form.focus_timeout" type="number" />
          </div>
          <div class="form-group"><label>{{ t('settings.retryCount') }}</label>
            <input v-model.number="form.retry_count" type="number" />
          </div>
          <div class="form-group"><label>{{ t('settings.retryInterval') }}</label>
            <input v-model.number="form.retry_interval" type="number" />
          </div>
        </div>
      </div>

      <!-- Network -->
      <div class="glass-card settings-section">
        <h2>{{ t('settings.network') }}</h2>
        <div class="form-row">
          <div class="form-group"><label>{{ t('settings.lanAccess') }}</label>
            <label class="toggle"><input v-model="form.lan_access" type="checkbox" /><span class="toggle-slider"></span></label>
          </div>
          <div class="form-group"><label>{{ t('settings.token') }}</label>
            <input v-model="form.token" type="password" placeholder="留空则不启用" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'
import { settingsApi } from '@/api/settings'
import { setLanguage, getCurrentLang } from '@/i18n'

const { t } = useI18n()
const { showToast } = useToast()
const language = ref(getCurrentLang())

const form = reactive({
  method: 'clipboard' as 'clipboard' | 'typing',
  chat_key: 't',
  delay_open_chat: 100,
  delay_after_paste: 50,
  delay_after_send: 50,
  focus_timeout: 5000,
  retry_count: 2,
  retry_interval: 300,
  delay_between_lines: 1500,
  lan_access: false,
  token: '',
})

async function loadSettings() {
  try {
    const s = await settingsApi.getAll()
    Object.assign(form, {
      method: s.sender?.method ?? 'clipboard',
      chat_key: s.sender?.chat_key ?? 't',
      delay_open_chat: s.sender?.delay_open_chat ?? 100,
      delay_after_paste: s.sender?.delay_after_paste ?? 50,
      delay_after_send: s.sender?.delay_after_send ?? 50,
      focus_timeout: s.sender?.focus_timeout ?? 5000,
      retry_count: s.sender?.retry_count ?? 2,
      retry_interval: s.sender?.retry_interval ?? 300,
      delay_between_lines: s.sender?.delay_between_lines ?? 1500,
      lan_access: s.server?.lan_access ?? false,
      token: s.server?.token ?? '',
    })
  } catch { /* settings may not be available */ }
}

async function saveAll() {
  try {
    await settingsApi.save({
      sender: { method: form.method, chat_key: form.chat_key, delay_open_chat: form.delay_open_chat, delay_after_paste: form.delay_after_paste, delay_after_send: form.delay_after_send, focus_timeout: form.focus_timeout, retry_count: form.retry_count, retry_interval: form.retry_interval, delay_between_lines: form.delay_between_lines },
      server: { lan_access: form.lan_access, token: form.token },
    })
    showToast({ message: '设置已保存', type: 'success' })
  } catch { showToast({ message: '保存失败', type: 'error' }) }
}

function switchLanguage() {
  setLanguage(language.value as 'zh-CN' | 'en')
}

onMounted(loadSettings)
</script>

<style scoped>
.panel { padding: 24px 32px; max-width: var(--content-max-width); margin: 0 auto; }
.panel-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
.panel-header h1 { font-size: var(--font-size-2xl); font-weight: 700; }
.header-actions { display: flex; gap: 8px; align-items: center; }
.lang-select { padding: 6px 10px; border-radius: 8px; background: var(--glass-bg); color: var(--text-main); border: 1px solid var(--glass-border); font-size: var(--font-size-sm); }
.settings-container { display: flex; flex-direction: column; gap: 20px; }
.settings-section { padding: var(--card-padding); }
.settings-section h2 { font-size: var(--font-size-lg); font-weight: 600; margin-bottom: 16px; }
.form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 12px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: var(--font-size-sm); color: var(--text-secondary); font-weight: 500; }
.form-group input, .form-group select { width: 100%; }
.toggle { position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle-slider { position: absolute; inset: 0; background: rgba(148,163,184,0.2); border-radius: 24px; transition: 0.3s; }
.toggle-slider::before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: 0.3s; }
.toggle input:checked + .toggle-slider { background: var(--accent-primary); }
.toggle input:checked + .toggle-slider::before { transform: translateX(20px); }
.btn { padding: 8px 18px; border-radius: var(--btn-radius); font-size: var(--font-size-sm); font-weight: 500; transition: var(--btn-transition); }
.btn-primary { background: var(--accent-primary); color: white; }
.btn-primary:hover { background: var(--accent-primary-hover); }
.btn-sm { padding: 5px 12px; font-size: var(--font-size-xs); }
@media (max-width: 768px) { .panel { padding: 16px; } .form-row { grid-template-columns: 1fr; } }
</style>
