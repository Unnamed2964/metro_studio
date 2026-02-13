const DEFAULT_CONFIG = {
  maxIterations: 2000,
  cooling: 0.996,
  initialTemperature: 14,
  anchorWeight: 0.0048,
  springWeight: 0.028,
  angleWeight: 0.022,
  repulsionWeight: 36,
  geoWeight: 0.56,
  minStationDistance: 22,
  minEdgeLength: 30,
  maxEdgeLength: 96,
  labelPadding: 5,
  straightenTurnToleranceDeg: 18,
  straightenStrength: 0.72,
  normalizeTargetSpan: 1320,
  lineDirectionPasses: 3,
  lineDirectionBlend: 0.43,
  lineDataAngleWeight: 1.25,
  lineMainDirectionWeight: 0.52,
  lineTurnPenalty: 1.55,
  lineTurnStepPenalty: 0.62,
  lineUTurnPenalty: 3.6,
  lineMinRunEdges: 2,
  lineShortRunPenalty: 2.8,
  lineBendScoreWeight: 2.6,
  lineShortRunScoreWeight: 5.4,
  octilinearRelaxIterations: 40,
  octilinearBlend: 0.38,
  octilinearExactPasses: 3,
}

self.onmessage = (event) => {
  const { requestId, payload } = event.data || {}
  if (!requestId) return
  try {
    const result = optimizeLayout(payload)
    self.postMessage({ requestId, ok: true, result })
  } catch (error) {
    self.postMessage({
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : 'unknown-worker-error',
    })
  }
}

function optimizeLayout(payload) {
  const startedAt = performance.now()
  const stations = payload?.stations || []
  const edges = payload?.edges || []
  const lines = payload?.lines || []
  const config = { ...DEFAULT_CONFIG, ...(payload?.config || {}) }

  if (!stations.length || !edges.length) {
    return {
      stations,
      score: 0,
      breakdown: {
        angle: 0,
        length: 0,
        overlap: 0,
        crossing: 0,
        bend: 0,
        shortRun: 0,
        geoDeviation: 0,
        labelOverlap: 0,
      },
      elapsedMs: performance.now() - startedAt,
    }
  }

  const stationIndex = new Map()
  stations.forEach((station, index) => {
    stationIndex.set(station.id, index)
  })

  const original = normalizeSeedPositions(stations, config.normalizeTargetSpan)
  const positions = original.map((xy) => [...xy])

  const edgeRecords = []
  for (const edge of edges) {
    const fromIndex = stationIndex.get(edge.fromStationId)
    const toIndex = stationIndex.get(edge.toStationId)
    if (fromIndex == null || toIndex == null || fromIndex === toIndex) continue

    const baseLength = distance(original[fromIndex], original[toIndex])
    const desiredLength = estimateDesiredEdgeLength(baseLength, config)

    edgeRecords.push({
      id: edge.id,
      fromIndex,
      toIndex,
      desiredLength,
    })
  }
  const edgeById = new Map(edgeRecords.map((edge) => [edge.id, edge]))
  const nodeDegrees = buildNodeDegrees(stations.length, edgeRecords)
  const lineChains = buildLineChains(lines, edgeById)

  let temperature = config.initialTemperature

  for (let iteration = 0; iteration < config.maxIterations; iteration += 1) {
    const forces = positions.map(() => [0, 0])

    applyAnchorForce(forces, positions, original, config)
    applySpringAndAngleForce(forces, positions, edgeRecords, config)
    applyRepulsionForce(forces, positions, config)

    const step = 0.12 * temperature
    for (let i = 0; i < positions.length; i += 1) {
      positions[i][0] += forces[i][0] * step
      positions[i][1] += forces[i][1] * step
    }

    temperature *= config.cooling
  }

  snapEdgesToEightDirections(positions, edgeRecords, 0.24)
  applyLineDirectionPlanning(positions, edgeById, lineChains, stations, nodeDegrees, config)
  straightenNearLinearSegments(positions, edgeRecords, lines, stations, config)
  compactLongEdges(positions, edgeRecords, config.maxEdgeLength * 1.12)
  applyLineDirectionPlanning(positions, edgeById, lineChains, stations, nodeDegrees, config)
  snapEdgesToEightDirections(positions, edgeRecords, 0.26)
  enforceOctilinearHardConstraints(positions, edgeRecords, stations, config)

  const breakdown = computeScoreBreakdown(positions, original, edgeRecords, lineChains, stations, config)
  const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0)

  const nextStations = stations.map((station, index) => ({
    ...station,
    displayPos: positions[index],
  }))

  return {
    stations: nextStations,
    score,
    breakdown,
    elapsedMs: performance.now() - startedAt,
  }
}

