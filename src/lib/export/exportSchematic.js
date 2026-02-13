import { bboxFromXY, buildOctilinearPolyline } from '../geo'

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function buildSchematicSvg(project, options = {}) {
  const stations = project?.stations || []
  const edges = project?.edges || []
  const lines = project?.lines || []
  const lineById = new Map(lines.map((line) => [line.id, line]))
  const stationById = new Map(stations.map((station) => [station.id, station]))

  const points = stations.map((station) => station.displayPos || [0, 0])
  const { minX, minY, maxX, maxY } = bboxFromXY(points)
  const padding = options.padding ?? 60
  const width = Math.max((maxX - minX) + padding * 2, 800)
  const height = Math.max((maxY - minY) + padding * 2, 600)

  const xOffset = padding - minX
  const yOffset = padding - minY

  const edgeElements = edges
    .map((edge) => {
      const from = stationById.get(edge.fromStationId)
      const to = stationById.get(edge.toStationId)
      if (!from || !to) return ''
      const color = lineById.get(edge.sharedByLineIds[0])?.color || '#0B4F6C'
      const polyline = buildOctilinearPolyline(from.displayPos, to.displayPos)
      const points = polyline
        .map(([x, y]) => `${x + xOffset},${y + yOffset}`)
        .join(' ')
      return `<polyline points="${points}" stroke="${escapeXml(
        color,
      )}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none" />`
    })
    .join('\n')

  const stationElements = stations
    .map((station) => {
      const x = station.displayPos[0] + xOffset
      const y = station.displayPos[1] + yOffset
      const stationColor = station.underConstruction ? '#f59e0b' : station.proposed ? '#9ca3af' : '#ffffff'
      const nameZh = escapeXml(station.nameZh)
      const nameEn = escapeXml(station.nameEn || '')
      const enText = nameEn ? `<text x="${x + 12}" y="${y + 13}" font-size="11" fill="#4b5563">${nameEn}</text>` : ''
      return `
<g>
  <circle cx="${x}" cy="${y}" r="5.8" fill="${stationColor}" stroke="#111827" stroke-width="2" />
  <text x="${x + 12}" y="${y - 2}" font-size="13" fill="#111827">${nameZh}</text>
  ${enText}
</g>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#f8fafc" />
  <g>
    ${edgeElements}
  </g>
  <g>
    ${stationElements}
  </g>
</svg>`
}

export function downloadSvg(project) {
  const svg = buildSchematicSvg(project)
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${project.name || 'railmap'}.svg`
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function downloadPng(project, options = {}) {
  const svg = buildSchematicSvg(project, options)
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  const image = new Image()
  const scale = options.scale || 2

  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = reject
    image.src = url
  })

  const canvas = document.createElement('canvas')
  canvas.width = image.width * scale
  canvas.height = image.height * scale
  const context = canvas.getContext('2d')
  context.scale(scale, scale)
  context.drawImage(image, 0, 0)

  const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  URL.revokeObjectURL(url)

  if (!pngBlob) {
    throw new Error('PNG 导出失败')
  }

  const pngUrl = URL.createObjectURL(pngBlob)
  const anchor = document.createElement('a')
  anchor.href = pngUrl
  anchor.download = `${project.name || 'railmap'}.png`
  anchor.click()
  URL.revokeObjectURL(pngUrl)
}
