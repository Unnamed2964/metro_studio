import bbox from '@turf/bbox'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { multiPolygon, point, polygon } from '@turf/helpers'
import jinanBoundaryGeoJson from '../../data/jinan-boundary.json'
import { normalizeHexColor, pickLineColor } from '../colors'
import { haversineDistanceMeters, projectLngLat } from '../geo'
import { createId } from '../ids'
import { JINAN_RELATION_ID } from '../projectModel'
import { postOverpassQuery } from './overpassClient'

const AREA_ID = 3600000000 + JINAN_RELATION_ID

const OPEN_ROUTE_QUERY = `
[out:json][timeout:120];
area(${AREA_ID})->.a;
relation(area.a)["type"="route"]["route"~"subway|light_rail"];
out body;
>;
out body qt;
`.trim()

const CONSTRUCTION_ROUTE_QUERY = `
[out:json][timeout:120];
area(${AREA_ID})->.a;
(
  relation(area.a)["type"="route"]["route"="construction"];
  relation(area.a)["type"="route"]["construction"~"subway|light_rail"];
  relation(area.a)["type"="route"]["state"="construction"];
);
out body;
>;
out body qt;
`.trim()

const PROPOSED_ROUTE_QUERY = `
[out:json][timeout:120];
area(${AREA_ID})->.a;
(
  relation(area.a)["type"="route"]["state"="proposed"];
  relation(area.a)["type"="route"]["proposed"~"subway|light_rail"];
);
out body;
>;
out body qt;
`.trim()

const boundaryFeature =
  jinanBoundaryGeoJson.type === 'Polygon'
    ? polygon(jinanBoundaryGeoJson.coordinates)
    : multiPolygon(jinanBoundaryGeoJson.coordinates)

const boundaryBbox = bbox(boundaryFeature)

const STOP_ROLE_REGEX = /(stop|platform|station)/i
const STATUS_WEIGHT = {
  proposed: 1,
  construction: 2,
  open: 3,
}

const SAME_LINE_MERGE_DISTANCE_METERS = 520
const CROSS_LINE_MERGE_DISTANCE_METERS = 320
const VERY_CLOSE_FORCE_MERGE_METERS = 28

function mergeElements(payloads) {
  const elementMap = new Map()
  for (const payload of payloads) {
    for (const element of payload.elements) {
      elementMap.set(`${element.type}/${element.id}`, element)
    }
  }
  return [...elementMap.values()]
}

function indexElements(elements) {
  const nodes = new Map()
  const ways = new Map()
  const relations = []

  for (const element of elements) {
    if (element.type === 'node') {
      nodes.set(element.id, element)
    } else if (element.type === 'way') {
      ways.set(element.id, element)
    } else if (element.type === 'relation') {
      relations.push(element)
    }
  }

  return { nodes, ways, relations }
}

function classifyRelationStatus(tags = {}) {
  const route = tags.route || ''
  const state = tags.state || ''
  const proposed = tags.proposed || ''
  const construction = tags.construction || ''

  if (state === 'proposed' || proposed.includes('subway') || proposed.includes('light_rail')) {
    return 'proposed'
  }
  if (
    route === 'construction' ||
    state === 'construction' ||
    construction.includes('subway') ||
    construction.includes('light_rail')
  ) {
    return 'construction'
  }
  return 'open'
}

function shouldIncludeStatus(status, includeConstruction, includeProposed) {
  if (status === 'open') return true
  if (status === 'construction') return includeConstruction
  if (status === 'proposed') return includeProposed
  return false
}

function toLineKey(relation) {
  const tags = relation.tags || {}
  return String(tags.ref || tags['name:zh'] || tags.name || relation.id)
}

function readStationName(node) {
  const tags = node.tags || {}
  const nameZh = tags['name:zh'] || tags.name || tags['official_name:zh'] || `站点 ${node.id}`
  const nameEn = tags['name:en'] || tags.int_name || tags['name:latin'] || nameZh
  return { nameZh, nameEn }
}

