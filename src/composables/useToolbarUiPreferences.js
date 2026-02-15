import { ref } from 'vue'
import {
  DEFAULT_UI_FONT,
  DEFAULT_UI_THEME,
  UI_FONT_OPTIONS,
  UI_FONT_STORAGE_KEY,
  UI_THEME_STORAGE_KEY,
  normalizeUiFont,
  normalizeUiTheme,
} from '../lib/uiPreferences'

/**
 * Composable for UI theme and font preferences with localStorage persistence.
 *
 * @returns Reactive refs and apply/restore helpers for theme and font
 */
export function useToolbarUiPreferences() {
  const uiTheme = ref(DEFAULT_UI_THEME)
  const uiFont = ref(DEFAULT_UI_FONT)

  function applyUiTheme(theme) {
    const nextTheme = normalizeUiTheme(theme)
    uiTheme.value = nextTheme
    document.documentElement.setAttribute('data-ui-theme', nextTheme)
    try {
      window.localStorage.setItem(UI_THEME_STORAGE_KEY, nextTheme)
    } catch {
      // Ignore unavailable localStorage runtime.
    }
  }

  function restoreUiTheme() {
    try {
      const cachedTheme = window.localStorage.getItem(UI_THEME_STORAGE_KEY)
      applyUiTheme(cachedTheme || DEFAULT_UI_THEME)
      return
    } catch {
      // Fall through to default theme.
    }
    applyUiTheme(DEFAULT_UI_THEME)
  }

  function applyUiFont(fontId) {
    const nextFont = normalizeUiFont(fontId)
    uiFont.value = nextFont
    document.documentElement.setAttribute('data-ui-font', nextFont)
    try {
      window.localStorage.setItem(UI_FONT_STORAGE_KEY, nextFont)
    } catch {
      // Ignore unavailable localStorage runtime.
    }
  }

  function restoreUiFont() {
    try {
      const cachedFont = window.localStorage.getItem(UI_FONT_STORAGE_KEY)
      applyUiFont(cachedFont || DEFAULT_UI_FONT)
      return
    } catch {
      // Fall through to default font.
    }
    applyUiFont(DEFAULT_UI_FONT)
  }

  return {
    uiTheme,
    uiFont,
    UI_FONT_OPTIONS,
    applyUiTheme,
    restoreUiTheme,
    applyUiFont,
    restoreUiFont,
  }
}