function normalizeSeedPositions(stations, targetSpan) {
  const raw = stations.map((station) => {
    if (Array.isArray(station.displayPos) && station.displayPos.length === 2) {
      return [...station.displayPos]
    }
    if (Array.isArray(station.lngLat) && station.lngLat.length === 2) {
      return [...station.lngLat]
    }
    return [0, 0]
  })

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const [x, y] of raw) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }

  const width = Math.max(maxX - minX, 1)
  const height = Math.max(maxY - minY, 1)
  const scale = targetSpan / Math.max(width, height)

  return raw.map(([x, y]) => [(x - minX) * scale, (y - minY) * scale])
}

function estimateDesiredEdgeLength(baseLength, config) {
  const linearCompressed = 34 + Math.min(baseLength, 280) * 0.2
  return clamp(linearCompressed, config.minEdgeLength, config.maxEdgeLength)
}

function applyAnchorForce(forces, positions, original, config) {
  for (let i = 0; i < positions.length; i += 1) {
    const dx = original[i][0] - positions[i][0]
    const dy = original[i][1] - positions[i][1]
    forces[i][0] += dx * config.anchorWeight
    forces[i][1] += dy * config.anchorWeight
  }
}

function applySpringAndAngleForce(forces, positions, edgeRecords, config) {
  for (const edge of edgeRecords) {
    const a = positions[edge.fromIndex]
    const b = positions[edge.toIndex]

    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const length = Math.max(distance(a, b), 0.00001)
    const ux = dx / length
    const uy = dy / length

    const springDelta = length - edge.desiredLength
    const springForce = springDelta * config.springWeight

    forces[edge.fromIndex][0] += ux * springForce
    forces[edge.fromIndex][1] += uy * springForce
    forces[edge.toIndex][0] -= ux * springForce
    forces[edge.toIndex][1] -= uy * springForce

    const snappedAngle = snapAngle(Math.atan2(dy, dx))
    const desiredDx = Math.cos(snappedAngle) * length
    const desiredDy = Math.sin(snappedAngle) * length
    const angleCorrectionX = (desiredDx - dx) * config.angleWeight
    const angleCorrectionY = (desiredDy - dy) * config.angleWeight

    forces[edge.fromIndex][0] -= angleCorrectionX
    forces[edge.fromIndex][1] -= angleCorrectionY
    forces[edge.toIndex][0] += angleCorrectionX
    forces[edge.toIndex][1] += angleCorrectionY
  }
}

function applyRepulsionForce(forces, positions, config) {
  const grid = new Map()
  const cellSize = config.minStationDistance * 1.6

  for (let i = 0; i < positions.length; i += 1) {
    const [x, y] = positions[i]
    const key = `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`
    if (!grid.has(key)) grid.set(key, [])
    grid.get(key).push(i)
  }

  const neighborOffsets = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 0],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ]

  for (let i = 0; i < positions.length; i += 1) {
    const [x, y] = positions[i]
    const baseX = Math.floor(x / cellSize)
    const baseY = Math.floor(y / cellSize)

    for (const [ox, oy] of neighborOffsets) {
      const key = `${baseX + ox}:${baseY + oy}`
      const bucket = grid.get(key)
      if (!bucket) continue
      for (const j of bucket) {
        if (i >= j) continue
        const dx = positions[j][0] - positions[i][0]
        const dy = positions[j][1] - positions[i][1]
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 0.00001)
        if (d >= config.minStationDistance * 2.5) continue
        const strength = (config.repulsionWeight / (d * d)) * 0.023
        const ux = dx / d
        const uy = dy / d
        forces[i][0] -= ux * strength
        forces[i][1] -= uy * strength
        forces[j][0] += ux * strength
        forces[j][1] += uy * strength
      }
    }
  }
}

function snapEdgesToEightDirections(positions, edgeRecords, ratio) {
  for (const edge of edgeRecords) {
    const from = positions[edge.fromIndex]
    const to = positions[edge.toIndex]
    const dx = to[0] - from[0]
    const dy = to[1] - from[1]
    const length = distance(from, to)
    if (!length) continue
    const snapped = snapAngle(Math.atan2(dy, dx))
    const targetDx = Math.cos(snapped) * length
    const targetDy = Math.sin(snapped) * length
    const correctionX = (targetDx - dx) * ratio
    const correctionY = (targetDy - dy) * ratio
    from[0] -= correctionX
    from[1] -= correctionY
    to[0] += correctionX
    to[1] += correctionY
  }
}

