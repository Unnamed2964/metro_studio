import { ref } from 'vue'
import { ANIMATION_CONFIG } from '../lib/animation/config.js'

/** @returns {{enabled: import('vue').Ref<boolean>, toggleAnimation: (value?: boolean) => void, getAutoAnimateConfig: () => {duration: number, easing?: string}}} */
export function useAnimationSettings() {
  const enabled = ref(true)

  function loadSettings() {
    try {
      const saved = localStorage.getItem(ANIMATION_CONFIG.storageKey)
      if (saved !== null) enabled.value = saved === 'true'
    } catch { }
  }

  function updateCssVariables() {
    const root = document.documentElement
    const config = getAutoAnimateConfig()
    const duration = config.duration === 0 ? { instant: 0, fast: 0, normal: 0, slow: 0 } : ANIMATION_CONFIG.duration

    root.style.setProperty('--transition-instant', `${duration.instant}ms ${ANIMATION_CONFIG.easing}`)
    root.style.setProperty('--transition-fast', `${duration.fast}ms ${ANIMATION_CONFIG.easing}`)
    root.style.setProperty('--transition-normal', `${duration.normal}ms ${ANIMATION_CONFIG.easing}`)
    root.style.setProperty('--transition-slow', `${duration.slow}ms ${ANIMATION_CONFIG.easing}`)
  }

  function toggleAnimation(value) {
    enabled.value = value ?? !enabled.value
    updateCssVariables()
    try {
      localStorage.setItem(ANIMATION_CONFIG.storageKey, enabled.value)
    } catch { }
  }

  function getAutoAnimateConfig() {
    if (!enabled.value) return { duration: 0 }
    return {
      duration: ANIMATION_CONFIG.duration.fast,
      easing: ANIMATION_CONFIG.easing,
    }
  }

  loadSettings()
  updateCssVariables()
  return { enabled, toggleAnimation, getAutoAnimateConfig }
}
