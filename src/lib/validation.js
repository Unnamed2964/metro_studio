/**
 * Data validation and repair utilities for RailProject.
 *
 * validateProject() performs structural integrity checks and returns
 * a list of issues. repairProject() returns a deep-cloned project
 * with common issues auto-fixed.
 */

// ─── helpers ────────────────────────────────────────────────────────

/**
 * @param {unknown} value
 * @returns {value is [number, number]}
 */
function isValidLngLat(value) {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  )
}

/**
 * Collect duplicate IDs from an array of objects with `.id`.
 * Returns a Map<id, count> for IDs that appear more than once.
 * @param {Array<{id: string}>} items
 * @returns {Map<string, number>}
 */
function findDuplicateIds(items) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const item of items) {
    counts.set(item.id, (counts.get(item.id) || 0) + 1)
  }
  for (const [id, count] of counts) {
    if (count <= 1) counts.delete(id)
  }
  return counts
}

// ─── validateProject ────────────────────────────────────────────────

/**
 * Validates a RailProject and returns issues found.
 * @param {import('./projectModel').RailProject} project
 * @returns {{
 *   issues: Array<{type: string, severity: 'error'|'warning', message: string, ids: string[]}>,
 *   isValid: boolean
 * }}
 */
export function validateProject(project) {
  /** @type {Array<{type: string, severity: 'error'|'warning', message: string, ids: string[]}>} */
  const issues = []

  if (!project) {
    issues.push({
      type: 'NULL_PROJECT',
      severity: 'error',
      message: '工程对象为空',
      ids: [],
    })
    return { issues, isValid: false }
  }

  const stationIds = new Set(project.stations.map((s) => s.id))
  const edgeIds = new Set(project.edges.map((e) => e.id))

  // ── duplicate IDs ──────────────────────────────────────────────

  const dupStations = findDuplicateIds(project.stations)
  for (const [id, count] of dupStations) {
    issues.push({
      type: 'DUPLICATE_STATION_ID',
      severity: 'error',
      message: `站点 ID "${id}" 重复出现 ${count} 次`,
      ids: [id],
    })
  }

  const dupEdges = findDuplicateIds(project.edges)
  for (const [id, count] of dupEdges) {
    issues.push({
      type: 'DUPLICATE_EDGE_ID',
      severity: 'error',
      message: `线段 ID "${id}" 重复出现 ${count} 次`,
      ids: [id],
    })
  }

  const dupLines = findDuplicateIds(project.lines)
  for (const [id, count] of dupLines) {
    issues.push({
      type: 'DUPLICATE_LINE_ID',
      severity: 'error',
      message: `线路 ID "${id}" 重复出现 ${count} 次`,
      ids: [id],
    })
  }

  // ── edge checks ────────────────────────────────────────────────

  for (const edge of project.edges) {
    // dangling station references
    const missingFrom = !stationIds.has(edge.fromStationId)
    const missingTo = !stationIds.has(edge.toStationId)
    if (missingFrom || missingTo) {
      const missing = []
      if (missingFrom) missing.push(edge.fromStationId)
      if (missingTo) missing.push(edge.toStationId)
      issues.push({
        type: 'EDGE_DANGLING_STATION',
        severity: 'error',
        message: `线段 "${edge.id}" 引用了不存在的站点: ${missing.join(', ')}`,
        ids: [edge.id, ...missing],
      })
    }

    // self-loop
    if (edge.fromStationId === edge.toStationId) {
      issues.push({
        type: 'EDGE_SELF_LOOP',
        severity: 'error',
        message: `线段 "${edge.id}" 的起止站相同 (${edge.fromStationId})`,
        ids: [edge.id, edge.fromStationId],
      })
    }
  }

  // ── line checks ────────────────────────────────────────────────

  for (const line of project.lines) {
    const danglingEdgeIds = line.edgeIds.filter((eid) => !edgeIds.has(eid))
    if (danglingEdgeIds.length > 0) {
      issues.push({
        type: 'LINE_DANGLING_EDGE',
        severity: 'error',
        message: `线路 "${line.nameZh}" (${line.id}) 引用了 ${danglingEdgeIds.length} 条不存在的线段`,
        ids: [line.id, ...danglingEdgeIds],
      })
    }

    if (line.edgeIds.length === 0) {
      issues.push({
        type: 'LINE_EMPTY_EDGES',
        severity: 'warning',
        message: `线路 "${line.nameZh}" (${line.id}) 没有任何线段`,
        ids: [line.id],
      })
    }
  }

  // ── manualTransfers checks ─────────────────────────────────────

  for (const transfer of project.manualTransfers) {
    const missingStations = []
    if (!stationIds.has(transfer.stationAId)) missingStations.push(transfer.stationAId)
    if (!stationIds.has(transfer.stationBId)) missingStations.push(transfer.stationBId)
    if (missingStations.length > 0) {
      issues.push({
        type: 'TRANSFER_DANGLING_STATION',
        severity: 'error',
        message: `手动换乘 "${transfer.id}" 引用了不存在的站点: ${missingStations.join(', ')}`,
        ids: [transfer.id, ...missingStations],
      })
    }
  }

  // ── station checks ─────────────────────────────────────────────

  // Build a set of all stations referenced by at least one edge
  const referencedStationIds = new Set()
  for (const edge of project.edges) {
    referencedStationIds.add(edge.fromStationId)
    referencedStationIds.add(edge.toStationId)
  }

  for (const station of project.stations) {
    // invalid lngLat
    if (!isValidLngLat(station.lngLat)) {
      issues.push({
        type: 'STATION_INVALID_LNGLAT',
        severity: 'error',
        message: `站点 "${station.nameZh}" (${station.id}) 的 lngLat 无效: ${JSON.stringify(station.lngLat)}`,
        ids: [station.id],
      })
    }

    // orphan station
    if (!referencedStationIds.has(station.id)) {
      issues.push({
        type: 'STATION_ORPHAN',
        severity: 'warning',
        message: `站点 "${station.nameZh}" (${station.id}) 未被任何线段引用`,
        ids: [station.id],
      })
    }
  }

  return {
    issues,
    isValid: issues.every((i) => i.severity !== 'error'),
  }
}

