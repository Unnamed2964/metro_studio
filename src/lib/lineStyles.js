export const DEFAULT_LINE_STYLE = 'solid'

export const LINE_STYLE_OPTIONS = [
  { id: 'solid', label: '实线' },
  { id: 'dashed', label: '虚线' },
  { id: 'dotted', label: '点线' },
  { id: 'double-solid', label: '双线' },
  { id: 'double-dashed', label: '双虚线' },
  { id: 'double-dotted-square', label: '双方点线' },
]

const lineStyleById = new Map(LINE_STYLE_OPTIONS.map((item) => [item.id, item]))

export function isLineStyle(value) {
  return lineStyleById.has(String(value || ''))
}

export function normalizeLineStyle(value) {
  const normalized = String(value || '')
  return isLineStyle(normalized) ? normalized : DEFAULT_LINE_STYLE
}

export function getLineStyleSchematic(styleId) {
  switch (normalizeLineStyle(styleId)) {
    case 'dashed':
      return {
        dasharray: '14 9',
        lineCap: 'round',
        trackOffsets: [0],
        trackWidthScale: 1,
      }
    case 'dotted':
      return {
        dasharray: '1 8',
        lineCap: 'round',
        trackOffsets: [0],
        trackWidthScale: 1,
      }
    case 'double-solid':
      return {
        dasharray: '',
        lineCap: 'round',
        trackOffsets: [-3.1, 3.1],
        trackWidthScale: 0.45,
      }
    case 'double-dashed':
      return {
        dasharray: '10 8',
        lineCap: 'round',
        trackOffsets: [-3.1, 3.1],
        trackWidthScale: 0.45,
      }
    case 'double-dotted-square':
      return {
        dasharray: '1 12',
        lineCap: 'square',
        trackOffsets: [-3.3, 3.3],
        trackWidthScale: 0.5,
      }
    case 'solid':
    default:
      return {
        dasharray: '',
        lineCap: 'round',
        trackOffsets: [0],
        trackWidthScale: 1,
      }
  }
}

export function getLineStyleMap(styleId) {
  switch (normalizeLineStyle(styleId)) {
    case 'dashed':
      return {
        dasharray: [2.2, 1.5],
        lineCap: 'round',
        lineWidth: 5,
        lineGapWidth: 0,
      }
    case 'dotted':
      return {
        dasharray: [0.2, 1.7],
        lineCap: 'round',
        lineWidth: 5,
        lineGapWidth: 0,
      }
    case 'double-solid':
      return {
        dasharray: [1, 0],
        lineCap: 'round',
        lineWidth: 2.35,
        lineGapWidth: 3.9,
      }
    case 'double-dashed':
      return {
        dasharray: [1.5, 1.3],
        lineCap: 'round',
        lineWidth: 2.35,
        lineGapWidth: 3.9,
      }
    case 'double-dotted-square':
      return {
        dasharray: [0.6, 2.2],
        lineCap: 'square',
        lineWidth: 2.7,
        lineGapWidth: 4.3,
      }
    case 'solid':
    default:
      return {
        dasharray: [1, 0],
        lineCap: 'round',
        lineWidth: 5,
        lineGapWidth: 0,
      }
  }
}
