import { haversineDistanceMeters } from '../geo'
import { postOverpassQuery } from './overpassClient'

const DEFAULT_RADIUS_METERS = 300
const MIN_RADIUS_METERS = 60
const MAX_RADIUS_METERS = 800

const ROAD_IMPORTANCE = {
  motorway: 1,
  trunk: 0.98,
  primary: 0.95,
  secondary: 0.9,
  tertiary: 0.84,
  unclassified: 0.76,
  residential: 0.68,
  living_street: 0.64,
  service: 0.56,
  pedestrian: 0.52,
  road: 0.5,
}

const ROAD_LABEL = {
  motorway: '高速/快速路',
  trunk: '主干路',
  primary: '主干路',
  secondary: '次干路',
  tertiary: '支路',
  unclassified: '一般道路',
  residential: '居住区道路',
  living_street: '生活街道',
  service: '服务道路',
  pedestrian: '步行街',
  road: '道路',
}

const PLACE_IMPORTANCE = {
  city: 1,
  town: 0.92,
  suburb: 0.86,
  borough: 0.84,
  neighbourhood: 0.8,
  quarter: 0.78,
  village: 0.76,
  hamlet: 0.7,
  locality: 0.68,
}

const FACILITY_IMPORTANCE = {
  university: 1,
  college: 0.96,
  hospital: 0.95,
  clinic: 0.84,
  school: 0.86,
  government: 0.88,
  courthouse: 0.88,
  townhall: 0.86,
  library: 0.82,
  theatre: 0.83,
  arts_centre: 0.82,
  museum: 0.84,
  station: 0.92,
  bus_station: 0.83,
  public_transport: 0.78,
  shopping_centre: 0.87,
  marketplace: 0.8,
  park: 0.76,
  stadium: 0.82,
  sports_centre: 0.78,
}

const LANDUSE_IMPORTANCE = {
  commercial: 0.82,
  retail: 0.8,
  residential: 0.72,
  industrial: 0.7,
  civic: 0.78,
}

