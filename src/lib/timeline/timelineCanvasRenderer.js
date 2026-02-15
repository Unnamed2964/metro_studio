/**
 * Geographic canvas renderer for timeline animation.
 *
 * Renders rail network on OSM tile background using real lngLat coordinates.
 * Includes progressive line drawing, station reveal animations, and
 * professional overlay UI (year, stats, events, branding, scale bar).
 *
 * Used by both timelinePreviewRenderer.js and timelineExporter.js.
 */

import { lngLatToPixel, renderTiles, metersPerPixel, selectZoomLevelFractional } from './timelineTileRenderer'
import { slicePolylineByProgress } from './timelineAnimationPlan'
import { haversineDistanceMeters } from '../geo'
import { getDisplayLineName } from '../lineNaming'

// ─── Geometry / easing helpers ──────────────────────────────────

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

// ─── UI scale helper ────────────────────────────────────────────

function uiScale(width, height) {
  return Math.min(width / 1920, height / 1080)
}

// ─── Geographic camera ──────────────────────────────────────────

/**
 * Compute a geographic camera that fits the given bounds.
 * @param {{ minLng, minLat, maxLng, maxLat }|null} bounds
 * @param {number} width
 * @param {number} height
 * @returns {{ centerLng: number, centerLat: number, zoom: number }}
 */
export function computeGeoCamera(bounds, width, height) {
  if (!bounds) {
    return { centerLng: 116.99, centerLat: 36.65, zoom: 11 }
  }
  const centerLng = (bounds.minLng + bounds.maxLng) / 2
  const centerLat = (bounds.minLat + bounds.maxLat) / 2
  const zoom = selectZoomLevelFractional(bounds, width, height, 0.78)
  return { centerLng, centerLat, zoom }
}

/**
 * Compute camera focused on specific edges' bounding box, zoomed closer.
 */
export function computeFocusCamera(focusBounds, fullBounds, width, height) {
  if (!focusBounds) return computeGeoCamera(fullBounds, width, height)
  // Expand focus bounds slightly for context
  const padLng = Math.max((focusBounds.maxLng - focusBounds.minLng) * 0.3, 0.005)
  const padLat = Math.max((focusBounds.maxLat - focusBounds.minLat) * 0.3, 0.005)
  const expanded = {
    minLng: focusBounds.minLng - padLng,
    minLat: focusBounds.minLat - padLat,
    maxLng: focusBounds.maxLng + padLng,
    maxLat: focusBounds.maxLat + padLat,
  }
  const cam = computeGeoCamera(expanded, width, height)
  // Limit focus zoom: don't zoom in more than 2.5 levels beyond the full-extent zoom,
  // so the camera doesn't jump dramatically when a new line has a small geographic span
  const fullZoom = computeGeoCamera(fullBounds, width, height).zoom
  const maxFocusZoom = fullZoom + 2.5
  cam.zoom = Math.max(9, Math.min(maxFocusZoom, cam.zoom))
  return cam
}

/**
 * Smoothly interpolate between two geographic cameras.
 */
export function lerpGeoCamera(from, to, t) {
  const eased = easeInOutCubic(Math.max(0, Math.min(1, t)))
  return {
    centerLng: from.centerLng + (to.centerLng - from.centerLng) * eased,
    centerLat: from.centerLat + (to.centerLat - from.centerLat) * eased,
    zoom: from.zoom + (to.zoom - from.zoom) * eased,
  }
}

// ─── Stats computation ──────────────────────────────────────────

export function computeStatsForYear(project, year) {
  const edges = (project?.edges || []).filter(e => e.openingYear == null || e.openingYear <= year)
  const stationIds = new Set()
  const lineIds = new Set()
  let totalMeters = 0
  for (const e of edges) {
    stationIds.add(e.fromStationId)
    stationIds.add(e.toStationId)
    for (const lid of e.sharedByLineIds) lineIds.add(lid)
    totalMeters += e.lengthMeters || 0
  }
  return { lines: lineIds.size, stations: stationIds.size, km: totalMeters / 1000 }
}

// ─── Edge rendering (geographic) ────────────────────────────────

/**
 * Compute line width based on zoom level.
 */
function geoLineWidth(zoom) {
  return Math.max(2, 3.5 * Math.pow(2, (zoom - 12) * 0.45))
}

/**
 * Draw a polyline of [lng,lat] points onto the canvas.
 */
