<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'

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
    nextTick(() => {
      updatePosition()
    })
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

  // 强制读取一次 offsetWidth 触发重排，确保尺寸正确
  const forceReflow = tooltip.offsetWidth

  const triggerRect = trigger.getBoundingClientRect()
  const tooltipRect = tooltip.getBoundingClientRect()

  // 如果 tooltip 尺寸为 0，说明还未渲染完成，延迟重试
  if (tooltipRect.width === 0 || tooltipRect.height === 0) {
    setTimeout(updatePosition, 16)
    return
  }

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

onBeforeUnmount(() => {
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
})
</script>

<template>
  <div class="tooltip-wrapper">
    <div
      ref="triggerRef"
      class="tooltip-trigger"
      @mouseenter="show"
      @mouseleave="hide"
      @focus="show"
      @blur="hide"
    >
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
        <span class="tooltip__text">{{ text }}</span>
        <kbd v-if="shortcut" class="tooltip__shortcut">{{ shortcut }}</kbd>
        <span class="tooltip__arrow" />
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
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: var(--toolbar-card-bg, #111c2e);
  color: var(--toolbar-text, #e5eefb);
  border: 1px solid var(--toolbar-border, #27354b);
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  animation: tooltip-fade-in 0.1s ease-out;
}

.tooltip__text {
  color: var(--toolbar-text, #e5eefb);
}

.tooltip__shortcut {
  font-family: inherit;
  font-size: 10px;
  color: var(--toolbar-muted, #9ab2ce);
  background: var(--toolbar-input-bg, #0b1526);
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid var(--toolbar-divider, #334865);
  line-height: 1.5;
}

.tooltip__arrow {
  position: absolute;
  width: 8px;
  height: 8px;
  background: var(--toolbar-card-bg, #111c2e);
  border: 1px solid var(--toolbar-border, #27354b);
  transform: rotate(45deg);
}

.tooltip--top .tooltip__arrow {
  bottom: -5px;
  left: 50%;
  margin-left: -4px;
  border-top: none;
  border-left: none;
}

.tooltip--bottom .tooltip__arrow {
  top: -5px;
  left: 50%;
  margin-left: -4px;
  border-bottom: none;
  border-right: none;
}

.tooltip--left .tooltip__arrow {
  right: -5px;
  top: 50%;
  margin-top: -4px;
  border-bottom: none;
  border-left: none;
}

.tooltip--right .tooltip__arrow {
  left: -5px;
  top: 50%;
  margin-top: -4px;
  border-top: none;
  border-right: none;
}

@keyframes tooltip-fade-in {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
