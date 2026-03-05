<template>
  <button
    class="v-btn"
    :class="[
      `v-btn--${variant}`,
      `v-btn--${size}`,
      { 'v-btn--block': block, 'v-btn--icon': icon, 'v-btn--loading': loading, 'v-btn--glow': glow }
    ]"
    :disabled="disabled || loading"
    :type="type"
    v-bind="$attrs"
  >
    <span v-if="loading" class="v-btn__spinner"></span>
    <slot />
  </button>
</template>

<script setup lang="ts">
defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'icon'
  size?: 'sm' | 'md' | 'lg'
  block?: boolean
  icon?: boolean
  loading?: boolean
  disabled?: boolean
  glow?: boolean
  type?: 'button' | 'submit' | 'reset'
}>(), {
  variant: 'ghost',
  size: 'md',
  block: false,
  icon: false,
  loading: false,
  disabled: false,
  glow: false,
  type: 'button',
})
</script>

<style scoped>
.v-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: var(--btn-radius);
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: var(--btn-transition);
  position: relative;
  white-space: nowrap;
  border: none;
  outline: none;
}

.v-btn:disabled { opacity: 0.4; cursor: not-allowed; pointer-events: none; }

/* Sizes */
.v-btn--sm { padding: 5px 12px; font-size: var(--font-size-xs); }
.v-btn--md { padding: 8px 18px; font-size: var(--font-size-sm); }
.v-btn--lg { padding: 12px 32px; font-size: var(--font-size-lg); }

/* Variants */
.v-btn--primary { background: var(--accent-primary); color: white; }
.v-btn--primary:hover { background: var(--accent-primary-hover); }

.v-btn--secondary { background: rgba(108, 92, 231, 0.15); color: var(--accent-primary); border: 1px solid rgba(108, 92, 231, 0.3); }
.v-btn--secondary:hover { background: rgba(108, 92, 231, 0.25); }

.v-btn--ghost { color: var(--text-secondary); background: transparent; }
.v-btn--ghost:hover { color: var(--text-main); background: rgba(148, 163, 184, 0.08); }

.v-btn--outline { border: 1px solid var(--glass-border); color: var(--text-secondary); background: transparent; }
.v-btn--outline:hover { border-color: var(--accent-primary); color: var(--accent-primary); }

.v-btn--danger { background: var(--accent-danger); color: white; }
.v-btn--danger:hover { background: var(--accent-danger-hover); }

.v-btn--icon { padding: 6px; min-width: unset; }

.v-btn--block { width: 100%; }

/* Glow */
.v-btn--glow { position: relative; overflow: visible; }
.v-btn--glow::after {
  content: ''; position: absolute; inset: -2px;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-cyan), var(--accent-purple));
  border-radius: inherit; z-index: -1; opacity: 0; filter: blur(12px); transition: opacity 0.3s ease;
}
.v-btn--glow:hover::after { opacity: 0.4; }

/* Loading spinner */
.v-btn--loading { pointer-events: none; }
.v-btn__spinner {
  width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,0.3); border-top-color: white;
  border-radius: 50%; animation: v-btn-spin 0.6s linear infinite;
}
@keyframes v-btn-spin { to { transform: rotate(360deg); } }
</style>
