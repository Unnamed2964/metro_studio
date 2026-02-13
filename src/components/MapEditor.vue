<script setup>
import maplibregl from 'maplibre-gl'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useProjectStore } from '../stores/projectStore'

const store = useProjectStore()
const mapContainer = ref(null)
let map = null
let dragState = null
let suppressNextMapClick = false

const LAYER_EDGES = 'railmap-edges'
const LAYER_EDGES_HIT = 'railmap-edges-hit'
const LAYER_EDGES_SELECTED = 'railmap-edges-selected'
const LAYER_STATIONS = 'railmap-stations-layer'
const SOURCE_STATIONS = 'railmap-stations'
const SOURCE_EDGES = 'railmap-edges'
const selectionBox = reactive({
  active: false,
  append: false,
  startX: 0,
  startY: 0,
  endX: 0,
  endY: 0,
})

const stationCount = computed(() => store.project?.stations.length || 0)
const edgeCount = computed(() => store.project?.edges.length || 0)
const selectedEdgeLabel = computed(() => (store.selectedEdgeId ? '1' : '0'))
const selectionBoxStyle = computed(() => {
  const left = Math.min(selectionBox.startX, selectionBox.endX)
  const top = Math.min(selectionBox.startY, selectionBox.endY)
  const width = Math.abs(selectionBox.endX - selectionBox.startX)
  const height = Math.abs(selectionBox.endY - selectionBox.startY)
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  }
})

function isTextInputTarget(target) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select'
}

function buildMapStyle() {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [
      {
        id: 'osm-base',
        type: 'raster',
        source: 'osm',
      },
    ],
  }
}

function ensureMapLayers() {
  if (!map || !map.getSource(SOURCE_STATIONS)) return

  if (!map.getLayer(LAYER_EDGES_HIT)) {
    map.addLayer({
      id: LAYER_EDGES_HIT,
      type: 'line',
      source: SOURCE_EDGES,
      paint: {
        'line-color': '#000000',
        'line-width': 14,
        'line-opacity': 0.001,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
    })
  }

  if (!map.getLayer(LAYER_EDGES)) {
    map.addLayer({
      id: LAYER_EDGES,
      type: 'line',
      source: SOURCE_EDGES,
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#2563EB'],
        'line-width': 5,
        'line-opacity': 0.88,
        'line-dasharray': [
          'case',
          ['==', ['get', 'lineStyle'], 'dashed'],
          ['literal', [2.2, 1.5]],
          ['==', ['get', 'lineStyle'], 'dotted'],
          ['literal', [0.2, 1.7]],
          ['literal', [1, 0]],
        ],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
    })
  }

  if (!map.getLayer(LAYER_EDGES_SELECTED)) {
    map.addLayer({
      id: LAYER_EDGES_SELECTED,
      type: 'line',
      source: SOURCE_EDGES,
      filter: ['==', ['get', 'id'], ''],
      paint: {
        'line-color': '#F8FAFC',
        'line-width': 8.5,
        'line-opacity': 0.96,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
    })
  }

  updateSelectedEdgeFilter()

  if (!map.getLayer(LAYER_STATIONS)) {
    map.addLayer({
      id: LAYER_STATIONS,
      type: 'circle',
      source: SOURCE_STATIONS,
      paint: {
        'circle-radius': [
          'case',
          ['==', ['get', 'isSelected'], true],
          7,
          ['==', ['get', 'isInterchange'], true],
          6,
          4.8,
        ],
        'circle-color': [
          'case',
          ['==', ['get', 'proposed'], true],
          '#9CA3AF',
          ['==', ['get', 'underConstruction'], true],
          '#F59E0B',
          '#FFFFFF',
        ],
        'circle-stroke-width': ['case', ['==', ['get', 'isSelected'], true], 3, 2],
        'circle-stroke-color': '#0F172A',
      },
    })
  }

  if (!map.getLayer('railmap-stations-label')) {
    map.addLayer({
      id: 'railmap-stations-label',
      type: 'symbol',
      source: SOURCE_STATIONS,
      layout: {
        'text-field': ['get', 'nameZh'],
        'text-font': ['Noto Sans CJK SC Regular', 'Noto Sans Regular'],
        'text-size': 12,
        'text-offset': [0.8, 0.2],
        'text-anchor': 'left',
      },
      paint: {
        'text-color': '#111827',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.4,
      },
    })
  }
}

function ensureSources() {
  if (!map) return

  if (!map.getSource(SOURCE_STATIONS)) {
    map.addSource(SOURCE_STATIONS, {
      type: 'geojson',
      data: buildStationsGeoJson(),
    })
  }

  if (!map.getSource(SOURCE_EDGES)) {
    map.addSource(SOURCE_EDGES, {
      type: 'geojson',
      data: buildEdgesGeoJson(),
    })
  }

  if (!map.getSource('jinan-boundary')) {
    map.addSource('jinan-boundary', {
      type: 'geojson',
      data: buildBoundaryGeoJson(),
    })
  } else {
    map.getSource('jinan-boundary').setData(buildBoundaryGeoJson())
  }

  if (!map.getLayer('jinan-boundary-line')) {
    map.addLayer({
      id: 'jinan-boundary-line',
      type: 'line',
      source: 'jinan-boundary',
      paint: {
        'line-color': '#0EA5E9',
        'line-width': 1.5,
        'line-dasharray': [1.2, 1.2],
      },
    })
  }
}

function updateSelectedEdgeFilter() {
  if (!map || !map.getLayer(LAYER_EDGES_SELECTED)) return
  map.setFilter(LAYER_EDGES_SELECTED, ['==', ['get', 'id'], store.selectedEdgeId || '__none__'])
}

function buildBoundaryGeoJson() {
  if (!store.regionBoundary) {
    return {
      type: 'FeatureCollection',
      features: [],
    }
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: store.regionBoundary,
        properties: {},
      },
    ],
  }
}