function stripLoopTerminusSuffix(name, isZh = true) {
  const raw = String(name || '').trim()
  if (!raw) return raw
  const loopHint = isZh ? /环/u : /(loop|circle)/i
  if (!loopHint.test(raw)) return raw
  if (isZh) {
    return raw
      .replace(/([0-9A-Za-z\u4e00-\u9fa5]+环线)\s*[-—–~～]\s*.+$/u, '$1')
      .replace(/([0-9A-Za-z\u4e00-\u9fa5]+环)\s*[-—–~～]\s*.+$/u, '$1')
      .trim()
  }
  return raw
    .replace(/((?:line|route)\s*\d*\s*(?:loop|circle))\s*[-—–~～]\s*.+$/i, '$1')
    .replace(/(.+\b(?:loop|circle)\b)\s*[-—–~～]\s*.+$/i, '$1')
    .trim()
}

function isLoopRelation(tags = {}) {
  const roundtrip = String(tags.roundtrip || '').toLowerCase()
  const circular = String(tags.circular || '').toLowerCase()
  const route = String(tags.route || '').toLowerCase()
  const nameZh = String(tags['name:zh'] || tags.name || '')
  const nameEn = String(tags['name:en'] || tags.int_name || '')

  if (roundtrip === 'yes' || circular === 'yes') return true
  if (route === 'loop') return true
  if (/环/u.test(nameZh)) return true
  if (/(loop|circle)/i.test(nameEn)) return true
  return false
}

function createLineFromRelation(relation, colorIndex, status) {
  const tags = relation.tags || {}
  const isLoop = isLoopRelation(tags)
  const nameZhRaw = tags['name:zh'] || tags.name || `线路 ${tags.ref || relation.id}`
  const nameEnRaw =
    tags['name:en'] || tags.int_name || tags['name:zh'] || tags.name || `Line ${tags.ref || relation.id}`
  return {
    id: createId('line'),
    key: toLineKey(relation),
    nameZh: isLoop ? stripLoopTerminusSuffix(nameZhRaw, true) : nameZhRaw,
    nameEn: isLoop ? stripLoopTerminusSuffix(nameEnRaw, false) : nameEnRaw,
    color: normalizeHexColor(tags.colour, pickLineColor(colorIndex)),
    status,
    style: 'solid',
    isLoop,
    edgeIds: [],
  }
}

function toNodeLngLat(node) {
  return [Number(node.lon), Number(node.lat)]
}

function isInsideJinan(lngLat) {
  return booleanPointInPolygon(point(lngLat), boundaryFeature)
}

function getOrderedStopNodeRefs(relation, ways, nodes) {
  const fromMembers = (relation.members || [])
    .filter((member) => member.type === 'node' && STOP_ROLE_REGEX.test(member.role || ''))
    .map((member) => member.ref)

  const uniqueRefs = new Set()
  const orderedRefs = []

  for (const ref of fromMembers) {
    if (!nodes.has(ref) || uniqueRefs.has(ref)) continue
    uniqueRefs.add(ref)
    orderedRefs.push(ref)
  }

  if (orderedRefs.length > 1) {
    return orderedRefs
  }

  for (const member of relation.members || []) {
    if (member.type !== 'way') continue
    const way = ways.get(member.ref)
    if (!way?.nodes) continue
    for (const nodeId of way.nodes) {
      const node = nodes.get(nodeId)
      const tags = node?.tags || {}
      const isStationNode =
        tags.railway === 'station' ||
        tags.station === 'subway' ||
        tags.public_transport === 'station' ||
        tags.public_transport === 'stop_position'
      if (!isStationNode) continue
      if (uniqueRefs.has(nodeId)) continue
      uniqueRefs.add(nodeId)
      orderedRefs.push(nodeId)
    }
  }

  return orderedRefs
}

function addAdjacency(adjacency, fromId, toId, weight) {
  if (!adjacency.has(fromId)) {
    adjacency.set(fromId, [])
  }
  adjacency.get(fromId).push({ to: toId, weight })
}

function buildRelationAdjacency(relation, ways, nodes) {
  const adjacency = new Map()
  for (const member of relation.members || []) {
    if (member.type !== 'way') continue
    const way = ways.get(member.ref)
    if (!way?.nodes || way.nodes.length < 2) continue
    for (let i = 0; i < way.nodes.length - 1; i += 1) {
      const fromNode = nodes.get(way.nodes[i])
      const toNode = nodes.get(way.nodes[i + 1])
      if (!fromNode || !toNode) continue
      const from = toNodeLngLat(fromNode)
      const to = toNodeLngLat(toNode)
      const weight = haversineDistanceMeters(from, to)
      addAdjacency(adjacency, way.nodes[i], way.nodes[i + 1], weight)
      addAdjacency(adjacency, way.nodes[i + 1], way.nodes[i], weight)
    }
  }
  return adjacency
}

