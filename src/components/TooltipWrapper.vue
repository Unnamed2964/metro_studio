<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  text: {
    type: String,
    required: true,
  },
  shortcut: {
    type: String,
    default: '',
  },
  placement: {
    type: String,
    default: 'top',
    validator: (value) => ['top', 'bottom', 'left', 'right'].includes(value),
  },
  delay: {
    type: Number,
    default: 500,
  },
})

const triggerRef = ref(null)
const tooltipRef = ref(null)
const visible = ref(false)
let showTimer = null
let hideTimer = null

const tooltipContent = computed(() => {
  if (props.shortcut) {
    return `${props.text} (${props.shortcut})`
  }
  return props.text
})

function show() {
  clearTimeout(hideTimer)
  showTimer = setTimeout(() => {
    visible.value = true
    updatePosition()
  }, props.delay)
}

function hide() {
  clearTimeout(showTimer)
  hideTimer = setTimeout(() => {
    visible.value = false
  }, 100)
}

function updatePosition() {
  if (!triggerRef.value || !tooltipRef.value) return

  const trigger = triggerRef.value
  const tooltip = tooltipRef.value
  const triggerRect = trigger.getBoundingClientRect()
  const tooltipRect = tooltip.getBoundingClientRect()

  let top = 0
  let left = 0

  switch (props.placement) {
    case 'top':
      top = triggerRect.top - tooltipRect.height - 8
      left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2
      break
    case 'bottom':
      top = triggerRect.bottom + 8
      left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2
      break
    case 'left':
      top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2
      left = triggerRect.left - tooltipRect.width - 8
      break
    case 'right':
      top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2
      left = triggerRect.right + 8
      break
  }

  // 边界检测
  const padding = 8
  const maxLeft = window.innerWidth - tooltipRect.width - padding
  const maxTop = window.innerHeight - tooltipRect.height - padding

  left = Math.max(padding, Math.min(left, maxLeft))
  top = Math.max(padding, Math.min(top, maxTop))

  tooltip.style.top = `${top}px`
  tooltip.style.left = `${left}px`
}

onMounted(() => {
  if (triggerRef.value) {
    triggerRef.value.addEventListener('mouseenter', show)
    triggerRef.value.addEventListener('mouseleave', hide)
    triggerRef.value.addEventListener('focus', show)
    triggerRef.value.addEventListener('blur', hide)
  }
})

onBeforeUnmount(() => {
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
  if (triggerRef.value) {
    triggerRef.value.removeEventListener('mouseenter', show)
    triggerRef.value.removeEventListener('mouseleave', hide)
    triggerRef.value.removeEventListener('focus', show)
    triggerRef.value.removeEventListener('blur', hide)
  }
})
</script>

<template>
  <div class="tooltip-wrapper">
    <div ref="triggerRef" class="tooltip-trigger">
      <slot />
    </div>
    <Teleport to="body">
      <div
        v-if="visible"
        ref="tooltipRef"
        class="tooltip"
        :class="`tooltip--${placement}`"
        role="tooltip"
      >
        {{ tooltipContent }}
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.tooltip-wrapper {
  display: inline-block;
}

.tooltip-trigger {
  display: inline-block;
}

.tooltip {
  position: fixed;
  z-index: 9999;
  padding: 6px 10px;
  background: var(--toolbar-card-bg);
  color: var(--toolbar-text);
  border: 1px solid var(--toolbar-border);
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  animation: tooltip-fade-in 0.15s ease;
}

@keyframes tooltip-fade-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