function buildStationsGeoJson() {
  const stations = store.project?.stations || []
  const selectedStationSet = new Set(store.selectedStationIds || [])
  return {
    type: 'FeatureCollection',
    features: stations.map((station) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: station.lngLat,
      },
      properties: {
        id: station.id,
        nameZh: station.nameZh,
        isInterchange: station.isInterchange,
        underConstruction: station.underConstruction,
        proposed: station.proposed,
        isSelected: selectedStationSet.has(station.id),
      },
    })),
  }
}

function buildEdgesGeoJson() {
  const lines = new Map((store.project?.lines || []).map((line) => [line.id, line]))
  const edges = store.project?.edges || []
  const stations = new Map((store.project?.stations || []).map((station) => [station.id, station]))

  return {
    type: 'FeatureCollection',
    features: edges
      .map((edge) => {
        const line = lines.get(edge.sharedByLineIds[0])
        const fallback = []
        const fromStation = stations.get(edge.fromStationId)
        const toStation = stations.get(edge.toStationId)
        if (fromStation) fallback.push(fromStation.lngLat)
        if (toStation) fallback.push(toStation.lngLat)
        const coordinates = edge.waypoints?.length >= 2 ? edge.waypoints : fallback
        if (coordinates.length < 2) return null
        return {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates,
          },
          properties: {
            id: edge.id,
            color: line?.color || '#2563EB',
            lineStyle: line?.style || 'solid',
            sharedCount: edge.sharedByLineIds.length,
          },
        }
      })
      .filter(Boolean),
  }
}

function updateMapData() {
  if (!map) return
  const stationSource = map.getSource(SOURCE_STATIONS)
  const edgeSource = map.getSource(SOURCE_EDGES)
  if (stationSource) {
    stationSource.setData(buildStationsGeoJson())
  }
  if (edgeSource) {
    edgeSource.setData(buildEdgesGeoJson())
  }
  updateSelectedEdgeFilter()
}

function handleWindowResize() {
  if (map) {
    map.resize()
  }
}

function handleStationClick(event) {
  const stationId = event.features?.[0]?.properties?.id
  if (!stationId) return
  const mouseEvent = event.originalEvent
  const isMultiModifier = Boolean(mouseEvent?.shiftKey || mouseEvent?.ctrlKey || mouseEvent?.metaKey)
  store.selectStation(stationId, {
    multi: isMultiModifier && store.mode === 'select',
    toggle: isMultiModifier && store.mode === 'select',
  })
}

function handleEdgeClick(event) {
  if (store.mode !== 'select') return
  const edgeId = event.features?.[0]?.properties?.id
  if (!edgeId) return
  const mouseEvent = event.originalEvent
  const keepStationSelection = Boolean(mouseEvent?.shiftKey || mouseEvent?.ctrlKey || mouseEvent?.metaKey)
  store.selectEdge(edgeId, { keepStationSelection })
}

