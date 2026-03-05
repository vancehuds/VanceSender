<template>
  <div class="v-card glass-card" :class="{ 'v-card--hoverable': hoverable }" :style="animDelay ? { '--anim-delay': animDelay } : {}">
    <div v-if="title || $slots.header" class="v-card__header">
      <slot name="header">
        <h2 class="v-card__title">
          <slot name="icon" />
          {{ title }}
        </h2>
        <slot name="header-right" />
      </slot>
    </div>
    <div class="v-card__body" :class="{ 'v-card__body--flush': flush }">
      <slot />
    </div>
    <div v-if="$slots.footer" class="v-card__footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  hoverable?: boolean
  flush?: boolean
  animDelay?: string
}>(), {
  title: '',
  hoverable: true,
  flush: false,
  animDelay: '',
})
</script>

<style scoped>
.v-card {
  display: flex;
  flex-direction: column;
}

.v-card--hoverable:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
}

.v-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.v-card__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-base);
  font-weight: 600;
}

.v-card__body--flush {
  padding: 0;
  margin: -20px -24px;
  margin-top: 0;
}

.v-card__footer {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--glass-border);
}
</style>
