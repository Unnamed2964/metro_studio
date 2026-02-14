import { defineStore } from 'pinia'
import {
  downloadAllLineHudZip,
  downloadOfficialSchematicPng,
} from '../lib/export/exportSchematic'
import { haversineDistanceMeters, projectLngLat } from '../lib/geo'
import { optimizeLayoutInWorker } from '../lib/layout/workerClient'
import { normalizeHexColor, pickLineColor } from '../lib/colors'
import { createId } from '../lib/ids'
import { normalizeLineNamesForLoop } from '../lib/lineNaming'
import { importJinanMetroFromOsm } from '../lib/osm/importJinanMetro'
import { createEmptyProject, normalizeProject } from '../lib/projectModel'
import {
  deleteProjectFromDb,
  listProjectsFromDb,
  loadLatestProjectFromDb,
  loadProjectFromDb,
  saveProjectToDb,
  setLatestProject,
} from '../lib/storage/db'
import { downloadProjectFile, parseProjectFile } from '../lib/storage/projectFile'

let persistTimer = null
let actualRoutePngExporter = null

function estimateDisplayPositionFromLngLat(stations, lngLat) {
  const stationsWithDisplay = (stations || []).filter(
    (station) =>
      Array.isArray(station.lngLat) &&
      station.lngLat.length === 2 &&
      Array.isArray(station.displayPos) &&
      station.displayPos.length === 2,
  )

  if (stationsWithDisplay.length < 2) {
    return projectLngLat(lngLat)
  }

  let minLng = Number.POSITIVE_INFINITY
  let maxLng = Number.NEGATIVE_INFINITY
  let minLat = Number.POSITIVE_INFINITY
  let maxLat = Number.NEGATIVE_INFINITY
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const station of stationsWithDisplay) {
    minLng = Math.min(minLng, station.lngLat[0])
    maxLng = Math.max(maxLng, station.lngLat[0])
    minLat = Math.min(minLat, station.lngLat[1])
    maxLat = Math.max(maxLat, station.lngLat[1])
    minX = Math.min(minX, station.displayPos[0])
    maxX = Math.max(maxX, station.displayPos[0])
    minY = Math.min(minY, station.displayPos[1])
    maxY = Math.max(maxY, station.displayPos[1])
  }

  const lngSpan = Math.max(maxLng - minLng, 1e-6)
  const latSpan = Math.max(maxLat - minLat, 1e-6)
  const xSpan = Math.max(maxX - minX, 1)
  const ySpan = Math.max(maxY - minY, 1)

  const lngRatio = (lngLat[0] - minLng) / lngSpan
  const latRatio = (lngLat[1] - minLat) / latSpan

  return [minX + xSpan * lngRatio, minY + ySpan * latRatio]
}

