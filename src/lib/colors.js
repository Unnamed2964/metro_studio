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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex, '')
  if (!normalized) return null
  const value = normalized.slice(1)
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  }
}

function rgbToHex({ r, g, b }) {
  const rr = clamp(Math.round(r), 0, 255)
  const gg = clamp(Math.round(g), 0, 255)
  const bb = clamp(Math.round(b), 0, 255)
  return `#${rr.toString(16).padStart(2, '0')}${gg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`.toUpperCase()
}

function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360
  const saturation = clamp(s, 0, 1)
  const lightness = clamp(l, 0, 1)
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = lightness - chroma / 2

  let r = 0
  let g = 0
  let b = 0

  if (hue < 60) {
    r = chroma
    g = x
  } else if (hue < 120) {
    r = x
    g = chroma
  } else if (hue < 180) {
    g = chroma
    b = x
  } else if (hue < 240) {
    g = x
    b = chroma
  } else if (hue < 300) {
    r = x
    b = chroma
  } else {
    r = chroma
    b = x
  }

  return {
    r: (r + m) * 255,
    g: (g + m) * 255,
    b: (b + m) * 255,
  }
}

function colorDistanceSquared(a, b) {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return dr * dr + dg * dg + db * db
}

/** @param {string} value @param {string} [fallback='#005BBB'] @returns {string} */
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

/** @param {number} [index=0] @returns {string} */
export function pickLineColor(index = 0) {
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length]
}

/** @param {string[]} [existingColors=[]] @param {number} [seedIndex=0] @returns {string} */
export function pickDistinctLineColor(existingColors = [], seedIndex = 0) {
  const normalizedExisting = [...new Set((existingColors || [])
    .map((color) => normalizeHexColor(color, ''))
    .filter(Boolean))]

  if (!normalizedExisting.length) {
    return pickLineColor(seedIndex)
  }

  const existingRgb = normalizedExisting.map((color) => hexToRgb(color)).filter(Boolean)
  if (!existingRgb.length) {
    return pickLineColor(seedIndex)
  }

  const candidateSet = new Set(DEFAULT_COLORS.map((color) => normalizeHexColor(color, '')))
  for (let i = 0; i < 72; i += 1) {
    const hue = (seedIndex * 47 + i * 137.508) % 360
    candidateSet.add(rgbToHex(hslToRgb(hue, 0.76, 0.46)))
    candidateSet.add(rgbToHex(hslToRgb(hue, 0.72, 0.56)))
  }

  let bestColor = pickLineColor(seedIndex)
  let bestScore = -1
  for (const candidate of candidateSet) {
    const rgb = hexToRgb(candidate)
    if (!rgb) continue
    let minDistance = Number.POSITIVE_INFINITY
    for (const used of existingRgb) {
      const distance = colorDistanceSquared(rgb, used)
      if (distance < minDistance) minDistance = distance
    }
    if (minDistance > bestScore) {
      bestScore = minDistance
      bestColor = candidate
    }
  }

  return normalizeHexColor(bestColor, pickLineColor(seedIndex))
}