// ─── repairProject ──────────────────────────────────────────────────

/**
 * Attempts to auto-fix common issues in a project.
 * Returns a new project object (does not mutate input).
 * @param {import('./projectModel').RailProject} project
 * @returns {{ project: import('./projectModel').RailProject, fixCount: number, fixes: string[] }}
 */
export function repairProject(project) {
  // Deep clone to avoid mutation
  const p = JSON.parse(JSON.stringify(project))
  /** @type {string[]} */
  const fixes = []

  // ── 1. Deduplicate station IDs (keep first occurrence) ─────────

  {
    const seen = new Set()
    const before = p.stations.length
    p.stations = p.stations.filter((s) => {
      if (seen.has(s.id)) return false
      seen.add(s.id)
      return true
    })
    const removed = before - p.stations.length
    if (removed > 0) {
      fixes.push(`移除了 ${removed} 个重复站点`)
    }
  }

  // ── 2. Deduplicate edge IDs (keep first occurrence) ────────────

  {
    const seen = new Set()
    const before = p.edges.length
    p.edges = p.edges.filter((e) => {
      if (seen.has(e.id)) return false
      seen.add(e.id)
      return true
    })
    const removed = before - p.edges.length
    if (removed > 0) {
      fixes.push(`移除了 ${removed} 条重复线段`)
    }
  }

  // ── 3. Deduplicate line IDs (keep first occurrence) ────────────

  {
    const seen = new Set()
    const before = p.lines.length
    p.lines = p.lines.filter((l) => {
      if (seen.has(l.id)) return false
      seen.add(l.id)
      return true
    })
    const removed = before - p.lines.length
    if (removed > 0) {
      fixes.push(`移除了 ${removed} 条重复线路`)
    }
  }

  // ── 4. Fix invalid station lngLat ──────────────────────────────

  {
    let count = 0
    for (const station of p.stations) {
      if (!isValidLngLat(station.lngLat)) {
        station.lngLat = [0, 0]
        count++
      }
    }
    if (count > 0) {
      fixes.push(`修复了 ${count} 个站点的无效坐标 (重置为 [0, 0])`)
    }
  }

  // Rebuild station ID set after dedup
  const stationIds = new Set(p.stations.map((s) => s.id))

  // ── 5. Remove self-loop edges ──────────────────────────────────

  {
    const before = p.edges.length
    p.edges = p.edges.filter((e) => e.fromStationId !== e.toStationId)
    const removed = before - p.edges.length
    if (removed > 0) {
      fixes.push(`移除了 ${removed} 条自环线段`)
    }
  }

  // ── 6. Remove edges referencing non-existent stations ──────────

  {
    const before = p.edges.length
    p.edges = p.edges.filter((e) => {
      return stationIds.has(e.fromStationId) && stationIds.has(e.toStationId)
    })
    const removed = before - p.edges.length
    if (removed > 0) {
      fixes.push(`移除了 ${removed} 条引用不存在站点的线段`)
    }
  }

  // Rebuild edge ID set after filtering
  const edgeIds = new Set(p.edges.map((e) => e.id))

  // ── 7. Remove non-existent edge IDs from lines ────────────────

  {
    let totalRemoved = 0
    for (const line of p.lines) {
      const before = line.edgeIds.length
      line.edgeIds = line.edgeIds.filter((eid) => edgeIds.has(eid))
      totalRemoved += before - line.edgeIds.length
    }
    if (totalRemoved > 0) {
      fixes.push(`从线路中移除了 ${totalRemoved} 个不存在的线段引用`)
    }
  }

  // ── 8. Remove manualTransfers with non-existent stations ───────

  {
    const before = p.manualTransfers.length
    p.manualTransfers = p.manualTransfers.filter((t) => {
      return stationIds.has(t.stationAId) && stationIds.has(t.stationBId)
    })
    const removed = before - p.manualTransfers.length
    if (removed > 0) {
      fixes.push(`移除了 ${removed} 条引用不存在站点的手动换乘`)
    }
  }

  return {
    project: p,
    fixCount: fixes.length,
    fixes,
  }
}