const CATEGORY_LIMITS = {
  intersections: 10,
  roads: 18,
  areas: 14,
  facilities: 20,
  buildings: 20,
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeNameKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_()\[\]{}<>.,，。·•'"`]/g, '')
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

function round(value, digits = 0) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function buildNearbyContextQuery([lng, lat], radiusMeters) {
  const radius = clamp(Math.round(toFiniteNumber(radiusMeters, DEFAULT_RADIUS_METERS)), MIN_RADIUS_METERS, MAX_RADIUS_METERS)
  const safeLng = toFiniteNumber(lng).toFixed(6)
  const safeLat = toFiniteNumber(lat).toFixed(6)

  return `[out:json][timeout:35];
(
  node(around:${radius},${safeLat},${safeLng})["place"]["name"];
  way(around:${radius},${safeLat},${safeLng})["place"]["name"];
  relation(around:${radius},${safeLat},${safeLng})["place"]["name"];
  relation(around:${radius},${safeLat},${safeLng})["boundary"="administrative"]["name"];
  way(around:${radius},${safeLat},${safeLng})["landuse"]["name"];

  node(around:${radius},${safeLat},${safeLng})["amenity"]["name"];
  way(around:${radius},${safeLat},${safeLng})["amenity"]["name"];
  relation(around:${radius},${safeLat},${safeLng})["amenity"]["name"];
  node(around:${radius},${safeLat},${safeLng})["tourism"]["name"];
  way(around:${radius},${safeLat},${safeLng})["tourism"]["name"];
  node(around:${radius},${safeLat},${safeLng})["leisure"]["name"];
  way(around:${radius},${safeLat},${safeLng})["leisure"]["name"];
  node(around:${radius},${safeLat},${safeLng})["public_transport"]["name"];
  way(around:${radius},${safeLat},${safeLng})["public_transport"]["name"];
  node(around:${radius},${safeLat},${safeLng})["shop"]["name"];
  way(around:${radius},${safeLat},${safeLng})["shop"]["name"];
  node(around:${radius},${safeLat},${safeLng})["office"]["name"];
  way(around:${radius},${safeLat},${safeLng})["office"]["name"];
  node(around:${radius},${safeLat},${safeLng})["railway"~"station|halt"]["name"];
  way(around:${radius},${safeLat},${safeLng})["railway"~"station|halt"]["name"];

  node(around:${radius},${safeLat},${safeLng})["building"]["name"];
  way(around:${radius},${safeLat},${safeLng})["building"]["name"];
);
out center tags qt;`
}

function buildNearbyRoadGeometryQuery([lng, lat], radiusMeters) {
  const radius = clamp(Math.round(toFiniteNumber(radiusMeters, DEFAULT_RADIUS_METERS)), MIN_RADIUS_METERS, MAX_RADIUS_METERS)
  const safeLng = toFiniteNumber(lng).toFixed(6)
  const safeLat = toFiniteNumber(lat).toFixed(6)

  return `[out:json][timeout:35];
(
  way(around:${radius},${safeLat},${safeLng})["highway"~"motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian|road"]["name"];
);
out tags geom qt;`
}

function resolveElementLngLat(element) {
  if (!element || typeof element !== 'object') return null
  if (element.type === 'node') {
    const lng = toFiniteNumber(element.lon, Number.NaN)
    const lat = toFiniteNumber(element.lat, Number.NaN)
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
  }
  const centerLng = toFiniteNumber(element.center?.lon, Number.NaN)
  const centerLat = toFiniteNumber(element.center?.lat, Number.NaN)
  if (Number.isFinite(centerLng) && Number.isFinite(centerLat)) {
    return [centerLng, centerLat]
  }
  return null
}

function resolveElementNames(tags) {
  return {
    nameZh: firstNonEmpty(tags?.['name:zh'], tags?.name, tags?.['official_name:zh'], tags?.official_name),
    nameEn: firstNonEmpty(tags?.['name:en'], tags?.int_name, tags?.['name:latin'], tags?.['official_name:en']),
  }
}

function resolveRoadType(tags) {
  const highway = String(tags?.highway || '').trim().toLowerCase()
  return ROAD_IMPORTANCE[highway] != null ? highway : ''
}

function resolveAreaType(tags) {
  const place = String(tags?.place || '').trim().toLowerCase()
  if (PLACE_IMPORTANCE[place] != null) {
    return { type: `地域:${place}`, importance: PLACE_IMPORTANCE[place] }
  }
  const boundary = String(tags?.boundary || '').trim().toLowerCase()
  if (boundary === 'administrative') {
    const adminLevel = toFiniteNumber(tags?.admin_level, 10)
    const importance = clamp(1 - (Math.max(2, adminLevel) - 2) * 0.06, 0.6, 0.95)
    return { type: `行政区:${Math.round(adminLevel)}`, importance }
  }
  const landuse = String(tags?.landuse || '').trim().toLowerCase()
  if (LANDUSE_IMPORTANCE[landuse] != null) {
    return { type: `片区:${landuse}`, importance: LANDUSE_IMPORTANCE[landuse] }
  }
  return null
}

function resolveFacilityType(tags) {
  const amenity = String(tags?.amenity || '').trim().toLowerCase()
  if (amenity) {
    return { type: `公共设施:${amenity}`, importance: FACILITY_IMPORTANCE[amenity] ?? 0.76 }
  }
  const tourism = String(tags?.tourism || '').trim().toLowerCase()
  if (tourism) {
    return { type: `公共设施:${tourism}`, importance: FACILITY_IMPORTANCE[tourism] ?? 0.75 }
  }
  const leisure = String(tags?.leisure || '').trim().toLowerCase()
  if (leisure) {
    return { type: `公共设施:${leisure}`, importance: FACILITY_IMPORTANCE[leisure] ?? 0.74 }
  }
  const publicTransport = String(tags?.public_transport || '').trim().toLowerCase()
  if (publicTransport) {
    return { type: `交通设施:${publicTransport}`, importance: FACILITY_IMPORTANCE[publicTransport] ?? 0.78 }
  }
  const railway = String(tags?.railway || '').trim().toLowerCase()
  if (railway === 'station' || railway === 'halt') {
    return { type: `交通设施:${railway}`, importance: FACILITY_IMPORTANCE.station }
  }
  const shop = String(tags?.shop || '').trim().toLowerCase()
  if (shop) {
    return { type: `商业设施:${shop}`, importance: FACILITY_IMPORTANCE.shopping_centre ?? 0.72 }
  }
  const office = String(tags?.office || '').trim().toLowerCase()
  if (office) {
    return { type: `机构:${office}`, importance: FACILITY_IMPORTANCE[office] ?? 0.72 }
  }
  return null
}

function resolveBuildingType(tags) {
  const building = String(tags?.building || '').trim().toLowerCase()
  if (!building) return null
  let importance = 0.66
  if (building === 'transportation' || building === 'station') importance = 0.84
  if (building === 'commercial' || building === 'retail') importance = 0.78
  if (building === 'hospital' || building === 'university' || building === 'civic') importance = 0.88
  return { type: `建筑:${building}`, importance }
}

function toScoredRecord({ entryType, nameZh, nameEn, distanceMeters, importance, type, element }) {
  const distanceScore = clamp(1 - distanceMeters / (MAX_RADIUS_METERS * 1.2), 0, 1)
  const score =
    entryType === 'road'
      ? importance * 0.82 + distanceScore * 0.18
      : importance * 0.72 + distanceScore * 0.28
  return {
    entryType,
    nameZh,
    nameEn,
    type,
    distanceMeters,
    importance,
    score,
    osmType: String(element?.type || ''),
    osmId: element?.id,
    geometry: Array.isArray(element?.geometry) ? element.geometry : null,
  }
}

function projectApproxMeters(lngLat, centerLngLat) {
  const [lng, lat] = lngLat
  const [centerLng, centerLat] = centerLngLat
  const latRad = (centerLat * Math.PI) / 180
  const x = (lng - centerLng) * (111320 * Math.cos(latRad))
  const y = (lat - centerLat) * 110540
  return [x, y]
}

function distancePointToSegmentMeters(p, a, b) {
  const vx = b[0] - a[0]
  const vy = b[1] - a[1]
  const wx = p[0] - a[0]
  const wy = p[1] - a[1]
  const len2 = vx * vx + vy * vy
  if (len2 < 1e-8) {
    const dx = p[0] - a[0]
    const dy = p[1] - a[1]
    return { distance: Math.hypot(dx, dy), direction: [0, 0] }
  }
  const t = clamp((wx * vx + wy * vy) / len2, 0, 1)
  const projX = a[0] + t * vx
  const projY = a[1] + t * vy
  const dx = p[0] - projX
  const dy = p[1] - projY
  const segLen = Math.hypot(vx, vy)
  const direction = segLen > 1e-8 ? [vx / segLen, vy / segLen] : [0, 0]
  return { distance: Math.hypot(dx, dy), direction }
}

function analyzeRoadGeometryAtPoint(roadRecord, centerLngLat) {
  const geometry = Array.isArray(roadRecord?.geometry) ? roadRecord.geometry : []
  if (geometry.length < 2) return null
  const centerXY = projectApproxMeters(centerLngLat, centerLngLat)

  let best = null
  for (let i = 0; i < geometry.length - 1; i += 1) {
    const from = [toFiniteNumber(geometry[i]?.lon, Number.NaN), toFiniteNumber(geometry[i]?.lat, Number.NaN)]
    const to = [toFiniteNumber(geometry[i + 1]?.lon, Number.NaN), toFiniteNumber(geometry[i + 1]?.lat, Number.NaN)]
    if (!Number.isFinite(from[0]) || !Number.isFinite(from[1]) || !Number.isFinite(to[0]) || !Number.isFinite(to[1])) continue
    const fromXY = projectApproxMeters(from, centerLngLat)
    const toXY = projectApproxMeters(to, centerLngLat)
    const candidate = distancePointToSegmentMeters(centerXY, fromXY, toXY)
    if (!best || candidate.distance < best.distance) {
      best = candidate
    }
  }
  return best
}

function detectRoadIntersections(roadRecords, centerLngLat, radiusMeters) {
  const roads = Array.isArray(roadRecords) ? roadRecords : []
  if (roads.length < 2) return []

  const analyzed = []
  for (const road of roads) {
    const nameZh = String(road?.nameZh || '').trim()
    if (!nameZh) continue
    const analysis = analyzeRoadGeometryAtPoint(road, centerLngLat)
    if (!analysis) continue
    analyzed.push({
      ...road,
      localDistanceMeters: analysis.distance,
      direction: analysis.direction,
    })
  }

  const intersections = []
  const seen = new Set()
  const nearThreshold = Math.min(55, radiusMeters * 0.2)

  for (let i = 0; i < analyzed.length; i += 1) {
    for (let j = i + 1; j < analyzed.length; j += 1) {
      const a = analyzed[i]
      const b = analyzed[j]
      if (normalizeNameKey(a.nameZh) === normalizeNameKey(b.nameZh)) continue
      if (a.localDistanceMeters > nearThreshold || b.localDistanceMeters > nearThreshold) continue

      const dot = clamp(a.direction[0] * b.direction[0] + a.direction[1] * b.direction[1], -1, 1)
      const angleDeg = Math.abs((Math.acos(Math.abs(dot)) * 180) / Math.PI)
      if (angleDeg < 18) continue

      const combinedImportance = (a.importance + b.importance) / 2
      const combinedDistance = (a.localDistanceMeters + b.localDistanceMeters) / 2
      const intersectionScore = combinedImportance * 0.8 + clamp(1 - combinedDistance / 60, 0, 1) * 0.2
      const pairNames = [a.nameZh, b.nameZh].sort((x, y) => x.localeCompare(y, 'zh-Hans-CN'))
      const key = `${normalizeNameKey(pairNames[0])}__${normalizeNameKey(pairNames[1])}`
      if (seen.has(key)) continue
      seen.add(key)

      intersections.push({
        nameZh: `${pairNames[0]}·${pairNames[1]}`,
        nameEn: '',
        type: '道路交叉口',
        roadNameZhList: pairNames,
        distanceMeters: round(combinedDistance, 0),
        importance: round(combinedImportance, 3),
        score: round(intersectionScore, 3),
        source: `${a.osmType}/${a.osmId}+${b.osmType}/${b.osmId}`,
      })
    }
  }

  return intersections
    .sort((a, b) => {
      if (Math.abs(b.score - a.score) > 1e-6) return b.score - a.score
      if (Math.abs(a.distanceMeters - b.distanceMeters) > 1e-6) return a.distanceMeters - b.distanceMeters
      return a.nameZh.localeCompare(b.nameZh, 'zh-Hans-CN')
    })
    .slice(0, CATEGORY_LIMITS.intersections)
}

function rebalanceRoadRecords(records, radiusMeters) {
  const items = Array.isArray(records) ? records : []
  if (!items.length) return []

  const nearbyMajorRoads = items.filter((record) => record.importance >= 0.9 && record.distanceMeters <= Math.min(radiusMeters * 0.95, 260))
  const hasNearbyMajorRoad = nearbyMajorRoads.length > 0
  const majorBestScore = nearbyMajorRoads.reduce((best, record) => Math.max(best, record.score), 0)

  const rebalanced = items.map((record) => {
    let adjustedScore = record.score
    if (record.importance >= 0.9) adjustedScore += 0.085
    else if (record.importance >= 0.84) adjustedScore += 0.032

    if (hasNearbyMajorRoad) {
      if (record.importance < 0.84 && record.distanceMeters > 85) adjustedScore -= 0.12
      if (record.importance < 0.76 && record.distanceMeters > 45) adjustedScore -= 0.16
    }

    return {
      ...record,
      score: adjustedScore,
    }
  })

  if (!hasNearbyMajorRoad) return rebalanced

  return rebalanced.filter((record) => {
    if (record.distanceMeters <= 55) return true
    if (record.importance >= 0.84) return true
    return record.score >= majorBestScore - 0.22
  })
}

function upsertByName(bucket, record) {
  const key = normalizeNameKey(record?.nameZh || record?.nameEn)
  if (!key) return
  const previous = bucket.get(key)
  if (!previous) {
    bucket.set(key, record)
    return
  }
  const betterScore = record.score > previous.score + 1e-6
  const sameScoreCloser = Math.abs(record.score - previous.score) <= 1e-6 && record.distanceMeters < previous.distanceMeters
  if (betterScore || sameScoreCloser) {
    bucket.set(key, record)
  }
}

function sortAndProjectRecords(records, limit) {
  return [...records]
    .sort((a, b) => {
      if (Math.abs(b.score - a.score) > 1e-6) return b.score - a.score
      if (Math.abs(a.distanceMeters - b.distanceMeters) > 1e-6) return a.distanceMeters - b.distanceMeters
      return String(a.nameZh).localeCompare(String(b.nameZh), 'zh-Hans-CN')
    })
    .slice(0, limit)
    .map((record) => ({
      nameZh: record.nameZh,
      nameEn: record.nameEn,
      type: record.type,
      distanceMeters: round(record.distanceMeters, 0),
      importance: round(record.importance, 3),
      score: round(record.score, 3),
      source: `${record.osmType}/${record.osmId}`,
    }))
}

function assertLngLat(lngLat) {
  if (!Array.isArray(lngLat) || lngLat.length !== 2) {
    throw new Error('坐标格式无效')
  }
  const lng = toFiniteNumber(lngLat[0], Number.NaN)
  const lat = toFiniteNumber(lngLat[1], Number.NaN)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new Error('坐标格式无效')
  }
  return [lng, lat]
}

