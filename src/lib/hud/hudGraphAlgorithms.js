/**
 * Graph algorithms for HUD route computation.
 * Dijkstra shortest path, farthest pair, connected components, cycle tracing.
 */

import { MinHeap } from './MinHeap'

export function ensureNode(adjacency, stationId) {
  if (!adjacency.has(stationId)) adjacency.set(stationId, [])
}

export function findLargestConnectedComponent(adjacency) {
  const visited = new Set()
  let best = []
  for (const stationId of adjacency.keys()) {
    if (visited.has(stationId)) continue
    const queue = [stationId]
    let head = 0
    visited.add(stationId)
    const component = []
    while (head < queue.length) {
      const current = queue[head]
      head += 1
      component.push(current)
      for (const neighbor of adjacency.get(current) || []) {
        if (visited.has(neighbor.to)) continue
        visited.add(neighbor.to)
        queue.push(neighbor.to)
      }
    }
    if (component.length > best.length) {
      best = component
    }
  }
  return best
}

export function traceCycle(adjacency, stationById) {
  const nodes = [...adjacency.keys()]
  if (!nodes.length) return []
  const sorted = [...nodes].sort((a, b) => {
    const nameA = stationById.get(a)?.nameZh || a
    const nameB = stationById.get(b)?.nameZh || b
    return nameA.localeCompare(nameB, 'zh-Hans-CN')
  })
  const start = sorted[0]
  const neighbors = adjacency.get(start) || []
  if (neighbors.length !== 2) return []
  const order = [start]
  const visited = new Set([start])
  let previous = start
  let current = neighbors[0].to

  while (current !== start) {
    if (visited.has(current)) return []
    visited.add(current)
    order.push(current)
    const options = adjacency.get(current) || []
    const next = options.find((entry) => entry.to !== previous)
    if (!next) return []
    previous = current
    current = next.to
  }

  return order
}

export function findFarthestPair(adjacency, candidates) {
  let best = null
  let maxDistance = Number.NEGATIVE_INFINITY

  for (const start of candidates) {
    const { dist } = dijkstra(adjacency, start)
    for (const end of candidates) {
      if (end === start) continue
      const distance = dist.get(end)
      if (!Number.isFinite(distance)) continue
      if (distance > maxDistance) {
        maxDistance = distance
        best = { from: start, to: end, distance }
      }
    }
  }

  return best
}

export function buildShortestPath(adjacency, from, to) {
  const { prev } = dijkstra(adjacency, from)
  const path = []
  let cursor = to
  const seen = new Set()
  while (cursor) {
    if (seen.has(cursor)) break
    seen.add(cursor)
    path.push(cursor)
    if (cursor === from) break
    cursor = prev.get(cursor)
  }
  path.reverse()
  if (!path.length || path[0] !== from) return []
  return path
}

export function dijkstra(adjacency, start) {
  const dist = new Map()
  const prev = new Map()
  const heap = new MinHeap()

  for (const stationId of adjacency.keys()) {
    dist.set(stationId, Number.POSITIVE_INFINITY)
  }
  dist.set(start, 0)
  heap.push({ stationId: start, dist: 0 })

  while (true) {
    const current = heap.pop()
    if (!current) break
    const known = dist.get(current.stationId)
    if (current.dist > known) continue
    for (const edge of adjacency.get(current.stationId) || []) {
      const nextDist = current.dist + edge.weight
      if (nextDist >= (dist.get(edge.to) ?? Number.POSITIVE_INFINITY)) continue
      dist.set(edge.to, nextDist)
      prev.set(edge.to, current.stationId)
      heap.push({ stationId: edge.to, dist: nextDist })
    }
  }

  return { dist, prev }
}
