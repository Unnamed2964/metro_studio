<script setup>
import { useToast } from '../composables/useToast.js'
import IconBase from './IconBase.vue'

const { toasts, removeToast } = useToast()

const iconMap = {
  success: 'check-circle',
  error: 'x-circle',
  warning: 'alert-triangle',
  info: 'info',
}
</script>

<template>
  <Teleport to="body">
    <div class="toast-container" aria-live="polite" aria-relevant="additions removals">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="toast"
          :class="`toast--${toast.type}`"
          role="status"
        >
          <span class="toast__icon" :class="`toast__icon--${toast.type}`">
            <IconBase :name="iconMap[toast.type]" :size="16" />
          </span>
          <span class="toast__message">{{ toast.message }}</span>
          <button
            class="toast__close"
            aria-label="关闭通知"
            @click="removeToast(toast.id)"
          >
            <IconBase name="x" :size="14" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 36px;
  right: 16px;
  z-index: 9999;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  pointer-events: none;
  max-width: 380px;
  width: 100%;
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--toolbar-card-bg);
  border: 1px solid var(--toolbar-card-border);
  border-left-width: 3px;
  box-shadow: var(--shadow-md);
  color: var(--toolbar-text);
  font-size: 13px;
  line-height: 1.45;
  pointer-events: auto;
  will-change: transform, opacity;
}

.toast--success {
  border-left-color: #22c55e;
}

.toast--error {
  border-left-color: #ef4444;
}

.toast--warning {
  border-left-color: #f59e0b;
}

.toast--info {
  border-left-color: #3b82f6;
}

.toast__icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  margin-top: 1px;
}

.toast__icon--success {
  color: #22c55e;
}

.toast__icon--error {
  color: #ef4444;
}

.toast__icon--warning {
  color: #f59e0b;
}

.toast__icon--info {
  color: #3b82f6;
}

.toast__message {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}

.toast__close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin: -2px -4px -2px 0;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--toolbar-muted);
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast);
}

.toast__close:hover {
  color: var(--toolbar-text);
  background: var(--toolbar-button-bg);
}

.toast-leave-active {
  position: absolute;
  right: 0;
  width: 100%;
}
</style>