function straightenNearLinearSegments(positions, edgeRecords, lines, stations, config) {
  const edgeById = new Map(edgeRecords.map((edge) => [edge.id, edge]))
  const turnTolerance = (config.straightenTurnToleranceDeg * Math.PI) / 180

  for (const line of lines || []) {
    const adjacency = new Map()
    for (const edgeId of line.edgeIds || []) {
      const edge = edgeById.get(edgeId)
      if (!edge) continue
      addNeighbor(adjacency, edge.fromIndex, edge.toIndex)
      addNeighbor(adjacency, edge.toIndex, edge.fromIndex)
    }

    for (let pass = 0; pass < 2; pass += 1) {
      for (const [centerIndex, neighbors] of adjacency.entries()) {
        if (neighbors.size !== 2) continue
        if ((stations[centerIndex]?.lineIds?.length || 0) > 1) continue
        const [leftIndex, rightIndex] = [...neighbors]
        const center = positions[centerIndex]
        const left = positions[leftIndex]
        const right = positions[rightIndex]

        const v1 = [left[0] - center[0], left[1] - center[1]]
        const v2 = [right[0] - center[0], right[1] - center[1]]
        const len1 = Math.max(Math.hypot(v1[0], v1[1]), 0.00001)
        const len2 = Math.max(Math.hypot(v2[0], v2[1]), 0.00001)

        const cosTheta = clamp((v1[0] * v2[0] + v1[1] * v2[1]) / (len1 * len2), -1, 1)
        const angle = Math.acos(cosTheta)
        const turn = Math.abs(Math.PI - angle)

        if (turn > turnTolerance) continue

        const projected = projectPointToLine(center, left, right)
        center[0] = lerp(center[0], projected[0], config.straightenStrength)
        center[1] = lerp(center[1], projected[1], config.straightenStrength)
      }
    }
  }
}

function compactLongEdges(positions, edgeRecords, maxLength) {
  for (const edge of edgeRecords) {
    const from = positions[edge.fromIndex]
    const to = positions[edge.toIndex]
    const length = distance(from, to)
    if (length <= maxLength) continue
    const target = maxLength
    const ratio = (length - target) / length
    const moveX = (to[0] - from[0]) * ratio * 0.5
    const moveY = (to[1] - from[1]) * ratio * 0.5
    from[0] += moveX
    from[1] += moveY
    to[0] -= moveX
    to[1] -= moveY
  }
}

function buildNodeDegrees(nodeCount, edgeRecords) {
  const degrees = new Array(nodeCount).fill(0)
  for (const edge of edgeRecords) {
    degrees[edge.fromIndex] += 1
    degrees[edge.toIndex] += 1
  }
  return degrees
}

function buildLineChains(lines, edgeById) {
  const chains = []

  for (const line of lines || []) {
    const lineEdgeIds = [...new Set((line.edgeIds || []).filter((edgeId) => edgeById.has(edgeId)))]
    if (!lineEdgeIds.length) continue

    const adjacency = new Map()
    for (const edgeId of lineEdgeIds) {
      const edge = edgeById.get(edgeId)
      if (!edge) continue
      addLineAdjacency(adjacency, edge.fromIndex, edge.toIndex, edgeId)
      addLineAdjacency(adjacency, edge.toIndex, edge.fromIndex, edgeId)
    }

    const visited = new Set()

    for (const edgeId of lineEdgeIds) {
      if (visited.has(edgeId)) continue
      const edge = edgeById.get(edgeId)
      if (!edge) continue

      const degreeA = adjacency.get(edge.fromIndex)?.length || 0
      const degreeB = adjacency.get(edge.toIndex)?.length || 0
      const startNode = degreeA !== 2 ? edge.fromIndex : degreeB !== 2 ? edge.toIndex : edge.fromIndex
      const chain = walkLineChain(startNode, edgeId, adjacency, edgeById, visited)
      if (!chain.edgePath.length || chain.nodePath.length !== chain.edgePath.length + 1) continue

      chains.push({
        lineId: line.id,
        ...chain,
      })
    }
  }

  return chains
}

function addLineAdjacency(adjacency, nodeIndex, neighborIndex, edgeId) {
  if (!adjacency.has(nodeIndex)) adjacency.set(nodeIndex, [])
  adjacency.get(nodeIndex).push({ neighborIndex, edgeId })
}

