/**
 * BFS-based shortest edge path finder between two stations.
 * Tries same-line-only first; falls back to unrestricted BFS.
 */

function bfsOnLine(adj, fromId, toId, lineId) {
  const visited = new Set([fromId])
  const queue = [{ stationId: fromId, edgePath: [] }]
  let head = 0
  while (head < queue.length) {
    const cur = queue[head++]
    for (const link of adj.get(cur.stationId) || []) {
      if (visited.has(link.neighbor)) continue
      if (!link.lineIds.includes(lineId)) continue
      const newPath = [...cur.edgePath, link.edgeId]
      if (link.neighbor === toId) return newPath
      visited.add(link.neighbor)
      queue.push({ stationId: link.neighbor, edgePath: newPath })
    }
  }
  return []
}

function bfsUnrestricted(adj, fromId, toId) {
  const visited = new Set([fromId])
  const queue = [{ stationId: fromId, edgePath: [] }]
  let head = 0
  while (head < queue.length) {
    const cur = queue[head++]
    for (const link of adj.get(cur.stationId) || []) {
      if (visited.has(link.neighbor)) continue
      const newPath = [...cur.edgePath, link.edgeId]
      if (link.neighbor === toId) return newPath
      visited.add(link.neighbor)
      queue.push({ stationId: link.neighbor, edgePath: newPath })
    }
  }
  return []
}

/**
 * Find the shortest edge path between two stations.
 * Tries same-line-only first; falls back to unrestricted BFS.
 *
 * @param {Array} edges - The project edges array
 * @param {string} fromStationId
 * @param {string} toStationId
 * @returns {string[]} Array of edge IDs forming the path
 */
export function findEdgePathBetweenStations(edges, fromStationId, toStationId) {
  if (!edges?.length) return []

  const adj = new Map()
  for (const edge of edges) {
    const a = edge.fromStationId
    const b = edge.toStationId
    if (!a || !b) continue
    if (!adj.has(a)) adj.set(a, [])
    if (!adj.has(b)) adj.set(b, [])
    adj.get(a).push({ neighbor: b, edgeId: edge.id, lineIds: edge.sharedByLineIds || [] })
    adj.get(b).push({ neighbor: a, edgeId: edge.id, lineIds: edge.sharedByLineIds || [] })
  }

  if (!adj.has(fromStationId) || !adj.has(toStationId)) return []

  // Find shared lines between the two stations' connected edges
  const fromLineIds = new Set(adj.get(fromStationId).flatMap((l) => l.lineIds))
  const toLineIds = new Set(adj.get(toStationId).flatMap((l) => l.lineIds))
  const sharedLineIds = [...fromLineIds].filter((lid) => toLineIds.has(lid))

  // Try line-restricted BFS for each shared line
  for (const lineId of sharedLineIds) {
    const result = bfsOnLine(adj, fromStationId, toStationId, lineId)
    if (result.length) return result
  }

  // Fallback: unrestricted BFS
  return bfsUnrestricted(adj, fromStationId, toStationId)
}