class MinHeap {
  constructor() {
    this.values = []
  }

  push(item) {
    this.values.push(item)
    this.bubbleUp(this.values.length - 1)
  }

  pop() {
    if (!this.values.length) return null
    const top = this.values[0]
    const end = this.values.pop()
    if (this.values.length && end) {
      this.values[0] = end
      this.bubbleDown(0)
    }
    return top
  }

  get size() {
    return this.values.length
  }

  bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (this.values[parent].dist <= this.values[index].dist) break
      ;[this.values[parent], this.values[index]] = [this.values[index], this.values[parent]]
      index = parent
    }
  }

  bubbleDown(index) {
    const length = this.values.length
    while (true) {
      const left = index * 2 + 1
      const right = index * 2 + 2
      let smallest = index
      if (left < length && this.values[left].dist < this.values[smallest].dist) {
        smallest = left
      }
      if (right < length && this.values[right].dist < this.values[smallest].dist) {
        smallest = right
      }
      if (smallest === index) break
      ;[this.values[smallest], this.values[index]] = [this.values[index], this.values[smallest]]
      index = smallest
    }
  }
}

class UnionFind {
  constructor(ids) {
    this.parent = new Map(ids.map((id) => [id, id]))
    this.rank = new Map(ids.map((id) => [id, 0]))
  }

  find(id) {
    const parent = this.parent.get(id)
    if (parent === id) {
      return id
    }
    const root = this.find(parent)
    this.parent.set(id, root)
    return root
  }

  union(a, b) {
    const rootA = this.find(a)
    const rootB = this.find(b)
    if (rootA === rootB) return

    const rankA = this.rank.get(rootA) || 0
    const rankB = this.rank.get(rootB) || 0

    if (rankA < rankB) {
      this.parent.set(rootA, rootB)
      return
    }
    if (rankA > rankB) {
      this.parent.set(rootB, rootA)
      return
    }
    this.parent.set(rootB, rootA)
    this.rank.set(rootA, rankA + 1)
  }
}

function shortestPath(adjacency, start, goal) {
  if (start === goal) return [start]
  const heap = new MinHeap()
  const dist = new Map([[start, 0]])
  const prev = new Map()
  const visited = new Set()

  heap.push({ id: start, dist: 0 })

  while (heap.size) {
    const current = heap.pop()
    if (!current || visited.has(current.id)) continue
    if (current.id === goal) break
    visited.add(current.id)

    for (const edge of adjacency.get(current.id) || []) {
      const nextDist = current.dist + edge.weight
      if (nextDist < (dist.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        dist.set(edge.to, nextDist)
        prev.set(edge.to, current.id)
        heap.push({ id: edge.to, dist: nextDist })
      }
    }
  }

  if (!prev.has(goal)) {
    return [start, goal]
  }

  const path = [goal]
  let cursor = goal
  while (prev.has(cursor)) {
    cursor = prev.get(cursor)
    path.push(cursor)
    if (cursor === start) break
  }
  return path.reverse()
}

function mergeLineStatus(current, incoming) {
  if (!current) return incoming
  return STATUS_WEIGHT[current] >= STATUS_WEIGHT[incoming] ? current : incoming
}

function normalizeStationName(name) {
  if (!name || typeof name !== 'string') return ''
  return name
    .trim()
    .replace(/\s+/g, '')
    .replace(/[（(][^()（）]*[)）]/g, '')
    .replace(/站$/u, '')
    .toLowerCase()
}

function hasSharedLine(lineSetA, lineSetB) {
  if (!lineSetA || !lineSetB) return false
  for (const lineId of lineSetA) {
    if (lineSetB.has(lineId)) return true
  }
  return false
}

function sumPathLength(waypoints) {
  let length = 0
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    length += haversineDistanceMeters(waypoints[i], waypoints[i + 1])
  }
  return length
}

function assignCompactDisplayPositions(stations) {
  if (!stations.length) return

  const projected = stations.map((station) => projectLngLat(station.lngLat))
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const [x, y] of projected) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }

  const width = Math.max(maxX - minX, 1)
  const height = Math.max(maxY - minY, 1)
  const targetLongest = 1480
  const scale = targetLongest / Math.max(width, height)
  const yCompression = 0.88

  for (let i = 0; i < stations.length; i += 1) {
    const [x, y] = projected[i]
    stations[i].displayPos = [(x - minX) * scale, (maxY - y) * scale * yCompression]
  }
}