function handleMapClick(event) {
  if (!map) return
  if (suppressNextMapClick) {
    suppressNextMapClick = false
    return
  }
  const hitStations = map.queryRenderedFeatures(event.point, { layers: [LAYER_STATIONS] })
  const hitEdges = map.queryRenderedFeatures(event.point, { layers: [LAYER_EDGES_HIT] })
  if (hitStations.length) return
  if (hitEdges.length) return
  if (store.mode === 'add-station') {
    store.addStationAt([event.lngLat.lng, event.lngLat.lat])
    return
  }
  if (store.mode === 'select') {
    const mouseEvent = event.originalEvent
    const keepSelection = Boolean(mouseEvent?.shiftKey || mouseEvent?.ctrlKey || mouseEvent?.metaKey)
    if (!keepSelection) {
      store.clearSelection()
    }
  }
}

function startStationDrag(event) {
  if (store.mode !== 'select') return
  const stationId = event.features?.[0]?.properties?.id
  if (!stationId) return
  const mouseEvent = event.originalEvent
  if (mouseEvent?.shiftKey || mouseEvent?.ctrlKey || mouseEvent?.metaKey) {
    store.selectStation(stationId, { multi: true, toggle: true })
    return
  }

  if (!store.selectedStationIds.includes(stationId)) {
    store.selectStation(stationId)
  }
  const stationIds = store.selectedStationIds.includes(stationId) ? [...store.selectedStationIds] : [stationId]
  dragState = {
    stationIds,
    lastLngLat: [event.lngLat.lng, event.lngLat.lat],
  }
  map.getCanvas().style.cursor = 'grabbing'
  map.dragPan.disable()
}

function onMouseMove(event) {
  if (selectionBox.active) {
    selectionBox.endX = event.point.x
    selectionBox.endY = event.point.y
  }

  if (!dragState) return
  const delta = [event.lngLat.lng - dragState.lastLngLat[0], event.lngLat.lat - dragState.lastLngLat[1]]
  dragState.lastLngLat = [event.lngLat.lng, event.lngLat.lat]
  store.moveStationsByDelta(dragState.stationIds, delta)
}

function stopStationDrag() {
  if (selectionBox.active) {
    const minX = Math.min(selectionBox.startX, selectionBox.endX)
    const maxX = Math.max(selectionBox.startX, selectionBox.endX)
    const minY = Math.min(selectionBox.startY, selectionBox.endY)
    const maxY = Math.max(selectionBox.startY, selectionBox.endY)

    const picked = (store.project?.stations || [])
      .filter((station) => {
        const pt = map.project(station.lngLat)
        return pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY
      })
      .map((station) => station.id)

    if (picked.length) {
      store.selectStations(picked, { replace: !selectionBox.append })
    } else if (!selectionBox.append) {
      store.clearSelection()
    }
    suppressNextMapClick = true

    selectionBox.active = false
    map.getCanvas().style.cursor = ''
    map.dragPan.enable()
  }

  if (!dragState) return
  dragState = null
  map.getCanvas().style.cursor = ''
  map.dragPan.enable()
}

function startBoxSelection(event) {
  if (store.mode !== 'select') return
  if (selectionBox.active) return
  const mouseEvent = event.originalEvent
  if (mouseEvent?.button !== 0) return
  const modifier = Boolean(mouseEvent?.shiftKey || mouseEvent?.ctrlKey || mouseEvent?.metaKey)
  if (!modifier) return

  const hitStations = map.queryRenderedFeatures(event.point, { layers: [LAYER_STATIONS] })
  const hitEdges = map.queryRenderedFeatures(event.point, { layers: [LAYER_EDGES_HIT] })
  if (hitStations.length) return
  if (hitEdges.length) return

  selectionBox.active = true
  selectionBox.append = modifier
  selectionBox.startX = event.point.x
  selectionBox.startY = event.point.y
  selectionBox.endX = event.point.x
  selectionBox.endY = event.point.y
  map.getCanvas().style.cursor = 'crosshair'
  map.dragPan.disable()
}

function onInteractiveFeatureEnter() {
  if (!map || selectionBox.active || dragState) return
  map.getCanvas().style.cursor = 'pointer'
}

function onInteractiveFeatureLeave() {
  if (!map || selectionBox.active || dragState) return
  map.getCanvas().style.cursor = ''
}