function walkLineChain(startNode, firstEdgeId, adjacency, edgeById, visited) {
  const nodePath = [startNode]
  const edgePath = []

  let currentNode = startNode
  let previousNode = -1
  let edgeId = firstEdgeId
  let isCycle = false

  while (edgeId != null) {
    if (visited.has(edgeId)) break
    visited.add(edgeId)
    const edge = edgeById.get(edgeId)
    if (!edge) break

    const nextNode = edge.fromIndex === currentNode ? edge.toIndex : edge.fromIndex
    edgePath.push(edgeId)
    nodePath.push(nextNode)

    previousNode = currentNode
    currentNode = nextNode

    if (currentNode === startNode) {
      isCycle = true
      break
    }

    const options = (adjacency.get(currentNode) || []).filter(
      (item) => !visited.has(item.edgeId) && item.neighborIndex !== previousNode,
    )

    edgeId = options.length === 1 ? options[0].edgeId : null
  }

  return { nodePath, edgePath, isCycle }
}

function applyLineDirectionPlanning(positions, edgeById, lineChains, stations, nodeDegrees, config) {
  const passes = Math.max(0, Math.floor(config.lineDirectionPasses || 0))
  if (!passes || !lineChains.length) return

  for (let pass = 0; pass < passes; pass += 1) {
    const targets = positions.map(() => [0, 0, 0])

    for (const chain of lineChains) {
      if (chain.edgePath.length < 2) continue
      const plan = planLineChainTargetPositions(chain, positions, edgeById, config)
      if (!plan) continue

      for (let i = 0; i < chain.nodePath.length; i += 1) {
        const nodeIndex = chain.nodePath[i]
        if (chain.isCycle && i === chain.nodePath.length - 1 && nodeIndex === chain.nodePath[0]) continue

        const station = stations[nodeIndex]
        const degree = Math.max(nodeDegrees[nodeIndex] || 1, 1)
        const degreeFactor = degree >= 4 ? 0.55 : degree === 3 ? 0.7 : degree === 2 ? 0.9 : 1
        const interchangeFactor = station?.isInterchange ? 0.62 : 1
        const weight = degreeFactor * interchangeFactor

        targets[nodeIndex][0] += plan.nodeTargets[i][0] * weight
        targets[nodeIndex][1] += plan.nodeTargets[i][1] * weight
        targets[nodeIndex][2] += weight
      }
    }

    for (let i = 0; i < positions.length; i += 1) {
      const weight = targets[i][2]
      if (!weight) continue

      const targetX = targets[i][0] / weight
      const targetY = targets[i][1] / weight
      const station = stations[i]
      const degree = Math.max(nodeDegrees[i] || 1, 1)
      const degreeFactor = degree >= 4 ? 0.58 : degree === 3 ? 0.72 : degree === 2 ? 0.9 : 1
      const interchangeFactor = station?.isInterchange ? 0.74 : 1
      const blend = clamp(config.lineDirectionBlend * degreeFactor * interchangeFactor, 0, 1)

      positions[i][0] = lerp(positions[i][0], targetX, blend)
      positions[i][1] = lerp(positions[i][1], targetY, blend)
    }
  }
}

function planLineChainTargetPositions(chain, positions, edgeById, config) {
  const edgeCount = chain.edgePath.length
  if (edgeCount < 2) return null

  const rawAngles = []
  const edgeLengths = []

  for (let i = 0; i < edgeCount; i += 1) {
    const from = positions[chain.nodePath[i]]
    const to = positions[chain.nodePath[i + 1]]
    const dx = to[0] - from[0]
    const dy = to[1] - from[1]
    rawAngles.push(Math.atan2(dy, dx))
    edgeLengths.push(Math.max(distance(from, to), 0.00001))
  }

  const mainDirection = estimateChainMainDirection(chain, positions, rawAngles, edgeLengths)
  let directionSequence = solveDirectionSequence(rawAngles, mainDirection, config)
  directionSequence = smoothShortDirectionRuns(directionSequence, rawAngles, mainDirection, config)

  const nodeTargets = [positions[chain.nodePath[0]].slice(0, 2)]

  for (let i = 0; i < edgeCount; i += 1) {
    const previous = nodeTargets[i]
    const angle = directionIndexToAngle(directionSequence[i])
    const length = edgeLengths[i]
    nodeTargets.push([
      previous[0] + Math.cos(angle) * length,
      previous[1] + Math.sin(angle) * length,
    ])
  }

  const lastIndex = nodeTargets.length - 1
  if (!chain.isCycle && lastIndex > 0) {
    const endIndex = chain.nodePath[lastIndex]
    const currentEnd = positions[endIndex]
    const deltaX = currentEnd[0] - nodeTargets[lastIndex][0]
    const deltaY = currentEnd[1] - nodeTargets[lastIndex][1]
    for (let i = 0; i <= lastIndex; i += 1) {
      const t = i / lastIndex
      nodeTargets[i][0] += deltaX * t
      nodeTargets[i][1] += deltaY * t
    }
  } else if (chain.isCycle && lastIndex > 0) {
    const closureX = nodeTargets[lastIndex][0] - nodeTargets[0][0]
    const closureY = nodeTargets[lastIndex][1] - nodeTargets[0][1]
    for (let i = 0; i <= lastIndex; i += 1) {
      const t = i / lastIndex
      nodeTargets[i][0] -= closureX * t
      nodeTargets[i][1] -= closureY * t
    }
  }

  return { nodeTargets, directionSequence }
}