function mergeStationsAndTopology({ stations, edges, lines, lineStatusById }) {
  if (!stations.length) {
    return { stations, edges, lines }
  }

  const edgeById = new Map(edges.map((edge) => [edge.id, edge]))
  const stationById = new Map(stations.map((station) => [station.id, station]))
  const stationLineSet = new Map(stations.map((station) => [station.id, new Set()]))

  for (const line of lines) {
    for (const edgeId of line.edgeIds) {
      const edge = edgeById.get(edgeId)
      if (!edge) continue
      stationLineSet.get(edge.fromStationId)?.add(line.id)
      stationLineSet.get(edge.toStationId)?.add(line.id)
    }
  }

  const uf = new UnionFind(stations.map((station) => station.id))
  const stationGroupsByName = new Map()

  for (const station of stations) {
    const key = normalizeStationName(station.nameZh)
    if (!key) continue
    if (!stationGroupsByName.has(key)) {
      stationGroupsByName.set(key, [])
    }
    stationGroupsByName.get(key).push(station)
  }

  for (const group of stationGroupsByName.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const stationA = group[i]
        const stationB = group[j]
        const lineSetA = stationLineSet.get(stationA.id)
        const lineSetB = stationLineSet.get(stationB.id)
        const sameLine = hasSharedLine(lineSetA, lineSetB)
        const threshold = sameLine ? SAME_LINE_MERGE_DISTANCE_METERS : CROSS_LINE_MERGE_DISTANCE_METERS
        const dist = haversineDistanceMeters(stationA.lngLat, stationB.lngLat)
        if (dist <= threshold) {
          uf.union(stationA.id, stationB.id)
        }
      }
    }
  }

  for (let i = 0; i < stations.length; i += 1) {
    for (let j = i + 1; j < stations.length; j += 1) {
      const stationA = stations[i]
      const stationB = stations[j]
      const dist = haversineDistanceMeters(stationA.lngLat, stationB.lngLat)
      if (dist <= VERY_CLOSE_FORCE_MERGE_METERS) {
        uf.union(stationA.id, stationB.id)
      }
    }
  }

  const rootToStations = new Map()
  for (const station of stations) {
    const root = uf.find(station.id)
    if (!rootToStations.has(root)) {
      rootToStations.set(root, [])
    }
    rootToStations.get(root).push(station)
  }

  const oldStationIdToNewStationId = new Map()
  const mergedStations = []

  for (const groupedStations of rootToStations.values()) {
    let sumLng = 0
    let sumLat = 0
    const allLineIds = new Set()
    let baseStation = groupedStations[0]

    for (const station of groupedStations) {
      sumLng += station.lngLat[0]
      sumLat += station.lngLat[1]
      if (normalizeStationName(station.nameZh).length > normalizeStationName(baseStation.nameZh).length) {
        baseStation = station
      }
      for (const lineId of stationLineSet.get(station.id) || []) {
        allLineIds.add(lineId)
      }
    }

    const mergedStationId = baseStation.id
    for (const station of groupedStations) {
      oldStationIdToNewStationId.set(station.id, mergedStationId)
    }

    const lineIds = [...allLineIds]
    const station = {
      id: mergedStationId,
      nameZh: baseStation.nameZh,
      nameEn: baseStation.nameEn,
      lngLat: [sumLng / groupedStations.length, sumLat / groupedStations.length],
      displayPos: [0, 0],
      isInterchange: lineIds.length > 1,
      underConstruction: lineIds.some((lineId) => lineStatusById.get(lineId) === 'construction'),
      proposed: lineIds.some((lineId) => lineStatusById.get(lineId) === 'proposed'),
      lineIds,
    }

    mergedStations.push(station)
  }

  const mergedStationById = new Map(mergedStations.map((station) => [station.id, station]))
  const oldEdgeIdToNewEdgeId = new Map()
  const edgeByPair = new Map()

  for (const edge of edges) {
    const fromStationId = oldStationIdToNewStationId.get(edge.fromStationId)
    const toStationId = oldStationIdToNewStationId.get(edge.toStationId)
    if (!fromStationId || !toStationId || fromStationId === toStationId) continue

    const pairKey =
      fromStationId < toStationId ? `${fromStationId}__${toStationId}` : `${toStationId}__${fromStationId}`

    const fromStation = mergedStationById.get(fromStationId)
    const toStation = mergedStationById.get(toStationId)
    if (!fromStation || !toStation) continue

    const baseWaypoints =
      Array.isArray(edge.waypoints) && edge.waypoints.length >= 2 ? edge.waypoints.map((w) => [...w]) : []

    const waypoints = baseWaypoints.length ? baseWaypoints : [fromStation.lngLat, toStation.lngLat]
    waypoints[0] = [...fromStation.lngLat]
    waypoints[waypoints.length - 1] = [...toStation.lngLat]
    const lengthMeters = sumPathLength(waypoints)

    if (!edgeByPair.has(pairKey)) {
      const mergedEdge = {
        id: edge.id,
        fromStationId,
        toStationId,
        waypoints,
        sharedByLineIds: [...new Set(edge.sharedByLineIds || [])],
        lengthMeters,
      }
      edgeByPair.set(pairKey, mergedEdge)
      oldEdgeIdToNewEdgeId.set(edge.id, mergedEdge.id)
    } else {
      const mergedEdge = edgeByPair.get(pairKey)
      for (const lineId of edge.sharedByLineIds || []) {
        if (!mergedEdge.sharedByLineIds.includes(lineId)) {
          mergedEdge.sharedByLineIds.push(lineId)
        }
      }
      if (lengthMeters < mergedEdge.lengthMeters) {
        mergedEdge.waypoints = waypoints
        mergedEdge.lengthMeters = lengthMeters
      }
      oldEdgeIdToNewEdgeId.set(edge.id, mergedEdge.id)
    }
  }

  const mergedEdges = [...edgeByPair.values()]

  const mergedLines = lines
    .map((line) => {
      const edgeIds = [...new Set(line.edgeIds.map((edgeId) => oldEdgeIdToNewEdgeId.get(edgeId)).filter(Boolean))]
      return {
        ...line,
        edgeIds,
      }
    })
    .filter((line) => line.edgeIds.length > 0)

  const mergedStationLineSet = new Map(mergedStations.map((station) => [station.id, new Set()]))
  const mergedEdgeById = new Map(mergedEdges.map((edge) => [edge.id, edge]))
  for (const line of mergedLines) {
    for (const edgeId of line.edgeIds) {
      const edge = mergedEdgeById.get(edgeId)
      if (!edge) continue
      mergedStationLineSet.get(edge.fromStationId)?.add(line.id)
      mergedStationLineSet.get(edge.toStationId)?.add(line.id)
    }
  }

  for (const station of mergedStations) {
    const lineIds = [...(mergedStationLineSet.get(station.id) || [])]
    station.lineIds = lineIds
    station.isInterchange = lineIds.length > 1
    station.underConstruction = lineIds.some((lineId) => lineStatusById.get(lineId) === 'construction')
    station.proposed = lineIds.some((lineId) => lineStatusById.get(lineId) === 'proposed')
  }

  assignCompactDisplayPositions(mergedStations)

  return {
    stations: mergedStations,
    edges: mergedEdges,
    lines: mergedLines,
  }
}

