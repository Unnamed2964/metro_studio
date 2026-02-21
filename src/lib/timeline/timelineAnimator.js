/**
 * Timeline animator for schematic/map views.
 *
 * Manages animation state for line-growth (stroke-dashoffset style),
 * station bounce-in, and text fade-in during timeline playback transitions.
 */

import { ref, reactive } from 'vue'

/** @returns {{animatingEdgeIds: import('vue').Ref<Set<string>>, animatingStationIds: import('vue').Ref<Set<string>>, edgeProgress: Object<string, number>, stationProgress: Object<string, number>, animateNewEdges: (newEdges: Array<{id: string}>, newStationIds: string[], durationMs?: number) => Promise<void>, cancelAll: () => void, getEdgeDashOffset: (edgeId: string, totalLength: number) => number, getStationScale: (stationId: string) => number, isAnimating: () => boolean}} */
export function useTimelineAnimator() {
  const animatingEdgeIds = ref(new Set())
  const animatingStationIds = ref(new Set())
  const edgeProgress = reactive({})   // edgeId → 0..1
  const stationProgress = reactive({}) // stationId → 0..1

  let activeAnimations = []

  function animateNewEdges(newEdges, newStationIds, durationMs = 1600) {
    cancelAll()

    const edgeIds = newEdges.map((e) => e.id)
    const stationIds = [...newStationIds]

    animatingEdgeIds.value = new Set(edgeIds)
    animatingStationIds.value = new Set(stationIds)

    for (const id of edgeIds) edgeProgress[id] = 0
    for (const id of stationIds) stationProgress[id] = 0

    return new Promise((resolve) => {
      const startTime = performance.now()
      const edgeDuration = durationMs * 0.7
      const stationDelay = durationMs * 0.3
      const stationDuration = durationMs * 0.5

      function tick(now) {
        const elapsed = now - startTime

        // Edge growth: 0 → edgeDuration
        const edgeT = Math.min(elapsed / edgeDuration, 1)
        const edgeEased = easeOutCubic(edgeT)
        for (const id of edgeIds) {
          edgeProgress[id] = edgeEased
        }

        // Station bounce-in: stationDelay → stationDelay + stationDuration
        const stationElapsed = Math.max(0, elapsed - stationDelay)
        const stationT = Math.min(stationElapsed / stationDuration, 1)
        const stationEased = easeOutBack(stationT)
        for (const id of stationIds) {
          stationProgress[id] = stationEased
        }

        if (elapsed < durationMs) {
          const rafId = requestAnimationFrame(tick)
          activeAnimations.push(rafId)
        } else {
          // Finalize
          for (const id of edgeIds) edgeProgress[id] = 1
          for (const id of stationIds) stationProgress[id] = 1
          animatingEdgeIds.value = new Set()
          animatingStationIds.value = new Set()
          resolve()
        }
      }

      const rafId = requestAnimationFrame(tick)
      activeAnimations.push(rafId)
    })
  }

  function cancelAll() {
    for (const id of activeAnimations) cancelAnimationFrame(id)
    activeAnimations = []
    animatingEdgeIds.value = new Set()
    animatingStationIds.value = new Set()
    for (const key of Object.keys(edgeProgress)) delete edgeProgress[key]
    for (const key of Object.keys(stationProgress)) delete stationProgress[key]
  }

  function getEdgeDashOffset(edgeId, totalLength) {
    const progress = edgeProgress[edgeId]
    if (progress == null || progress >= 1) return 0
    return totalLength * (1 - progress)
  }

  function getStationScale(stationId) {
    const progress = stationProgress[stationId]
    if (progress == null || progress >= 1) return 1
    return progress
  }

  function isAnimating() {
    return animatingEdgeIds.value.size > 0 || animatingStationIds.value.size > 0
  }

  return {
    animatingEdgeIds,
    animatingStationIds,
    edgeProgress,
    stationProgress,
    animateNewEdges,
    cancelAll,
    getEdgeDashOffset,
    getStationScale,
    isAnimating,
  }
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

function easeOutBack(t) {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}
