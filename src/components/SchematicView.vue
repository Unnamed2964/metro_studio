<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { bboxFromXY, buildOctilinearPolyline } from '../lib/geo'
import { useProjectStore } from '../stores/projectStore'

const store = useProjectStore()
const canvasRef = ref(null)
const svgRef = ref(null)
const viewport = reactive({
  scale: 1,
  tx: 0,
  ty: 0,
})
const panState = reactive({
  active: false,
  lastClientX: 0,
  lastClientY: 0,
})

const lineById = computed(() => {
  const map = new Map()
  for (const line of store.project?.lines || []) {
    map.set(line.id, line)
  }
  return map
})

const stationById = computed(() => {
  const map = new Map()
  for (const station of store.project?.stations || []) {
    map.set(station.id, station)
  }
  return map
})

const viewData = computed(() => {
  const stations = store.project?.stations || []
  const points = stations.map((station) => station.displayPos || [0, 0])
  const { minX, minY, maxX, maxY } = bboxFromXY(points)
  const padding = 80
  const width = Math.max(maxX - minX + padding * 2, 900)
  const height = Math.max(maxY - minY + padding * 2, 640)
  return {
    minX,
    minY,
    width,
    height,
    xOffset: padding - minX,
    yOffset: padding - minY,
  }
})

const latestSnapshot = computed(() => {
  const snapshots = store.project?.snapshots || []
  return snapshots.length ? snapshots[snapshots.length - 1] : null
})

const viewportTransform = computed(() => `translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`)

function toX(value) {
  return value + viewData.value.xOffset
}

function toY(value) {
  return value + viewData.value.yOffset
}

function edgeColor(edge) {
  return lineById.value.get(edge.sharedByLineIds[0])?.color || '#2563EB'
}

function edgePolylinePoints(edge) {
  const from = stationById.value.get(edge.fromStationId)?.displayPos
  const to = stationById.value.get(edge.toStationId)?.displayPos
  if (!Array.isArray(from) || !Array.isArray(to)) return ''
  const points = buildOctilinearPolyline(from, to)
  return points.map(([x, y]) => `${toX(x)},${toY(y)}`).join(' ')
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function resetViewport() {
  viewport.scale = 1
  viewport.tx = 0
  viewport.ty = 0
}

function toSvgPoint(clientX, clientY) {
  if (!svgRef.value) return null
  const ctm = svgRef.value.getScreenCTM()
  if (!ctm) return null
  const point = svgRef.value.createSVGPoint()
  point.x = clientX
  point.y = clientY
  return point.matrixTransform(ctm.inverse())
}

function onCanvasWheel(event) {
  const focus = toSvgPoint(event.clientX, event.clientY)
  if (!focus) return

  const oldScale = viewport.scale
  const zoomFactor = Math.exp(-event.deltaY * 0.0017)
  const nextScale = clamp(oldScale * zoomFactor, 0.35, 7)
  if (Math.abs(nextScale - oldScale) < 1e-6) return

  viewport.tx += (oldScale - nextScale) * focus.x
  viewport.ty += (oldScale - nextScale) * focus.y
  viewport.scale = nextScale
}

function onCanvasMouseDown(event) {
  if (event.button !== 1) return
  event.preventDefault()
  panState.active = true
  panState.lastClientX = event.clientX
  panState.lastClientY = event.clientY
}

function onCanvasAuxClick(event) {
  if (event.button === 1) {
    event.preventDefault()
  }
}

function endMiddlePan() {
  panState.active = false
}

function onGlobalMouseMove(event) {
  if (!panState.active) return

  const previous = toSvgPoint(panState.lastClientX, panState.lastClientY)
  const current = toSvgPoint(event.clientX, event.clientY)
  if (previous && current) {
    viewport.tx += current.x - previous.x
    viewport.ty += current.y - previous.y
  }

  panState.lastClientX = event.clientX
  panState.lastClientY = event.clientY
}

function onGlobalMouseUp(event) {
  if (!panState.active) return
  if (event.type === 'mouseup' && event.button !== 1) return
  endMiddlePan()
}

watch(
  () => [store.project?.id || '', viewData.value.width, viewData.value.height],
  async () => {
    await nextTick()
    resetViewport()
  },
  { immediate: true },
)

onMounted(() => {
  window.addEventListener('mousemove', onGlobalMouseMove)
  window.addEventListener('mouseup', onGlobalMouseUp)
  window.addEventListener('blur', onGlobalMouseUp)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onGlobalMouseMove)
  window.removeEventListener('mouseup', onGlobalMouseUp)
  window.removeEventListener('blur', onGlobalMouseUp)
})
</script>

<template>
  <section class="schematic-view">
    <header class="schematic-view__header">
      <h2>官方风示意图视图</h2>
      <div class="schematic-view__stats">
        <span v-if="latestSnapshot">评分: {{ latestSnapshot.score.toFixed(2) }}</span>
        <span>快照: {{ store.project?.snapshots.length || 0 }}</span>
      </div>
    </header>

    <div
      ref="canvasRef"
      class="schematic-view__canvas"
      :class="{ 'schematic-view__canvas--panning': panState.active }"
      @wheel.prevent="onCanvasWheel"
      @mousedown="onCanvasMouseDown"
      @auxclick="onCanvasAuxClick"
    >
      <svg
        ref="svgRef"
        :viewBox="`0 0 ${viewData.width} ${viewData.height}`"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
      >
        <rect :width="viewData.width" :height="viewData.height" fill="#f8fafc" />

        <g :transform="viewportTransform">
          <g class="schematic-view__edges">
            <polyline
              v-for="edge in store.project?.edges || []"
              :key="edge.id"
              :points="edgePolylinePoints(edge)"
              :stroke="edgeColor(edge)"
              stroke-width="8"
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
            />
          </g>

          <g class="schematic-view__stations">
            <g v-for="station in store.project?.stations || []" :key="station.id">
              <circle
                :cx="toX(station.displayPos[0])"
                :cy="toY(station.displayPos[1])"
                :r="station.isInterchange ? 6 : 5"
                :fill="station.proposed ? '#9ca3af' : station.underConstruction ? '#f59e0b' : '#ffffff'"
                stroke="#0f172a"
                stroke-width="2"
              />
              <text
                :x="toX(station.displayPos[0]) + 11"
                :y="toY(station.displayPos[1]) - 3"
                font-size="13"
                fill="#111827"
              >
                {{ station.nameZh }}
              </text>
              <text
                v-if="station.nameEn"
                :x="toX(station.displayPos[0]) + 11"
                :y="toY(station.displayPos[1]) + 12"
                font-size="11"
                fill="#475569"
              >
                {{ station.nameEn }}
              </text>
            </g>
          </g>
        </g>
      </svg>
    </div>
  </section>
</template>

<style scoped>
.schematic-view {
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #ffffff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.schematic-view__header {
  padding: 12px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #e2e8f0;
}

.schematic-view__header h2 {
  margin: 0;
  font-size: 16px;
}

.schematic-view__stats {
  display: flex;
  gap: 10px;
  font-size: 12px;
  color: #334155;
}

.schematic-view__canvas {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #f1f5f9;
  user-select: none;
  cursor: default;
}

.schematic-view__canvas--panning {
  cursor: grabbing;
}

.schematic-view__canvas svg {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}
</style>
