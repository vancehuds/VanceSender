<template>
  <div class="v-empty">
    <div v-if="icon" class="v-empty__icon">{{ icon }}</div>
    <p class="v-empty__text"><slot>{{ text }}</slot></p>
    <div v-if="$slots.action" class="v-empty__action">
      <slot name="action" />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  icon?: string
  text?: string
}>(), {
  icon: '',
  text: '',
})
</script>

<style scoped>
.v-empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-muted);
}

.v-empty__icon {
  font-size: 2rem;
  margin-bottom: 8px;
}

.v-empty__text {
  font-size: var(--font-size-sm);
}

.v-empty__action {
  margin-top: 16px;
}
</style>