function dedupeStationIds(ids, stationIdSet) {
  const result = []
  const seen = new Set()
  for (const id of ids || []) {
    if (!stationIdSet.has(id) || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

function applyRenameTemplate(template, sequenceNumber) {
  const normalized = String(template || '').trim()
  if (!normalized) return ''
  if (normalized.includes('{n}')) {
    return normalized.replaceAll('{n}', String(sequenceNumber))
  }
  return `${normalized}${sequenceNumber}`
}

function cloneLngLat(lngLat) {
  if (!Array.isArray(lngLat) || lngLat.length !== 2) return null
  const lng = Number(lngLat[0])
  const lat = Number(lngLat[1])
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return [lng, lat]
}

function distanceSquared(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return dx * dx + dy * dy
}

function buildEditableEdgeWaypoints(edge, fromLngLat, toLngLat) {
  const from = cloneLngLat(fromLngLat)
  const to = cloneLngLat(toLngLat)
  if (!from || !to) return null
  const rawPoints =
    Array.isArray(edge?.waypoints) && edge.waypoints.length >= 2
      ? edge.waypoints.map((point) => cloneLngLat(point)).filter(Boolean)
      : [from, to]
  if (rawPoints.length < 2) {
    return [from, to]
  }

  const directError = distanceSquared(rawPoints[0], from) + distanceSquared(rawPoints[rawPoints.length - 1], to)
  const reverseError = distanceSquared(rawPoints[0], to) + distanceSquared(rawPoints[rawPoints.length - 1], from)
  const orderedPoints = reverseError < directError ? [...rawPoints].reverse() : rawPoints
  orderedPoints[0] = from
  orderedPoints[orderedPoints.length - 1] = to
  return orderedPoints
}

function findClosestSegmentInsertionIndex(points, target) {
  if (!Array.isArray(points) || points.length < 2 || !Array.isArray(target) || target.length !== 2) {
    return 1
  }
  let bestInsertIndex = 1
  let bestDistanceSquared = Number.POSITIVE_INFINITY
  const [px, py] = target

  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[i + 1]
    const dx = x2 - x1
    const dy = y2 - y1
    const lenSq = dx * dx + dy * dy
    let t = 0
    if (lenSq > 0) {
      t = ((px - x1) * dx + (py - y1) * dy) / lenSq
    }
    const clamped = Math.max(0, Math.min(1, t))
    const cx = x1 + clamped * dx
    const cy = y1 + clamped * dy
    const distSq = (px - cx) * (px - cx) + (py - cy) * (py - cy)
    if (distSq < bestDistanceSquared) {
      bestDistanceSquared = distSq
      bestInsertIndex = i + 1
    }
  }
  return bestInsertIndex
}

export const useProjectStore = defineStore('project', {
  state: () => ({
    project: null,
    regionBoundary: null,
    mode: 'select',
    selectedStationId: null,
    selectedStationIds: [],
    selectedEdgeId: null,
    selectedEdgeAnchor: null,
    pendingEdgeStartStationId: null,
    activeLineId: null,
    isImporting: false,
    isLayoutRunning: false,
    isInitialized: false,
    statusText: '',
    includeConstruction: false,
    includeProposed: false,
    exportStationVisibilityMode: 'all',
  }),
  getters: {
    lineById(state) {
      const map = new Map()
      for (const line of state.project?.lines || []) {
        map.set(line.id, line)
      }
      return map
    },
    stationById(state) {
      const map = new Map()
      for (const station of state.project?.stations || []) {
        map.set(station.id, station)
      }
      return map
    },
    edgeById(state) {
      const map = new Map()
      for (const edge of state.project?.edges || []) {
        map.set(edge.id, edge)
      }
      return map
    },
    selectedStations(state) {
      if (!state.project) return []
      const selectedSet = new Set(state.selectedStationIds || [])
      return state.project.stations.filter((station) => selectedSet.has(station.id))
    },
  },
  actions: {
    async initialize() {
      if (this.isInitialized) return
      const latest = await loadLatestProjectFromDb()
      this.project = latest || createEmptyProject('济南地铁图工程')
      this.regionBoundary = this.project.regionBoundary || null
      this.includeConstruction = Boolean(this.project.importConfig?.includeConstruction)
      this.includeProposed = Boolean(this.project.importConfig?.includeProposed)
      this.activeLineId = this.project.lines[0]?.id || null
      this.selectedStationId = null
      this.selectedStationIds = []
      this.selectedEdgeId = null
      this.selectedEdgeAnchor = null
      this.pendingEdgeStartStationId = null
      this.isInitialized = true
      this.statusText = latest ? `已加载最近工程: ${latest.name}` : '已创建新工程'
      if (!latest) {
        try {
          await this.persistNow()
        } catch (error) {
          this.statusText = `初始化持久化失败: ${error.message || 'unknown error'}`
        }
      }
    },

    async createNewProject(name = '新建工程') {
      this.project = createEmptyProject(name)
      this.activeLineId = this.project.lines[0]?.id || null
      this.mode = 'select'
      this.selectedEdgeId = null
      this.selectedEdgeAnchor = null
      this.selectedStationId = null
      this.selectedStationIds = []
      this.pendingEdgeStartStationId = null
      this.regionBoundary = null
      this.includeConstruction = false
      this.includeProposed = false
      this.statusText = '已创建空工程'
      await this.persistNow()
    },

    async renameCurrentProject(name) {
      if (!this.project) return
      const normalizedName = String(name || '').trim()
      if (!normalizedName) return
      this.project.name = normalizedName
      this.project.meta.updatedAt = new Date().toISOString()
      this.statusText = `已重命名工程: ${normalizedName}`
      await this.persistNow()
    },

    async duplicateCurrentProject(name) {
      if (!this.project) return null
      const normalizedName = String(name || '').trim()
      const now = new Date().toISOString()
      const duplicated = normalizeProject({
        ...JSON.parse(JSON.stringify(this.project)),
        id: createId('project'),
        name: normalizedName || `${this.project.name} 副本`,
        meta: {
          createdAt: now,
          updatedAt: now,
        },
      })

      this.project = duplicated
      this.regionBoundary = duplicated.regionBoundary || null
      this.includeConstruction = Boolean(duplicated.importConfig?.includeConstruction)
      this.includeProposed = Boolean(duplicated.importConfig?.includeProposed)
      this.activeLineId = duplicated.lines[0]?.id || null
      this.mode = 'select'
      this.selectedStationId = null
      this.selectedStationIds = []
      this.selectedEdgeId = null
      this.selectedEdgeAnchor = null
      this.pendingEdgeStartStationId = null
      this.recomputeStationLineMembership()
      this.statusText = `已复制工程: ${duplicated.name}`
      await this.persistNow()
      return duplicated
    },

    async deleteProjectById(projectId) {
      if (!projectId) return false
      const targetId = String(projectId)
      const deletingCurrent = this.project?.id === targetId

      await deleteProjectFromDb(targetId)
      const projects = await listProjectsFromDb()

      if (!projects.length) {
        this.project = createEmptyProject('济南地铁图工程')
        this.regionBoundary = this.project.regionBoundary || null
        this.includeConstruction = false
        this.includeProposed = false
        this.activeLineId = this.project.lines[0]?.id || null
        this.mode = 'select'
        this.selectedStationId = null
        this.selectedStationIds = []
        this.selectedEdgeId = null
        this.selectedEdgeAnchor = null
        this.pendingEdgeStartStationId = null
        this.statusText = '已删除工程，已创建新工程'
        await this.persistNow()
        return true
      }

      if (deletingCurrent) {
        const fallback = projects[0]
        this.project = fallback
        this.regionBoundary = fallback.regionBoundary || null
        this.includeConstruction = Boolean(fallback.importConfig?.includeConstruction)
        this.includeProposed = Boolean(fallback.importConfig?.includeProposed)
        this.activeLineId = fallback.lines[0]?.id || null
        this.mode = 'select'
        this.selectedStationId = null
        this.selectedStationIds = []
        this.selectedEdgeId = null
        this.selectedEdgeAnchor = null
        this.pendingEdgeStartStationId = null
        this.recomputeStationLineMembership()
        this.statusText = `已删除工程，已加载: ${fallback.name}`
        await setLatestProject(fallback.id)
        return true
      }

      await setLatestProject(this.project?.id || projects[0].id)
      this.statusText = '已删除工程'
      return true
    },

    setMode(mode) {
      this.mode = mode
      if (mode !== 'add-edge' && mode !== 'route-draw') {
        this.pendingEdgeStartStationId = null
      }
    },

    setLayoutGeoSeedScale(value) {
      if (!this.project) return
      const parsed = Number(value)
      if (!Number.isFinite(parsed)) return
      const normalized = Math.max(0.1, Math.min(16, parsed))
      if (!this.project.layoutConfig || typeof this.project.layoutConfig !== 'object') {
        this.project.layoutConfig = { geoSeedScale: normalized }
      } else {
        this.project.layoutConfig.geoSeedScale = normalized
      }
      this.touchProject('')
    },

    cancelPendingEdgeStart() {
      if (!this.pendingEdgeStartStationId) return
      this.pendingEdgeStartStationId = null
      if (this.mode === 'add-edge' || this.mode === 'route-draw') {
        this.statusText = '已取消待连接起点'
      }
    },

    setActiveLine(lineId) {
      this.activeLineId = lineId
    },

    setSelectedStations(stationIds, options = {}) {
      if (!this.project) return
      const stationIdSet = new Set(this.project.stations.map((station) => station.id))
      const sanitized = dedupeStationIds(stationIds, stationIdSet)
      this.selectedStationIds = sanitized
      if (sanitized.length) {
        this.selectedEdgeId = null
        this.selectedEdgeAnchor = null
      }
      if (options.keepPrimary && this.selectedStationId && sanitized.includes(this.selectedStationId)) {
        return
      }
      this.selectedStationId = sanitized.length ? sanitized[sanitized.length - 1] : null
    },

    clearSelection() {
      this.selectedStationId = null
      this.selectedStationIds = []
      this.selectedEdgeId = null
      this.selectedEdgeAnchor = null
    },

    selectStations(stationIds, options = {}) {
      const replace = options.replace !== false
      if (replace) {
        this.setSelectedStations(stationIds)
        return
      }
      const merged = [...this.selectedStationIds, ...(stationIds || [])]
      this.setSelectedStations(merged, { keepPrimary: true })
    },

    selectAllStations() {
      if (!this.project) return
      this.setSelectedStations(this.project.stations.map((station) => station.id))
      this.statusText = `已全选 ${this.selectedStationIds.length} 个站点`
    },

    addLine({ nameZh, nameEn, color, status = 'open', style = 'solid', isLoop = false }) {
      if (!this.project) return null
      const lineIndex = this.project.lines.length
      const safeIsLoop = Boolean(isLoop)
      const normalizedStatus = ['open', 'construction', 'proposed'].includes(status) ? status : 'open'
      const normalizedStyle = ['solid', 'dashed', 'dotted'].includes(style) ? style : 'solid'
      const normalizedNames = normalizeLineNamesForLoop({
        nameZh: nameZh?.trim() || `手工线路 ${lineIndex + 1}`,
        nameEn: nameEn?.trim() || `Manual Line ${lineIndex + 1}`,
        isLoop: safeIsLoop,
      })
      const line = {
        id: createId('line'),
        key: `manual_${Date.now()}_${lineIndex}`,
        nameZh: normalizedNames.nameZh,
        nameEn: normalizedNames.nameEn,
        color: normalizeHexColor(color, pickLineColor(lineIndex)),
        status: normalizedStatus,
        style: normalizedStyle,
        isLoop: safeIsLoop,
        edgeIds: [],
      }
      this.project.lines.push(line)
      this.activeLineId = line.id
      this.touchProject(`新增线路: ${line.nameZh}`)
      return line
    },

    addStationAt(lngLat) {
      if (!this.project || !Array.isArray(lngLat) || lngLat.length !== 2) return null
      const nextIndex = this.project.stations.length + 1
      const station = {
        id: createId('station'),
        nameZh: `新站 ${nextIndex}`,
        nameEn: `Station ${nextIndex}`,
        lngLat: [...lngLat],
        displayPos: estimateDisplayPositionFromLngLat(this.project.stations, lngLat),
        isInterchange: false,
        underConstruction: false,
        proposed: false,
        lineIds: [],
      }
      this.project.stations.push(station)
      this.setSelectedStations([station.id])
      this.touchProject(`新增站点: ${station.nameZh}`)
      return station
    },

    syncConnectedEdgeEndpoints(stationId, lngLat) {
      if (!this.project) return
      const safePoint = cloneLngLat(lngLat)
      if (!safePoint) return
      for (const edge of this.project.edges || []) {
        if (!Array.isArray(edge.waypoints) || edge.waypoints.length < 2) continue
        if (edge.fromStationId === stationId) {
          edge.waypoints[0] = [...safePoint]
        }
        if (edge.toStationId === stationId) {
          edge.waypoints[edge.waypoints.length - 1] = [...safePoint]
        }
      }
    },

    updateStationPosition(stationId, lngLat) {
      if (!this.project) return
      const station = this.project.stations.find((item) => item.id === stationId)
      if (!station) return
      station.lngLat = [...lngLat]
      station.displayPos = estimateDisplayPositionFromLngLat(this.project.stations, lngLat)
      this.syncConnectedEdgeEndpoints(station.id, station.lngLat)
      this.touchProject('')
    },

    moveStationsByDelta(stationIds, deltaLngLat) {
      if (!this.project || !Array.isArray(deltaLngLat) || deltaLngLat.length !== 2) return
      const stationIdSet = new Set(this.project.stations.map((station) => station.id))
      const movingIds = dedupeStationIds(stationIds, stationIdSet)
      if (!movingIds.length) return
      const [dx, dy] = deltaLngLat
      const movingSet = new Set(movingIds)
      for (const station of this.project.stations) {
        if (!movingSet.has(station.id)) continue
        const nextLngLat = [station.lngLat[0] + dx, station.lngLat[1] + dy]
        station.lngLat = nextLngLat
        station.displayPos = estimateDisplayPositionFromLngLat(this.project.stations, nextLngLat)
        this.syncConnectedEdgeEndpoints(station.id, station.lngLat)
      }
      this.touchProject('')
    },

    updateStationName(stationId, { nameZh, nameEn }) {
      if (!this.project) return
      const station = this.project.stations.find((item) => item.id === stationId)
      if (!station) return
      station.nameZh = String(nameZh || '').trim() || station.nameZh
      station.nameEn = String(nameEn || '').trim()
      this.touchProject(`更新站名: ${station.nameZh}`)
    },

    renameSelectedStationsByTemplate({ zhTemplate, enTemplate, startIndex = 1 } = {}) {
      if (!this.project || !this.selectedStationIds.length) return
      const selectedSet = new Set(this.selectedStationIds)
      const selectedStations = this.project.stations.filter((station) => selectedSet.has(station.id))
      if (!selectedStations.length) return

      const normalizedStart = Number(startIndex)
      const sequenceStart = Number.isFinite(normalizedStart) ? Math.max(1, Math.floor(normalizedStart)) : 1
      const hasZhTemplate = Boolean(String(zhTemplate || '').trim())
      const hasEnTemplate = Boolean(String(enTemplate || '').trim())
      if (!hasZhTemplate && !hasEnTemplate) return

      selectedStations.forEach((station, index) => {
        const n = sequenceStart + index
        if (hasZhTemplate) {
          const nextZh = applyRenameTemplate(zhTemplate, n)
          if (nextZh) {
            station.nameZh = nextZh
          }
        }
        if (hasEnTemplate) {
          station.nameEn = applyRenameTemplate(enTemplate, n)
        }
      })

      this.touchProject(`批量重命名 ${selectedStations.length} 个站点`)
    },

    updateLine(lineId, patch = {}) {
      if (!this.project) return
      const line = this.project.lines.find((item) => item.id === lineId)
      if (!line) return

      const next = { ...line }
      if (patch.nameZh != null) next.nameZh = String(patch.nameZh).trim() || next.nameZh
      if (patch.nameEn != null) next.nameEn = String(patch.nameEn).trim()
      if (patch.color != null) {
        const colorIndex = this.project.lines.findIndex((item) => item.id === lineId)
        next.color = normalizeHexColor(patch.color, pickLineColor(Math.max(0, colorIndex)))
      }
      if (patch.status != null && ['open', 'construction', 'proposed'].includes(patch.status)) {
        next.status = patch.status
      }
      if (patch.style != null && ['solid', 'dashed', 'dotted'].includes(patch.style)) {
        next.style = patch.style
      }
      if (patch.isLoop != null) {
        next.isLoop = Boolean(patch.isLoop)
      }
      const normalizedNames = normalizeLineNamesForLoop({
        nameZh: next.nameZh,
        nameEn: next.nameEn,
        isLoop: next.isLoop,
      })
      next.nameZh = normalizedNames.nameZh || next.nameZh
      next.nameEn = normalizedNames.nameEn

      Object.assign(line, next)
      this.recomputeStationLineMembership()
      this.touchProject(`更新线路: ${line.nameZh}`)
    },

    deleteSelectedStations() {
      if (!this.project || !this.selectedStationIds.length) return
      const removing = new Set(this.selectedStationIds)
      this.project.stations = this.project.stations.filter((station) => !removing.has(station.id))
      this.project.edges = this.project.edges.filter(
        (edge) => !removing.has(edge.fromStationId) && !removing.has(edge.toStationId),
      )
      const edgeIdSet = new Set(this.project.edges.map((edge) => edge.id))
      for (const line of this.project.lines) {
        line.edgeIds = (line.edgeIds || []).filter((edgeId) => edgeIdSet.has(edgeId))
      }
      this.project.lines = this.project.lines.filter((line) => line.edgeIds.length > 0)
      if (!this.project.lines.length) {
        this.addLine({})
      }
      if (!this.project.lines.some((line) => line.id === this.activeLineId)) {
        this.activeLineId = this.project.lines[0]?.id || null
      }
      this.recomputeStationLineMembership()
      this.clearSelection()
      this.touchProject('已删除选中站点')
    },

    selectEdge(edgeId, options = {}) {
      if (!this.project) return
      const target = this.project.edges.find((edge) => edge.id === edgeId)
      if (!target) return
      this.selectedEdgeId = target.id
      this.selectedEdgeAnchor = null
      if (!options.keepStationSelection) {
        this.selectedStationId = null
        this.selectedStationIds = []
      }
      this.pendingEdgeStartStationId = null
    },

    selectEdgeAnchor(edgeId, anchorIndex) {
      if (!this.project) return
      const edge = this.project.edges.find((item) => item.id === edgeId)
      if (!edge) return
      const waypoints = this.resolveEditableEdgeWaypoints(edge)
      if (!waypoints || waypoints.length < 3) return
      const normalizedIndex = Number(anchorIndex)
      if (!Number.isInteger(normalizedIndex) || normalizedIndex < 1 || normalizedIndex > waypoints.length - 2) return
      this.selectedEdgeId = edge.id
      this.selectedEdgeAnchor = {
        edgeId: edge.id,
        anchorIndex: normalizedIndex,
      }
      this.selectedStationId = null
      this.selectedStationIds = []
      this.pendingEdgeStartStationId = null
    },

    resolveEditableEdgeWaypoints(edge) {
      if (!this.project || !edge) return null
      const fromStation = this.project.stations.find((station) => station.id === edge.fromStationId)
      const toStation = this.project.stations.find((station) => station.id === edge.toStationId)
      if (!fromStation || !toStation) return null
      return buildEditableEdgeWaypoints(edge, fromStation.lngLat, toStation.lngLat)
    },

    addEdgeAnchor(edgeId, lngLat, options = {}) {
      if (!this.project) return null
      const edge = this.project.edges.find((item) => item.id === edgeId)
      if (!edge) return null
      const point = cloneLngLat(lngLat)
      if (!point) return null
      const resolvedWaypoints = this.resolveEditableEdgeWaypoints(edge)
      if (!resolvedWaypoints || resolvedWaypoints.length < 2) return null
      const waypoints = edge.isCurved
        ? resolvedWaypoints
        : [resolvedWaypoints[0], resolvedWaypoints[resolvedWaypoints.length - 1]]

      const requestedIndex = Number(options.insertIndex)
      const insertIndex = Number.isInteger(requestedIndex) && requestedIndex >= 1 && requestedIndex <= waypoints.length - 1
        ? requestedIndex
        : findClosestSegmentInsertionIndex(waypoints, point)

      edge.waypoints = [...waypoints.slice(0, insertIndex), point, ...waypoints.slice(insertIndex)]
      edge.isCurved = true
      this.selectedEdgeId = edge.id
      this.selectedEdgeAnchor = {
        edgeId: edge.id,
        anchorIndex: insertIndex,
      }
      this.touchProject('新增锚点')
      return this.selectedEdgeAnchor
    },

    updateEdgeAnchor(edgeId, anchorIndex, lngLat) {
      if (!this.project) return false
      const edge = this.project.edges.find((item) => item.id === edgeId)
      if (!edge) return false
      const point = cloneLngLat(lngLat)
      if (!point) return false
      const waypoints = this.resolveEditableEdgeWaypoints(edge)
      if (!waypoints || waypoints.length < 3) return false

      const normalizedIndex = Number(anchorIndex)
      if (!Number.isInteger(normalizedIndex) || normalizedIndex < 1 || normalizedIndex > waypoints.length - 2) return false
      waypoints[normalizedIndex] = point
      edge.waypoints = waypoints
      edge.isCurved = true
      this.selectedEdgeId = edge.id
      this.selectedEdgeAnchor = {
        edgeId: edge.id,
        anchorIndex: normalizedIndex,
      }
      this.touchProject('')
      return true
    },

    removeEdgeAnchor(edgeId, anchorIndex) {
      if (!this.project) return false
      const edge = this.project.edges.find((item) => item.id === edgeId)
      if (!edge) return false
      const waypoints = this.resolveEditableEdgeWaypoints(edge)
      if (!waypoints || waypoints.length < 3) return false

      const normalizedIndex = Number(anchorIndex)
      if (!Number.isInteger(normalizedIndex) || normalizedIndex < 1 || normalizedIndex > waypoints.length - 2) return false
      const nextWaypoints = waypoints.filter((_, index) => index !== normalizedIndex)
      edge.waypoints = nextWaypoints
      edge.isCurved = nextWaypoints.length >= 3
      this.selectedEdgeId = edge.id
      if (nextWaypoints.length < 3) {
        this.selectedEdgeAnchor = null
      } else {
        const nextAnchorIndex = Math.max(1, Math.min(normalizedIndex, nextWaypoints.length - 2))
        this.selectedEdgeAnchor = {
          edgeId: edge.id,
          anchorIndex: nextAnchorIndex,
        }
      }
      this.touchProject('删除锚点')
      return true
    },

    clearEdgeAnchors(edgeId) {
      if (!this.project) return false
      const edge = this.project.edges.find((item) => item.id === edgeId)
      if (!edge) return false
      const waypoints = this.resolveEditableEdgeWaypoints(edge)
      if (!waypoints || waypoints.length < 2) return false
      edge.waypoints = [waypoints[0], waypoints[waypoints.length - 1]]
      edge.isCurved = false
      this.selectedEdgeId = edge.id
      this.selectedEdgeAnchor = null
      this.touchProject('清空线段锚点')
      return true
    },

    removeSelectedEdgeAnchor() {
      if (!this.selectedEdgeAnchor?.edgeId) return false
      return this.removeEdgeAnchor(this.selectedEdgeAnchor.edgeId, this.selectedEdgeAnchor.anchorIndex)
    },

    deleteSelectedEdge() {
      if (!this.project || !this.selectedEdgeId) return
      const deletingEdgeId = this.selectedEdgeId
      const deletingEdge = this.project.edges.find((edge) => edge.id === deletingEdgeId)
      if (!deletingEdge) {
        this.selectedEdgeId = null
        this.selectedEdgeAnchor = null
        return
      }

      this.project.edges = this.project.edges.filter((edge) => edge.id !== deletingEdgeId)
      for (const line of this.project.lines) {
        line.edgeIds = (line.edgeIds || []).filter((edgeId) => edgeId !== deletingEdgeId)
      }
      this.project.lines = this.project.lines.filter((line) => line.edgeIds.length > 0)
      if (!this.project.lines.length) {
        this.addLine({})
      }
      if (!this.project.lines.some((line) => line.id === this.activeLineId)) {
        this.activeLineId = this.project.lines[0]?.id || null
      }

      this.selectedEdgeId = null
      this.selectedEdgeAnchor = null
      this.recomputeStationLineMembership()
      this.touchProject(`删除线段: ${deletingEdge.fromStationId} -> ${deletingEdge.toStationId}`)
    },

    deleteLine(lineId) {
      if (!this.project) return
      const line = this.project.lines.find((item) => item.id === lineId)
      if (!line) return

      const lineSet = new Set([lineId])
      const affectedStationIdSet = new Set()
      for (const edge of this.project.edges) {
        if (!(edge.sharedByLineIds || []).some((id) => lineSet.has(id))) continue
        affectedStationIdSet.add(edge.fromStationId)
        affectedStationIdSet.add(edge.toStationId)
      }
      this.project.lines = this.project.lines.filter((item) => item.id !== lineId)

      const nextEdges = []
      for (const edge of this.project.edges) {
        const shared = (edge.sharedByLineIds || []).filter((id) => !lineSet.has(id))
        if (!shared.length) continue
        nextEdges.push({ ...edge, sharedByLineIds: shared })
      }
      this.project.edges = nextEdges
      const edgeIdSet = new Set(nextEdges.map((edge) => edge.id))
      for (const item of this.project.lines) {
        item.edgeIds = (item.edgeIds || []).filter((edgeId) => edgeIdSet.has(edgeId))
      }
      this.project.lines = this.project.lines.filter((item) => item.edgeIds.length > 0 || item.id === this.activeLineId)
      if (!this.project.lines.length) {
        this.addLine({})
      }
      if (!this.project.lines.some((item) => item.id === this.activeLineId)) {
        this.activeLineId = this.project.lines[0]?.id || null
      }
      if (this.selectedEdgeId) {
        const stillExists = this.project.edges.some((edge) => edge.id === this.selectedEdgeId)
        if (!stillExists) {
          this.selectedEdgeId = null
          this.selectedEdgeAnchor = null
        }
      }
      if (this.selectedEdgeAnchor) {
        const anchorEdgeExists = this.project.edges.some((edge) => edge.id === this.selectedEdgeAnchor.edgeId)
        if (!anchorEdgeExists) {
          this.selectedEdgeAnchor = null
        }
      }
      this.recomputeStationLineMembership()
      const removableStationIdSet = new Set()
      for (const station of this.project.stations) {
        if (!affectedStationIdSet.has(station.id)) continue
        if ((station.lineIds || []).length === 0) {
          removableStationIdSet.add(station.id)
        }
      }
      if (removableStationIdSet.size) {
        this.project.stations = this.project.stations.filter((station) => !removableStationIdSet.has(station.id))
        if (this.selectedStationId && removableStationIdSet.has(this.selectedStationId)) {
          this.selectedStationId = null
        }
        if (this.selectedStationIds.length) {
          this.selectedStationIds = this.selectedStationIds.filter((id) => !removableStationIdSet.has(id))
        }
        if (this.pendingEdgeStartStationId && removableStationIdSet.has(this.pendingEdgeStartStationId)) {
          this.pendingEdgeStartStationId = null
        }
      }
      this.touchProject(`删除线路: ${line.nameZh}`)
    },

    findOrCreateActiveLine() {
      if (!this.project) return null
      let line = this.project.lines.find((item) => item.id === this.activeLineId)
      if (!line) {
        line = this.addLine({})
      }
      return line
    },

    addEdgeBetweenStations(fromStationId, toStationId) {
      if (!this.project || fromStationId === toStationId) return null

      const fromStation = this.project.stations.find((station) => station.id === fromStationId)
      const toStation = this.project.stations.find((station) => station.id === toStationId)
      if (!fromStation || !toStation) return null

      const line = this.findOrCreateActiveLine()
      if (!line) return null

      const pairKey =
        fromStationId < toStationId
          ? `${fromStationId}__${toStationId}`
          : `${toStationId}__${fromStationId}`

      let edge = this.project.edges.find((item) => {
        const key =
          item.fromStationId < item.toStationId
            ? `${item.fromStationId}__${item.toStationId}`
            : `${item.toStationId}__${item.fromStationId}`
        return key === pairKey
      })

      if (!edge) {
        edge = {
          id: createId('edge'),
          fromStationId,
          toStationId,
          waypoints: [fromStation.lngLat, toStation.lngLat],
          sharedByLineIds: [line.id],
          lengthMeters: haversineDistanceMeters(fromStation.lngLat, toStation.lngLat),
          isCurved: false,
        }
        this.project.edges.push(edge)
      } else if (!edge.sharedByLineIds.includes(line.id)) {
        edge.sharedByLineIds.push(line.id)
      }

      if (!line.edgeIds.includes(edge.id)) {
        line.edgeIds.push(edge.id)
      }

      this.recomputeStationLineMembership()
      this.selectedEdgeId = edge.id
      this.selectedEdgeAnchor = null
      this.touchProject('新增线段')
      return edge
    },

    selectStation(stationId, options = {}) {
      const multi = Boolean(options.multi || options.toggle)
      const toggle = Boolean(options.toggle)
      if (multi) {
        const selected = new Set(this.selectedStationIds || [])
        if (toggle && selected.has(stationId)) {
          selected.delete(stationId)
        } else {
          selected.add(stationId)
        }
        this.setSelectedStations([...selected], { keepPrimary: !toggle })
      } else {
        this.setSelectedStations([stationId])
      }
      this.selectedEdgeId = null
      this.selectedEdgeAnchor = null
      if (this.mode === 'add-edge') {
        if (!this.pendingEdgeStartStationId) {
          this.pendingEdgeStartStationId = stationId
          this.statusText = '已选择起点站，请选择终点站'
          return
        }
        if (this.pendingEdgeStartStationId === stationId) {
          this.pendingEdgeStartStationId = null
          this.statusText = '已取消边创建'
          return
        }
        this.addEdgeBetweenStations(this.pendingEdgeStartStationId, stationId)
        this.pendingEdgeStartStationId = null
        return
      }
      if (this.mode === 'route-draw') {
        if (!this.pendingEdgeStartStationId) {
          this.pendingEdgeStartStationId = stationId
          this.statusText = '连续布线已开始：请继续点击下一个点'
          return
        }
        if (this.pendingEdgeStartStationId === stationId) {
          this.statusText = '已停留当前点，请点击其他点继续布线'
          return
        }
        this.addEdgeBetweenStations(this.pendingEdgeStartStationId, stationId)
        this.pendingEdgeStartStationId = stationId
        this.statusText = '已连接并继续布线：请点击下一个点'
      }
    },

    recomputeStationLineMembership() {
      if (!this.project) return
      const stationLineSet = new Map(this.project.stations.map((station) => [station.id, new Set()]))
      const lineById = new Map(this.project.lines.map((line) => [line.id, line]))
      const edgeById = new Map(this.project.edges.map((edge) => [edge.id, edge]))
      if (this.selectedEdgeId && !edgeById.has(this.selectedEdgeId)) {
        this.selectedEdgeId = null
        this.selectedEdgeAnchor = null
      }
      if (this.selectedEdgeAnchor) {
        const selectedAnchorEdge = edgeById.get(this.selectedEdgeAnchor.edgeId)
        const waypoints = this.resolveEditableEdgeWaypoints(selectedAnchorEdge)
        const maxAnchorIndex = waypoints ? waypoints.length - 2 : 0
        if (!waypoints || maxAnchorIndex < 1 || this.selectedEdgeAnchor.anchorIndex > maxAnchorIndex) {
          this.selectedEdgeAnchor = null
        }
      }

      for (const line of this.project.lines) {
        for (const edgeId of line.edgeIds) {
          const edge = edgeById.get(edgeId)
          if (!edge) continue
          stationLineSet.get(edge.fromStationId)?.add(line.id)
          stationLineSet.get(edge.toStationId)?.add(line.id)
        }
      }

      for (const station of this.project.stations) {
        const hadLineMembership = Array.isArray(station.lineIds) && station.lineIds.length > 0
        const previousUnderConstruction = Boolean(station.underConstruction)
        const previousProposed = Boolean(station.proposed)
        const lineIds = [...(stationLineSet.get(station.id) || [])]
        station.lineIds = lineIds
        station.isInterchange = lineIds.length > 1
        if (lineIds.length > 0) {
          station.underConstruction = lineIds.some((lineId) => lineById.get(lineId)?.status === 'construction')
          station.proposed = lineIds.some((lineId) => lineById.get(lineId)?.status === 'proposed')
          continue
        }

        // Preserve explicit status flags for standalone imported stations.
        // If a station previously had line membership and now has none, clear derived flags.
        if (hadLineMembership) {
          station.underConstruction = false
          station.proposed = false
        } else {
          station.underConstruction = previousUnderConstruction
          station.proposed = previousProposed
        }
      }
    },

    async importJinanNetwork() {
      if (!this.project || this.isImporting) return
      this.isImporting = true
      this.statusText = '正在导入 OSM 济南地铁线网...'
      try {
        const imported = await importJinanMetroFromOsm({
          includeConstruction: this.includeConstruction,
          includeProposed: this.includeProposed,
        })

        this.project = normalizeProject({
          ...this.project,
          name: `${this.project.name || '工程'} (OSM导入)`,
          region: imported.region,
          regionBoundary: imported.boundary,
          importConfig: {
            includeConstruction: this.includeConstruction,
            includeProposed: this.includeProposed,
          },
          stations: imported.stations,
          edges: imported.edges,
          lines: imported.lines,
          meta: {
            ...this.project.meta,
            updatedAt: new Date().toISOString(),
          },
        })
        this.regionBoundary = imported.boundary
        this.activeLineId = this.project.lines[0]?.id || null
        this.selectedStationId = null
        this.selectedStationIds = []
        this.selectedEdgeId = null
        this.selectedEdgeAnchor = null
        this.pendingEdgeStartStationId = null
        this.recomputeStationLineMembership()
        this.statusText = `导入完成: ${this.project.lines.length} 条线 / ${this.project.stations.length} 站`
        await this.persistNow()
      } catch (error) {
        this.statusText = `导入失败: ${error.message || 'unknown error'}`
      } finally {
        this.isImporting = false
      }
    },

    async runAutoLayout() {
      if (!this.project || this.isLayoutRunning || this.project.stations.length < 2) return
      this.isLayoutRunning = true
      this.statusText = '正在执行自动排版...'
      try {
        const geoSeedScale = Number(this.project.layoutConfig?.geoSeedScale)
        const result = await optimizeLayoutInWorker({
          stations: this.project.stations,
          edges: this.project.edges,
          lines: this.project.lines,
          config: {
            geoSeedScale: Number.isFinite(geoSeedScale) ? geoSeedScale : 6,
          },
        })
        this.project.stations = result.stations
        this.project.layoutMeta = {
          stationLabels: result.layoutMeta?.stationLabels || {},
          edgeDirections: result.layoutMeta?.edgeDirections || {},
        }
        const safeScore = Number.isFinite(result.score) ? result.score : 0
        this.project.snapshots.push({
          createdAt: new Date().toISOString(),
          score: safeScore,
          breakdown: result.breakdown,
        })
        this.statusText = `自动排版完成，评分 ${safeScore.toFixed(2)}`
        this.touchProject('')
      } catch (error) {
        this.statusText = `自动排版失败: ${error.message || 'unknown error'}`
      } finally {
        this.isLayoutRunning = false
      }
    },

    async exportProjectFile() {
      if (!this.project) return
      downloadProjectFile(this.project)
      this.statusText = '工程文件已导出'
    },

    async importProjectFile(file) {
      if (!file) return
      const parsed = await parseProjectFile(file)
      this.project = parsed
      this.regionBoundary = parsed.regionBoundary || null
      this.includeConstruction = Boolean(parsed.importConfig?.includeConstruction)
      this.includeProposed = Boolean(parsed.importConfig?.includeProposed)
      this.activeLineId = this.project.lines[0]?.id || null
      this.selectedStationId = null
      this.selectedStationIds = []
      this.selectedEdgeId = null
      this.selectedEdgeAnchor = null
      this.pendingEdgeStartStationId = null
      this.recomputeStationLineMembership()
      this.statusText = `已加载工程文件: ${parsed.name}`
      await this.persistNow()
    },

    async exportActualRoutePng() {
      if (!this.project) return
      try {
        if (typeof actualRoutePngExporter !== 'function') {
          throw new Error('真实地图未就绪，无法导出实际走向图')
        }
        await actualRoutePngExporter({
          project: this.project,
          stationVisibilityMode: this.exportStationVisibilityMode,
        })
        this.statusText = '实际走向图 PNG 已导出'
      } catch (error) {
        this.statusText = `实际走向图导出失败: ${error.message || 'unknown error'}`
        throw error
      }
    },

    async exportOfficialSchematicPng() {
      if (!this.project) return
      await downloadOfficialSchematicPng(this.project)
      this.statusText = '官方风格图 PNG 已导出'
    },

    async exportAllLineHudZip() {
      if (!this.project) return
      const result = await downloadAllLineHudZip(this.project)
      this.statusText = `车辆 HUD 打包已导出（${result.exportedCount} 张）`
    },

    async persistNow() {
      if (!this.project) return
      this.project.meta.updatedAt = new Date().toISOString()
      try {
        const saved = await saveProjectToDb(this.project)
        await setLatestProject(saved.id)
      } catch (error) {
        this.statusText = `本地保存失败: ${error.message || 'unknown error'}`
        throw error
      }
    },

    schedulePersist() {
      if (persistTimer) clearTimeout(persistTimer)
      persistTimer = setTimeout(() => {
        this.persistNow().catch(() => {})
      }, 800)
    },

    touchProject(statusText) {
      if (!this.project) return
      this.project.meta.updatedAt = new Date().toISOString()
      if (statusText) {
        this.statusText = statusText
      }
      this.schedulePersist()
    },

    async loadProjectById(projectId) {
      const project = await loadProjectFromDb(projectId)
      if (!project) return
      this.project = project
      this.regionBoundary = project.regionBoundary || null
      this.includeConstruction = Boolean(project.importConfig?.includeConstruction)
      this.includeProposed = Boolean(project.importConfig?.includeProposed)
      this.activeLineId = project.lines[0]?.id || null
      this.selectedStationId = null
      this.selectedStationIds = []
      this.selectedEdgeId = null
      this.selectedEdgeAnchor = null
      this.pendingEdgeStartStationId = null
      this.recomputeStationLineMembership()
      this.statusText = `已加载工程: ${project.name}`
      await setLatestProject(project.id)
    },

    async listProjects() {
      return listProjectsFromDb()
    },

    registerActualRoutePngExporter(exporter) {
      actualRoutePngExporter = typeof exporter === 'function' ? exporter : null
    },

    unregisterActualRoutePngExporter(exporter) {
      if (typeof exporter === 'function') {
        if (actualRoutePngExporter === exporter) {
          actualRoutePngExporter = null
        }
        return
      }
      actualRoutePngExporter = null
    },

    setExportStationVisibilityMode(mode) {
      const normalized = String(mode || '').trim()
      if (!['all', 'interchange', 'none'].includes(normalized)) return
      this.exportStationVisibilityMode = normalized
    },
  },
})

