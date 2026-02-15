import {
  boxesOverlap,
  distancePointToRect,
  distanceSegmentToRect,
  segmentIntersectsRectWithClearance,
  toFiniteNumber,
} from './shared'
import {
  estimateLabelWidth,
  buildLabelTemplates,
  detectStationOrientationBias,
  buildLabelBox,
  candidateSidePenalty,
  buildTemplatePools,
  selectTemplateFromPools,
  relaxStationLabelLayout,
} from './labelPlacement'

function computeStationLabelLayout(positions, stations, edgeRecords, nodeDegrees, config) {
  const segments = edgeRecords.map((edge) => ({
    fromIndex: edge.fromIndex,
    toIndex: edge.toIndex,
    from: positions[edge.fromIndex],
    to: positions[edge.toIndex],
  }))

  const order = Array.from({ length: stations.length }, (_, index) => index).sort((a, b) => {
    const inter = Number(Boolean(stations[b]?.isInterchange)) - Number(Boolean(stations[a]?.isInterchange))
    if (inter !== 0) return inter
    const degreeDiff = (nodeDegrees[b] || 0) - (nodeDegrees[a] || 0)
    if (degreeDiff !== 0) return degreeDiff
    return (stations[b]?.nameZh?.length || 0) - (stations[a]?.nameZh?.length || 0)
  })

  const labels = {}
  const placed = []
  const lineClearance = Math.max(2, toFiniteNumber(config.labelLineClearance, 9.5))
  const incidentIgnoreRadius = Math.max(0, toFiniteNumber(config.incidentEdgeLabelIgnoreRadius, 10))

  for (const stationIndex of order) {
    const station = stations[stationIndex]
    const base = positions[stationIndex]
    const width = estimateLabelWidth(station)
    const height = station.nameEn ? 26 : 15
    const templates = buildLabelTemplates(station, config, nodeDegrees[stationIndex] || 0)
    const orientationBias = detectStationOrientationBias(segments, stationIndex, base)
    const preferredTemplates =
      orientationBias === 'vertical'
        ? templates.filter((template) => template.anchor === 'middle')
        : templates

    let best = null
    let bestScore = Number.POSITIVE_INFINITY

    const scoreTemplate = (template, strictLineClearance) => {
      const box = buildLabelBox(base, width, height, template, config.labelPadding)
      let score = candidateSidePenalty(template.side, segments, stationIndex, base)
      let hardInvalid = false

      for (const item of placed) {
        if (!boxesOverlap(box, item.box)) continue
        const overlapX = Math.min(box.right, item.box.right) - Math.max(box.left, item.box.left)
        const overlapY = Math.min(box.bottom, item.box.bottom) - Math.max(box.top, item.box.top)
        score += Math.max(0, overlapX) * Math.max(0, overlapY) * 0.34 + 180
      }

      for (let i = 0; i < positions.length; i += 1) {
        if (i === stationIndex) continue
        const dist = distancePointToRect(positions[i][0], positions[i][1], box)
        if (dist < 8.5) {
          score += (8.5 - dist) * 12
        }
      }

      for (const segment of segments) {
        const isIncident = segment.fromIndex === stationIndex || segment.toIndex === stationIndex
        const stationCenter = isIncident ? base : null
        const intersected = segmentIntersectsRectWithClearance(
          segment.from,
          segment.to,
          box,
          lineClearance,
          stationCenter,
          incidentIgnoreRadius,
        )
        if (intersected) {
          score += isIncident ? 180 : 320
          if (strictLineClearance) hardInvalid = true
          continue
        }

        const segmentDistance = distanceSegmentToRect(
          segment.from,
          segment.to,
          box,
          stationCenter,
          incidentIgnoreRadius,
        )
        if (segmentDistance < lineClearance) {
          const gapPenalty = (lineClearance - segmentDistance) * (isIncident ? 18 : 22)
          score += gapPenalty
          if (strictLineClearance) hardInvalid = true
        }
      }

      return { score, hardInvalid, box }
    }

    const templatePools = buildTemplatePools(preferredTemplates, templates)
    const strictPick = selectTemplateFromPools(templatePools, (template) => scoreTemplate(template, true), true)
    if (strictPick) {
      best = strictPick.template
      bestScore = strictPick.score
    }

    if (!best) {
      const softPick = selectTemplateFromPools(
        templatePools,
        (template) => scoreTemplate(template, false),
        false,
      )
      if (softPick) {
        best = softPick.template
        bestScore = softPick.score
      }
    }

    if (!best) {
      for (const template of templates) {
        const box = buildLabelBox(base, width, height, template, config.labelPadding)
        let score = candidateSidePenalty(template.side, segments, stationIndex, base)
        for (const segment of segments) {
          const isIncident = segment.fromIndex === stationIndex || segment.toIndex === stationIndex
          const stationCenter = isIncident ? base : null
          const intersected = segmentIntersectsRectWithClearance(
            segment.from,
            segment.to,
            box,
            lineClearance,
            stationCenter,
            incidentIgnoreRadius,
          )
          if (intersected) score += isIncident ? 180 : 320
        }
        if (score < bestScore) {
          bestScore = score
          best = { ...template, box }
        }
      }
    }

    if (!best) {
      const fallbackPlacement = templates[0] || { dx: 14, dy: -26, anchor: 'start', side: 'E_N' }
      best = {
        ...fallbackPlacement,
        box: buildLabelBox(base, width, height, fallbackPlacement, config.labelPadding),
      }
    }

    labels[station.id] = {
      dx: best.dx,
      dy: best.dy,
      anchor: best.anchor,
    }
    placed.push({ stationIndex, box: best.box })
  }

  return relaxStationLabelLayout(
    positions,
    stations,
    labels,
    segments,
    config,
    lineClearance,
    incidentIgnoreRadius,
  )
}

export { computeStationLabelLayout, estimateLabelWidth, buildLabelBox }