function estimateChainMainDirection(chain, positions, rawAngles, edgeLengths) {
  const firstNode = positions[chain.nodePath[0]]
  const lastNode = positions[chain.nodePath[chain.nodePath.length - 1]]
  const endDx = lastNode[0] - firstNode[0]
  const endDy = lastNode[1] - firstNode[1]

  if (!chain.isCycle && Math.hypot(endDx, endDy) > 0.00001) {
    return angleToDirectionIndex(Math.atan2(endDy, endDx))
  }

  let vx = 0
  let vy = 0
  for (let i = 0; i < rawAngles.length; i += 1) {
    const weight = edgeLengths[i]
    vx += Math.cos(rawAngles[i]) * weight
    vy += Math.sin(rawAngles[i]) * weight
  }
  if (Math.hypot(vx, vy) <= 0.00001) {
    return angleToDirectionIndex(rawAngles[0] || 0)
  }

  return angleToDirectionIndex(Math.atan2(vy, vx))
}

function solveDirectionSequence(rawAngles, mainDirection, config) {
  const edgeCount = rawAngles.length
  if (!edgeCount) return []

  const dp = Array.from({ length: edgeCount }, () => new Array(8).fill(Number.POSITIVE_INFINITY))
  const previousDirection = Array.from({ length: edgeCount }, () => new Array(8).fill(-1))

  for (let direction = 0; direction < 8; direction += 1) {
    dp[0][direction] = directionUnaryCost(rawAngles[0], direction, mainDirection, config)
  }

  for (let edgeIndex = 1; edgeIndex < edgeCount; edgeIndex += 1) {
    for (let direction = 0; direction < 8; direction += 1) {
      const unaryCost = directionUnaryCost(rawAngles[edgeIndex], direction, mainDirection, config)
      for (let prevDirection = 0; prevDirection < 8; prevDirection += 1) {
        const candidate =
          dp[edgeIndex - 1][prevDirection] +
          unaryCost +
          directionTurnCost(prevDirection, direction, config)
        if (candidate < dp[edgeIndex][direction]) {
          dp[edgeIndex][direction] = candidate
          previousDirection[edgeIndex][direction] = prevDirection
        }
      }
    }
  }

  let bestDirection = 0
  let bestCost = Number.POSITIVE_INFINITY
  for (let direction = 0; direction < 8; direction += 1) {
    if (dp[edgeCount - 1][direction] < bestCost) {
      bestCost = dp[edgeCount - 1][direction]
      bestDirection = direction
    }
  }

  const sequence = new Array(edgeCount).fill(0)
  sequence[edgeCount - 1] = bestDirection

  for (let edgeIndex = edgeCount - 1; edgeIndex > 0; edgeIndex -= 1) {
    sequence[edgeIndex - 1] = previousDirection[edgeIndex][sequence[edgeIndex]]
  }

  return sequence
}

function smoothShortDirectionRuns(sequence, rawAngles, mainDirection, config) {
  const minRunEdges = Math.max(1, Math.floor(config.lineMinRunEdges || 1))
  if (sequence.length < 3 || minRunEdges <= 1) return sequence

  const result = [...sequence]

  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false
    let runStart = 0

    while (runStart < result.length) {
      let runEnd = runStart + 1
      while (runEnd < result.length && result[runEnd] === result[runStart]) {
        runEnd += 1
      }

      const runLength = runEnd - runStart
      if (runLength < minRunEdges) {
        const candidates = []
        if (runStart > 0) candidates.push(result[runStart - 1])
        if (runEnd < result.length) candidates.push(result[runEnd])
        candidates.push(mainDirection)

        let bestDirection = result[runStart]
        let bestCost = Number.POSITIVE_INFINITY

        for (const direction of new Set(candidates)) {
          let candidateCost = 0
          for (let i = runStart; i < runEnd; i += 1) {
            candidateCost += directionUnaryCost(rawAngles[i], direction, mainDirection, config)
          }
          if (runStart > 0) {
            candidateCost += directionTurnCost(result[runStart - 1], direction, config)
          }
          if (runEnd < result.length) {
            candidateCost += directionTurnCost(direction, result[runEnd], config)
          }
          if (direction !== result[runStart]) {
            candidateCost -= config.lineShortRunPenalty
          }

          if (candidateCost < bestCost) {
            bestCost = candidateCost
            bestDirection = direction
          }
        }

        if (bestDirection !== result[runStart]) {
          for (let i = runStart; i < runEnd; i += 1) {
            result[i] = bestDirection
          }
          changed = true
        }
      }

      runStart = runEnd
    }

    if (!changed) break
  }

  return result
}

