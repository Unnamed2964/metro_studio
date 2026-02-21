import { onBeforeUnmount, onMounted, ref } from 'vue'
import { resolveEdgeWaypointsForRender, buildCurveFromWaypoints } from './map-editor/dataBuilders'

export function useMapPulses(store) {
  const pulses = ref([])
  let lastTimestamp = 0
  let animationFrame = null

  // 辅助函数：根据比例获取线段上的点
  function getPointOnLine(coords, t) {
    if (coords.length < 2) return null
    if (t <= 0) return coords[0]
    if (t >= 1) return coords[coords.length - 1]

    const totalLen = coords.reduce((acc, curr, i) => {
      if (i === 0) return 0
      const prev = coords[i - 1]
      return acc + Math.hypot(curr[0] - prev[0], curr[1] - prev[1])
    }, 0)

    const targetLen = t * totalLen
    let currentLen = 0
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1]
      const curr = coords[i]
      const segLen = Math.hypot(curr[0] - prev[0], curr[1] - prev[1])
      if (currentLen + segLen >= targetLen) {
        const segT = (targetLen - currentLen) / segLen
        return [
          prev[0] + (curr[0] - prev[0]) * segT,
          prev[1] + (curr[1] - prev[1]) * segT,
        ]
      }
      currentLen += segLen
    }
    return coords[coords.length - 1]
  }

  function spawnPulse() {
    if (!store.project?.edges?.length) return
    if (pulses.value.length > 40) return // 限制最大脉冲数

    const edge = store.project.edges[Math.floor(Math.random() * store.project.edges.length)]
    const line = store.project.lines?.find(l => l.id === edge.sharedByLineIds?.[0])
    if (!line) return

    // 获取渲染用的坐标点
    const stationMap = new Map((store.project?.stations || []).map(s => [s.id, s]))
    const linearWaypoints = resolveEdgeWaypointsForRender(edge, stationMap)
    const shouldSmooth = Boolean(edge?.isCurved) && linearWaypoints.length >= 3 && linearWaypoints.length <= 20
    const coords = shouldSmooth ? buildCurveFromWaypoints(linearWaypoints) : linearWaypoints

    if (coords.length < 2) return

    const direction = Math.random() > 0.5 ? 1 : -1
    pulses.value.push({
      id: Math.random().toString(36).substr(2, 9),
      coords: direction === 1 ? coords : [...coords].reverse(),
      color: line.color || '#bc1fff',
      progress: 0,
      speed: 0.2 + Math.random() * 0.4,
      life: 1.0,
      radius: 1.2 + Math.random() * 1.5,
    })
  }

  function update(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp
    const dt = (timestamp - lastTimestamp) / 1000
    lastTimestamp = timestamp

    // 随机生成脉冲
    if (Math.random() < 0.15) {
      spawnPulse()
    }

    // 更新现有脉冲
    const nextPulses = []
    for (const pulse of pulses.value) {
      pulse.progress += pulse.speed * dt
      pulse.life -= 0.15 * dt
      if (pulse.progress < 1.0 && pulse.life > 0) {
        nextPulses.push(pulse)
      }
    }
    pulses.value = nextPulses

    // 转换为 GeoJSON
    const features = pulses.value.map(pulse => {
      const pos = getPointOnLine(pulse.coords, pulse.progress)
      if (!pos) return null
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: pos },
        properties: {
          color: pulse.color,
          radius: pulse.radius,
          opacity: Math.min(pulse.life, 1.0 - pulse.progress) * 0.8,
        }
      }
    }).filter(Boolean)

    store.mapPulsesGeoJson = {
      type: 'FeatureCollection',
      features
    }

    animationFrame = requestAnimationFrame(update)
  }

  onMounted(() => {
    animationFrame = requestAnimationFrame(update)
  })

  onBeforeUnmount(() => {
    if (animationFrame) cancelAnimationFrame(animationFrame)
  })

  return { pulses }
}
