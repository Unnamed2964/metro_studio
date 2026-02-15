/**
 * Real-time timeline preview renderer — geographic edition.
 *
 * Drives live playback on an OSM tile background using real lngLat
 * coordinates with CONTINUOUS line drawing from first station to last.
 *
 * State machine: idle → playing → idle
 *
 * Key design: the animation draws the entire network as one continuous
 * stroke across all years, rather than resetting per year.
 */

import { TileCache, renderTiles, lngLatToPixel } from './timelineTileRenderer'
import { buildTimelineAnimationPlan, buildPseudoTimelineAnimationPlan, slicePolylineByProgress } from './timelineAnimationPlan'
import {
  computeGeoCamera,
  computeStatsForYear,
  easeOutCubic,
  renderOverlayBranding,
  renderOverlayEvent,
  renderOverlayLineInfo,
  renderOverlayScaleBar,
  renderOverlayStats,
  renderOverlayYear,
  renderPrevEdges,
  renderStations,
} from './timelineCanvasRenderer'

const DEFAULT_TOTAL_DRAW_MS = 12000 // total continuous drawing time (before speed)

/**
 * Collect geographic bounds from all stations and edge waypoints.
 */
function collectBounds(project) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
  let hasData = false
  for (const s of project?.stations || []) {
    if (!Array.isArray(s.lngLat) || s.lngLat.length !== 2) continue
    const [lng, lat] = s.lngLat
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    minLng = Math.min(minLng, lng); minLat = Math.min(minLat, lat)
    maxLng = Math.max(maxLng, lng); maxLat = Math.max(maxLat, lat)
    hasData = true
  }
  for (const e of project?.edges || []) {
    for (const p of e?.waypoints || []) {
      if (!Array.isArray(p) || p.length !== 2) continue
      const [lng, lat] = p
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
      minLng = Math.min(minLng, lng); minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng); maxLat = Math.max(maxLat, lat)
      hasData = true
    }
  }
  return hasData ? { minLng, minLat, maxLng, maxLat } : null
}

/**
 * Build a flat continuous drawing plan from the per-year animation plan.
 *
 * Flattens all year plans into a single ordered list of segments with
 * a global progress 0..1 across the entire network. This enables
 * continuous drawing from the first station to the last.
 *
 * Each segment carries: waypoints, color, lineId, globalStart, globalEnd,
 * fromStationId, toStationId.
 *
 * Also builds a list of station reveals with global trigger progress,
 * and year markers (at what global progress each year starts).
 *
 * @param {Object} animationPlan  from buildTimelineAnimationPlan / buildPseudoTimelineAnimationPlan
 * @param {number[]} years
 * @returns {{ segments, stationReveals, yearMarkers, totalLengthMeters }}
 */
function buildContinuousPlan(animationPlan, years) {
  if (!animationPlan || !years.length) {
    return { segments: [], stationReveals: [], yearMarkers: [], totalLengthMeters: 0 }
  }

  // First pass: compute total length across all years
  let totalLengthMeters = 0
  for (const year of years) {
    const yp = animationPlan.yearPlans.get(year)
    if (!yp) continue
    for (const lp of yp.lineDrawPlans) {
      totalLengthMeters += lp.totalLength
    }
  }
  if (totalLengthMeters <= 0) {
    return { segments: [], stationReveals: [], yearMarkers: [], totalLengthMeters: 0 }
  }

  // Second pass: build flat segment list with global progress
  const segments = []
  const stationReveals = []
  const yearMarkers = []
  const revealedStations = new Set()
  let cumulativeLength = 0

  for (const year of years) {
    const yp = animationPlan.yearPlans.get(year)
    if (!yp) continue

    const yearStartProgress = cumulativeLength / totalLengthMeters
    yearMarkers.push({ year, globalStart: yearStartProgress, yearPlan: yp })

    for (const lp of yp.lineDrawPlans) {
      for (const seg of lp.segments) {
        const segLenMeters = seg.lengthMeters || 0
        const globalStart = cumulativeLength / totalLengthMeters
        const globalEnd = (cumulativeLength + segLenMeters) / totalLengthMeters

        segments.push({
          waypoints: seg.waypoints,
          color: lp.color,
          lineId: lp.lineId,
          nameZh: lp.nameZh,
          nameEn: lp.nameEn,
          globalStart,
          globalEnd,
          fromStationId: seg.fromStationId,
          toStationId: seg.toStationId,
          year,
        })

        // Station reveals at global progress
        if (!revealedStations.has(seg.fromStationId)) {
          revealedStations.add(seg.fromStationId)
          stationReveals.push({ stationId: seg.fromStationId, triggerProgress: globalStart })
        }
        if (!revealedStations.has(seg.toStationId)) {
          revealedStations.add(seg.toStationId)
          stationReveals.push({ stationId: seg.toStationId, triggerProgress: globalEnd })
        }

        cumulativeLength += segLenMeters
      }
    }
  }

  return { segments, stationReveals, yearMarkers, totalLengthMeters }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Object} project
 * @param {Object} options
 */
