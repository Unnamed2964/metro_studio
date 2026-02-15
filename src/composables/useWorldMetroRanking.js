import { computed, onBeforeUnmount, onMounted, reactive } from 'vue'
import {
  buildProjectMetroRanking,
  computeProjectRailLengthKm,
  fetchWorldMetroRanking,
} from '../lib/ranking/worldMetroRanking'
import { useProjectStore } from '../stores/projectStore'

export function useWorldMetroRanking() {
  const store = useProjectStore()

  let abortController = null

  const state = reactive({
    loading: false,
    error: '',
    fetchedAt: '',
    entries: [],
  })

  const projectRailLengthKm = computed(() => computeProjectRailLengthKm(store.project))

  const projectMetroRanking = computed(() =>
    buildProjectMetroRanking(projectRailLengthKm.value, state.entries),
  )

  const rankingMessage = computed(() => {
    const ranking = projectMetroRanking.value
    const distance = ranking.playerLengthKm.toFixed(1)
    if (!state.entries.length) {
      return `已建 ${distance} km`
    }
    return `已建 ${distance} km · 第 ${ranking.rank} / ${ranking.total} 名`
  })

  const comparisonMessage = computed(() => {
    const ranking = projectMetroRanking.value
    if (!state.entries.length) return ''
    if (ranking.rank === 1) {
      const second = ranking.below
      if (!second) return '已超过当前榜单所有城市地铁系统'
      const lead = (ranking.playerLengthKm - second.lengthKm).toFixed(1)
      return `领先第 2 名 ${lead} km（${second.city} · ${second.systemName}）`
    }
    if (!ranking.above) return ''
    const gap = (ranking.above.lengthKm - ranking.playerLengthKm).toFixed(1)
    return `距离上一名 ${gap} km（${ranking.above.city} · ${ranking.above.systemName}）`
  })

  const timestamp = computed(() => {
    if (!state.fetchedAt) return ''
    const date = new Date(state.fetchedAt)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString()
  })

  function cancelRequest() {
    if (!abortController) return
    abortController.abort(new Error('aborted'))
    abortController = null
  }

  async function refresh() {
    cancelRequest()
    const controller = new AbortController()
    abortController = controller
    state.loading = true
    state.error = ''

    try {
      const result = await fetchWorldMetroRanking({ signal: controller.signal })
      if (controller.signal.aborted) return
      state.entries = result.entries
      state.fetchedAt = result.fetchedAt
    } catch (error) {
      if (controller.signal.aborted) return
      state.error = String(error?.message || '全球排行榜加载失败')
    } finally {
      if (abortController === controller) {
        abortController = null
      }
      state.loading = false
    }
  }

  onMounted(() => {
    refresh()
  })

  onBeforeUnmount(() => {
    cancelRequest()
  })

  return {
    state,
    projectRailLengthKm,
    rankingMessage,
    comparisonMessage,
    timestamp,
    refresh,
  }
}
