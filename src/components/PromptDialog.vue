<script setup>
import { nextTick, ref, watch } from 'vue'
import { useDialog } from '../composables/useDialog.js'

const { promptState } = useDialog()
const inputRef = ref(null)
const dialogRef = ref(null)
const inputValue = ref('')

function doConfirm() {
  if (!promptState.visible) return
  promptState.visible = false
  if (promptState.resolve) {
    promptState.resolve(inputValue.value)
    promptState.resolve = null
  }
}

function doCancel() {
  if (!promptState.visible) return
  promptState.visible = false
  if (promptState.resolve) {
    promptState.resolve(null)
    promptState.resolve = null
  }
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    doCancel()
  }
  if (e.key === 'Enter' && e.target === inputRef.value) {
    doConfirm()
  }
  // Focus trap: Tab cycles within the dialog
  if (e.key === 'Tab' && dialogRef.value) {
    const focusable = dialogRef.value.querySelectorAll(
      'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }
}

watch(
  () => promptState.visible,
  async (visible) => {
    if (visible) {
      inputValue.value = promptState.defaultValue
      await nextTick()
      if (inputRef.value) {
        inputRef.value.focus()
        inputRef.value.select()
      }
    }
  }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="prompt-dialog">
      <div
        v-if="promptState.visible"
        class="prompt-overlay"
        @mousedown.self="doCancel"
        @keydown="onKeydown"
      >
        <div
          ref="dialogRef"
          class="prompt-dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="promptState.title"
        >
          <header class="prompt-dialog__header">
            <h2 class="prompt-dialog__title">{{ promptState.title }}</h2>
          </header>
          <div class="prompt-dialog__body">
            <p v-if="promptState.message" class="prompt-dialog__message">{{ promptState.message }}</p>
            <input
              ref="inputRef"
              v-model="inputValue"
              class="pp-input prompt-dialog__input"
              :placeholder="promptState.placeholder"
            />
          </div>
          <footer class="prompt-dialog__footer">
            <button
              class="prompt-dialog__btn prompt-dialog__btn--cancel"
              type="button"
              @click="doCancel"
            >
              {{ promptState.cancelText }}
            </button>
            <button
              class="prompt-dialog__btn prompt-dialog__btn--primary"
              type="button"
              @click="doConfirm"
            >
              {{ promptState.confirmText }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.prompt-overlay {
  position: fixed;
  inset: 0;
  z-index: 9500;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}

.prompt-dialog {
  width: 420px;
  max-width: calc(100vw - 32px);
  background: var(--toolbar-card-bg);
  border: 1px solid var(--toolbar-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.prompt-dialog__header {
  padding: 16px 20px 0;
}

.prompt-dialog__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--toolbar-text);
  line-height: 1.4;
}

.prompt-dialog__body {
  padding: 10px 20px 4px;
}

.prompt-dialog__message {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--toolbar-muted);
  line-height: 1.55;
  white-space: pre-line;
}

.prompt-dialog__input {
  margin-top: 2px;
}

.prompt-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 20px 16px;
}

.prompt-dialog__btn {
  padding: 7px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all var(--transition-normal);
  outline: none;
}

.prompt-dialog__btn:focus-visible {
  box-shadow: var(--focus-ring);
}

.prompt-dialog__btn--cancel {
  background: var(--toolbar-button-bg);
  border-color: var(--toolbar-button-border);
  color: var(--toolbar-button-text);
}

.prompt-dialog__btn--cancel:hover {
  border-color: var(--toolbar-button-hover-border);
}

.prompt-dialog__btn--primary {
  background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
  border-color: var(--toolbar-primary-border);
  color: #fff;
}

.prompt-dialog__btn--primary:hover {
  background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
  box-shadow: 0 2px 8px rgba(29, 78, 216, 0.35);
}

/* ── Transition ── */
.prompt-dialog-enter-active {
  transition: opacity 0.2s ease;
}

.prompt-dialog-enter-active .prompt-dialog {
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}

.prompt-dialog-leave-active {
  transition: opacity 0.15s ease;
}

.prompt-dialog-leave-active .prompt-dialog {
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.prompt-dialog-enter-from {
  opacity: 0;
}

.prompt-dialog-enter-from .prompt-dialog {
  opacity: 0;
  transform: scale(0.94);
}

.prompt-dialog-leave-to {
  opacity: 0;
}

.prompt-dialog-leave-to .prompt-dialog {
  opacity: 0;
  transform: scale(0.96);
}
</style>