function drawGeoPolyline(ctx, points, camera, width, height, color, lineWidth, alpha) {
  if (!points || points.length < 2) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash([])
  ctx.beginPath()
  const [sx, sy] = lngLatToPixel(points[0][0], points[0][1], camera, width, height)
  ctx.moveTo(sx, sy)
  for (let i = 1; i < points.length; i++) {
    const [px, py] = lngLatToPixel(points[i][0], points[i][1], camera, width, height)
    ctx.lineTo(px, py)
  }
  ctx.stroke()
  ctx.restore()
}

/**
 * Render all previously-completed edges (from prior years) as full lines.
 */
export function renderPrevEdges(ctx, prevEdges, camera, width, height, stationMap, lineMap) {
  const lw = geoLineWidth(camera.zoom)
  for (const edge of prevEdges) {
    const line = lineMap.get((edge.sharedByLineIds || [])[0])
    const color = line?.color || '#2563EB'
    const from = stationMap.get(edge.fromStationId)
    const to = stationMap.get(edge.toStationId)
    if (!from || !to) continue

    // Resolve waypoints inline
    let waypoints = edge._cachedWaypoints
    if (!waypoints) {
      waypoints = resolveWaypointsSimple(edge, from, to)
      edge._cachedWaypoints = waypoints
    }
    if (waypoints.length < 2) continue
    drawGeoPolyline(ctx, waypoints, camera, width, height, color, lw, 0.85)
  }
}

function resolveWaypointsSimple(edge, fromStation, toStation) {
  const from = fromStation?.lngLat
  const to = toStation?.lngLat
  if (!from || !to) return []
  const raw = Array.isArray(edge.waypoints) && edge.waypoints.length >= 2
    ? edge.waypoints.filter(p => Array.isArray(p) && p.length === 2)
    : [from, to]
  if (raw.length < 2) return [from, to]
  // Direction correction
  const dF = (raw[0][0] - from[0]) ** 2 + (raw[0][1] - from[1]) ** 2
  const dR = (raw[0][0] - to[0]) ** 2 + (raw[0][1] - to[1]) ** 2
  const ordered = dR < dF ? [...raw].reverse() : raw
  ordered[0] = from
  ordered[ordered.length - 1] = to
  return ordered
}

/**
 * Render the current year's edges with progressive drawing animation.
 */
export function renderAnimatedEdges(ctx, yearPlan, drawProgress, camera, width, height) {
  const lw = geoLineWidth(camera.zoom)
  for (const plan of yearPlan.lineDrawPlans) {
    for (const seg of plan.segments) {
      // Determine how much of this segment to draw
      const segSpan = seg.endProgress - seg.startProgress
      if (segSpan <= 0) continue
      const segProgress = Math.max(0, Math.min(1, (drawProgress - seg.startProgress) / segSpan))
      if (segProgress <= 0) continue

      const { points: slicedPoints } = slicePolylineByProgress(seg.waypoints, segProgress)
      if (slicedPoints.length < 2) continue
      drawGeoPolyline(ctx, slicedPoints, camera, width, height, plan.color, lw, 1)
    }
  }
}

// ─── Station rendering (geographic) ─────────────────────────────

/**
 * Render stations as circles/interchange markers.
 */