export function createTimelinePreviewRenderer(canvas, project, options = {}) {
  const {
    title = project?.name || 'RailMap',
    author = '',
    pseudoMode: initialPseudoMode = false,
    onStateChange,
    onYearChange,
  } = options

  let pseudoMode = initialPseudoMode
  let speed = 1
  let state = 'idle'
  let rafId = null
  let phaseStart = 0

  // Timeline data
  let years = []
  let eventMap = new Map()
  let lineLabels = new Map()
  let animationPlan = null
  let continuousPlan = null
  let currentYearIndex = 0

  // Geographic data
  let tileCache = new TileCache()
  let stationMap = new Map()
  let lineMap = new Map()
  let fullBounds = null

  // Camera — fixed on full bounds during continuous draw
  let camera = { centerLng: 116.99, centerLat: 36.65, zoom: 11 }

  // Canvas
  const ctx = canvas.getContext('2d')
  let logicalWidth = canvas.width
  let logicalHeight = canvas.height
  const dpr = window.devicePixelRatio || 1

  function applyCanvasSize(w, h) {
    logicalWidth = w
    logicalHeight = h
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  // ─── Tile reload trigger ──────────────────────────────────────
  // When a tile finishes loading, schedule a repaint if idle
  tileCache.onTileLoaded = () => {
    if (state === 'idle' && fullBounds) {
      scheduleFrame()
    }
  }

  // ─── Data preparation ──────────────────────────────────────────

  function buildData() {
    stationMap = new Map((project?.stations || []).map(s => [s.id, s]))
    lineMap = new Map((project?.lines || []).map(l => [l.id, l]))
    fullBounds = collectBounds(project)

    if (pseudoMode) {
      const pseudoPlan = buildPseudoTimelineAnimationPlan(project)
      years = pseudoPlan.years
      animationPlan = pseudoPlan
      lineLabels = pseudoPlan.lineLabels || new Map()
      eventMap = new Map()
    } else {
      const yearSet = new Set()
      for (const edge of project?.edges || []) {
        if (edge.openingYear != null) yearSet.add(edge.openingYear)
      }
      years = [...yearSet].sort((a, b) => a - b)

      eventMap = new Map()
      for (const evt of project?.timelineEvents || []) {
        eventMap.set(evt.year, evt.description)
      }

      lineLabels = new Map()
      animationPlan = buildTimelineAnimationPlan(project)
    }

    // Build the continuous plan from the per-year plan
    continuousPlan = buildContinuousPlan(animationPlan, years)

    // Fixed camera on full bounds
    camera = computeGeoCamera(fullBounds, logicalWidth, logicalHeight)

    // Prefetch tiles
    if (fullBounds) {
      tileCache.prefetchForBounds(fullBounds, Math.round(camera.zoom))
    }
  }

  // ─── Timing helpers ─────────────────────────────────────────────

  function getTotalDrawMs() { return DEFAULT_TOTAL_DRAW_MS / speed }

  // ─── Stats helpers ──────────────────────────────────────────────

  /** Find which year the current global progress falls into. */
  function findCurrentYear(globalProgress) {
    if (!continuousPlan?.yearMarkers?.length) return { year: null, index: 0 }
    let idx = 0
    for (let i = continuousPlan.yearMarkers.length - 1; i >= 0; i--) {
      if (globalProgress >= continuousPlan.yearMarkers[i].globalStart) {
        idx = i
        break
      }
    }
    return { year: continuousPlan.yearMarkers[idx].year, index: idx }
  }

  /** Compute stats for pseudo mode up to a given year. */
  function computePseudoStats(yearPlan) {
    if (!yearPlan) return null
    const lineIds = new Set()
    const allEdges = [...(yearPlan.prevEdges || [])]
    for (const lp of yearPlan.lineDrawPlans || []) {
      lineIds.add(lp.lineId)
      for (const seg of lp.segments) {
        const edge = (project?.edges || []).find(e => e.id === seg.edgeId)
        if (edge) allEdges.push(edge)
      }
    }
    for (const e of allEdges) {
      for (const lid of e.sharedByLineIds || []) lineIds.add(lid)
    }
    let totalMeters = 0
    for (const e of allEdges) totalMeters += e.lengthMeters || 0
    return {
      lines: lineIds.size,
      stations: yearPlan.cumulativeStationIds?.size || 0,
      km: totalMeters / 1000,
    }
  }

  /** Compute stats at a given global progress. */
  function computeStatsAtProgress(globalProgress) {
    const { year, index } = findCurrentYear(globalProgress)
    if (year == null) return null
    const marker = continuousPlan.yearMarkers[index]
    if (!marker?.yearPlan) return null
    return pseudoMode
      ? computePseudoStats(marker.yearPlan)
      : computeStatsForYear(project, year)
  }

  /**
   * Compute per-line cumulative km up to the given year marker index.
   * Returns an array of { lineId, name, color, km } for all lines
   * that have appeared up to and including the current year.
   */
  function computeCumulativeLineStats(yearMarkerIndex) {
    if (!continuousPlan?.yearMarkers?.length) return []
    const lineKm = new Map()   // lineId → total meters
    const lineInfo = new Map()  // lineId → { name, color }

    for (let i = 0; i <= yearMarkerIndex && i < continuousPlan.yearMarkers.length; i++) {
      const marker = continuousPlan.yearMarkers[i]
      const yp = marker?.yearPlan
      if (!yp) continue
      for (const lp of yp.lineDrawPlans) {
        if (!lineInfo.has(lp.lineId)) {
          const line = lineMap.get(lp.lineId)
          lineInfo.set(lp.lineId, {
            name: lp.nameZh || lp.nameEn || (line?.nameZh) || lp.lineId,
            color: lp.color || line?.color || '#2563EB',
          })
        }
        lineKm.set(lp.lineId, (lineKm.get(lp.lineId) || 0) + (lp.totalLength || 0))
      }
    }

    // Preserve line order from project.lines
    const orderedLineIds = (project?.lines || []).map(l => l.id)
    const result = []
    for (const lid of orderedLineIds) {
      if (lineInfo.has(lid)) {
        const info = lineInfo.get(lid)
        result.push({
          lineId: lid,
          name: info.name,
          color: info.color,
          km: (lineKm.get(lid) || 0) / 1000,
        })
      }
    }
    // Add any lines not in project.lines order (shouldn't happen, but safety)
    for (const [lid, info] of lineInfo) {
      if (!result.find(r => r.lineId === lid)) {
        result.push({
          lineId: lid,
          name: info.name,
          color: info.color,
          km: (lineKm.get(lid) || 0) / 1000,
        })
      }
    }
    return result
  }

  /**
   * Get the current year's new line draw info for the top banner.
   * Returns { nameZh, nameEn, color, deltaKm } for the primary line being drawn this year.
   */
  function getCurrentYearLineInfo(yearMarkerIndex) {
    if (!continuousPlan?.yearMarkers?.length) return null
    const marker = continuousPlan.yearMarkers[yearMarkerIndex]
    const yp = marker?.yearPlan
    if (!yp?.lineDrawPlans?.length) return null

    // Sum up all new km this year
    let totalNewKm = 0
    for (const lp of yp.lineDrawPlans) {
      totalNewKm += (lp.totalLength || 0) / 1000
    }

    // Use the first (primary) line for display
    const primary = yp.lineDrawPlans[0]
    return {
      nameZh: primary.nameZh || '',
      nameEn: primary.nameEn || '',
      color: primary.color || '#2563EB',
      deltaKm: totalNewKm,
    }
  }

  // ─── State transitions ─────────────────────────────────────────

  function setState(next) {
    if (state === next) return
    state = next
    onStateChange?.(state, {
      year: years[currentYearIndex] ?? null,
      yearIndex: currentYearIndex,
      totalYears: years.length,
    })
  }

  function startPlaying(now) {
    currentYearIndex = 0
    phaseStart = now
    setState('playing')
    emitYearChange()
  }

  function emitYearChange() {
    onYearChange?.(years[currentYearIndex], currentYearIndex, years.length)
  }

  // ─── Continuous rendering ───────────────────────────────────────

  /**
   * Render the network at a given global draw progress (0..1).
   * Draws all segments up to the progress point as a single continuous stroke.
   */
  function renderContinuousFrame(globalProgress) {
    const cp = continuousPlan
    if (!cp || !cp.segments.length) return

    // Fixed camera on full bounds
    camera = computeGeoCamera(fullBounds, logicalWidth, logicalHeight)

    // Tiles
    renderTiles(ctx, camera, logicalWidth, logicalHeight, tileCache)

    const lw = Math.max(2, 3.5 * Math.pow(2, (camera.zoom - 12) * 0.45))

    // Draw all segments: fully drawn ones + the currently animating one
    for (const seg of cp.segments) {
      if (globalProgress <= seg.globalStart) break // not reached yet

      const segSpan = seg.globalEnd - seg.globalStart
      let segProgress = 1
      if (segSpan > 0 && globalProgress < seg.globalEnd) {
        segProgress = Math.max(0, Math.min(1, (globalProgress - seg.globalStart) / segSpan))
      }

      let points = seg.waypoints
      if (segProgress < 1) {
        const sliced = slicePolylineByProgress(seg.waypoints, segProgress)
        points = sliced.points
      }

      if (points.length >= 2) {
        drawGeoPolyline(ctx, points, camera, logicalWidth, logicalHeight, seg.color, lw, 1)
      }
    }

    // Draw stations that have been revealed
    const revealedIds = new Set()
    for (const reveal of cp.stationReveals) {
      if (globalProgress < reveal.triggerProgress) continue
      revealedIds.add(reveal.stationId)
    }
    renderStations(ctx, revealedIds, camera, logicalWidth, logicalHeight, stationMap, { alpha: 0.9 })

    // Animate the most recently revealed stations (fade-in)
    for (const reveal of cp.stationReveals) {
      const fadeWindow = 0.02
      if (globalProgress < reveal.triggerProgress) continue
      if (globalProgress > reveal.triggerProgress + fadeWindow) continue
      const fadeT = (globalProgress - reveal.triggerProgress) / fadeWindow
      const station = stationMap.get(reveal.stationId)
      if (!station?.lngLat) continue
      renderStationFadeIn(ctx, station, camera, fadeT)
    }

    // Overlays
    const { year, index } = findCurrentYear(globalProgress)
    if (year != null && year !== years[currentYearIndex]) {
      currentYearIndex = index
      emitYearChange()
    }

    const yearLabel = pseudoMode ? (lineLabels.get(year)?.nameZh || `#${year}`) : year
    const stats = computeStatsAtProgress(globalProgress)
    const overlayAlpha = globalProgress < 0.02 ? globalProgress / 0.02 : globalProgress > 0.98 ? (1 - globalProgress) / 0.02 : 1

    renderOverlayYear(ctx, yearLabel, overlayAlpha, logicalWidth, logicalHeight)
    renderOverlayStats(ctx, stats, overlayAlpha, logicalWidth, logicalHeight)
    renderOverlayScaleBar(ctx, camera, overlayAlpha, logicalWidth, logicalHeight)
    renderOverlayBranding(ctx, title, author, overlayAlpha, logicalWidth, logicalHeight)

    // Current year marker (shared by event text + line info)
    const curMarker = continuousPlan.yearMarkers[index]

    // Top banner — always show current year's line info, with event text override
    if (curMarker) {
      const nextMarker = continuousPlan.yearMarkers[index + 1]
      const yearEnd = nextMarker ? nextMarker.globalStart : 1
      const yearSpan = yearEnd - curMarker.globalStart
      const yearLocalT = yearSpan > 0 ? (globalProgress - curMarker.globalStart) / yearSpan : 0
      const bannerAlpha = yearLocalT < 0.1 ? yearLocalT / 0.1 : yearLocalT > 0.9 ? (1 - yearLocalT) / 0.1 : 1

      const eventText = eventMap.get(year)
      const lineInfo = getCurrentYearLineInfo(index)
      const lineColor = lineInfo?.color || continuousPlan.segments.find(s => s.year === year)?.color || '#2563EB'

      renderOverlayEvent(ctx, eventText || null, lineColor, bannerAlpha * overlayAlpha, logicalWidth, logicalHeight, {
        nameZh: lineInfo?.nameZh || '',
        nameEn: lineInfo?.nameEn || '',
        deltaKm: lineInfo?.deltaKm || 0,
      })
    }

    // Line legend — cumulative lines up to current year
    const cumulativeLineStats = computeCumulativeLineStats(index)
    if (cumulativeLineStats.length > 0) {
      renderOverlayLineInfo(ctx, curMarker?.yearPlan, stats, overlayAlpha, logicalWidth, logicalHeight, {
        cumulativeLineStats,
      })
    }
  }

  /** Draw a single polyline in geographic coordinates. */
  function drawGeoPolyline(ctx2d, points, cam, width, height, color, lineWidth, alpha) {
    if (!points || points.length < 2) return
    ctx2d.save()
    ctx2d.globalAlpha = alpha
    ctx2d.strokeStyle = color
    ctx2d.lineWidth = lineWidth
    ctx2d.lineCap = 'round'
    ctx2d.lineJoin = 'round'
    ctx2d.setLineDash([])
    ctx2d.beginPath()
    const [sx, sy] = lngLatToPixel(points[0][0], points[0][1], cam, width, height)
    ctx2d.moveTo(sx, sy)
    for (let i = 1; i < points.length; i++) {
      const [px, py] = lngLatToPixel(points[i][0], points[i][1], cam, width, height)
      ctx2d.lineTo(px, py)
    }
    ctx2d.stroke()
    ctx2d.restore()
  }

  /** Render a station with fade-in scale effect. */
  function renderStationFadeIn(ctx2d, station, cam, fadeT) {
    const zoom = cam.zoom
    const radius = Math.max(2.5, 3.5 * Math.pow(2, (zoom - 12) * 0.35))
    const [px, py] = lngLatToPixel(station.lngLat[0], station.lngLat[1], cam, logicalWidth, logicalHeight)
    if (px < -50 || px > logicalWidth + 50 || py < -50 || py > logicalHeight + 50) return

    const scale = 0.5 + fadeT * 0.5
    const alpha = fadeT

    ctx2d.save()
    ctx2d.globalAlpha = alpha
    ctx2d.translate(px, py)
    ctx2d.scale(scale, scale)
    ctx2d.beginPath()
    ctx2d.arc(0, 0, radius, 0, Math.PI * 2)
    ctx2d.fillStyle = '#ffffff'
    ctx2d.fill()
    ctx2d.strokeStyle = '#1F2937'
    ctx2d.lineWidth = Math.max(1, radius * 0.42)
    ctx2d.stroke()
    ctx2d.restore()
  }

  // ─── Rendering tick ────────────────────────────────────────────

  function tick(now) {
    rafId = null

    if (state === 'idle') {
      renderIdleFrame()
      return
    }

    if (state === 'playing') {
      tickPlaying(now)
      scheduleFrame()
      return
    }
  }

  function tickPlaying(now) {
    const totalMs = getTotalDrawMs()
    const elapsed = now - phaseStart
    const rawProgress = elapsed / totalMs

    if (rawProgress >= 1) {
      // Drawing complete — render final frame and stop
      renderContinuousFrame(1)
      setState('idle')
      renderIdleFrame()
      return
    }

    const globalProgress = rawProgress
    renderContinuousFrame(globalProgress)
  }

  function renderIdleFrame() {
    if (!fullBounds) {
      ctx.fillStyle = '#e8ecf0'
      ctx.fillRect(0, 0, logicalWidth, logicalHeight)
      return
    }
    const cam = computeGeoCamera(fullBounds, logicalWidth, logicalHeight)
    renderTiles(ctx, cam, logicalWidth, logicalHeight, tileCache)

    // Render all timeline edges
    const allEdges = pseudoMode
      ? (project?.edges || [])
      : (project?.edges || []).filter(e => e.openingYear != null)
    renderPrevEdges(ctx, allEdges, cam, logicalWidth, logicalHeight, stationMap, lineMap)
    const allStationIds = new Set()
    for (const e of allEdges) {
      allStationIds.add(e.fromStationId)
      allStationIds.add(e.toStationId)
    }
    renderStations(ctx, allStationIds, cam, logicalWidth, logicalHeight, stationMap)
    renderOverlayBranding(ctx, title, author, 0.4, logicalWidth, logicalHeight)
  }

  function scheduleFrame() {
    if (rafId != null) return
    rafId = requestAnimationFrame(tick)
  }

  function cancelFrame() {
    if (rafId != null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  // ─── Public API ────────────────────────────────────────────────

  function play() {
    if (!years.length) return
    if (state === 'playing') return

    buildData()
    camera = computeGeoCamera(fullBounds, logicalWidth, logicalHeight)

    const now = performance.now()
    startPlaying(now)
    scheduleFrame()
  }

  function pause() {
    if (state !== 'playing') return
    cancelFrame()
    setState('idle')
  }

  function stop() {
    cancelFrame()
    currentYearIndex = 0
    camera = computeGeoCamera(fullBounds, logicalWidth, logicalHeight)
    setState('idle')
    renderIdleFrame()
  }

  function seekToYear(year) {
    const idx = years.indexOf(year)
    if (idx === -1 || !continuousPlan?.yearMarkers?.length) return
    currentYearIndex = idx

    // Find the global progress for this year's end
    const marker = continuousPlan.yearMarkers[idx]
    const nextMarker = continuousPlan.yearMarkers[idx + 1]
    const yearEnd = nextMarker ? nextMarker.globalStart : 1
    renderContinuousFrame(yearEnd)
    emitYearChange()
  }

  function setSpeed(s) {
    const num = Number(s)
    if (Number.isFinite(num) && num > 0) speed = num
  }

  function setPseudoMode(v) { pseudoMode = Boolean(v) }

  function resize(w, h) {
    applyCanvasSize(w, h)
    if (state === 'idle') renderIdleFrame()
  }

  function rebuild() {
    buildData()
    if (state === 'idle') renderIdleFrame()
  }

  function destroy() {
    cancelFrame()
    tileCache.onTileLoaded = null
    state = 'idle'
    tileCache.clear()
    animationPlan = null
    continuousPlan = null
    years = []
  }

  function getState() {
    return {
      state,
      currentYear: years[currentYearIndex] ?? null,
      yearIndex: currentYearIndex,
      totalYears: years.length,
      speed,
    }
  }

  // ─── Initialize ────────────────────────────────────────────────

  buildData()

  return {
    play,
    pause,
    stop,
    seekToYear,
    setSpeed,
    setPseudoMode,
    resize,
    rebuild,
    destroy,
    getState,
    get state() { return state },
    get years() { return years },
    get currentYearIndex() { return currentYearIndex },
    get pseudoMode() { return pseudoMode },
    get lineLabels() { return lineLabels },
  }
}