function directionUnaryCost(observedAngle, direction, mainDirection, config) {
  const targetAngle = directionIndexToAngle(direction)
  const angleDeviation = Math.abs(normalizeAngle(observedAngle - targetAngle))
  const mainDistance = circularDirectionDistance(direction, mainDirection)
  return angleDeviation * config.lineDataAngleWeight + mainDistance * config.lineMainDirectionWeight
}

function directionTurnCost(previousDirection, nextDirection, config) {
  if (previousDirection === nextDirection) return 0
  const steps = circularDirectionDistance(previousDirection, nextDirection)
  let cost = config.lineTurnPenalty + steps * config.lineTurnStepPenalty
  if (steps >= 4) {
    cost += config.lineUTurnPenalty
  } else if (steps === 3) {
    cost += config.lineUTurnPenalty * 0.45
  }
  return cost
}

function circularDirectionDistance(a, b) {
  const direct = Math.abs(a - b)
  return Math.min(direct, 8 - direct)
}

function angleToDirectionIndex(angle) {
  const value = normalizeAngle(angle)
  const step = Math.PI / 4
  let index = Math.round(value / step)
  index %= 8
  if (index < 0) index += 8
  return index
}

function directionIndexToAngle(index) {
  return ((index % 8) + 8) % 8 * (Math.PI / 4)
}

function enforceOctilinearHardConstraints(positions, edgeRecords, stations, config) {
  if (!edgeRecords.length) return

  const degree = new Array(positions.length).fill(0)
  for (const edge of edgeRecords) {
    degree[edge.fromIndex] += 1
    degree[edge.toIndex] += 1
  }

  const relaxIterations = Math.max(0, Math.floor(config.octilinearRelaxIterations || 0))
  for (let iteration = 0; iteration < relaxIterations; iteration += 1) {
    const targets = positions.map(() => [0, 0, 0])

    for (const edge of edgeRecords) {
      const from = positions[edge.fromIndex]
      const to = positions[edge.toIndex]
      const dx = to[0] - from[0]
      const dy = to[1] - from[1]
      const length = Math.max(distance(from, to), 0.00001)
      const snapped = snapAngle(Math.atan2(dy, dx))

      const targetDx = Math.cos(snapped) * length
      const targetDy = Math.sin(snapped) * length
      const midX = (from[0] + to[0]) * 0.5
      const midY = (from[1] + to[1]) * 0.5
      const fromTarget = [midX - targetDx * 0.5, midY - targetDy * 0.5]
      const toTarget = [midX + targetDx * 0.5, midY + targetDy * 0.5]

      const fromWeight = 1 / Math.max(degree[edge.fromIndex], 1)
      const toWeight = 1 / Math.max(degree[edge.toIndex], 1)

      targets[edge.fromIndex][0] += fromTarget[0] * fromWeight
      targets[edge.fromIndex][1] += fromTarget[1] * fromWeight
      targets[edge.fromIndex][2] += fromWeight

      targets[edge.toIndex][0] += toTarget[0] * toWeight
      targets[edge.toIndex][1] += toTarget[1] * toWeight
      targets[edge.toIndex][2] += toWeight
    }

    for (let i = 0; i < positions.length; i += 1) {
      const weight = targets[i][2]
      if (!weight) continue
      const station = stations[i]
      const targetX = targets[i][0] / weight
      const targetY = targets[i][1] / weight
      const degreePenalty = degree[i] >= 4 ? 0.62 : degree[i] === 3 ? 0.74 : degree[i] === 2 ? 0.92 : 1
      const interchangePenalty = station?.isInterchange ? 0.7 : 1
      const blend = clamp(config.octilinearBlend * degreePenalty * interchangePenalty, 0, 1)
      positions[i][0] = lerp(positions[i][0], targetX, blend)
      positions[i][1] = lerp(positions[i][1], targetY, blend)
    }

    if ((iteration + 1) % 8 === 0) {
      snapEdgesToEightDirections(positions, edgeRecords, 0.2)
    }
  }

  const exactPasses = Math.max(1, Math.floor(config.octilinearExactPasses || 1))
  for (let pass = 0; pass < exactPasses; pass += 1) {
    for (const edge of edgeRecords) {
      const from = positions[edge.fromIndex]
      const to = positions[edge.toIndex]
      const dx = to[0] - from[0]
      const dy = to[1] - from[1]
      const length = Math.max(distance(from, to), 0.00001)
      const snapped = snapAngle(Math.atan2(dy, dx))
      const targetDx = Math.cos(snapped) * length
      const targetDy = Math.sin(snapped) * length
      const errX = targetDx - dx
      const errY = targetDy - dy

      const fromDegree = Math.max(degree[edge.fromIndex], 1)
      const toDegree = Math.max(degree[edge.toIndex], 1)
      let fromMove = toDegree / (fromDegree + toDegree)
      let toMove = fromDegree / (fromDegree + toDegree)
      if (fromDegree === 1 && toDegree > 1) {
        fromMove = 1
        toMove = 0
      } else if (toDegree === 1 && fromDegree > 1) {
        fromMove = 0
        toMove = 1
      }

      from[0] -= errX * fromMove
      from[1] -= errY * fromMove
      to[0] += errX * toMove
      to[1] += errY * toMove
    }
  }
}

