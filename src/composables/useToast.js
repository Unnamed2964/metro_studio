// Naive UI message instance, set by App.vue via setMessageApi()
let messageApi = null

export function setMessageApi(api) {
  messageApi = api
}

function addToast({ type = 'info', message, duration = 3500 }) {
  if (!messageApi) return
  const fn = messageApi[type] || messageApi.info
  fn(message, { duration })
}

export function useToast() {
  return { addToast }
}
