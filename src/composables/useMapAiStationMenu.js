import { nextTick, reactive } from 'vue'
import { generateStationNameCandidates } from '../lib/ai/stationNaming'
import { fetchNearbyStationNamingContext, STATION_NAMING_RADIUS_METERS } from '../lib/osm/nearbyStationNamingContext'

/**
 * AI station naming menu state and candidate request/apply logic.
 *
 * @param {Object} deps
 * @param {import('pinia').Store} deps.store - The project store
 * @param {import('vue').Ref<HTMLElement|null>} deps.mapContainerRef - Ref to the map container element
 * @param {import('vue').Ref<HTMLElement|null>} deps.aiStationMenuRef - Ref to the AI station menu element
 * @param {() => maplibregl.Map|null} deps.getMap - Getter for the map instance
 * @param {() => void} deps.closeContextMenu - Function to close the context menu
 */
export function useMapAiStationMenu({ store, mapContainerRef, aiStationMenuRef, getMap, closeContextMenu }) {
  let aiNamingAbortController = null

  const aiStationMenu = reactive({
    visible: false,
    x: 0,
    y: 0,
    lngLat: null,
    stationId: null,
    loading: false,
    error: '',
    candidates: [],
    requestVersion: 0,
  })

  function abortAiNamingRequest() {
    if (!aiNamingAbortController) return
    aiNamingAbortController.abort(new Error('aborted'))
    aiNamingAbortController = null
  }

  function closeAiStationMenu(options = {}) {
    const shouldAbort = options.abort !== false
    if (shouldAbort) {
      abortAiNamingRequest()
    }
    aiStationMenu.visible = false
    aiStationMenu.loading = false
    aiStationMenu.error = ''
    aiStationMenu.candidates = []
    aiStationMenu.lngLat = null
    aiStationMenu.stationId = null
  }

  async function adjustAiStationMenuPosition() {
    await nextTick()
    if (!mapContainerRef.value || !aiStationMenuRef.value || !aiStationMenu.visible) return
    const containerRect = mapContainerRef.value.getBoundingClientRect()
    const menuRect = aiStationMenuRef.value.getBoundingClientRect()
    const padding = 8
    const maxX = Math.max(padding, containerRect.width - menuRect.width - padding)
    const maxY = Math.max(padding, containerRect.height - menuRect.height - padding)
    aiStationMenu.x = Math.max(padding, Math.min(aiStationMenu.x, maxX))
    aiStationMenu.y = Math.max(padding, Math.min(aiStationMenu.y, maxY))
  }

  function openAiStationMenu({ x, y, lngLat, stationId }) {
    abortAiNamingRequest()
    aiStationMenu.visible = true
    aiStationMenu.x = Number.isFinite(x) ? x : 0
    aiStationMenu.y = Number.isFinite(y) ? y : 0
    aiStationMenu.lngLat = Array.isArray(lngLat) ? [...lngLat] : null
    aiStationMenu.stationId = stationId || null
    aiStationMenu.loading = true
    aiStationMenu.error = ''
    aiStationMenu.candidates = []
    aiStationMenu.requestVersion += 1
    adjustAiStationMenuPosition()
  }

  async function requestAiCandidatesForStation({ lngLat, stationId, screenPoint } = {}) {
    if (!Array.isArray(lngLat) || lngLat.length !== 2 || !stationId) return
    const map = getMap()

    store.setSelectedStations([stationId])
    const projected = map ? map.project(lngLat) : { x: 0, y: 0 }
    const x = Number.isFinite(screenPoint?.x) ? screenPoint.x : projected.x
    const y = Number.isFinite(screenPoint?.y) ? screenPoint.y : projected.y

    openAiStationMenu({ x, y, lngLat, stationId })
    const requestVersion = aiStationMenu.requestVersion
    const controller = new AbortController()
    aiNamingAbortController = controller

    try {
      store.statusText = `AI点站：正在采集周边 ${STATION_NAMING_RADIUS_METERS}m OSM 要素...`
      const namingContext = await fetchNearbyStationNamingContext(lngLat, {
        radiusMeters: STATION_NAMING_RADIUS_METERS,
        signal: controller.signal,
      })

      if (controller.signal.aborted || requestVersion !== aiStationMenu.requestVersion) return

      store.statusText = 'AI点站：正在调用 LLM 生成候选站名...'
      const candidates = await generateStationNameCandidates({
        context: namingContext,
        lngLat,
        signal: controller.signal,
      })

      if (controller.signal.aborted || requestVersion !== aiStationMenu.requestVersion) return

      aiStationMenu.loading = false
      aiStationMenu.error = ''
      aiStationMenu.candidates = candidates
      store.statusText = `AI点站：已生成 ${candidates.length} 个候选，请在菜单中选择`
      adjustAiStationMenuPosition()
    } catch (error) {
      if (controller.signal.aborted || requestVersion !== aiStationMenu.requestVersion) return
      const message = String(error?.message || '未知错误')
      aiStationMenu.loading = false
      aiStationMenu.candidates = []
      aiStationMenu.error = message
      store.statusText = `AI点站失败: ${message}`
      adjustAiStationMenuPosition()
    } finally {
      if (aiNamingAbortController === controller) {
        aiNamingAbortController = null
      }
    }
  }

  async function addAiStationAt(lngLat, screenPoint) {
    if (!Array.isArray(lngLat) || lngLat.length !== 2) return
    const station = store.addStationAt([...lngLat])
    if (!station?.id) return
    await requestAiCandidatesForStation({
      lngLat: [...lngLat],
      stationId: station.id,
      screenPoint,
    })
  }

  function addAiStationAtContext(contextMenu) {
    if (!contextMenu.lngLat) return
    const lngLat = [...contextMenu.lngLat]
    const screenPoint = { x: contextMenu.x, y: contextMenu.y }
    closeContextMenu()
    void addAiStationAt(lngLat, screenPoint)
  }

  function applyAiStationCandidate(candidate) {
    if (!aiStationMenu.stationId || !candidate) return
    store.updateStationName(aiStationMenu.stationId, {
      nameZh: candidate.nameZh,
      nameEn: candidate.nameEn,
    })
    store.setSelectedStations([aiStationMenu.stationId])
    store.statusText = `AI点站命名已应用: ${candidate.nameZh}`
    closeAiStationMenu({ abort: false })
  }

  function retryAiStationNamingFromMenu() {
    if (!aiStationMenu.stationId || !aiStationMenu.lngLat) return
    void requestAiCandidatesForStation({
      lngLat: [...aiStationMenu.lngLat],
      stationId: aiStationMenu.stationId,
      screenPoint: { x: aiStationMenu.x, y: aiStationMenu.y },
    })
  }

  function aiRenameContextStationFromContext(contextStation, contextMenu) {
    if (!contextStation?.id || !Array.isArray(contextStation.lngLat)) return
    const stationId = contextStation.id
    const lngLat = [...contextStation.lngLat]
    const screenPoint = { x: contextMenu.x, y: contextMenu.y }
    closeContextMenu()
    void requestAiCandidatesForStation({ lngLat, stationId, screenPoint })
  }

  function onAiMenuOverlayMouseDown(event) {
    if (event.button !== 0 && event.button !== 2) return
    closeAiStationMenu()
  }

  function destroy() {
    abortAiNamingRequest()
  }

  return {
    aiStationMenu,
    STATION_NAMING_RADIUS_METERS,
    closeAiStationMenu,
    adjustAiStationMenuPosition,
    openAiStationMenu,
    requestAiCandidatesForStation,
    addAiStationAt,
    addAiStationAtContext,
    applyAiStationCandidate,
    retryAiStationNamingFromMenu,
    aiRenameContextStationFromContext,
    onAiMenuOverlayMouseDown,
    abortAiNamingRequest,
    destroy,
  }
}
