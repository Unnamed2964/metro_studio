import { normalizeHexColor, pickDistinctLineColor, pickLineColor } from '../../../lib/colors'
import { haversineDistanceMeters } from '../../../lib/geo'
import { createId } from '../../../lib/ids'
import { retranslateStationEnglishNames } from '../../../lib/ai/stationEnTranslator'
import { normalizeLineStyle } from '../../../lib/lineStyles'
import { normalizeLineNamesForLoop } from '../../../lib/lineNaming'
import {
  buildTransferEffectiveLineIds,
  createTransferPairKey,
  hasManualTransferBetween,
  normalizeManualTransfers,
} from '../../../lib/transfer'
import {
  applyRenameTemplate,
  buildEditableEdgeWaypoints,
  cloneLngLat,
  dedupeStationIds,
  estimateDisplayPositionFromLngLat,
  findClosestSegmentInsertionIndex,
} from '../helpers'

const networkEditingActions = {
  addLine({ nameZh, nameEn, color, status = 'open', style = 'solid' }) {
    if (!this.project) return null
    const lineIndex = this.project.lines.length
    const existingLineColors = (this.project.lines || []).map((line) => line?.color).filter(Boolean)
    const autoColor = pickDistinctLineColor(existingLineColors, lineIndex)
    const normalizedStatus = ['open', 'construction', 'proposed'].includes(status) ? status : 'open'
    const normalizedStyle = normalizeLineStyle(style)
    const line = {
      id: createId('line'),
      key: `manual_${Date.now()}_${lineIndex}`,
      nameZh: nameZh?.trim() || `${lineIndex + 1}号线`,
      nameEn: nameEn?.trim() || `Line ${lineIndex + 1}`,
      color: normalizeHexColor(color, autoColor || pickLineColor(lineIndex)),
      status: normalizedStatus,
      style: normalizedStyle,
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
      transferLineIds: [],
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

  updateStationNamesBatch(updates = [], options = {}) {
    if (!this.project) return { updatedCount: 0, total: 0 }
    const items = Array.isArray(updates) ? updates : []
    if (!items.length) return { updatedCount: 0, total: 0 }

    const stationById = new Map((this.project.stations || []).map((station) => [station.id, station]))
    let updatedCount = 0

    for (const update of items) {
      const stationId = String(update?.stationId || '').trim()
      if (!stationId) continue
      const station = stationById.get(stationId)
      if (!station) continue

      const nextZh = String(update?.nameZh || '').trim()
      const nextEn = String(update?.nameEn || '').trim()

      let changed = false
      if (nextZh && nextZh !== station.nameZh) {
        station.nameZh = nextZh
        changed = true
      }
      if (nextEn && nextEn !== station.nameEn) {
        station.nameEn = nextEn
        changed = true
      }
      if (changed) updatedCount += 1
    }

    if (updatedCount > 0) {
      const reason = String(options?.reason || '').trim()
      this.touchProject(reason || `批量更新站名: ${updatedCount} 站`)
    }

    return {
      updatedCount,
      total: items.length,
    }
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

  async retranslateAllStationEnglishNamesWithAi() {
    if (!this.project) return { updatedCount: 0, total: 0, failedCount: 0 }
    if (this.isStationEnglishRetranslating) return { updatedCount: 0, total: 0, failedCount: 0 }

    const stations = Array.isArray(this.project.stations)
      ? this.project.stations.map((station) => ({
          stationId: station.id,
          nameZh: station.nameZh,
          nameEn: station.nameEn,
        }))
      : []
    const total = stations.length
    if (!total) return { updatedCount: 0, total: 0, failedCount: 0 }

    this.isStationEnglishRetranslating = true
    this.stationEnglishRetranslateProgress = {
      done: 0,
      total,
      percent: 0,
      message: '准备翻译任务...',
    }
    this.statusText = '全图英文重译已开始...'

    try {
      const result = await retranslateStationEnglishNames({
        stations,
        onProgress: ({ done, total: progressTotal, percent, message }) => {
          const safePercent = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0))
          this.stationEnglishRetranslateProgress = {
            done: Math.max(0, Math.floor(done || 0)),
            total: Math.max(0, Math.floor(progressTotal || total)),
            percent: safePercent,
            message: String(message || ''),
          }
          this.statusText = `全图英文重译中... ${Math.round(safePercent)}%`
        },
      })

      const stationById = new Map(this.project.stations.map((station) => [station.id, station]))
      let updatedCount = 0
      for (const update of result.updates || []) {
        const station = stationById.get(update.stationId)
        if (!station) continue
        const nextNameEn = String(update.nameEn || '').trim()
        if (!nextNameEn) continue
        if (station.nameEn === nextNameEn) continue
        station.nameEn = nextNameEn
        updatedCount += 1
      }

      if (updatedCount > 0) {
        this.touchProject(`全图英文重译完成: 更新 ${updatedCount}/${total} 站`)
      }
      const failedCount = Array.isArray(result.failed) ? result.failed.length : 0
      this.stationEnglishRetranslateProgress = {
        done: total,
        total,
        percent: 100,
        message: failedCount ? `完成（${failedCount} 站使用回退/失败）` : '完成',
      }
      this.statusText = failedCount
        ? `全图英文重译完成: 更新 ${updatedCount}/${total} 站，${failedCount} 站回退/失败`
        : `全图英文重译完成: 更新 ${updatedCount}/${total} 站`

      return { updatedCount, total, failedCount }
    } catch (error) {
      const message = String(error?.message || 'unknown error')
      this.stationEnglishRetranslateProgress = {
        done: this.stationEnglishRetranslateProgress?.done || 0,
        total,
        percent: this.stationEnglishRetranslateProgress?.percent || 0,
        message: `失败: ${message}`,
      }
      this.statusText = `全图英文重译失败: ${message}`
      throw error
    } finally {
      this.isStationEnglishRetranslating = false
    }
  },

  async retranslateStationEnglishNamesByIdsWithAi(stationIds = []) {
    if (!this.project) return { updatedCount: 0, total: 0, failedCount: 0 }
    if (this.isStationEnglishRetranslating) return { updatedCount: 0, total: 0, failedCount: 0 }

    const idSet = new Set((Array.isArray(stationIds) ? stationIds : []).map((id) => String(id || '').trim()).filter(Boolean))
    if (!idSet.size) return { updatedCount: 0, total: 0, failedCount: 0 }

    const stations = (Array.isArray(this.project.stations) ? this.project.stations : [])
      .filter((station) => idSet.has(station.id))
      .map((station) => ({
        stationId: station.id,
        nameZh: station.nameZh,
        nameEn: station.nameEn,
      }))
    const total = stations.length
    if (!total) return { updatedCount: 0, total: 0, failedCount: 0 }

    this.isStationEnglishRetranslating = true
    this.stationEnglishRetranslateProgress = {
      done: 0,
      total,
      percent: 0,
      message: '准备翻译任务...',
    }
    this.statusText = `站点英文重译已开始（${total} 站）...`

    try {
      const result = await retranslateStationEnglishNames({
        stations,
        onProgress: ({ done, total: progressTotal, percent, message }) => {
          const safePercent = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0))
          this.stationEnglishRetranslateProgress = {
            done: Math.max(0, Math.floor(done || 0)),
            total: Math.max(0, Math.floor(progressTotal || total)),
            percent: safePercent,
            message: String(message || ''),
          }
          this.statusText = `站点英文重译中... ${Math.round(safePercent)}%`
        },
      })

      const stationById = new Map(this.project.stations.map((station) => [station.id, station]))
      let updatedCount = 0
      for (const update of result.updates || []) {
        const station = stationById.get(update.stationId)
        if (!station) continue
        const nextNameEn = String(update.nameEn || '').trim()
        if (!nextNameEn) continue
        if (station.nameEn === nextNameEn) continue
        station.nameEn = nextNameEn
        updatedCount += 1
      }

      if (updatedCount > 0) {
        this.touchProject(`站点英文重译完成: 更新 ${updatedCount}/${total} 站`)
      }
      const failedCount = Array.isArray(result.failed) ? result.failed.length : 0
      this.stationEnglishRetranslateProgress = {
        done: total,
        total,
        percent: 100,
        message: failedCount ? `完成（${failedCount} 站使用回退/失败）` : '完成',
      }
      this.statusText = failedCount
        ? `站点英文重译完成: 更新 ${updatedCount}/${total} 站，${failedCount} 站回退/失败`
        : `站点英文重译完成: 更新 ${updatedCount}/${total} 站`

      return { updatedCount, total, failedCount }
    } catch (error) {
      const message = String(error?.message || 'unknown error')
      this.stationEnglishRetranslateProgress = {
        done: this.stationEnglishRetranslateProgress?.done || 0,
        total,
        percent: this.stationEnglishRetranslateProgress?.percent || 0,
        message: `失败: ${message}`,
      }
      this.statusText = `站点英文重译失败: ${message}`
      throw error
    } finally {
      this.isStationEnglishRetranslating = false
    }
  },

  async retranslateSelectedStationEnglishNamesWithAi() {
    const ids = Array.isArray(this.selectedStationIds) ? this.selectedStationIds : []
    return this.retranslateStationEnglishNamesByIdsWithAi(ids)
  },

  hasManualTransferBetweenStations(stationAId, stationBId) {
    if (!this.project) return false
    return hasManualTransferBetween(this.project.manualTransfers, stationAId, stationBId)
  },

  addManualTransferBetweenStations(stationAId, stationBId) {
    if (!this.project) return false
    const stationIdSet = new Set((this.project.stations || []).map((station) => station.id))
    const idA = String(stationAId || '')
    const idB = String(stationBId || '')
    const pairKey = createTransferPairKey(idA, idB)
    if (!pairKey) return false
    if (!stationIdSet.has(idA) || !stationIdSet.has(idB)) return false
    const [normalizedA, normalizedB] = pairKey.split('__')
    const alreadyExists = hasManualTransferBetween(this.project.manualTransfers, normalizedA, normalizedB)
    if (alreadyExists) return false
    if (!Array.isArray(this.project.manualTransfers)) {
      this.project.manualTransfers = []
    }
    this.project.manualTransfers.push({
      id: createId('transfer'),
      stationAId: normalizedA,
      stationBId: normalizedB,
    })
    this.recomputeStationLineMembership()
    this.touchProject('已添加手动换乘关系')
    return true
  },

  removeManualTransferBetweenStations(stationAId, stationBId) {
    if (!this.project || !Array.isArray(this.project.manualTransfers)) return false
    const pairKey = createTransferPairKey(stationAId, stationBId)
    if (!pairKey) return false
    const prevLength = this.project.manualTransfers.length
    this.project.manualTransfers = this.project.manualTransfers.filter(
      (transfer) => createTransferPairKey(transfer?.stationAId, transfer?.stationBId) !== pairKey,
    )
    if (this.project.manualTransfers.length === prevLength) return false
    this.recomputeStationLineMembership()
    this.touchProject('已移除手动换乘关系')
    return true
  },

  addManualTransferForSelectedStations() {
    if (!this.project) return false
    if ((this.selectedStationIds || []).length !== 2) return false
    const [stationAId, stationBId] = this.selectedStationIds
    const changed = this.addManualTransferBetweenStations(stationAId, stationBId)
    if (!changed) {
      this.statusText = '所选两站已存在换乘关系或不可添加'
      return false
    }
    this.statusText = '已将所选两站设为换乘'
    return true
  },

  removeManualTransferForSelectedStations() {
    if (!this.project) return false
    if ((this.selectedStationIds || []).length !== 2) return false
    const [stationAId, stationBId] = this.selectedStationIds
    const changed = this.removeManualTransferBetweenStations(stationAId, stationBId)
    if (!changed) {
      this.statusText = '所选两站未建立换乘关系'
      return false
    }
    this.statusText = '已取消所选两站换乘'
    return true
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
    if (patch.style != null) {
      next.style = normalizeLineStyle(patch.style)
    }
    Object.assign(line, next)
    this.recomputeStationLineMembership()
    this.touchProject(`更新线路: ${line.nameZh}`)
  },

  reassignSelectedEdgesToLine(toLineId, options = {}) {
    if (!this.project) return false
    const targetLine = this.project.lines.find((item) => item.id === toLineId)
    if (!targetLine) return false

    const selectedEdgeIds = Array.isArray(options.edgeIds)
      ? options.edgeIds
      : this.selectedEdgeIds?.length
        ? this.selectedEdgeIds
        : this.selectedEdgeId
          ? [this.selectedEdgeId]
        : []
    const edgeIds = [...new Set(selectedEdgeIds.map((id) => String(id || '').trim()).filter(Boolean))]
    if (!edgeIds.length) {
      this.statusText = '请先选中线段'
      return false
    }

    const edgeById = new Map(this.project.edges.map((edge) => [edge.id, edge]))
    let movedCount = 0
    for (const edgeId of edgeIds) {
      const edge = edgeById.get(edgeId)
      if (!edge) continue
      const previous = Array.isArray(edge.sharedByLineIds) ? edge.sharedByLineIds : []
      const unchanged = previous.length === 1 && previous[0] === targetLine.id
      if (unchanged) continue
      edge.sharedByLineIds = [targetLine.id]
      movedCount += 1
    }

    if (!movedCount) {
      this.statusText = '未找到可迁移线段'
      return false
    }

    const lineById = new Map(this.project.lines.map((line) => [line.id, line]))
    for (const line of this.project.lines) {
      line.edgeIds = []
    }
    for (const edge of this.project.edges) {
      for (const lineId of edge.sharedByLineIds || []) {
        const line = lineById.get(lineId)
        if (!line) continue
        if (!line.edgeIds.includes(edge.id)) {
          line.edgeIds.push(edge.id)
        }
      }
    }

    this.recomputeStationLineMembership()
    const targetName = targetLine.nameZh || targetLine.id
    this.touchProject(`迁移选中线段所属线: -> ${targetName}（${movedCount}段）`)
    this.statusText = `已将 ${movedCount} 条选中线段迁移到 ${targetName}`
    return true
  },

  updateEdgesBatch(edgeIds, patch = {}) {
    if (!this.project) return { updatedCount: 0 }
    const targetIds = [...new Set((Array.isArray(edgeIds) ? edgeIds : []).map((id) => String(id || '').trim()).filter(Boolean))]
    if (!targetIds.length) return { updatedCount: 0 }

    const edgeById = new Map(this.project.edges.map((edge) => [edge.id, edge]))
    const lineById = new Map(this.project.lines.map((line) => [line.id, line]))
    const targetLine = patch.targetLineId ? lineById.get(patch.targetLineId) : null
    const hasTargetLinePatch = Boolean(targetLine)
    const hasStylePatch = patch.lineStyle != null
    const nextStyle = hasStylePatch ? normalizeLineStyle(patch.lineStyle) : null
    const hasCurvePatch = patch.isCurved != null
    const nextIsCurved = hasCurvePatch ? Boolean(patch.isCurved) : false

    let updatedCount = 0
    for (const edgeId of targetIds) {
      const edge = edgeById.get(edgeId)
      if (!edge) continue
      let changed = false

      if (hasTargetLinePatch) {
        const previous = Array.isArray(edge.sharedByLineIds) ? edge.sharedByLineIds : []
        const sameLine = previous.length === 1 && previous[0] === targetLine.id
        if (!sameLine) {
          edge.sharedByLineIds = [targetLine.id]
          changed = true
        }
      }

      if (hasStylePatch) {
        const currentLine = lineById.get(edge.sharedByLineIds?.[0])
        const baseLineStyle = normalizeLineStyle(currentLine?.style)
        const previousStyle = normalizeLineStyle(edge.lineStyleOverride || baseLineStyle)
        if (nextStyle === baseLineStyle) {
          if (edge.lineStyleOverride != null) {
            delete edge.lineStyleOverride
            changed = true
          }
        } else if (previousStyle !== nextStyle || edge.lineStyleOverride !== nextStyle) {
          edge.lineStyleOverride = nextStyle
          changed = true
        }
      }

      if (hasCurvePatch) {
        if (nextIsCurved) {
          if (!edge.isCurved) {
            edge.isCurved = true
            changed = true
          }
        } else {
          const resolved = this.resolveEditableEdgeWaypoints(edge)
          if (resolved && resolved.length >= 2) {
            const collapsed = [resolved[0], resolved[resolved.length - 1]]
            if ((edge.waypoints || []).length !== collapsed.length || edge.isCurved) {
              edge.waypoints = collapsed
              edge.isCurved = false
              changed = true
            }
          }
        }
      }

      if (patch.openingYear !== undefined) {
        const prev = edge.openingYear ?? null
        const next = patch.openingYear
        if (prev !== next) {
          edge.openingYear = next
          changed = true
        }
      }

      if (patch.phase !== undefined) {
        const prev = edge.phase ?? null
        const next = patch.phase || null
        if (prev !== next) {
          edge.phase = next
          changed = true
        }
      }

      if (changed) {
        updatedCount += 1
      }
    }

    if (!updatedCount) return { updatedCount: 0 }

    if (hasTargetLinePatch) {
      for (const line of this.project.lines) {
        line.edgeIds = []
      }
      for (const edge of this.project.edges) {
        for (const lineId of edge.sharedByLineIds || []) {
          const line = lineById.get(lineId)
          if (!line) continue
          if (!line.edgeIds.includes(edge.id)) {
            line.edgeIds.push(edge.id)
          }
        }
      }
    }

    this.recomputeStationLineMembership()
    this.touchProject(`批量更新线段: ${updatedCount} 条`)
    return { updatedCount }
  },

  deleteSelectedStations() {
    if (!this.project || !this.selectedStationIds.length) return
    const removing = new Set(this.selectedStationIds)
    this.project.stations = this.project.stations.filter((station) => !removing.has(station.id))
    this.project.manualTransfers = (this.project.manualTransfers || []).filter(
      (transfer) => !removing.has(transfer?.stationAId) && !removing.has(transfer?.stationBId),
    )
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
    const multi = Boolean(options.multi || options.toggle)
    const toggle = Boolean(options.toggle)
    if (multi) {
      const selected = new Set(this.selectedEdgeIds || [])
      if (toggle && selected.has(target.id)) {
        selected.delete(target.id)
      } else {
        selected.add(target.id)
      }
      this.setSelectedEdges([...selected], { keepStations: Boolean(options.keepStationSelection) })
    } else {
      this.setSelectedEdges([target.id], { keepStations: Boolean(options.keepStationSelection) })
    }
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
    this.selectedEdgeIds = [edge.id]
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
    this.selectedEdgeIds = [edge.id]
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
    this.selectedEdgeIds = [edge.id]
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
    this.selectedEdgeIds = [edge.id]
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
    this.selectedEdgeIds = [edge.id]
    this.selectedEdgeAnchor = null
    this.touchProject('清空线段锚点')
    return true
  },

  removeSelectedEdgeAnchor() {
    if (!this.selectedEdgeAnchor?.edgeId) return false
    return this.removeEdgeAnchor(this.selectedEdgeAnchor.edgeId, this.selectedEdgeAnchor.anchorIndex)
  },

  deleteSelectedEdge() {
    if (!this.project) return
    const selectedEdgeIds =
      Array.isArray(this.selectedEdgeIds) && this.selectedEdgeIds.length
        ? this.selectedEdgeIds
        : this.selectedEdgeId
          ? [this.selectedEdgeId]
          : []
    if (!selectedEdgeIds.length) return
    const deletingEdgeIdSet = new Set(selectedEdgeIds)
    const deletingEdges = this.project.edges.filter((edge) => deletingEdgeIdSet.has(edge.id))
    if (!deletingEdges.length) {
      this.selectedEdgeId = null
      this.selectedEdgeIds = []
      this.selectedEdgeAnchor = null
      return
    }

    this.project.edges = this.project.edges.filter((edge) => !deletingEdgeIdSet.has(edge.id))
    for (const line of this.project.lines) {
      line.edgeIds = (line.edgeIds || []).filter((edgeId) => !deletingEdgeIdSet.has(edgeId))
    }
    this.project.lines = this.project.lines.filter((line) => line.edgeIds.length > 0)
    if (!this.project.lines.length) {
      this.addLine({})
    }
    if (!this.project.lines.some((line) => line.id === this.activeLineId)) {
      this.activeLineId = this.project.lines[0]?.id || null
    }

    this.selectedEdgeId = null
    this.selectedEdgeIds = []
    this.selectedEdgeAnchor = null
    this.recomputeStationLineMembership()
    this.touchProject(`删除线段: ${deletingEdges.length} 条`)
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
    const existingEdgeIdSet = new Set(this.project.edges.map((edge) => edge.id))
    if (Array.isArray(this.selectedEdgeIds) && this.selectedEdgeIds.length) {
      this.selectedEdgeIds = this.selectedEdgeIds.filter((edgeId) => existingEdgeIdSet.has(edgeId))
    }
    if (this.selectedEdgeId && !existingEdgeIdSet.has(this.selectedEdgeId)) {
      this.selectedEdgeId = this.selectedEdgeIds.length ? this.selectedEdgeIds[this.selectedEdgeIds.length - 1] : null
      if (!this.selectedEdgeId) {
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
      this.project.manualTransfers = (this.project.manualTransfers || []).filter(
        (transfer) =>
          !removableStationIdSet.has(transfer?.stationAId) && !removableStationIdSet.has(transfer?.stationBId),
      )
      if (this.selectedStationId && removableStationIdSet.has(this.selectedStationId)) {
        this.selectedStationId = null
      }
      if (this.selectedStationIds.length) {
        this.selectedStationIds = this.selectedStationIds.filter((id) => !removableStationIdSet.has(id))
      }
      if (this.pendingEdgeStartStationId && removableStationIdSet.has(this.pendingEdgeStartStationId)) {
        this.pendingEdgeStartStationId = null
      }
      this.recomputeStationLineMembership()
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
        openingYear: this.currentEditYear,
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
    this.selectedEdgeIds = [edge.id]
    this.selectedEdgeAnchor = null
    this.touchProject('新增线段')
    return edge
  },


  moveLineUp(lineId) {
    if (!this.project) return false
    const index = this.project.lines.findIndex((l) => l.id === lineId)
    if (index <= 0) return false
    const lines = this.project.lines
    ;[lines[index - 1], lines[index]] = [lines[index], lines[index - 1]]
    this.touchProject('移动线路顺序')
    return true
  },

  moveLineDown(lineId) {
    if (!this.project) return false
    const index = this.project.lines.findIndex((l) => l.id === lineId)
    if (index === -1 || index >= this.project.lines.length - 1) return false
    const lines = this.project.lines
    ;[lines[index], lines[index + 1]] = [lines[index + 1], lines[index]]
    this.touchProject('移动线路顺序')
    return true
  },

  splitEdgeAtPoint(edgeId, lngLat) {
    if (!this.project || !Array.isArray(lngLat) || lngLat.length !== 2) return null
    const edge = this.project.edges.find((item) => item.id === edgeId)
    if (!edge) return null

    const fromStation = this.project.stations.find((station) => station.id === edge.fromStationId)
    const toStation = this.project.stations.find((station) => station.id === edge.toStationId)
    if (!fromStation || !toStation) return null

    const point = cloneLngLat(lngLat)
    if (!point) return null

    const resolvedWaypoints = this.resolveEditableEdgeWaypoints(edge)
    if (!resolvedWaypoints || resolvedWaypoints.length < 2) return null

    const insertIndex = findClosestSegmentInsertionIndex(resolvedWaypoints, point)
    if (insertIndex < 1 || insertIndex >= resolvedWaypoints.length) return null

    const nextIndex = this.project.stations.length + 1
    const newStation = {
      id: createId('station'),
      nameZh: `新站 ${nextIndex}`,
      nameEn: `Station ${nextIndex}`,
      lngLat: [...point],
      displayPos: estimateDisplayPositionFromLngLat(this.project.stations, point),
      isInterchange: false,
      underConstruction: false,
      proposed: false,
      lineIds: [...(edge.sharedByLineIds || [])],
      transferLineIds: [],
    }
    this.project.stations.push(newStation)

    const firstEdgeWaypoints = resolvedWaypoints.slice(0, insertIndex + 1)
    const secondEdgeWaypoints = resolvedWaypoints.slice(insertIndex)

    const firstEdge = {
      id: createId('edge'),
      fromStationId: edge.fromStationId,
      toStationId: newStation.id,
      waypoints: [...firstEdgeWaypoints],
      sharedByLineIds: [...(edge.sharedByLineIds || [])],
      lengthMeters: haversineDistanceMeters(fromStation.lngLat, newStation.lngLat),
      isCurved: firstEdgeWaypoints.length > 2,
    }

    const secondEdge = {
      id: createId('edge'),
      fromStationId: newStation.id,
      toStationId: edge.toStationId,
      waypoints: [...secondEdgeWaypoints],
      sharedByLineIds: [...(edge.sharedByLineIds || [])],
      lengthMeters: haversineDistanceMeters(newStation.lngLat, toStation.lngLat),
      isCurved: secondEdgeWaypoints.length > 2,
    }

    this.project.edges = this.project.edges.filter((e) => e.id !== edge.id)
    this.project.edges.push(firstEdge, secondEdge)

    const lineById = new Map(this.project.lines.map((line) => [line.id, line]))
    for (const line of this.project.lines) {
      const lineEdgeIds = line.edgeIds || []
      const edgeIndex = lineEdgeIds.indexOf(edge.id)
      if (edgeIndex !== -1) {
        const newEdgeIds = [...lineEdgeIds]
        newEdgeIds.splice(edgeIndex, 1, firstEdge.id, secondEdge.id)
        line.edgeIds = newEdgeIds
      }
    }

    if (Array.isArray(this.selectedEdgeIds)) {
      const selectedIndex = this.selectedEdgeIds.indexOf(edge.id)
      if (selectedIndex !== -1) {
        const newSelected = [...this.selectedEdgeIds]
        newSelected.splice(selectedIndex, 1, firstEdge.id)
        this.selectedEdgeIds = newSelected
      }
    }
    if (this.selectedEdgeId === edge.id) {
      this.selectedEdgeId = firstEdge.id
    }
    this.selectedEdgeAnchor = null

    this.recomputeStationLineMembership()
    this.touchProject('分割线段: 插入新站')
    return { station: newStation, edges: [firstEdge, secondEdge] }
  },

  canMergeEdgesAtStation(stationId) {
    if (!this.project) return false
    const station = this.project.stations.find((s) => s.id === stationId)
    if (!station) return false

    const connectedEdges = (this.project.edges || []).filter(
      (edge) => edge.fromStationId === stationId || edge.toStationId === stationId
    )

    if (connectedEdges.length !== 2) return false

    const [edgeA, edgeB] = connectedEdges
    const lineIdsA = new Set(edgeA.sharedByLineIds || [])
    const lineIdsB = new Set(edgeB.sharedByLineIds || [])

    for (const lineId of lineIdsA) {
      if (lineIdsB.has(lineId)) return true
    }

    return false
  },

  mergeEdgesAtStation(stationId) {
    if (!this.project) return false
    const station = this.project.stations.find((s) => s.id === stationId)
    if (!station) return false

    const connectedEdges = (this.project.edges || []).filter(
      (edge) => edge.fromStationId === stationId || edge.toStationId === stationId
    )

    if (connectedEdges.length !== 2) {
      this.statusText = '该站点不恰好连接2条线段，无法合并'
      return false
    }

    const [edgeA, edgeB] = connectedEdges
    const sharedLineIds = (edgeA.sharedByLineIds || []).filter((id) => (edgeB.sharedByLineIds || []).includes(id))

    if (sharedLineIds.length === 0) {
      this.statusText = '相连的两条线段不属于同一线路，无法合并'
      return false
    }

    let firstEdge, secondEdge, firstStationId, secondStationId
    if (edgeA.toStationId === stationId) {
      firstEdge = edgeA
      firstStationId = edgeA.fromStationId
    } else {
      firstEdge = edgeB
      firstStationId = edgeB.fromStationId
    }

    if (edgeB.fromStationId === stationId) {
      secondEdge = edgeB
      secondStationId = edgeB.toStationId
    } else {
      secondEdge = edgeA
      secondStationId = edgeA.toStationId
    }

    const firstStation = this.project.stations.find((s) => s.id === firstStationId)
    const secondStation = this.project.stations.find((s) => s.id === secondStationId)
    if (!firstStation || !secondStation) return false

    const firstWaypoints = this.resolveEditableEdgeWaypoints(firstEdge)
    const secondWaypoints = this.resolveEditableEdgeWaypoints(secondEdge)
    if (!firstWaypoints || !secondWaypoints) return false

    const mergedWaypoints = [...firstWaypoints.slice(0, -1), ...secondWaypoints.slice(1)]

    const mergedLineIds = [...new Set([...(firstEdge.sharedByLineIds || []), ...(secondEdge.sharedByLineIds || [])])]

    const mergedEdge = {
      id: createId('edge'),
      fromStationId: firstStationId,
      toStationId: secondStationId,
      waypoints: mergedWaypoints,
      sharedByLineIds: mergedLineIds,
      lengthMeters: haversineDistanceMeters(firstStation.lngLat, secondStation.lngLat),
      isCurved: mergedWaypoints.length > 2,
    }

    this.project.edges = this.project.edges.filter((e) => e.id !== firstEdge.id && e.id !== secondEdge.id)
    this.project.edges.push(mergedEdge)

    this.project.stations = this.project.stations.filter((s) => s.id !== stationId)
    this.project.manualTransfers = (this.project.manualTransfers || []).filter(
      (t) => t.stationAId !== stationId && t.stationBId !== stationId
    )

    const lineById = new Map(this.project.lines.map((line) => [line.id, line]))
    for (const line of this.project.lines) {
      const lineEdgeIds = line.edgeIds || []
      const firstIndex = lineEdgeIds.indexOf(firstEdge.id)
      const secondIndex = lineEdgeIds.indexOf(secondEdge.id)
      const hasLine = mergedLineIds.includes(line.id)

      if (hasLine && (firstIndex !== -1 || secondIndex !== -1)) {
        const newEdgeIds = lineEdgeIds.filter((id) => id !== firstEdge.id && id !== secondEdge.id)
        if (!newEdgeIds.includes(mergedEdge.id)) {
          const insertPos = Math.max(firstIndex, secondIndex)
          if (insertPos !== -1) {
            newEdgeIds.splice(insertPos, 0, mergedEdge.id)
          } else {
            newEdgeIds.push(mergedEdge.id)
          }
        }
        line.edgeIds = newEdgeIds
      } else {
        line.edgeIds = lineEdgeIds.filter((id) => id !== firstEdge.id && id !== secondEdge.id)
      }
    }

    this.project.lines = this.project.lines.filter((line) => line.edgeIds.length > 0)
    if (!this.project.lines.length) {
      this.addLine({})
    }
    if (!this.project.lines.some((line) => line.id === this.activeLineId)) {
      this.activeLineId = this.project.lines[0]?.id || null
    }

    if (this.selectedStationId === stationId) {
      this.selectedStationId = null
    }
    this.selectedStationIds = (this.selectedStationIds || []).filter((id) => id !== stationId)

    const selectedEdges = new Set(this.selectedEdgeIds || [])
    if (selectedEdges.has(firstEdge.id) || selectedEdges.has(secondEdge.id)) {
      this.selectedEdgeId = mergedEdge.id
      this.selectedEdgeIds = [mergedEdge.id]
    }
    this.selectedEdgeAnchor = null

    this.recomputeStationLineMembership()
    this.touchProject('合并相邻线段')
    return true
  },

  recomputeStationLineMembership() {
    if (!this.project) return
    const stationIds = (this.project.stations || []).map((station) => station.id)
    const stationIdSet = new Set(stationIds)
    this.project.manualTransfers = normalizeManualTransfers(this.project.manualTransfers, stationIdSet).map((transfer) => ({
      ...transfer,
      id: transfer.id || createId('transfer'),
    }))
    const stationLineSet = new Map(this.project.stations.map((station) => [station.id, new Set()]))
    const lineById = new Map(this.project.lines.map((line) => [line.id, line]))
    const edgeById = new Map(this.project.edges.map((edge) => [edge.id, edge]))
    this.selectedEdgeIds = (this.selectedEdgeIds || []).filter((edgeId) => edgeById.has(edgeId))
    if (!this.selectedEdgeId && this.selectedEdgeIds.length) {
      this.selectedEdgeId = this.selectedEdgeIds[this.selectedEdgeIds.length - 1]
    }
    if (this.selectedEdgeId && !edgeById.has(this.selectedEdgeId)) {
      this.selectedEdgeId = this.selectedEdgeIds.length ? this.selectedEdgeIds[this.selectedEdgeIds.length - 1] : null
      if (!this.selectedEdgeId) {
        this.selectedEdgeAnchor = null
      }
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

    const { effectiveLineIdsByStationId } = buildTransferEffectiveLineIds(
      stationIds,
      this.project.manualTransfers,
      stationLineSet,
    )

    for (const station of this.project.stations) {
      const hadLineMembership = Array.isArray(station.lineIds) && station.lineIds.length > 0
      const previousUnderConstruction = Boolean(station.underConstruction)
      const previousProposed = Boolean(station.proposed)
      const lineIds = [...(stationLineSet.get(station.id) || [])]
      const transferLineIds = [...(effectiveLineIdsByStationId.get(station.id) || lineIds)]
      station.lineIds = lineIds
      station.transferLineIds = transferLineIds
      station.isInterchange = transferLineIds.length > 1
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

  setCurrentEditYear(year) {
    const normalizedYear = Number.isFinite(year) ? Math.floor(Number(year)) : 2010
    this.currentEditYear = normalizedYear
  },

}

export { networkEditingActions }