export function renderStations(ctx, stationIds, camera, width, height, stationMap, opts = {}) {
  const alpha = opts.alpha ?? 1
  const zoom = camera.zoom
  const radius = Math.max(2.5, 3.5 * Math.pow(2, (zoom - 12) * 0.35))
  const fontSize = Math.max(8, 11 * Math.pow(2, (zoom - 12) * 0.25))

  ctx.save()
  ctx.globalAlpha = alpha

  for (const sid of stationIds) {
    const station = stationMap.get(sid)
    if (!station?.lngLat) continue
    const [px, py] = lngLatToPixel(station.lngLat[0], station.lngLat[1], camera, width, height)

    // Skip if off-screen
    if (px < -50 || px > width + 50 || py < -50 || py > height + 50) continue

    // Draw station dot
    ctx.beginPath()
    if (station.isInterchange) {
      roundRect(ctx, px - radius * 1.4, py - radius * 0.9, radius * 2.8, radius * 1.8, radius * 0.85)
    } else {
      ctx.arc(px, py, radius, 0, Math.PI * 2)
    }
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = station.isInterchange ? '#334155' : '#1F2937'
    ctx.lineWidth = Math.max(1, radius * 0.42)
    ctx.stroke()

    // Station name (only at sufficient zoom)
    if (zoom >= 11 && opts.showLabels !== false) {
      ctx.fillStyle = '#1a1a2e'
      ctx.font = `600 ${fontSize}px "Source Han Sans SC", "Noto Sans CJK SC", "PingFang SC", sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(station.nameZh || '', px + radius + 3, py - fontSize * 0.3)

      if (station.nameEn && zoom >= 12.5) {
        ctx.fillStyle = '#7b8794'
        ctx.font = `500 ${fontSize * 0.78}px "Roboto Condensed", "Arial Narrow", sans-serif`
        ctx.fillText(station.nameEn, px + radius + 3, py + fontSize * 0.65)
      }
    }
  }

  ctx.restore()
}

/**
 * Render stations that are being revealed this year, with fade-in based on drawProgress.
 */
export function renderAnimatedStations(ctx, yearPlan, drawProgress, camera, width, height, stationMap) {
  const zoom = camera.zoom
  const radius = Math.max(2.5, 3.5 * Math.pow(2, (zoom - 12) * 0.35))
  const fontSize = Math.max(8, 11 * Math.pow(2, (zoom - 12) * 0.25))

  for (const plan of yearPlan.lineDrawPlans) {
    for (const reveal of plan.stationReveals) {
      // Station appears when drawProgress reaches its trigger
      const revealT = reveal.triggerProgress
      const fadeProgress = revealT <= 0 ? 1 : Math.max(0, Math.min(1, (drawProgress - revealT + 0.05) / 0.05))
      if (fadeProgress <= 0) continue

      const station = stationMap.get(reveal.stationId)
      if (!station?.lngLat) continue
      const [px, py] = lngLatToPixel(station.lngLat[0], station.lngLat[1], camera, width, height)
      if (px < -50 || px > width + 50 || py < -50 || py > height + 50) continue

      const scale = 0.5 + fadeProgress * 0.5
      const alpha = fadeProgress

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(px, py)
      ctx.scale(scale, scale)

      ctx.beginPath()
      if (station.isInterchange) {
        roundRect(ctx, -radius * 1.4, -radius * 0.9, radius * 2.8, radius * 1.8, radius * 0.85)
      } else {
        ctx.arc(0, 0, radius, 0, Math.PI * 2)
      }
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.strokeStyle = station.isInterchange ? '#334155' : '#1F2937'
      ctx.lineWidth = Math.max(1, radius * 0.42)
      ctx.stroke()

      ctx.restore()

      // Label
      if (zoom >= 11 && fadeProgress > 0.5) {
        ctx.save()
        ctx.globalAlpha = Math.max(0, (fadeProgress - 0.5) * 2)
        ctx.fillStyle = '#1a1a2e'
        ctx.font = `600 ${fontSize}px "Source Han Sans SC", "Noto Sans CJK SC", "PingFang SC", sans-serif`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(station.nameZh || '', px + radius + 3, py - fontSize * 0.3)
        if (station.nameEn && zoom >= 12.5) {
          ctx.fillStyle = '#7b8794'
          ctx.font = `500 ${fontSize * 0.78}px "Roboto Condensed", "Arial Narrow", sans-serif`
          ctx.fillText(station.nameEn, px + radius + 3, py + fontSize * 0.65)
        }
        ctx.restore()
      }
    }
  }
}

// ─── Overlay: Year display (large, left side) ───────────────────

export function renderOverlayYear(ctx, year, alpha, width, height) {
  if (alpha <= 0 || year == null) return
  const s = uiScale(width, height)
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))

  // Large year number — positioned left, vertically centered-low
  const x = 48 * s
  const y = height * 0.52
  ctx.fillStyle = '#ffffff'
  ctx.font = `900 ${120 * s}px "DIN Alternate", "Bahnschrift", "Roboto Condensed", monospace`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
  ctx.shadowBlur = 12 * s
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 3 * s
  ctx.fillText(String(year), x, y)
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0

  ctx.restore()
}

// ─── Overlay: Stats pills (left side, below year) ───────────────

export function renderOverlayStats(ctx, stats, alpha, width, height) {
  if (alpha <= 0 || !stats) return
  const s = uiScale(width, height)
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))

  const baseX = 48 * s
  const baseY = height * 0.52 + 80 * s  // below the large year

  const pillH = 36 * s
  const pillR = pillH / 2
  const gap = 12 * s

  // KM pill
  const kmText = `${stats.km.toFixed(1)} KM`
  const stText = `${stats.stations} ST.`

  drawStatPill(ctx, baseX, baseY, pillH, pillR, s, kmText)
  const kmWidth = measurePillWidth(ctx, kmText, s, pillH)
  drawStatPill(ctx, baseX + kmWidth + gap, baseY, pillH, pillR, s, stText)

  ctx.restore()
}

function measurePillWidth(ctx, text, s, pillH) {
  ctx.font = `700 ${16 * s}px "DIN Alternate", "Bahnschrift", "Roboto Condensed", monospace`
  const tw = ctx.measureText(text).width
  return tw + pillH  // padding = pillH/2 on each side
}

function drawStatPill(ctx, x, y, h, r, s, text) {
  ctx.font = `700 ${16 * s}px "DIN Alternate", "Bahnschrift", "Roboto Condensed", monospace`
  const tw = ctx.measureText(text).width
  const w = tw + h  // padding = h/2 on each side

  // Pill background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.lineWidth = 1.2 * s
  roundRect(ctx, x, y, w, h, r)
  ctx.fill()
  ctx.stroke()

  // Text
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + w / 2, y + h / 2)
}

// ─── Overlay: Event banner (top center) ──────────────────────────
// Shows: [color swatch] 线路名 开通运营 (+XX.Xkm) \n English name
// When no event text, shows the current year's line info as the banner.

export function renderOverlayEvent(ctx, text, lineColor, alpha, width, height, opts = {}) {
  if (alpha <= 0) return
  const { nameZh, nameEn, deltaKm } = opts
  const s = uiScale(width, height)
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))

  const bannerY = 32 * s
  const swatchW = 6 * s
  const padH = 20 * s
  const lineGap = 10 * s

  // Build main text: either custom event text, or "线路名 开通运营 (+km)"
  let mainText = text || ''
  if (!mainText && nameZh) {
    mainText = `${nameZh} 开通运营`
    if (deltaKm != null && deltaKm > 0) {
      mainText += ` (+${deltaKm.toFixed(1)}km)`
    }
  }
  if (!mainText) { ctx.restore(); return }

  const mainFont = `600 ${15 * s}px "Source Han Sans SC", "Noto Sans CJK SC", sans-serif`
  const subFont = `400 ${11 * s}px "Roboto Condensed", "Arial Narrow", sans-serif`

  ctx.font = mainFont
  const mainW = ctx.measureText(mainText).width

  let subText = nameEn || ''
  let subW = 0
  if (subText) {
    ctx.font = subFont
    subW = ctx.measureText(subText).width
  }

  const contentW = Math.max(mainW, subW)
  const bannerW = swatchW + contentW + padH * 2 + lineGap
  const bannerH = subText ? (50 * s) : (40 * s)
  const bannerX = (width - bannerW) / 2

  // Banner background — frosted glass style
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
  ctx.shadowColor = 'rgba(0, 0, 0, 0.12)'
  ctx.shadowBlur = 8 * s
  ctx.shadowOffsetY = 2 * s
  roundRect(ctx, bannerX, bannerY, bannerW, bannerH, 8 * s)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0

  // Line color swatch (vertical bar)
  const swatchX = bannerX + padH * 0.7
  const swatchPadV = 8 * s
  ctx.fillStyle = lineColor || '#2563EB'
  roundRect(ctx, swatchX, bannerY + swatchPadV, swatchW, bannerH - swatchPadV * 2, 3 * s)
  ctx.fill()

  // Main text
  const textX = swatchX + swatchW + lineGap
  ctx.fillStyle = '#1a1a2e'
  ctx.font = mainFont
  ctx.textAlign = 'left'
  if (subText) {
    ctx.textBaseline = 'bottom'
    ctx.fillText(mainText, textX, bannerY + bannerH * 0.52)
    // English subtitle
    ctx.fillStyle = '#8b95a5'
    ctx.font = subFont
    ctx.textBaseline = 'top'
    ctx.fillText(subText, textX, bannerY + bannerH * 0.55)
  } else {
    ctx.textBaseline = 'middle'
    ctx.fillText(mainText, textX, bannerY + bannerH / 2)
  }

  ctx.restore()
}

// ─── Overlay: Scale bar (bottom-left) ────────────────────────────

export function renderOverlayScaleBar(ctx, camera, alpha, width, height) {
  if (alpha <= 0) return
  const s = uiScale(width, height)
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha)) * 0.7

  const mpp = metersPerPixel(camera.centerLat, camera.zoom)
  // Choose a nice round distance
  const candidates = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000]
  let targetMeters = 1000
  for (const c of candidates) {
    const px = c / mpp
    if (px >= 40 * s && px <= 160 * s) {
      targetMeters = c
      break
    }
  }
  const barPx = targetMeters / mpp
  const label = targetMeters >= 1000 ? `${targetMeters / 1000} KM` : `${targetMeters} M`

  const x = 48 * s
  const y = height - 36 * s
  const barH = 3 * s

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x, y, barPx, barH)
  // End ticks
  ctx.fillRect(x, y - 4 * s, 1.5 * s, barH + 8 * s)
  ctx.fillRect(x + barPx - 1.5 * s, y - 4 * s, 1.5 * s, barH + 8 * s)

  ctx.fillStyle = '#ffffff'
  ctx.font = `500 ${10 * s}px "Roboto Condensed", "Arial Narrow", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(label, x + barPx / 2, y - 5 * s)

  ctx.restore()
}

// ─── Overlay: Branding (bottom-right, minimal) ──────────────────

export function renderOverlayBranding(ctx, projectName, author, alpha, width, height) {
  if (alpha <= 0) return
  const s = uiScale(width, height)
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha)) * 0.5

  const x = width - 48 * s
  const y = height - 16 * s

  // OSM attribution only — no logo
  ctx.fillStyle = '#ffffff'
  ctx.font = `400 ${9 * s}px "Roboto Condensed", sans-serif`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillText('© OpenStreetMap contributors', x, y)

  ctx.restore()
}

