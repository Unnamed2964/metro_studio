<script setup>
import { ref } from 'vue'
import IconBase from './IconBase.vue'

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  collapsed: {
    type: Boolean,
    default: false,
  },
  defaultOpen: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits(['update:collapsed'])

const isOpen = ref(props.defaultOpen)

function toggle() {
  isOpen.value = !isOpen.value
  emit('update:collapsed', !isOpen.value)
}
</script>

<template>
  <div class="accordion">
    <button
      class="accordion__header"
      type="button"
      :aria-expanded="isOpen"
      @click="toggle"
    >
      <h3 class="accordion__title">{{ title }}</h3>
      <IconBase
        :name="isOpen ? 'chevron-up' : 'chevron-down'"
        :size="16"
        class="accordion__icon"
      />
    </button>
    <div v-if="isOpen" class="accordion__content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.accordion {
  margin-bottom: 12px;
}

.accordion__header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 8px;
  background: var(--toolbar-card-bg);
  color: var(--toolbar-text);
  cursor: pointer;
  transition: all 0.15s ease;
}

.accordion__header:hover {
  border-color: var(--toolbar-button-hover-border);
  background: var(--toolbar-button-bg);
}

.accordion__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
}

.accordion__icon {
  flex-shrink: 0;
  color: var(--toolbar-muted);
  transition: transform 0.2s ease;
}

.accordion__content {
  padding: 12px 0 0;
  animation: accordion-slide-down 0.2s ease;
}

@keyframes accordion-slide-down {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
