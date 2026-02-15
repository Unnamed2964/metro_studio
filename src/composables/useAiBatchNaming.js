import { computed, onBeforeUnmount, reactive } from 'vue'
import { generateStationNameCandidates } from '../lib/ai/stationNaming'
import { fetchNearbyStationNamingContext, STATION_NAMING_RADIUS_METERS } from '../lib/osm/nearbyStationNamingContext'
import { useProjectStore } from '../stores/projectStore'

export function useAiBatchNaming() {
  const store = useProjectStore()

  let abortController = null

  const state = reactive({
    active: false,
    phase: 'idle',
    generating: false,
    stationIds: [],
    stationEntries: [],
    currentIndex: 0,
    error: '',
    prefetchedCount: 0,
    prefetchFailedCount: 0,
    appliedCount: 0,
    skippedCount: 0,
  })

  const currentStation = computed(() => {
    if (!state.active || !store.project) return null
    const stationId = state.stationIds[state.currentIndex]
    if (!stationId) return null
    return store.project.stations.find((s) => s.id === stationId) || null
  })

  const currentEntry = computed(() => {
    if (!state.active) return null
    const stationId = state.stationIds[state.currentIndex]
    if (!stationId) return null
    return state.stationEntries.find((e) => e.stationId === stationId) || null
  })

  const currentCandidates = computed(() =>
    Array.isArray(currentEntry.value?.candidates) ? currentEntry.value.candidates : [],
  )

  const currentError = computed(() => String(currentEntry.value?.error || '').trim())

  const total = computed(() => state.stationIds.length)

  const prefetchPercent = computed(() => {
    if (!total.value) return 0
    return Math.round((state.prefetchedCount / total.value) * 100)
  })

  const selectPercent = computed(() => {
    if (!total.value) return 0
    const finished = state.appliedCount + state.skippedCount
    return Math.round((finished / total.value) * 100)
  })

  const progressPercent = computed(() =>
    state.phase === 'prefetch' ? prefetchPercent.value : selectPercent.value,
  )

  function isAbortError(error) {
    const message = String(error?.message || '').toLowerCase()
    return error?.name === 'AbortError' || message.includes('aborted') || message.includes('abort')
  }

  function abortRequest() {
    if (!abortController) return
    abortController.abort(new Error('aborted'))
    abortController = null
  }

  function findStationById(stationId) {
    if (!store.project || !stationId) return null
    return store.project.stations.find((s) => s.id === stationId) || null
  }

  function findEntry(stationId) {
    if (!stationId) return null
    return state.stationEntries.find((e) => e.stationId === stationId) || null
  }

  function reset() {
    abortRequest()
    state.active = false
    state.phase = 'idle'
    state.generating = false
    state.stationIds = []
    state.stationEntries = []
    state.currentIndex = 0
    state.error = ''
    state.prefetchedCount = 0
    state.prefetchFailedCount = 0
    state.appliedCount = 0
    state.skippedCount = 0
  }

  async function requestCandidatesForStation(stationId, { signal } = {}) {
    const station = findStationById(stationId)
    if (!station || !Array.isArray(station.lngLat)) {
      throw new Error('当前站点不存在或坐标无效')
    }
    const context = await fetchNearbyStationNamingContext(station.lngLat, {
      radiusMeters: STATION_NAMING_RADIUS_METERS,
      signal,
    })
    const candidates = await generateStationNameCandidates({
      context,
      lngLat: station.lngLat,
      signal,
    })
    if (!Array.isArray(candidates) || !candidates.length) {
      throw new Error('未生成候选站名')
    }
    return { station, candidates }
  }

  async function prefetchAll() {
    const count = state.stationIds.length
    if (!count) return

    abortRequest()
    const controller = new AbortController()
    abortController = controller

    state.phase = 'prefetch'
    state.generating = true
    state.error = ''
    state.prefetchedCount = 0
    state.prefetchFailedCount = 0
    store.statusText = `AI批量命名：正在为 ${count} 个站点批量生成候选...`

    try {
      for (let i = 0; i < count; i += 1) {
        if (controller.signal.aborted) return
        const stationId = state.stationIds[i]
        const entry = findEntry(stationId)
        if (entry) {
          entry.status = 'pending'
          entry.error = ''
          entry.candidates = []
        }
        try {
          const { station, candidates } = await requestCandidatesForStation(stationId, {
            signal: controller.signal,
          })
          if (controller.signal.aborted) return
          if (entry) {
            entry.status = 'ready'
            entry.error = ''
            entry.candidates = candidates
          }
          const displayName = station.nameZh || station.id
          store.statusText = `AI批量命名：候选生成 ${state.prefetchedCount + 1}/${count} · ${displayName}`
        } catch (error) {
          if (controller.signal.aborted || isAbortError(error)) return
          const message = String(error?.message || '生成失败')
          if (entry) {
            entry.status = 'failed'
            entry.error = message
            entry.candidates = []
          }
          state.prefetchFailedCount += 1
        } finally {
          if (!controller.signal.aborted) {
            state.prefetchedCount += 1
          }
        }
      }
    } finally {
      if (abortController === controller) {
        abortController = null
      }
      if (controller.signal.aborted) return
      state.generating = false
      state.phase = 'select'
    }

    const successCount = state.stationEntries.filter(
      (e) => e.status === 'ready' && e.candidates.length > 0,
    ).length
    if (!successCount) {
      state.error = '所有站点候选生成失败，请重试或结束批量命名'
      store.statusText = 'AI批量命名：候选已全部生成，但均失败'
      return
    }
    state.error = ''
    store.statusText = `AI批量命名：候选已全部生成，成功 ${successCount}/${count}，请逐站选择`
  }

  function moveToNext() {
    state.currentIndex += 1
    if (state.currentIndex >= state.stationIds.length) {
      const applied = state.appliedCount
      const skipped = state.skippedCount
      store.statusText = `AI批量命名完成：已应用 ${applied}/${total.value}，跳过 ${skipped}`
      reset()
      return
    }
    const station = currentStation.value
    const entry = currentEntry.value
    if (!station) return
    if (entry?.status === 'ready' && currentCandidates.value.length) {
      store.statusText = `AI批量命名：请为 ${station.nameZh || station.id} 选择候选站名`
      return
    }
    store.statusText = `AI批量命名：${station.nameZh || station.id} 暂无可用候选，请重试或跳过`
  }

  async function start(stations) {
    if (!stations.length) return
    state.active = true
    state.phase = 'prefetch'
    state.generating = false
    state.stationIds = stations.map((s) => s.id)
    state.stationEntries = state.stationIds.map((stationId) => ({
      stationId,
      status: 'pending',
      candidates: [],
      error: '',
    }))
    state.currentIndex = 0
    state.error = ''
    state.prefetchedCount = 0
    state.prefetchFailedCount = 0
    state.appliedCount = 0
    state.skippedCount = 0
    await prefetchAll()
  }

  async function retryCurrent() {
    if (!state.active || state.phase !== 'select' || state.generating) return
    const station = currentStation.value
    if (!station) return
    const entry = findEntry(station.id)
    if (!entry) return

    abortRequest()
    const controller = new AbortController()
    abortController = controller
    state.generating = true
    state.error = ''
    entry.status = 'pending'
    entry.error = ''
    entry.candidates = []

    try {
      const { candidates } = await requestCandidatesForStation(station.id, {
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      entry.status = 'ready'
      entry.error = ''
      entry.candidates = candidates
      store.statusText = `AI批量命名：已为 ${station.nameZh || station.id} 生成 ${candidates.length} 个候选`
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return
      const message = String(error?.message || '生成失败')
      entry.status = 'failed'
      entry.error = message
      entry.candidates = []
      state.error = message
      store.statusText = `AI批量命名失败: ${message}`
    } finally {
      if (abortController === controller) {
        abortController = null
      }
      state.generating = false
    }
  }

  function skipCurrent() {
    if (!state.active || state.phase !== 'select' || state.generating) return
    state.skippedCount += 1
    moveToNext()
  }

  function applyCandidate(candidate) {
    if (!candidate || !currentStation.value || state.phase !== 'select' || state.generating) return
    const station = currentStation.value
    store.updateStationName(station.id, {
      nameZh: candidate.nameZh,
      nameEn: candidate.nameEn,
    })
    state.appliedCount += 1
    moveToNext()
  }

  function cancel() {
    reset()
    store.statusText = '已取消 AI 批量命名'
  }

  onBeforeUnmount(() => {
    abortRequest()
  })

  return {
    state,
    currentStation,
    currentEntry,
    currentCandidates,
    currentError,
    total,
    progressPercent,
    start,
    retryCurrent,
    skipCurrent,
    applyCandidate,
    cancel,
  }
}
