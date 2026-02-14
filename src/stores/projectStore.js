import { acceptHMRUpdate, defineStore } from 'pinia'
import { exportPersistenceActions } from './project/actions/exportPersistence'
import { historyActions } from './project/actions/history'
import { importLayoutActions } from './project/actions/importLayout'
import { lifecycleActions } from './project/actions/lifecycle'
import { networkEditingActions } from './project/actions/networkEditing'
import { selectionActions } from './project/actions/selection'

export const useProjectStore = defineStore('project', {
  state: () => ({
    project: null,
    regionBoundary: null,
    mode: 'select',
    selectedStationId: null,
    selectedStationIds: [],
    selectedEdgeId: null,
    selectedEdgeIds: [],
    selectedEdgeAnchor: null,
    pendingEdgeStartStationId: null,
    activeLineId: null,
    isImporting: false,
    isLayoutRunning: false,
    isInitialized: false,
    statusText: '',
    isStationEnglishRetranslating: false,
    stationEnglishRetranslateProgress: {
      done: 0,
      total: 0,
      percent: 0,
      message: '',
    },
    includeConstruction: false,
    includeProposed: false,
    exportStationVisibilityMode: 'all',
    history: {
      past: [],
      future: [],
      lastSnapshot: null,
      lastSnapshotHash: '',
      maxEntries: 320,
      checkpointInterval: 20,
      checkpoints: [],
      isRestoring: false,
    },
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
    selectedEdges(state) {
      if (!state.project) return []
      const selectedSet = new Set(state.selectedEdgeIds || [])
      return state.project.edges.filter((edge) => selectedSet.has(edge.id))
    },
    canUndo(state) {
      return (state.history?.past?.length || 0) > 0
    },
    canRedo(state) {
      return (state.history?.future?.length || 0) > 0
    },
  },
  actions: {
    ...historyActions,
    ...lifecycleActions,
    ...selectionActions,
    ...networkEditingActions,
    ...importLayoutActions,
    ...exportPersistenceActions,
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useProjectStore, import.meta.hot))
}
