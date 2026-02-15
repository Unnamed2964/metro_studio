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
      <span class="accordion__triangle" :class="{ 'accordion__triangle--open': isOpen }" />
      <h3 class="accordion__title">{{ title }}</h3>
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
  gap: 8px;
  padding: 8px 2px;
  border: none;
  border-bottom: 1px solid var(--toolbar-divider);
  border-radius: 0;
  background: transparent;
  color: var(--toolbar-text);
  cursor: pointer;
  transition: color var(--transition-fast, 0.1s ease);
}

.accordion__header:hover {
  color: var(--toolbar-tab-active-text);
}

.accordion__triangle {
  width: 0;
  height: 0;
  border-left: 5px solid var(--toolbar-muted);
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
  flex-shrink: 0;
  transition: transform var(--transition-normal, 0.15s ease);
}

.accordion__triangle--open {
  transform: rotate(90deg);
}

.accordion__header:hover .accordion__triangle {
  border-left-color: var(--toolbar-text);
}

.accordion__title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--toolbar-muted);
}

.accordion__header:hover .accordion__title {
  color: var(--toolbar-text);
}

.accordion__content {
  padding: 12px 0 0;
  animation: accordion-slide-down 0.2s ease;
}

@keyframes accordion-slide-down {
  from {
    opacity: 0;
    max-height: 0;
  }
  to {
    opacity: 1;
    max-height: 500px;
  }
}
</style>
