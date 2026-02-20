import { computed, ref } from 'vue'
import { darkTheme } from 'naive-ui'

const PRIMARY = '#8b5cf6'
const INFO = '#6366f1'
const SUCCESS = '#22c55e'
const WARNING = '#f59e0b'
const ERROR = '#ef4444'

export const naiveThemeOverrides = {
  common: {
    primaryColor: PRIMARY,
    primaryColorHover: '#a78bfa',
    primaryColorPressed: '#7c3aed',
    primaryColorSuppl: PRIMARY,
    infoColor: INFO,
    infoColorHover: '#818cf8',
    infoColorPressed: '#4f46e5',
    successColor: SUCCESS,
    successColorHover: '#4ade80',
    successColorPressed: '#16a34a',
    warningColor: WARNING,
    warningColorHover: '#fbbf24',
    warningColorPressed: '#d97706',
    errorColor: ERROR,
    errorColorHover: '#f87171',
    errorColorPressed: '#dc2626',
    borderRadius: '6px',
    borderRadiusSmall: '4px',
    fontSize: '13px',
    fontSizeSmall: '12px',
  },
}

export const naiveDarkTheme = darkTheme

const isDark = ref(true)

export function setNaiveThemeDark(dark) {
  isDark.value = dark
}

export const naiveTheme = computed(() => isDark.value ? darkTheme : null)
