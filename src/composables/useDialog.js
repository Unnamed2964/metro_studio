import { reactive } from 'vue'

// ── Confirm dialog state ──
const confirmState = reactive({
  visible: false,
  title: '',
  message: '',
  confirmText: '确认',
  cancelText: '取消',
  danger: false,
  resolve: null,
})

// ── Prompt dialog state ──
const promptState = reactive({
  visible: false,
  title: '',
  message: '',
  placeholder: '',
  defaultValue: '',
  confirmText: '确认',
  cancelText: '取消',
  resolve: null,
})

/**
 * Show a confirm dialog.
 * @param {Object} options
 * @param {string} [options.title='确认操作']
 * @param {string} options.message
 * @param {string} [options.confirmText='确认']
 * @param {string} [options.cancelText='取消']
 * @param {boolean} [options.danger=false] - Use danger/red styling for confirm button
 * @returns {Promise<boolean>} true if confirmed, false if cancelled
 */
function confirm({
  title = '确认操作',
  message,
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    // If a previous dialog is still open, cancel it
    if (confirmState.resolve) {
      confirmState.resolve(false)
    }
    confirmState.title = title
    confirmState.message = message
    confirmState.confirmText = confirmText
    confirmState.cancelText = cancelText
    confirmState.danger = danger
    confirmState.resolve = resolve
    confirmState.visible = true
  })
}

/**
 * Show a prompt dialog with an input field.
 * @param {Object} options
 * @param {string} [options.title='请输入']
 * @param {string} [options.message='']
 * @param {string} [options.placeholder='']
 * @param {string} [options.defaultValue='']
 * @param {string} [options.confirmText='确认']
 * @param {string} [options.cancelText='取消']
 * @returns {Promise<string|null>} The entered string, or null if cancelled
 */
function prompt({
  title = '请输入',
  message = '',
  placeholder = '',
  defaultValue = '',
  confirmText = '确认',
  cancelText = '取消',
} = {}) {
  return new Promise((resolve) => {
    // If a previous dialog is still open, cancel it
    if (promptState.resolve) {
      promptState.resolve(null)
    }
    promptState.title = title
    promptState.message = message
    promptState.placeholder = placeholder
    promptState.defaultValue = defaultValue
    promptState.confirmText = confirmText
    promptState.cancelText = cancelText
    promptState.resolve = resolve
    promptState.visible = true
  })
}

export function useDialog() {
  return { confirmState, promptState, confirm, prompt }
}
