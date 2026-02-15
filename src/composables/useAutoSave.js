import { onBeforeUnmount, ref, watch } from 'vue'
import { useProjectStore } from '../stores/projectStore'

const DEBOUNCE_MS = 30_000

/**
 * Auto-save composable for the project store.
 *
 * Watches `store.project` deeply. After any mutation, a 30-second debounce
 * timer starts. When it fires, `store.persistNow()` is called.
 *
 * Skips saving when:
 *  - project is null
 *  - store.isImporting is true
 *  - store.history.isRestoring is true
 *
 * Returns reactive state for UI consumption.
 */
export function useAutoSave() {
  const store = useProjectStore()

  const saveState = ref('saved')   // 'saved' | 'unsaved' | 'saving' | 'error'
  const lastSavedAt = ref(null)    // Date | null

  let debounceTimer = null
  let isFirstRun = true

  function clearTimer() {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  function shouldSkip() {
    return (
      !store.project ||
      store.isImporting ||
      store.history.isRestoring
    )
  }

  async function executeSave() {
    if (shouldSkip()) return

    saveState.value = 'saving'
    try {
      await store.persistNow()
      saveState.value = 'saved'
      lastSavedAt.value = new Date()
    } catch {
      saveState.value = 'error'
    }
  }

  function scheduleSave() {
    clearTimer()
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      executeSave()
    }, DEBOUNCE_MS)
  }

  /**
   * Force an immediate save, bypassing the debounce timer.
   */
  async function saveNow() {
    clearTimer()
    await executeSave()
  }

  const stopWatch = watch(
    () => store.project,
    () => {
      // Skip the initial trigger that fires when the watcher is first set up,
      // because the project is loaded from DB and is already persisted.
      if (isFirstRun) {
        isFirstRun = false
        return
      }

      if (shouldSkip()) return

      saveState.value = 'unsaved'
      scheduleSave()
    },
    { deep: true },
  )

  onBeforeUnmount(() => {
    stopWatch()
    clearTimer()
  })

  return {
    saveState,
    lastSavedAt,
    saveNow,
  }
}