function addNeighbor(adjacency, from, to) {
  if (!adjacency.has(from)) adjacency.set(from, new Set())
  adjacency.get(from).add(to)
}

function projectPointToLine(pointXY, lineA, lineB) {
  const ax = lineA[0]
  const ay = lineA[1]
  const bx = lineB[0]
  const by = lineB[1]
  const px = pointXY[0]
  const py = pointXY[1]

  const abx = bx - ax
  const aby = by - ay
  const length2 = abx * abx + aby * aby
  if (length2 < 1e-9) return [px, py]

  const t = ((px - ax) * abx + (py - ay) * aby) / length2
  return [ax + t * abx, ay + t * aby]
}

function computeScoreBreakdown(positions, original, edgeRecords, lineChains, stations, config) {
  const breakdown = {
    angle: 0,
    length: 0,
    overlap: 0,
    crossing: 0,
    bend: 0,
    shortRun: 0,
    geoDeviation: 0,
    labelOverlap: 0,
  }

  for (const edge of edgeRecords) {
    const a = positions[edge.fromIndex]
    const b = positions[edge.toIndex]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const angle = Math.atan2(dy, dx)
    const snapped = snapAngle(angle)
    const angleDiff = Math.abs(normalizeAngle(angle - snapped))
    breakdown.angle += (angleDiff * 180) / Math.PI

    const length = distance(a, b)
    breakdown.length += Math.abs(length - edge.desiredLength) * 0.18
  }

  const minRunEdges = Math.max(1, Math.floor(config.lineMinRunEdges || 1))
  const shortRunLengthThreshold = config.minEdgeLength * 1.35

  for (const chain of lineChains || []) {
    if (chain.edgePath.length < 2) continue

    let currentDirection = null
    let runEdges = 0
    let runLength = 0

    for (let i = 0; i < chain.edgePath.length; i += 1) {
      const from = positions[chain.nodePath[i]]
      const to = positions[chain.nodePath[i + 1]]
      const edgeLength = distance(from, to)
      const direction = angleToDirectionIndex(Math.atan2(to[1] - from[1], to[0] - from[0]))

      if (currentDirection == null) {
        currentDirection = direction
        runEdges = 1
        runLength = edgeLength
        continue
      }

      if (direction === currentDirection) {
        runEdges += 1
        runLength += edgeLength
        continue
      }

      const turnSteps = circularDirectionDistance(currentDirection, direction)
      breakdown.bend += turnSteps * config.lineBendScoreWeight
      if (runEdges < minRunEdges || runLength < shortRunLengthThreshold) {
        const edgePenalty = Math.max(0, minRunEdges - runEdges) * config.lineShortRunScoreWeight
        const lengthPenalty = runLength < shortRunLengthThreshold ? config.lineShortRunScoreWeight : 0
        breakdown.shortRun += edgePenalty + lengthPenalty
      }

      currentDirection = direction
      runEdges = 1
      runLength = edgeLength
    }
  }

  const stationGrid = new Map()
  const cellSize = config.minStationDistance

  for (let i = 0; i < positions.length; i += 1) {
    const [x, y] = positions[i]
    const key = `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`
    if (!stationGrid.has(key)) stationGrid.set(key, [])
    stationGrid.get(key).push(i)
  }

  const neighborOffsets = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 0],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ]

  for (let i = 0; i < positions.length; i += 1) {
    const [x, y] = positions[i]
    const cx = Math.floor(x / cellSize)
    const cy = Math.floor(y / cellSize)
    for (const [ox, oy] of neighborOffsets) {
      const bucket = stationGrid.get(`${cx + ox}:${cy + oy}`)
      if (!bucket) continue
      for (const j of bucket) {
        if (i >= j) continue
        const d = distance(positions[i], positions[j])
        if (d < config.minStationDistance) {
          breakdown.overlap += (config.minStationDistance - d) * 2.9
        }
      }
    }
  }

  for (let i = 0; i < edgeRecords.length; i += 1) {
    const e1 = edgeRecords[i]
    const a1 = positions[e1.fromIndex]
    const a2 = positions[e1.toIndex]
    const aBox = segmentBox(a1, a2)

    for (let j = i + 1; j < edgeRecords.length; j += 1) {
      const e2 = edgeRecords[j]
      if (
        e1.fromIndex === e2.fromIndex ||
        e1.fromIndex === e2.toIndex ||
        e1.toIndex === e2.fromIndex ||
        e1.toIndex === e2.toIndex
      ) {
        continue
      }
      const b1 = positions[e2.fromIndex]
      const b2 = positions[e2.toIndex]
      const bBox = segmentBox(b1, b2)
      if (!boxesOverlap(aBox, bBox)) continue
      if (segmentsIntersect(a1, a2, b1, b2)) {
        breakdown.crossing += 70
      }
    }
  }

  for (let i = 0; i < positions.length; i += 1) {
    breakdown.geoDeviation += distance(positions[i], original[i]) * config.geoWeight * 0.11
  }

  const labelBoxes = stations.map((station, index) => {
    const nameZh = station.nameZh || ''
    const nameEn = station.nameEn || ''
    const width = Math.max(nameZh.length * 6.3, nameEn.length * 4.8) + 12
    const height = nameEn ? 24 : 15
    const [x, y] = positions[index]
    return {
      left: x + 7,
      right: x + 7 + width,
      top: y - height / 2 - config.labelPadding,
      bottom: y + height / 2 + config.labelPadding,
    }
  })

  for (let i = 0; i < labelBoxes.length; i += 1) {
    for (let j = i + 1; j < labelBoxes.length; j += 1) {
      if (boxesOverlap(labelBoxes[i], labelBoxes[j])) {
        const overlapX =
          Math.min(labelBoxes[i].right, labelBoxes[j].right) -
          Math.max(labelBoxes[i].left, labelBoxes[j].left)
        const overlapY =
          Math.min(labelBoxes[i].bottom, labelBoxes[j].bottom) -
          Math.max(labelBoxes[i].top, labelBoxes[j].top)
        breakdown.labelOverlap += Math.max(0, overlapX) * Math.max(0, overlapY) * 0.045
      }
    }
  }

  return breakdown
}

