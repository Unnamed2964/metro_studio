import { haversineDistanceMeters } from '../geo'
import { postOverpassQuery } from './overpassClient'

import {
  clamp,
  toFiniteNumber,
  DEFAULT_RADIUS_METERS,
  MIN_RADIUS_METERS,
  MAX_RADIUS_METERS,
  ROAD_IMPORTANCE,
  ROAD_LABEL,
  buildNearbyContextQuery,
  buildNearbyRoadGeometryQuery,
  resolveElementNames,
  resolveElementLngLat,
  resolveRoadType,
  resolveAreaType,
  resolveFacilityType,
  resolveBuildingType,
} from './nearbyStationNamingParser'

import {
  assertLngLat,
  toScoredRecord,
  upsertByName,
  detectRoadIntersections,
  rebalanceRoadRecords,
  sortAndProjectRecords,
} from './nearbyStationNamingScorer'

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
        meta: {
          roadClass: roadType,
          roadClassLabel: ROAD_LABEL[roadType] || `道路:${roadType}`,
        },
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
          meta: area.meta || null,
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
          meta: facility.meta || null,
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
          meta: building.meta || null,
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
    roads: sortAndProjectRecords(roadRecords),
    areas: sortAndProjectRecords([...areas.values()]),
    facilities: sortAndProjectRecords([...facilities.values()]),
    buildings: sortAndProjectRecords([...buildings.values()]),
  }
}

export { DEFAULT_RADIUS_METERS as STATION_NAMING_RADIUS_METERS }

export * from './nearbyStationNamingParser'
export * from './nearbyStationNamingScorer'
