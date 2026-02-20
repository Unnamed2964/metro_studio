import { ref, h } from 'vue'
import { NInput } from 'naive-ui'

// Naive UI dialog instance, set by App.vue via setDialogApi()
let dialogApi = null

export function setDialogApi(api) {
  dialogApi = api
}

function confirm({
  title = '确认操作',
  message,
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    if (!dialogApi) { resolve(false); return }
    const d = dialogApi[danger ? 'error' : 'warning']({
      title,
      content: message,
      positiveText: confirmText,
      negativeText: cancelText,
      onPositiveClick: () => resolve(true),
      onNegativeClick: () => resolve(false),
      onClose: () => resolve(false),
      onMaskClick: () => { d.destroy(); resolve(false) },
    })
  })
}

function prompt({
  title = '请输入',
  message = '',
  placeholder = '',
  defaultValue = '',
  confirmText = '确认',
  cancelText = '取消',
} = {}) {
  return new Promise((resolve) => {
    if (!dialogApi) { resolve(null); return }
    const inputValue = ref(defaultValue)
    const d = dialogApi.create({
      title,
      content: () => h('div', null, [
        message ? h('p', { style: 'margin:0 0 10px;font-size:13px;color:var(--toolbar-muted)' }, message) : null,
        h(NInput, {
          value: inputValue.value,
          placeholder,
          onUpdateValue: (v) => { inputValue.value = v },
          onKeydown: (e) => { if (e.key === 'Enter') { d.destroy(); resolve(inputValue.value) } },
          autofocus: true,
        }),
      ]),
      positiveText: confirmText,
      negativeText: cancelText,
      onPositiveClick: () => resolve(inputValue.value),
      onNegativeClick: () => resolve(null),
      onClose: () => resolve(null),
      onMaskClick: () => { d.destroy(); resolve(null) },
    })
  })
}

export function useDialog() {
  return { confirm, prompt }
}