/**
 * @param {{includeConstruction: boolean, includeProposed: boolean}} options
 * @param {AbortSignal} [signal]
 */
export async function importJinanMetroFromOsm(options, signal) {
  const includeConstruction = Boolean(options?.includeConstruction)
  const includeProposed = Boolean(options?.includeProposed)

  const queries = [OPEN_ROUTE_QUERY]
  if (includeConstruction) {
    queries.push(CONSTRUCTION_ROUTE_QUERY)
  }
  if (includeProposed) {
    queries.push(PROPOSED_ROUTE_QUERY)
  }

  const payloads = []
  for (const query of queries) {
    payloads.push(await postOverpassQuery(query, signal))
  }

  const elements = mergeElements(payloads)
  const { nodes, ways, relations } = indexElements(elements)

  const stationByNodeId = new Map()
  const nodeIdByStationId = new Map()
  const lineByKey = new Map()
  const edgeByPairKey = new Map()
  const lineStatusById = new Map()

  let lineColorIndex = 0

  for (const relation of relations) {
    const tags = relation.tags || {}
    if (tags.type !== 'route') continue

    const status = classifyRelationStatus(tags)
    if (!shouldIncludeStatus(status, includeConstruction, includeProposed)) {
      continue
    }

    const lineKey = toLineKey(relation)
    if (!lineByKey.has(lineKey)) {
      lineByKey.set(lineKey, createLineFromRelation(relation, lineColorIndex, status))
      lineColorIndex += 1
    } else {
      const existingLine = lineByKey.get(lineKey)
      existingLine.status = mergeLineStatus(existingLine.status, status)
    }

    const line = lineByKey.get(lineKey)
    lineStatusById.set(line.id, line.status)

    const relationAdjacency = buildRelationAdjacency(relation, ways, nodes)
    const stopNodeRefs = getOrderedStopNodeRefs(relation, ways, nodes)
      .map((ref) => Number(ref))
      .filter((ref) => nodes.has(ref))

    const stationSequence = []

    for (const nodeRef of stopNodeRefs) {
      const node = nodes.get(nodeRef)
      const lngLat = toNodeLngLat(node)
      if (!isInsideJinan(lngLat)) {
        continue
      }
      if (!stationByNodeId.has(nodeRef)) {
        const names = readStationName(node)
        const station = {
          id: createId('station'),
          osmNodeId: nodeRef,
          nameZh: names.nameZh,
          nameEn: names.nameEn,
          lngLat,
          displayPos: [0, 0],
          isInterchange: false,
          underConstruction: false,
          proposed: false,
          lineIds: [],
        }
        stationByNodeId.set(nodeRef, station)
        nodeIdByStationId.set(station.id, nodeRef)
      }

      const station = stationByNodeId.get(nodeRef)
      const lastStationId = stationSequence[stationSequence.length - 1]
      if (lastStationId !== station.id) {
        stationSequence.push(station.id)
      }
    }

    for (let i = 0; i < stationSequence.length - 1; i += 1) {
      const fromStationId = stationSequence[i]
      const toStationId = stationSequence[i + 1]
      if (fromStationId === toStationId) continue

      const fromNodeId = nodeIdByStationId.get(fromStationId)
      const toNodeId = nodeIdByStationId.get(toStationId)
      if (!fromNodeId || !toNodeId) continue

      const pairKey =
        fromStationId < toStationId ? `${fromStationId}__${toStationId}` : `${toStationId}__${fromStationId}`

      if (!edgeByPairKey.has(pairKey)) {
        const nodePath = shortestPath(relationAdjacency, fromNodeId, toNodeId)
        const waypoints = []
        for (const nodeId of nodePath) {
          const node = nodes.get(nodeId)
          if (!node) continue
          waypoints.push(toNodeLngLat(node))
        }

        const fromStation = stationByNodeId.get(fromNodeId)
        const toStation = stationByNodeId.get(toNodeId)
        const fallbackWaypoints = [fromStation?.lngLat, toStation?.lngLat].filter(Boolean)
        const finalWaypoints = waypoints.length >= 2 ? waypoints : fallbackWaypoints

        edgeByPairKey.set(pairKey, {
          id: createId('edge'),
          fromStationId,
          toStationId,
          waypoints: finalWaypoints,
          sharedByLineIds: [line.id],
          lengthMeters: sumPathLength(finalWaypoints),
        })
      } else {
        const edge = edgeByPairKey.get(pairKey)
        if (!edge.sharedByLineIds.includes(line.id)) {
          edge.sharedByLineIds.push(line.id)
        }
      }

      const edge = edgeByPairKey.get(pairKey)
      if (!line.edgeIds.includes(edge.id)) {
        line.edgeIds.push(edge.id)
      }
    }
  }

  const merged = mergeStationsAndTopology({
    stations: [...stationByNodeId.values()],
    edges: [...edgeByPairKey.values()],
    lines: [...lineByKey.values()],
    lineStatusById,
  })

  return {
    region: {
      id: 'jinan_admin',
      name: '济南市',
      relationId: JINAN_RELATION_ID,
      bbox: boundaryBbox,
    },
    boundary: boundaryFeature.geometry,
    stations: merged.stations,
    edges: merged.edges,
    lines: merged.lines,
    importMeta: {
      importedAt: new Date().toISOString(),
      includeConstruction,
      includeProposed,
      relationCount: relations.length,
      mergedStationCount: merged.stations.length,
    },
  }
}
