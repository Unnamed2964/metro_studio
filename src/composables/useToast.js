import { ref } from 'vue'

const MAX_TOASTS = 5
const DEFAULT_DURATION = 3500

let nextId = 1
const toasts = ref([])
const timers = new Map()

function addToast({ type = 'info', message, duration = DEFAULT_DURATION }) {
  const id = nextId++

  // Evict oldest when at capacity
  while (toasts.value.length >= MAX_TOASTS) {
    removeToast(toasts.value[0].id)
  }

  toasts.value.push({ id, type, message, duration })

  if (duration > 0) {
    const timer = window.setTimeout(() => {
      removeToast(id)
    }, duration)
    timers.set(id, timer)
  }

  return id
}

function removeToast(id) {
  const timer = timers.get(id)
  if (timer !== undefined) {
    window.clearTimeout(timer)
    timers.delete(id)
  }
  const idx = toasts.value.findIndex((t) => t.id === id)
  if (idx !== -1) {
    toasts.value.splice(idx, 1)
  }
}

export function useToast() {
  return { toasts, addToast, removeToast }
}
