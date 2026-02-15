import { ref, watch } from 'vue'
import { useProjectStore } from '../stores/projectStore'

const MIN_YEAR = 1900
const MAX_YEAR = 2100
const YEAR_STEP = 1

/**
 * Composable for edit-year input in the toolbar:
 * year input state, normalization, increment/decrement.
 *
 * @returns Reactive state, constants, and methods for year editing
 */
export function useToolbarEditYear() {
  const store = useProjectStore()

  const editYearInput = ref(store.currentEditYear)

  watch(() => store.currentEditYear, (newYear) => {
    editYearInput.value = newYear
  })

  function normalizeEditYear(year) {
    const num = Number.isFinite(year) ? Math.floor(Number(year)) : 2010
    return Math.max(MIN_YEAR, Math.min(MAX_YEAR, num))
  }

  function onEditYearInput(event) {
    const rawValue = event.target.value
    const year = normalizeEditYear(rawValue)
    store.setCurrentEditYear(year)
    editYearInput.value = year
  }

  function incrementEditYear() {
    const nextYear = normalizeEditYear(store.currentEditYear + YEAR_STEP)
    store.setCurrentEditYear(nextYear)
    editYearInput.value = nextYear
  }

  function decrementEditYear() {
    const nextYear = normalizeEditYear(store.currentEditYear - YEAR_STEP)
    store.setCurrentEditYear(nextYear)
    editYearInput.value = nextYear
  }

  return {
    editYearInput,
    MIN_YEAR,
    MAX_YEAR,
    onEditYearInput,
    incrementEditYear,
    decrementEditYear,
  }
}
