import { normalizeProject } from '../../../lib/projectModel'

function cloneHistorySnapshot(store) {
  return {
    project: JSON.parse(JSON.stringify(store.project || null)),
    mode: store.mode,
    selectedStationId: store.selectedStationId,
    selectedStationIds: [...(store.selectedStationIds || [])],
    selectedEdgeId: store.selectedEdgeId,
    selectedEdgeIds: [...(store.selectedEdgeIds || [])],
    selectedEdgeAnchor: store.selectedEdgeAnchor ? { ...store.selectedEdgeAnchor } : null,
    pendingEdgeStartStationId: store.pendingEdgeStartStationId,
    activeLineId: store.activeLineId,
  }
}

function snapshotHash(snapshot) {
  return JSON.stringify(snapshot)
}

function applyHistorySnapshot(store, snapshot) {
  const safeProject = normalizeProject(snapshot?.project || null)
  store.project = safeProject
  store.mode = snapshot?.mode || 'select'
  store.selectedStationId = snapshot?.selectedStationId || null
  store.selectedStationIds = Array.isArray(snapshot?.selectedStationIds) ? [...snapshot.selectedStationIds] : []
  store.selectedEdgeId = snapshot?.selectedEdgeId || null
  store.selectedEdgeIds = Array.isArray(snapshot?.selectedEdgeIds) ? [...snapshot.selectedEdgeIds] : []
  store.selectedEdgeAnchor = snapshot?.selectedEdgeAnchor ? { ...snapshot.selectedEdgeAnchor } : null
  store.pendingEdgeStartStationId = snapshot?.pendingEdgeStartStationId || null
  store.activeLineId = snapshot?.activeLineId || safeProject.lines?.[0]?.id || null
  store.recomputeStationLineMembership()
}

const historyActions = {
  resetHistoryBaseline() {
    const snapshot = cloneHistorySnapshot(this)
    this.history.past = []
    this.history.future = []
    this.history.checkpoints = []
    this.history.lastSnapshot = snapshot
    this.history.lastSnapshotHash = snapshotHash(snapshot)
    this.history.isRestoring = false
  },

  recordHistory(label = '') {
    if (!this.project || this.history.isRestoring) return
    const current = cloneHistorySnapshot(this)
    const currentHash = snapshotHash(current)
    if (!this.history.lastSnapshotHash) {
      this.history.lastSnapshot = current
      this.history.lastSnapshotHash = currentHash
      return
    }
    if (currentHash === this.history.lastSnapshotHash) {
      return
    }

    const normalizedLabel = String(label || '').trim() || '连续编辑'
    const now = Date.now()
    const previousSnapshot = this.history.lastSnapshot
    const lastEntry = this.history.past[this.history.past.length - 1]
    const canMergeContinuous =
      normalizedLabel === '连续编辑' &&
      lastEntry?.label === '连续编辑' &&
      Number.isFinite(lastEntry?.timestamp) &&
      now - lastEntry.timestamp < 900

    if (canMergeContinuous) {
      lastEntry.after = current
      lastEntry.timestamp = now
      this.history.lastSnapshot = current
      this.history.lastSnapshotHash = currentHash
      this.history.future = []
      return
    }

    const entry = {
      label: normalizedLabel,
      timestamp: now,
      before: previousSnapshot,
      after: current,
    }
    this.history.past.push(entry)
    this.history.future = []

    const interval = Number(this.history.checkpointInterval) || 20
    if (this.history.past.length % interval === 0) {
      this.history.checkpoints.push({
        at: this.history.past.length,
        snapshot: current,
      })
    }

    const maxEntries = Number(this.history.maxEntries) || 320
    if (this.history.past.length > maxEntries) {
      const removeCount = this.history.past.length - maxEntries
      this.history.past.splice(0, removeCount)
      this.history.checkpoints = this.history.checkpoints
        .map((checkpoint) => ({
          at: checkpoint.at - removeCount,
          snapshot: checkpoint.snapshot,
        }))
        .filter((checkpoint) => checkpoint.at > 0)
    }

    this.history.lastSnapshot = current
    this.history.lastSnapshotHash = currentHash
  },

  undo() {
    if (!this.history.past.length) return false
    const entry = this.history.past.pop()
    this.history.isRestoring = true
    try {
      applyHistorySnapshot(this, entry.before)
      this.history.future.push(entry)
      this.history.lastSnapshot = entry.before
      this.history.lastSnapshotHash = snapshotHash(entry.before)
      this.statusText = `已撤销：${entry.label}`
      this.schedulePersist()
    } finally {
      this.history.isRestoring = false
    }
    return true
  },

  redo() {
    if (!this.history.future.length) return false
    const entry = this.history.future.pop()
    this.history.isRestoring = true
    try {
      applyHistorySnapshot(this, entry.after)
      this.history.past.push(entry)
      this.history.lastSnapshot = entry.after
      this.history.lastSnapshotHash = snapshotHash(entry.after)
      this.statusText = `已重做：${entry.label}`
      this.schedulePersist()
    } finally {
      this.history.isRestoring = false
    }
    return true
  },
}

export { historyActions }

