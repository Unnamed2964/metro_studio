<script setup>
import { nextTick, ref, watch } from 'vue'
import { useDialog } from '../composables/useDialog.js'

const { confirmState } = useDialog()
const confirmBtnRef = ref(null)
const dialogRef = ref(null)

function doConfirm() {
  if (!confirmState.visible) return
  confirmState.visible = false
  if (confirmState.resolve) {
    confirmState.resolve(true)
    confirmState.resolve = null
  }
}

function doCancel() {
  if (!confirmState.visible) return
  confirmState.visible = false
  if (confirmState.resolve) {
    confirmState.resolve(false)
    confirmState.resolve = null
  }
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    doCancel()
  }
  // Focus trap: Tab cycles between cancel and confirm buttons
  if (e.key === 'Tab' && dialogRef.value) {
    const focusable = dialogRef.value.querySelectorAll(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
  () => confirmState.visible,
  async (visible) => {
    if (visible) {
      await nextTick()
      confirmBtnRef.value?.focus()
    }
  }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog-transition">
      <div
        v-if="confirmState.visible"
        class="confirm-overlay"
        @mousedown.self="doCancel"
        @keydown="onKeydown"
      >
        <div
          ref="dialogRef"
          class="confirm-dialog"
          role="alertdialog"
          aria-modal="true"
          :aria-label="confirmState.title"
        >
          <header class="confirm-dialog__header">
            <h2 class="confirm-dialog__title">{{ confirmState.title }}</h2>
          </header>
          <div class="confirm-dialog__body">
            <p class="confirm-dialog__message">{{ confirmState.message }}</p>
          </div>
          <footer class="confirm-dialog__footer">
            <button
              class="confirm-dialog__btn confirm-dialog__btn--cancel"
              type="button"
              @click="doCancel"
            >
              {{ confirmState.cancelText }}
            </button>
            <button
              ref="confirmBtnRef"
              class="confirm-dialog__btn"
              :class="confirmState.danger ? 'confirm-dialog__btn--danger' : 'confirm-dialog__btn--primary'"
              type="button"
              @click="doConfirm"
            >
              {{ confirmState.confirmText }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 9500;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}

.confirm-dialog {
  width: 400px;
  max-width: calc(100vw - 32px);
  background: var(--toolbar-card-bg);
  border: 1px solid var(--toolbar-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.confirm-dialog__header {
  padding: 16px 20px 0;
}

.confirm-dialog__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--toolbar-text);
  line-height: 1.4;
}

.confirm-dialog__body {
  padding: 10px 20px 4px;
}

.confirm-dialog__message {
  margin: 0;
  font-size: 13px;
  color: var(--toolbar-muted);
  line-height: 1.55;
  white-space: pre-line;
}

.confirm-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 20px 16px;
}

.confirm-dialog__btn {
  padding: 7px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all var(--transition-normal);
  outline: none;
}

.confirm-dialog__btn:focus-visible {
  box-shadow: var(--focus-ring);
}

.confirm-dialog__btn--cancel {
  background: var(--toolbar-button-bg);
  border-color: var(--toolbar-button-border);
  color: var(--toolbar-button-text);
}

.confirm-dialog__btn--cancel:hover {
  border-color: var(--toolbar-button-hover-border);
}

.confirm-dialog__btn--primary {
  background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
  border-color: var(--toolbar-primary-border);
  color: #fff;
}

.confirm-dialog__btn--primary:hover {
  background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
  box-shadow: 0 2px 8px rgba(29, 78, 216, 0.35);
}

.confirm-dialog__btn--danger {
  background: linear-gradient(180deg, #b53242 0%, #8d2430 100%);
  border-color: var(--toolbar-danger-border);
  color: #fff;
}

.confirm-dialog__btn--danger:hover {
  background: linear-gradient(180deg, #c94959 0%, #b53242 100%);
  box-shadow: 0 2px 8px rgba(141, 36, 48, 0.35);
}
</style>