// ─── Overlay: Line legend bar (bottom-right) ────────────────────
// Horizontal row of line badges: [color dot] name km
// Shows ALL cumulative lines up to the current year, not just the current year's lines.

export function renderOverlayLineInfo(ctx, yearPlan, stats, alpha, width, height, opts = {}) {
  if (alpha <= 0) return
  const { cumulativeLineStats } = opts
  const lineEntries = cumulativeLineStats || []
  if (!lineEntries.length) return

  const s = uiScale(width, height)
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))

  const dotR = 5 * s
  const entryH = 24 * s
  const padH = 14 * s
  const padV = 10 * s
  const gap = 8 * s
  const nameFont = `600 ${11 * s}px "Source Han Sans SC", "Noto Sans CJK SC", sans-serif`
  const kmFont = `500 ${10 * s}px "DIN Alternate", "Bahnschrift", "Roboto Condensed", monospace`

  // Measure each entry width
  const entries = []
  for (const entry of lineEntries) {
    ctx.font = nameFont
    const nameW = ctx.measureText(entry.name).width
    ctx.font = kmFont
    const kmText = entry.km > 0 ? ` ${entry.km.toFixed(1)}` : ''
    const kmW = kmText ? ctx.measureText(kmText).width : 0
    const entryW = dotR * 2 + 6 * s + nameW + kmW
    entries.push({ ...entry, nameW, kmText, kmW, entryW })
  }

  // Layout: vertical column on the right side
  const maxEntryW = Math.max(...entries.map(e => e.entryW))
  const panelW = maxEntryW + padH * 2
  const panelH = padV * 2 + entries.length * entryH
  const panelX = width - panelW - 48 * s
  const panelY = height - panelH - 48 * s

  // Panel background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
  roundRect(ctx, panelX, panelY, panelW, panelH, 8 * s)
  ctx.fill()

  // Draw entries
  let entryY = panelY + padV
  for (const entry of entries) {
    const cx = panelX + padH + dotR
    const cy = entryY + entryH / 2

    // Color dot
    ctx.fillStyle = entry.color
    ctx.beginPath()
    ctx.arc(cx, cy, dotR, 0, Math.PI * 2)
    ctx.fill()

    // Name
    ctx.fillStyle = '#ffffff'
    ctx.font = nameFont
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const nameX = cx + dotR + 6 * s
    ctx.fillText(entry.name, nameX, cy)

    // KM value
    if (entry.kmText) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.font = kmFont
      ctx.fillText(entry.kmText, nameX + entry.nameW, cy)
    }

    entryY += entryH
  }

  ctx.restore()
}
