<script setup>
import { computed } from 'vue'

const props = defineProps({
  stations: { type: Array, required: true },
  lineById: { type: Map, required: true },
  markersKey: { type: Number, required: true },
  getMarkerStyle: { type: Function, required: true },
  style: { type: String, default: 'orbit' }, // 'orbit' | 'radar' | 'gear'
  visible: { type: Boolean, default: true },
  zoom: { type: Number, default: 4 },
})

function getZoomScale(zoom) {
  const minZoom = 3
  const maxZoom = 18
  const clamped = Math.min(maxZoom, Math.max(minZoom, zoom))
  const scale = 2 ** ((clamped - 12) / 2.4)
  return Math.min(2.4, Math.max(0.35, scale))
}

const interchangeStations = computed(() => {
  if (!props.visible) return []
  const zoomScale = getZoomScale(props.zoom)
  return props.stations.filter(s => s.isInterchange).map(s => {
    // 获取站点所属的所有线路颜色
    const lineIds = s.transferLineIds?.length ? s.transferLineIds : (s.lineIds || [])
    const lineColors = lineIds.map(id => props.lineById.get(id)?.color).filter(Boolean)
    const uniqueLineColors = [...new Set(lineColors)]
    
    // 如果没有获取到线路颜色，默认给一些占位色
    const colors = uniqueLineColors.length > 0 ? uniqueLineColors : ['#bc1fff', '#38bdf8']

    const ringCount = colors.length
    const maxDiameter = 20 * zoomScale
    const minDiameter = 8 * zoomScale
    const diameterStep = ringCount > 1 ? (maxDiameter - minDiameter) / (ringCount - 1) : 0
    const borderWidth = (ringCount >= 5 ? 1.8 : 2.4) * zoomScale
    const rings = colors.map((color, index) => ({
      color,
      size: Number((maxDiameter - diameterStep * index).toFixed(2)),
      borderWidth,
      zIndex: 20 - index,
    }))
    const containerSize = Math.max(10, maxDiameter + borderWidth * 2 + 4)
    
    return { 
      ...s, 
      containerSize: Number(containerSize.toFixed(2)),
      rings,
    }
  })
})
</script>

<template>
  <div v-if="visible" class="map-interchange-layer">
    <div
      v-for="station in interchangeStations"
      :key="`interchange-${station.id}-${markersKey}`"
      class="interchange-marker"
      :style="[
        getMarkerStyle(station.lngLat),
        {
          width: `${station.containerSize}px`,
          height: `${station.containerSize}px`,
        },
      ]"
    >
      <div
        class="nested-rings-container"
        :style="{
          width: `${station.containerSize}px`,
          height: `${station.containerSize}px`,
        }"
      >
        <div
          v-for="(ring, i) in station.rings"
          :key="i"
          class="nested-inner-ring"
          :style="{
            width: `${ring.size}px`,
            height: `${ring.size}px`,
            borderColor: ring.color,
            borderWidth: `${ring.borderWidth}px`,
            zIndex: ring.zIndex
          }"
        ></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-interchange-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 15;
}

.interchange-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.nested-rings-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 内部多重线路环（静态，不旋转） */
.nested-inner-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-style: solid;
  border-radius: 9999px;
  background: transparent;
  box-sizing: border-box;
}
</style>
