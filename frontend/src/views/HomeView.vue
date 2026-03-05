<template>
  <div class="panel">
    <header class="panel-header">
      <h1>{{ t('home.title') }} VanceSender</h1>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="openInBrowser">{{ t('home.openBrowser') }}</button>
        <button class="btn btn-ghost" @click="copyLocalUrl">{{ t('home.copyAddress') }}</button>
      </div>
    </header>

    <!-- Update Banner -->
    <div v-if="updateAvailable" class="update-banner glass-card">
      <div class="update-banner-main">
        <span class="update-badge">新版本可用</span>
        <span class="update-text">发现新版本 {{ latestVersion }}，建议尽快更新。</span>
      </div>
      <div class="update-banner-actions">
        <button class="btn btn-sm btn-ghost" @click="updateAvailable = false">本次关闭</button>
        <a v-if="releaseUrl" :href="releaseUrl" class="btn btn-sm btn-primary" target="_blank" rel="noopener noreferrer">查看并下载</a>
      </div>
    </div>

    <div class="bento-grid">
      <!-- Hero Card -->
      <div class="bento-card bento-hero glass-card" style="--anim-delay: 0.1s">
        <div class="hero-blur-blob blob-1"></div>
        <div class="hero-blur-blob blob-2"></div>
        <div class="hero-content">
          <div class="hero-header-wrap">
            <h2 class="hero-title">{{ t('home.title') }} VanceSender</h2>
            <p class="hero-subtitle">{{ t('home.subtitle') }}</p>
          </div>
          <div class="hero-quick-info">
            <div class="info-pill" @click="copyLocalUrl">
              <span class="pill-label">本机访问</span>
              <span class="pill-value code">{{ localUrl }}</span>
            </div>
            <div class="info-pill" @click="openDocsUrl">
              <span class="pill-label">API 文档</span>
              <span class="pill-value code">{{ docsUrl }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats Card -->
      <div class="bento-card glass-card" style="--anim-delay: 0.2s">
        <div class="bento-header">
          <h2>
            <div class="card-icon-wrapper">
              <div class="icon-glow"></div>
              <svg class="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" />
              </svg>
            </div>
            运行情况
          </h2>
        </div>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-value">{{ stats.total_sent }}</span>
            <span class="stat-label">{{ t('home.totalSent') }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-value text-accent-success">{{ stats.success_rate }}%</span>
            <span class="stat-label">{{ t('home.successRate') }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ stats.total_batches }}</span>
            <span class="stat-label">{{ t('home.batchCount') }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-value text-accent-danger">{{ stats.total_failed }}</span>
            <span class="stat-label">{{ t('home.failedCount') }}</span>
          </div>
        </div>
      </div>

      <!-- Update Card -->
      <div class="bento-card bento-small glass-card" style="--anim-delay: 0.3s">
        <div class="bento-header">
          <h2>
            <div class="card-icon-wrapper">
              <div class="icon-glow glow-green"></div>
              <svg class="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </div>
            版本检查
          </h2>
          <span class="status-badge text-muted">{{ updateStatus }}</span>
        </div>
        <div class="update-meta">
          <div class="update-v-item">
            <span class="v-label">{{ t('home.currentVersion') }}</span>
            <strong class="v-val">{{ currentVersion }}</strong>
          </div>
          <div class="update-v-separator"></div>
          <div class="update-v-item">
            <span class="v-label">{{ t('home.latestVersion') }}</span>
            <strong class="v-val">{{ latestVersion }}</strong>
          </div>
        </div>
        <div class="update-actions">
          <label class="inline-checkbox">
            <input v-model="includePrerelease" type="checkbox" />
            <span>{{ t('home.includePrerelease') }}</span>
          </label>
          <button class="btn btn-sm btn-outline" @click="checkUpdate">{{ t('home.checkUpdate') }}</button>
        </div>
      </div>

      <!-- Resources Card -->
      <div class="bento-card bento-small glass-card" style="--anim-delay: 0.4s">
        <div class="bento-header">
          <h2>
            <div class="card-icon-wrapper">
              <div class="icon-glow glow-purple"></div>
              <svg class="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
            {{ t('home.resources') }}
          </h2>
        </div>
        <div class="micro-cards">
          <a class="micro-card" href="https://sender.vhuds.com/help.html" target="_blank" rel="noopener noreferrer">
            <div class="mc-icon">📖</div><span class="mc-text">{{ t('home.docs') }}</span>
          </a>
          <a class="micro-card" href="https://qm.qq.com/q/RNjqaPwYme" target="_blank" rel="noopener noreferrer">
            <div class="mc-icon">💬</div><span class="mc-text">{{ t('home.joinGroup') }}</span>
          </a>
          <a class="micro-card" href="https://sender.vhuds.com" target="_blank" rel="noopener noreferrer">
            <div class="mc-icon">🌐</div><span class="mc-text">{{ t('home.website') }}</span>
          </a>
          <a class="micro-card" href="https://github.com/vancehuds/VanceSender" target="_blank" rel="noopener noreferrer">
            <div class="mc-icon">⭐</div><span class="mc-text">{{ t('home.repo') }}</span>
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { settingsApi } from '@/api/settings'
import { statsApi } from '@/api/stats'
import { useToast } from '@/composables/useToast'
import type { AppStats } from '@/types/api'

const { t } = useI18n()
const { showToast } = useToast()

const localUrl = ref('http://127.0.0.1:8730')
const docsUrl = ref('http://127.0.0.1:8730/docs')
const currentVersion = ref('-')
const latestVersion = ref('-')
const updateStatus = ref('检查中...')
const updateAvailable = ref(false)
const releaseUrl = ref('')
const includePrerelease = ref(false)
const stats = ref<AppStats>({
  total_sent: 0,
  total_success: 0,
  total_failed: 0,
  total_batches: 0,
  success_rate: 0,
  most_used_presets: [],
})

async function loadStats() {
  try {
    stats.value = await statsApi.get()
  } catch {
    // Stats may not be available
  }
}

async function loadRuntimeInfo() {
  try {
    const info = await settingsApi.runtimeInfo()
    const port = info.port || 8730
    localUrl.value = `http://127.0.0.1:${port}`
    docsUrl.value = `http://127.0.0.1:${port}/docs`
    currentVersion.value = info.version || '-'
  } catch {
    // Runtime info may not be available yet
  }
}

async function checkUpdate() {
  updateStatus.value = '检查中...'
  try {
    const result = await settingsApi.checkUpdate(includePrerelease.value)
    currentVersion.value = result.current_version
    latestVersion.value = result.latest_version
    updateAvailable.value = result.update_available
    releaseUrl.value = result.release_url || ''
    updateStatus.value = result.update_available ? '有更新' : '已是最新'
  } catch {
    updateStatus.value = '检查失败'
  }
}

function copyLocalUrl() {
  navigator.clipboard.writeText(localUrl.value)
  showToast({ message: '已复制到剪贴板', type: 'success' })
}

function openInBrowser() {
  window.open(localUrl.value, '_blank')
}

function openDocsUrl() {
  window.open(docsUrl.value, '_blank')
}

onMounted(() => {
  loadStats()
  loadRuntimeInfo()
  checkUpdate()
})
</script>

<style scoped>
.panel {
  padding: 24px 32px;
  max-width: var(--content-max-width);
  margin: 0 auto;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.panel-header h1 {
  font-size: var(--font-size-2xl);
  font-weight: 700;
}

.header-actions {
  display: flex;
  gap: 8px;
}

/* Buttons */
.btn {
  padding: 8px 18px;
  border-radius: var(--btn-radius);
  font-size: var(--font-size-sm);
  font-weight: 500;
  transition: var(--btn-transition);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-primary {
  background: var(--accent-primary);
  color: white;
}

.btn-primary:hover {
  background: var(--accent-primary-hover);
}

.btn-secondary {
  background: rgba(108, 92, 231, 0.15);
  color: var(--accent-primary);
  border: 1px solid rgba(108, 92, 231, 0.3);
}

.btn-secondary:hover {
  background: rgba(108, 92, 231, 0.25);
}

.btn-ghost {
  color: var(--text-secondary);
}

.btn-ghost:hover {
  color: var(--text-main);
  background: rgba(148, 163, 184, 0.08);
}

.btn-outline {
  border: 1px solid var(--glass-border);
  color: var(--text-secondary);
}

.btn-outline:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.btn-sm {
  padding: 5px 12px;
  font-size: var(--font-size-xs);
}

/* Update Banner */
.update-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  margin-bottom: 20px;
  border-left: 3px solid var(--accent-warning);
}

.update-banner-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.update-badge {
  background: var(--accent-warning);
  color: var(--text-inverse);
  padding: 2px 10px;
  border-radius: 20px;
  font-size: var(--font-size-xs);
  font-weight: 600;
}

.update-banner-actions {
  display: flex;
  gap: 8px;
}

/* Bento Grid */
.bento-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.bento-hero {
  grid-column: 1 / -1;
  position: relative;
  overflow: hidden;
}

.hero-content {
  position: relative;
  z-index: 1;
}

.hero-title {
  font-size: var(--font-size-2xl);
  font-weight: 700;
  margin-bottom: 6px;
}

.hero-subtitle {
  color: var(--text-secondary);
  font-size: var(--font-size-base);
}

.hero-quick-info {
  display: flex;
  gap: 16px;
  margin-top: 20px;
}

.info-pill {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 16px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.info-pill:hover {
  background: rgba(0, 0, 0, 0.35);
}

.pill-label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.pill-value {
  font-size: var(--font-size-sm);
  color: var(--accent-cyan);
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-top: 16px;
}

.stat-item {
  text-align: center;
}

.stat-value {
  display: block;
  font-size: var(--font-size-xl);
  font-weight: 700;
  margin-bottom: 4px;
}

.stat-label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

/* Update meta */
.update-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 14px 0;
}

.update-v-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.v-label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.v-val {
  font-size: var(--font-size-sm);
}

.update-v-separator {
  width: 1px;
  height: 28px;
  background: var(--glass-border);
}

.update-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.inline-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  cursor: pointer;
}

.inline-checkbox input {
  accent-color: var(--accent-primary);
}

/* Bento header */
.bento-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.bento-header h2 {
  display: flex;
  align-items: center;
  font-size: var(--font-size-base);
  font-weight: 600;
}

.card-title-icon {
  width: 18px;
  height: 18px;
  position: relative;
  z-index: 1;
}

.status-badge {
  font-size: var(--font-size-xs);
  padding: 3px 10px;
  border-radius: 20px;
  background: rgba(148, 163, 184, 0.1);
}

/* Micro cards (resources) */
.micro-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.micro-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.15);
  color: var(--text-secondary);
  transition: all 0.2s ease;
}

.micro-card:hover {
  background: rgba(0, 0, 0, 0.3);
  color: var(--text-main);
  transform: translateY(-1px);
}

.mc-icon {
  font-size: 1.1rem;
}

.mc-text {
  font-size: var(--font-size-sm);
}

@media (max-width: 768px) {
  .panel {
    padding: 16px;
  }

  .bento-grid {
    grid-template-columns: 1fr;
  }

  .hero-quick-info {
    flex-direction: column;
    gap: 8px;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .panel-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
}
</style>
