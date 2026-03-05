<template>
  <div class="auth-gate-overlay">
    <div class="auth-gate glass-card">
      <div class="auth-logo">
        <svg viewBox="0 0 256 256" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
          <polygon points="180,76 76,128 116,140" fill="currentColor" />
          <polygon points="180,76 116,140 128,180" fill="currentColor" />
          <polygon points="116,140 128,180 110,160" fill="currentColor" />
        </svg>
      </div>
      <h2>VanceSender</h2>
      <p class="auth-desc">此服务已启用 Token 认证，请输入访问令牌。</p>
      <form @submit.prevent="auth.submitToken()">
        <input
          v-model="auth.tokenInput.value"
          type="password"
          placeholder="输入 Token..."
          class="auth-input"
          autofocus
        />
        <p v-if="auth.authError.value" class="auth-error">{{ auth.authError.value }}</p>
        <button type="submit" class="auth-btn">验证</button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuth } from '@/composables/useAuth'

const auth = useAuth()
</script>

<style scoped>
.auth-gate-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
}

.auth-gate {
  width: 360px;
  max-width: 90vw;
  text-align: center;
  padding: 40px 32px;
}

.auth-logo {
  color: var(--accent-primary);
  margin-bottom: 16px;
}

h2 {
  font-size: var(--font-size-xl);
  font-weight: 700;
  margin-bottom: 8px;
}

.auth-desc {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  margin-bottom: 24px;
}

.auth-input {
  width: 100%;
  padding: 12px 16px;
  margin-bottom: 12px;
  font-size: var(--font-size-base);
}

.auth-error {
  color: var(--accent-danger);
  font-size: var(--font-size-sm);
  margin-bottom: 12px;
}

.auth-btn {
  width: 100%;
  padding: 12px;
  background: var(--accent-primary);
  color: white;
  border-radius: var(--btn-radius);
  font-weight: 600;
  font-size: var(--font-size-base);
  transition: var(--btn-transition);
}

.auth-btn:hover {
  background: var(--accent-primary-hover);
}
</style>
