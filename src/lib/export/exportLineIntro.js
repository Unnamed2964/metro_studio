import { buildHudLineRoute } from '../hud/renderModel'
import { getDisplayLineName } from '../lineNaming'

/**
 * Export a line introduction card as PNG.
 * Layout: colored header + horizontal route strip with angled station names.
 */
export async function downloadLineIntroPng(project, lineId) {
  const line = project?.lines?.find(l => l.id === lineId)
  if (!line) return

  const route = buildHudLineRoute(project, lineId)
  if (!route.ready || !route.directionOptions?.length) return

  const stationIds = route.directionOptions[0].stationIds
  const stationMap = new Map((project?.stations || []).map(s => [s.id, s]))
  const stations = stationIds.map(id => stationMap.get(id)).filter(Boolean)
  if (!stations.length) return

  const lineColor = line.color || '#005BBB'
  const nameZh = getDisplayLineName(line, 'zh') || line.nameZh || ''
  const nameEn = line.nameEn || ''

  // Layout constants
  const scale = 2
  const stationGap = 80
  const padL = 60, padR = 60
  const headerH = 70
  const routeY = headerH + 140
  const labelAreaH = 120
  const bottomPad = 30
  const totalW = padL + Math.max(400, (stations.length - 1) * stationGap) + padR
  const totalH = routeY + labelAreaH + bottomPad

  const canvas = document.createElement('canvas')
  canvas.width = totalW * scale
  canvas.height = totalH * scale
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)

  // Background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, totalW, totalH)

  // Header bar
  ctx.fillStyle = lineColor
  roundRect(ctx, 20, 16, totalW - 40, headerH, 12)
  ctx.fill()

  // Header text
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold 30px "Source Han Sans SC", "Microsoft YaHei", sans-serif`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(nameZh, 44, 16 + headerH * 0.42)
  if (nameEn) {
    ctx.font = `600 14px "Roboto Condensed", "Arial Narrow", sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.fillText(nameEn, 44, 16 + headerH * 0.73)
  }

  // Station count badge (right side of header)
  const countText = `${stations.length} 站`
  ctx.font = `600 16px "Source Han Sans SC", "Microsoft YaHei", sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.textAlign = 'right'
  ctx.fillText(countText, totalW - 44, 16 + headerH / 2)

  // Route line
  const routeStartX = padL
  const lineW = 6
  ctx.strokeStyle = lineColor
  ctx.lineWidth = lineW
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(routeStartX, routeY)
  ctx.lineTo(routeStartX + (stations.length - 1) * stationGap, routeY)
  ctx.stroke()

  // Stations + labels
  const dotR = 8
  const interchangeDotR = 11

  // Determine which stations are interchanges
  const interchangeSet = new Set()
  for (const s of stations) {
    if (s.isInterchange) interchangeSet.add(s.id)
  }

  for (let i = 0; i < stations.length; i++) {
    const s = stations[i]
    const x = routeStartX + i * stationGap
    const isInterchange = interchangeSet.has(s.id)
    const r = isInterchange ? interchangeDotR : dotR

    // White halo
    ctx.beginPath()
    ctx.arc(x, routeY, r + 3, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()

    // Station dot
    ctx.beginPath()
    if (isInterchange) {
      ctx.arc(x, routeY, r, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.strokeStyle = lineColor
      ctx.lineWidth = 3
      ctx.stroke()
      // Inner ring
      ctx.beginPath()
      ctx.arc(x, routeY, r - 4, 0, Math.PI * 2)
      ctx.strokeStyle = lineColor
      ctx.lineWidth = 1.5
      ctx.stroke()
    } else {
      ctx.arc(x, routeY, r, 0, Math.PI * 2)
      ctx.fillStyle = lineColor
      ctx.fill()
      // White inner
      ctx.beginPath()
      ctx.arc(x, routeY, r - 3, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
    }

    // Station name (angled)
    ctx.save()
    ctx.translate(x, routeY - r - 8)
    ctx.rotate(-Math.PI / 4)
    ctx.font = `500 13px "Source Han Sans SC", "Microsoft YaHei", sans-serif`
    ctx.fillStyle = '#333333'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText(s.nameZh || '', 0, 0)
    ctx.restore()
  }

  // Export
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(project?.name || 'metro').replace(/[\\/:*?"<>|]/g, '_')}_${nameZh}_线介绍图.png`
  a.click()
  URL.revokeObjectURL(url)
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}
