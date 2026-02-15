import { computed, reactive, watch } from 'vue'
import { useProjectStore } from '../stores/projectStore'

/**
 * Composable for station-related operations in the toolbar:
 * station form state, rename, batch rename, delete, select all,
 * manual transfer, AI retranslation, and selection computeds.
 *
 * @returns Reactive state and methods for station operations
 */
export function useToolbarStationOps() {
  const store = useProjectStore()

  const stationForm = reactive({
    nameZh: '',
    nameEn: '',
  })

  const stationBatchForm = reactive({
    zhTemplate: '',
    enTemplate: '',
    startIndex: 1,
  })

  const selectedStationCount = computed(() => store.selectedStationIds.length)

  const selectedStationsInOrder = computed(() => {
    if (!store.project) return []
    const stationMap = new Map(store.project.stations.map((station) => [station.id, station]))
    return (store.selectedStationIds || []).map((id) => stationMap.get(id)).filter(Boolean)
  })

  const selectedStation = computed(() => {
    if (!store.project || !store.selectedStationId) return null
    return store.project.stations.find((station) => station.id === store.selectedStationId) || null
  })

  const stationEnglishRetranslateProgress = computed(() => store.stationEnglishRetranslateProgress || {
    done: 0,
    total: 0,
    percent: 0,
    message: '',
  })

  const canEditSelectedManualTransfer = computed(() => selectedStationCount.value === 2)

  const selectedManualTransferExists = computed(() => {
    if (!canEditSelectedManualTransfer.value) return false
    const [stationAId, stationBId] = store.selectedStationIds
    return store.hasManualTransferBetweenStations(stationAId, stationBId)
  })

  // Sync stationForm when selected station changes
  watch(
    selectedStation,
    (station) => {
      stationForm.nameZh = station?.nameZh || ''
      stationForm.nameEn = station?.nameEn || ''
    },
    { immediate: true },
  )

  function applyStationRename() {
    if (!selectedStation.value) return
    store.updateStationName(selectedStation.value.id, {
      nameZh: stationForm.nameZh,
      nameEn: stationForm.nameEn,
    })
  }

  function applyBatchStationRename() {
    store.renameSelectedStationsByTemplate({
      zhTemplate: stationBatchForm.zhTemplate,
      enTemplate: stationBatchForm.enTemplate,
      startIndex: stationBatchForm.startIndex,
    })
  }

  function deleteSelectedStations() {
    store.deleteSelectedStations()
  }

  function selectAllStations() {
    store.selectAllStations()
  }

  async function retranslateAllStationEnglishNames() {
    await store.retranslateAllStationEnglishNamesWithAi()
  }

  async function retranslateSelectedStationEnglishNames() {
    await store.retranslateSelectedStationEnglishNamesWithAi()
  }

  function addManualTransferForSelectedStations() {
    store.addManualTransferForSelectedStations()
  }

  function removeManualTransferForSelectedStations() {
    store.removeManualTransferForSelectedStations()
  }

  return {
    stationForm,
    stationBatchForm,
    selectedStationCount,
    selectedStationsInOrder,
    selectedStation,
    stationEnglishRetranslateProgress,
    canEditSelectedManualTransfer,
    selectedManualTransferExists,
    applyStationRename,
    applyBatchStationRename,
    deleteSelectedStations,
    selectAllStations,
    retranslateAllStationEnglishNames,
    retranslateSelectedStationEnglishNames,
    addManualTransferForSelectedStations,
    removeManualTransferForSelectedStations,
  }
}
