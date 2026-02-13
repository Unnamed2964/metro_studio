const DEFAULT_COLORS = [
  '#005BBB',
  '#D7263D',
  '#1D8348',
  '#F39C12',
  '#6C3483',
  '#0E7490',
  '#C0392B',
  '#2E86C1',
  '#16A085',
  '#2C3E50',
]

export function normalizeHexColor(value, fallback = '#005BBB') {
  if (!value || typeof value !== 'string') {
    return fallback
  }
  const trimmed = value.trim()
  const hex = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  const match = hex.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  if (!match) {
    return fallback
  }
  if (hex.length === 4) {
    const [, shortHex] = match
    return `#${shortHex
      .split('')
      .map((char) => `${char}${char}`)
      .join('')
      .toUpperCase()}`
  }
  return hex.toUpperCase()
}

export function pickLineColor(index = 0) {
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length]
}