function handleWindowKeyDown(event) {
  if (isTextInputTarget(event.target)) return

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
    event.preventDefault()
    store.selectAllStations()
    return
  }

  if (event.key === 'Escape') {
    store.clearSelection()
    return
  }

  if (event.key !== 'Delete' && event.key !== 'Backspace') return

  if (store.selectedStationIds.length) {
    event.preventDefault()
    store.deleteSelectedStations()
    return
  }
  if (store.selectedEdgeId) {
    event.preventDefault()
    store.deleteSelectedEdge()
  }
}

onMounted(() => {
  map = new maplibregl.Map({
    container: mapContainer.value,
    style: buildMapStyle(),
    center: [117.1138, 36.6519],
    zoom: 10.5,
    attributionControl: true,
  })

  map.addControl(new maplibregl.NavigationControl(), 'top-right')

  map.on('load', () => {
    ensureSources()
    ensureMapLayers()
    updateMapData()
    map.resize()

    map.on('click', LAYER_STATIONS, handleStationClick)
    map.on('mousedown', LAYER_STATIONS, startStationDrag)
    map.on('click', LAYER_EDGES_HIT, handleEdgeClick)
    map.on('mouseenter', LAYER_STATIONS, onInteractiveFeatureEnter)
    map.on('mouseleave', LAYER_STATIONS, onInteractiveFeatureLeave)
    map.on('mouseenter', LAYER_EDGES_HIT, onInteractiveFeatureEnter)
    map.on('mouseleave', LAYER_EDGES_HIT, onInteractiveFeatureLeave)
  })

  map.on('click', handleMapClick)
  map.on('mousedown', startBoxSelection)
  map.on('mousemove', onMouseMove)
  map.on('mouseup', stopStationDrag)
  map.on('mouseleave', stopStationDrag)
  window.addEventListener('resize', handleWindowResize)
  window.addEventListener('keydown', handleWindowKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleWindowResize)
  window.removeEventListener('keydown', handleWindowKeyDown)
  if (map) {
    map.remove()
  }
})

watch(
  () => ({
    project: store.project,
    selectedStationId: store.selectedStationId,
    selectedStationIds: store.selectedStationIds,
    selectedEdgeId: store.selectedEdgeId,
    boundary: store.regionBoundary,
  }),
  () => {
    if (!map || !map.isStyleLoaded()) return
    ensureSources()
    ensureMapLayers()
    updateMapData()
  },
  { deep: true },
)
</script>

<template>
  <section class="map-editor">
    <header class="map-editor__header">
      <h2>真实地图编辑器</h2>
      <div class="map-editor__stats">
        <span>站点: {{ stationCount }}</span>
        <span>线段: {{ edgeCount }}</span>
        <span>已选站: {{ store.selectedStationIds.length }}</span>
        <span>已选边: {{ selectedEdgeLabel }}</span>
        <span>模式: {{ store.mode }}</span>
      </div>
    </header>
    <div class="map-editor__container">
      <div ref="mapContainer" class="map-editor__map"></div>
      <div v-if="selectionBox.active" class="map-editor__selection-box" :style="selectionBoxStyle"></div>
      <p class="map-editor__hint">Shift/Ctrl/⌘ + 拖拽框选 | Delete 删除选中 | Ctrl/Cmd+A 全选站点</p>
    </div>
  </section>
</template>

<style scoped>
.map-editor {
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #ffffff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.map-editor__header {
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e2e8f0;
}

.map-editor__header h2 {
  margin: 0;
  font-size: 16px;
}

.map-editor__stats {
  display: flex;
  gap: 12px;
  color: #334155;
  font-size: 12px;
}

.map-editor__container {
  flex: 1;
  min-height: 0;
  position: relative;
}

.map-editor__map {
  position: absolute;
  inset: 0;
}

.map-editor__selection-box {
  position: absolute;
  border: 1px solid #0ea5e9;
  background: rgba(14, 165, 233, 0.14);
  pointer-events: none;
  z-index: 10;
}

.map-editor__hint {
  position: absolute;
  left: 12px;
  bottom: 10px;
  margin: 0;
  padding: 5px 8px;
  background: rgba(15, 23, 42, 0.72);
  color: #e2e8f0;
  border-radius: 6px;
  font-size: 11px;
  z-index: 11;
  pointer-events: none;
}
</style>