export async function fetchNearbyStationNamingContext(lngLat, options = {}) {
  const center = assertLngLat(lngLat)
  const radiusMeters = clamp(
    Math.round(toFiniteNumber(options.radiusMeters, DEFAULT_RADIUS_METERS)),
    MIN_RADIUS_METERS,
    MAX_RADIUS_METERS,
  )

  const mainQuery = buildNearbyContextQuery(center, radiusMeters)
  const roadQuery = buildNearbyRoadGeometryQuery(center, radiusMeters)
  const [mainPayload, roadPayload] = await Promise.all([
    postOverpassQuery(mainQuery, options.signal),
    postOverpassQuery(roadQuery, options.signal),
  ])
  const elements = Array.isArray(mainPayload?.elements) ? mainPayload.elements : []
  const roadElements = Array.isArray(roadPayload?.elements) ? roadPayload.elements : []

  const roads = new Map()
  const areas = new Map()
  const facilities = new Map()
  const buildings = new Map()

  for (const element of roadElements) {
    const tags = element?.tags
    if (!tags || typeof tags !== 'object') continue
    const names = resolveElementNames(tags)
    if (!names.nameZh) continue
    const featureLngLat = resolveElementLngLat(element)
    if (!featureLngLat) continue
    const distanceMeters = haversineDistanceMeters(center, featureLngLat)
    if (!Number.isFinite(distanceMeters) || distanceMeters > radiusMeters * 1.45) continue
    const roadType = resolveRoadType(tags)
    if (!roadType) continue

    upsertByName(
      roads,
      toScoredRecord({
        entryType: 'road',
        nameZh: names.nameZh,
        nameEn: names.nameEn,
        distanceMeters,
        importance: ROAD_IMPORTANCE[roadType],
        type: ROAD_LABEL[roadType] || `道路:${roadType}`,
        element,
      }),
    )
  }

  for (const element of elements) {
    const tags = element?.tags
    if (!tags || typeof tags !== 'object') continue

    const names = resolveElementNames(tags)
    if (!names.nameZh) continue

    const featureLngLat = resolveElementLngLat(element)
    if (!featureLngLat) continue

    const distanceMeters = haversineDistanceMeters(center, featureLngLat)
    if (!Number.isFinite(distanceMeters) || distanceMeters > radiusMeters * 1.4) continue

    const area = resolveAreaType(tags)
    if (area) {
      upsertByName(
        areas,
        toScoredRecord({
          entryType: 'area',
          nameZh: names.nameZh,
          nameEn: names.nameEn,
          distanceMeters,
          importance: area.importance,
          type: area.type,
          element,
        }),
      )
    }

    const facility = resolveFacilityType(tags)
    if (facility) {
      upsertByName(
        facilities,
        toScoredRecord({
          entryType: 'facility',
          nameZh: names.nameZh,
          nameEn: names.nameEn,
          distanceMeters,
          importance: facility.importance,
          type: facility.type,
          element,
        }),
      )
    }

    const building = resolveBuildingType(tags)
    if (building) {
      upsertByName(
        buildings,
        toScoredRecord({
          entryType: 'building',
          nameZh: names.nameZh,
          nameEn: names.nameEn,
          distanceMeters,
          importance: building.importance,
          type: building.type,
          element,
        }),
      )
    }
  }

  const allRoadRecords = [...roads.values()]
  const intersections = detectRoadIntersections(allRoadRecords, center, radiusMeters)
  const roadRecords = rebalanceRoadRecords(allRoadRecords, radiusMeters)

  return {
    center,
    radiusMeters,
    rawFeatureCount: elements.length + roadElements.length,
    intersections,
    roads: sortAndProjectRecords(roadRecords, CATEGORY_LIMITS.roads),
    areas: sortAndProjectRecords([...areas.values()], CATEGORY_LIMITS.areas),
    facilities: sortAndProjectRecords([...facilities.values()], CATEGORY_LIMITS.facilities),
    buildings: sortAndProjectRecords([...buildings.values()], CATEGORY_LIMITS.buildings),
  }
}

export { DEFAULT_RADIUS_METERS as STATION_NAMING_RADIUS_METERS }