function snapAngle(angle) {
  const step = Math.PI / 4
  return Math.round(angle / step) * step
}

function normalizeAngle(angle) {
  let value = angle
  while (value > Math.PI) value -= 2 * Math.PI
  while (value < -Math.PI) value += 2 * Math.PI
  return value
}

function distance(a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  return Math.sqrt(dx * dx + dy * dy)
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function lerp(start, end, alpha) {
  return start + (end - start) * alpha
}

function segmentBox(a, b) {
  return {
    left: Math.min(a[0], b[0]),
    right: Math.max(a[0], b[0]),
    top: Math.min(a[1], b[1]),
    bottom: Math.max(a[1], b[1]),
  }
}

function boxesOverlap(a, b) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)

  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && onSegment(a, c, b)) return true
  if (o2 === 0 && onSegment(a, d, b)) return true
  if (o3 === 0 && onSegment(c, a, d)) return true
  if (o4 === 0 && onSegment(c, b, d)) return true
  return false
}

function orientation(p, q, r) {
  const value = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1])
  if (Math.abs(value) < 1e-9) return 0
  return value > 0 ? 1 : 2
}

function onSegment(p, q, r) {
  return (
    q[0] <= Math.max(p[0], r[0]) &&
    q[0] >= Math.min(p[0], r[0]) &&
    q[1] <= Math.max(p[1], r[1]) &&
    q[1] >= Math.min(p[1], r[1])
  )
}
