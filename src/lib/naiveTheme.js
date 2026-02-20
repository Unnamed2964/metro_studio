import { computed } from 'vue'
import { darkTheme } from 'naive-ui'

const PRIMARY = '#ff2d78'
const INFO = '#a855f7'
const SUCCESS = '#22c55e'
const WARNING = '#f59e0b'
const ERROR = '#ef4444'

export const naiveThemeOverrides = {
  common: {
    primaryColor: PRIMARY,
    primaryColorHover: '#ff5a9a',
    primaryColorPressed: '#d4205f',
    primaryColorSuppl: PRIMARY,
    infoColor: INFO,
    infoColorHover: '#c084fc',
    infoColorPressed: '#9333ea',
    successColor: SUCCESS,
    successColorHover: '#4ade80',
    successColorPressed: '#16a34a',
    warningColor: WARNING,
    warningColorHover: '#fbbf24',
    warningColorPressed: '#d97706',
    errorColor: ERROR,
    errorColorHover: '#f87171',
    errorColorPressed: '#dc2626',
    borderRadius: '0px',
    borderRadiusSmall: '0px',
    fontSize: '13px',
    fontSizeSmall: '12px',
  },
  Dialog: {
    borderRadius: '0px',
    color: '#1a1a28',
    border: '1px solid #2a2838',
  },
  Modal: {
    borderRadius: '0px',
    color: '#1a1a28',
    border: '1px solid #2a2838',
  },
  Dropdown: {
    borderRadius: '0px',
    color: '#1a1a28',
    optionColorHover: 'rgba(255,45,120,0.1)',
  },
  Tooltip: {
    borderRadius: '0px',
    color: '#1a1a28',
    border: '1px solid #2a2838',
  },
  Input: {
    borderRadius: '0px',
    borderFocus: '1px solid #ff2d78',
    boxShadowFocus: '0 0 0 1px #ff2d78, 0 0 6px rgba(255,45,120,0.25)',
  },
  Card: {
    borderRadius: '0px',
    color: '#1a1a28',
    borderColor: '#2a2838',
  },
}

export const naiveDarkTheme = darkTheme

export function setNaiveThemeDark() {}

export const naiveTheme = computed(() => darkTheme)
