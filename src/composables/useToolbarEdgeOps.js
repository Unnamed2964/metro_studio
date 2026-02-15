import { computed, reactive, watch } from 'vue'
import { useProjectStore } from '../stores/projectStore'

/**
 * Composable for edge-related operations in the toolbar:
 * edge batch form, edge property updates, line reassignment.
 *
 * @returns Reactive state and methods for edge operations
 */
export function useToolbarEdgeOps() {
  const store = useProjectStore()

  const edgeBatchForm = reactive({
    targetLineId: '',
    lineStyle: '',
    curveMode: 'keep',
  })

  const selectedEdgeCount = computed(() => store.selectedEdgeIds.length)

  const selectedEdges = computed(() => {
    if (!store.project || !store.selectedEdgeIds.length) return []
    const edgeMap = new Map(store.project.edges.map((edge) => [edge.id, edge]))
    return store.selectedEdgeIds.map((edgeId) => edgeMap.get(edgeId)).filter(Boolean)
  })

  const selectedEdge = computed(() => {
    if (!store.project || !store.selectedEdgeIds.length) return null
    const primaryEdgeId = store.selectedEdgeId || store.selectedEdgeIds[store.selectedEdgeIds.length - 1]
    return store.project.edges.find((edge) => edge.id === primaryEdgeId) || null
  })

  const selectedEdgeStations = computed(() => {
    if (!selectedEdge.value || !store.project) {
      return { from: null, to: null }
    }
    const stationMap = new Map(store.project.stations.map((station) => [station.id, station]))
    return {
      from: stationMap.get(selectedEdge.value.fromStationId) || null,
      to: stationMap.get(selectedEdge.value.toStationId) || null,
    }
  })

  const selectedEdgeLines = computed(() => {
    if (!selectedEdge.value || !store.project) return []
    const lineMap = new Map(store.project.lines.map((line) => [line.id, line]))
    return (selectedEdge.value.sharedByLineIds || []).map((lineId) => lineMap.get(lineId)).filter(Boolean)
  })

  const edgeReassignTargets = computed(() => store.project?.lines || [])

  const edgeSelectionCanApplyBatch = computed(
    () => selectedEdgeCount.value > 0 && (Boolean(edgeBatchForm.targetLineId) || Boolean(edgeBatchForm.lineStyle) || edgeBatchForm.curveMode !== 'keep'),
  )

  // Auto-select a sensible default target line when edge selection or lines change
  watch(
    [selectedEdges, () => store.project?.lines],
    ([edges]) => {
      const lines = store.project?.lines || []
      if (!edges?.length || !lines.length) {
        edgeBatchForm.targetLineId = ''
        resetEdgeBatchForm()
        return
      }

      const currentLineIds = new Set(
        edges.flatMap((edge) => (edge.sharedByLineIds || []).map((lineId) => String(lineId))),
      )
      const targetStillAvailable = lines.some((line) => line.id === edgeBatchForm.targetLineId)
      if (targetStillAvailable) return

      const preferred = lines.find((line) => !currentLineIds.has(String(line.id)))
      if (preferred) {
        edgeBatchForm.targetLineId = preferred.id
        return
      }
      edgeBatchForm.targetLineId = lines[0].id
    },
    { immediate: true },
  )

  function applySelectedEdgesBatch() {
    const edgeIds = store.selectedEdgeIds || []
    if (!edgeIds.length) return

    const patch = {}
    if (edgeBatchForm.targetLineId) {
      patch.targetLineId = edgeBatchForm.targetLineId
    }
    if (edgeBatchForm.lineStyle) {
      patch.lineStyle = edgeBatchForm.lineStyle
    }
    if (edgeBatchForm.curveMode === 'curved') {
      patch.isCurved = true
    } else if (edgeBatchForm.curveMode === 'straight') {
      patch.isCurved = false
    }

    if (!Object.keys(patch).length) {
      store.statusText = '请先选择至少一个批量变更项'
      return
    }

    const { updatedCount } = store.updateEdgesBatch(edgeIds, patch)
    if (!updatedCount) {
      store.statusText = '所选线段未发生变化'
      return
    }
    store.statusText = `已批量更新 ${updatedCount} 条线段`
  }

  function resetEdgeBatchForm() {
    edgeBatchForm.targetLineId = ''
    edgeBatchForm.lineStyle = ''
    edgeBatchForm.curveMode = 'keep'
  }

  function deleteSelectedEdge() {
    store.deleteSelectedEdge()
  }

  return {
    edgeBatchForm,
    selectedEdgeCount,
    selectedEdges,
    selectedEdge,
    selectedEdgeStations,
    selectedEdgeLines,
    edgeReassignTargets,
    edgeSelectionCanApplyBatch,
    applySelectedEdgesBatch,
    resetEdgeBatchForm,
    deleteSelectedEdge,
  }
}
