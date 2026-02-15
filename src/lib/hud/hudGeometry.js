/**
 * Geometry helpers for HUD rendering.
 * SVG path generation, chevron marks, badge sizing, layout estimation.
 */

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function pointsToRoundedPath(points, radius) {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`
  if (points.length === 2) {
    return `M ${points[0][0]} ${points[0][1]} L ${points[1][0]} ${points[1][1]}`
  }

  const safeRadius = Math.max(0, radius)
  let d = `M ${points[0][0]} ${points[0][1]}`

  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1]
    const curr = points[i]
    const next = points[i + 1]

    const inVec = [curr[0] - prev[0], curr[1] - prev[1]]
    const outVec = [next[0] - curr[0], next[1] - curr[1]]
    const inLen = Math.hypot(inVec[0], inVec[1])
    const outLen = Math.hypot(outVec[0], outVec[1])

    if (inLen < 1e-6 || outLen < 1e-6 || safeRadius < 0.5) {
      d += ` L ${curr[0]} ${curr[1]}`
      continue
    }

    const trim = Math.min(safeRadius, inLen * 0.48, outLen * 0.48)
    const inUnit = [inVec[0] / inLen, inVec[1] / inLen]
    const outUnit = [outVec[0] / outLen, outVec[1] / outLen]
    const p1 = [curr[0] - inUnit[0] * trim, curr[1] - inUnit[1] * trim]
    const p2 = [curr[0] + outUnit[0] * trim, curr[1] + outUnit[1] * trim]

    d += ` L ${p1[0]} ${p1[1]} Q ${curr[0]} ${curr[1]} ${p2[0]} ${p2[1]}`
  }

  const last = points[points.length - 1]
  d += ` L ${last[0]} ${last[1]}`
  return d
}

export function pointsToClosedRoundedPath(points, radius) {
  if (!Array.isArray(points) || points.length < 3) return pointsToRoundedPath(points || [], radius)
  const cyclePoints = [...points, points[0], points[1]]
  const safeRadius = Math.max(0, radius)
  let d = `M ${points[0][0]} ${points[0][1]}`

  for (let i = 1; i <= points.length; i += 1) {
    const prev = cyclePoints[i - 1]
    const curr = cyclePoints[i]
    const next = cyclePoints[i + 1]
    const inVec = [curr[0] - prev[0], curr[1] - prev[1]]
    const outVec = [next[0] - curr[0], next[1] - curr[1]]
    const inLen = Math.hypot(inVec[0], inVec[1])
    const outLen = Math.hypot(outVec[0], outVec[1])

    if (inLen < 1e-6 || outLen < 1e-6 || safeRadius < 0.5) {
      d += ` L ${curr[0]} ${curr[1]}`
      continue
    }

    const trim = Math.min(safeRadius, inLen * 0.44, outLen * 0.44)
    const inUnit = [inVec[0] / inLen, inVec[1] / inLen]
    const outUnit = [outVec[0] / outLen, outVec[1] / outLen]
    const p1 = [curr[0] - inUnit[0] * trim, curr[1] - inUnit[1] * trim]
    const p2 = [curr[0] + outUnit[0] * trim, curr[1] + outUnit[1] * trim]
    d += ` L ${p1[0]} ${p1[1]} Q ${curr[0]} ${curr[1]} ${p2[0]} ${p2[1]}`
  }

  d += ' Z'
  return d
}

export function buildChevronMarks(stations, options = {}) {
  const isLoop = Boolean(options?.isLoop)
  const segmentCount = isLoop ? stations.length : stations.length - 1
  const stride = isLoop && stations.length >= 40 ? 3 : 1
  const marks = []
  for (let i = 0; i < segmentCount; i += stride) {
    const current = stations[i]
    const next = stations[(i + 1) % stations.length]
    if (!current || !next) continue
    if (current.rowIndex !== next.rowIndex) continue
    const dx = next.x - current.x
    const dy = next.y - current.y
    const segmentLength = Math.hypot(dx, dy)
    if (segmentLength < 70) continue
    const ux = dx / segmentLength
    const uy = dy / segmentLength
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI
    const centerX = (current.x + next.x) / 2
    const centerY = (current.y + next.y) / 2
    const spacing = 16
    marks.push({
      id: `${current.id}_${next.id}_a`,
      x: centerX - ux * spacing * 0.7,
      y: centerY - uy * spacing * 0.7,
      angle,
    })
    marks.push({
      id: `${current.id}_${next.id}_b`,
      x: centerX + ux * spacing * 0.7,
      y: centerY + uy * spacing * 0.7,
      angle,
    })
  }
  return marks
}

export function resolveHudStationGap(stationCount) {
  const count = Math.max(2, Number(stationCount) || 2)
  if (count <= 8) return 300
  if (count <= 16) return 240
  if (count <= 24) return 200
  return 170
}

export function estimateHudLineHeaderWidth(lineNameZh) {
  const text = String(lineNameZh || '').trim()
  if (!text) return 220
  let units = 0
  for (const ch of text) {
    if (/[\u4e00-\u9fff]/u.test(ch)) units += 1.35
    else units += 1
  }
  return clamp(Math.round(120 + units * 44), 220, 620)
}

export function resolveTransferBadgeWidth(text) {
  const value = String(text || '')
  let units = 0
  for (const ch of value) {
    if (/[\u4e00-\u9fff]/u.test(ch)) units += 1.65
    else units += 1
  }
  return Math.max(64, Math.min(136, Math.round(26 + units * 10)))
}

export function estimateRowCalloutDownExtent(stationIds, stationById, lineId) {
  const maxBadgeCount = estimateMaxTransferBadgeCount(stationIds, stationById, lineId)
  if (maxBadgeCount <= 0) return 0
  return 122 + (maxBadgeCount - 1) * 30
}

export function estimateRowCalloutUpExtent(stationIds, stationById, lineId) {
  const maxBadgeCount = estimateMaxTransferBadgeCount(stationIds, stationById, lineId)
  if (maxBadgeCount <= 0) return 0
  return 128 + (maxBadgeCount - 1) * 30
}

export function estimateMaxTransferBadgeCount(stationIds, stationById, lineId) {
  const currentLineKey = toIdKey(lineId)
  let maxCount = 0
  for (const stationId of stationIds) {
    const station = stationById.get(stationId)
    if (!station) continue
    const effectiveLineIds = Array.isArray(station.transferLineIds) && station.transferLineIds.length
      ? station.transferLineIds
      : station.lineIds || []
    const transferCount = [...new Set(effectiveLineIds.map((id) => toIdKey(id)).filter(Boolean))]
      .filter((key) => key !== currentLineKey)
      .length
    if (transferCount > maxCount) maxCount = transferCount
  }
  return Math.min(6, maxCount)
}

function toIdKey(id) {
  if (id == null) return ''
  return String(id)
}
