<script setup>
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAutoAnimate } from '@formkit/auto-animate/vue'
import { useProjectStore } from '../stores/projectStore'
import {
  LAYER_EDGE_ANCHORS_HIT,
  LAYER_EDGES,
  LAYER_EDGES_HIT,
  LAYER_EDGES_SQUARE,
  LAYER_STATIONS,
} from './map-editor/constants'
import { buildMapStyle } from './map-editor/mapStyle'
import {
  ensureSources,
  ensureMapLayers,
  updateMapData,
  ensureLanduseLayer,
  removeLanduseLayer,
  updateLanduseVisibility,
  setStationHighlightVisibility,
} from './map-editor/mapLayers'
import { useMapContextMenu } from '../composables/useMapContextMenu.js'
import { useMapLineSelectionMenu } from '../composables/useMapLineSelectionMenu.js'
import { useMapExport } from '../composables/useMapExport.js'
import { useMapEventHandlers } from '../composables/useMapEventHandlers.js'
import { useMapBoundary } from '../composables/useMapBoundary.js'
import { useRouteDrawPreview } from '../composables/useRouteDrawPreview.js'
import { useMapTimelinePlayer } from '../composables/useMapTimelinePlayer.js'
import { useMapNavigation } from '../composables/useMapNavigation.js'
import { useAnimationSettings } from '../composables/useAnimationSettings.js'
import { setMapGetter, setStoreGetter } from '../composables/useMapSearch.js'
import IconBase from './IconBase.vue'
import TimelineSlider from './TimelineSlider.vue'
import LanduseLegend from './LanduseLegend.vue'
import MapContextMenu from './map-editor/MapContextMenu.vue'
import MapLineSelectionMenu from './map-editor/MapLineSelectionMenu.vue'
import MapMeasureOverlay from './map-editor/MapMeasureOverlay.vue'
import MapAnnotationMarkers from './map-editor/MapAnnotationMarkers.vue'
import MapNavigationOverlay from './map-editor/MapNavigationOverlay.vue'

const store = useProjectStore()
const mapContainer = ref(null)
const contextMenuCompRef = ref(null)
const lineSelectionMenuCompRef = ref(null)
const contextMenuRef = computed(() => contextMenuCompRef.value?.menuEl ?? null)
const lineSelectionMenuRef = computed(() => lineSelectionMenuCompRef.value?.menuEl ?? null)
const showHint = ref(false)
let map = null
let scaleControl = null

const { getAutoAnimateConfig } = useAnimationSettings()
useAutoAnimate(contextMenuRef, getAutoAnimateConfig())
useAutoAnimate(lineSelectionMenuRef, getAutoAnimateConfig())

function getMap() {
  return map
}

// ── Composables ──

const {
  contextMenu,
  contextMenuStyle,
  hasSelection,
  contextStation,
  contextTargetLabel,
  canMergeAtContextStation,
  closeContextMenu,
  adjustContextMenuPosition,
  openContextMenu,
  onContextOverlayMouseDown,
  setModeFromContext,
  addStationAtContext,
  clearSelectionFromContext,
  addEdgeAnchorFromContext,
  removeEdgeAnchorFromContext,
  clearContextEdgeAnchorsFromContext,
  renameContextStationFromContext,
  deleteContextStationFromContext,
  deleteContextEdgeFromContext,
  splitEdgeAtContext,
  mergeEdgesAtContextStation,
  aiTranslateContextStationEnglishFromContext,
} = useMapContextMenu({
  store,
  mapContainerRef: mapContainer,
  contextMenuRef,
  getMap,
})

const {
  lineSelectionMenu,
  closeLineSelectionMenu,
  openLineSelectionMenu,
  selectLineFromMenu,
  onLineSelectionMenuOverlayMouseDown,
} = useMapLineSelectionMenu({
  store,
  mapContainerRef: mapContainer,
  closeContextMenu,
})

const lineSelectionMenuStyle = computed(() => ({
  left: `${lineSelectionMenu.x}px`,
  top: `${lineSelectionMenu.y}px`,
}))

const { exportActualRoutePngFromMap } = useMapExport({ store, getMap })

const {
  routeDrawPreview,
  routeDrawDistanceLabel,
  routeDrawDistanceStyle,
  clearRouteDrawPreview,
  refreshRouteDrawPreviewProjectedPoints,
  updateRouteDrawPreview,
} = useRouteDrawPreview({ store, getMap })

const {
  selectionBox,
  handleStationClick,
  handleEdgeClick,
  handleEdgeAnchorClick,
  handleMapClick,
  handleMapContextMenu,
  startStationDrag,
  startEdgeAnchorDrag,
  onMouseMove,
  stopStationDrag,
  startBoxSelection,
  onInteractiveFeatureEnter,
  onInteractiveFeatureLeave,
  handleWindowResize,
} = useMapEventHandlers({
  store,
  getMap,
  closeContextMenu,
  closeLineSelectionMenu,
  openContextMenu,
  updateRouteDrawPreview,
  clearRouteDrawPreview,
  openLineSelectionMenu,
  refreshRouteDrawPreviewProjectedPoints,
  contextMenu,
})

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

const {
  fitMapToBoundary,
  setMapNotReady,
  onMapLoad: onBoundaryMapLoad,
  setupBoundaryWatcher,
} = useMapBoundary({ store, getMap })

const {
  onTimelineYearChange,
  onTimelinePlay,
  onTimelinePause,
  onTimelineStop,
  onTimelineSpeedChange,
  destroy: destroyTimelinePlayer,
} = useMapTimelinePlayer({ store })

const {
  navPrompt,
  navResultVisible,
  initNavigation,
  destroyNavigation,
} = useMapNavigation({ store, getMap })

// ── Map helpers ──

function lockMapNorthUp() {
  if (!map) return
  map.dragRotate?.disable()
  map.touchZoomRotate?.disableRotation()
  map.setBearing(0)
  map.setPitch(0)
}

function onWindowResize() {
  handleWindowResize(adjustContextMenuPosition)
}

// ── Escape callback registration ──
const registerEscapeCallback = inject('registerEscapeCallback', null)
const unregisterEscapeCallback = inject('unregisterEscapeCallback', null)

function escapeHandler() {
  if (contextMenu.visible) {
    closeContextMenu()
    return true
  }
  return false
}

function formatNavDistance(meters) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${Math.round(meters)} m`
}

const measureMarkersKey = ref(0)
const annotationMarkersKey = ref(0)

function getMeasureMarkerStyle(lngLat) {
  if (!map || !lngLat) return { display: 'none' }
  const point = map.project(lngLat)
  return {
    left: `${point.x}px`,
    top: `${point.y}px`,
  }
}

function getAnnotationMarkerStyle(lngLat) {
  if (!map || !lngLat) return { display: 'none' }
  const point = map.project(lngLat)
  return {
    left: `${point.x}px`,
    top: `${point.y}px`,
  }
}

const measureLines = computed(() => {
  // 依赖 measureMarkersKey 来触发重新计算
  const _ = measureMarkersKey.value
  if (!map || !store.measure.points || store.measure.points.length < 2) return []
  const lines = []
  for (let i = 0; i < store.measure.points.length - 1; i++) {
    const p1 = map.project(store.measure.points[i].lngLat)
    const p2 = map.project(store.measure.points[i + 1].lngLat)
    lines.push({
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
    })
  }
  return lines
})

function updateMeasureAndAnnotationPositions() {
  measureMarkersKey.value++
  annotationMarkersKey.value++
}

// ── Lifecycle ──

onMounted(() => {
  store.registerActualRoutePngExporter(exportActualRoutePngFromMap)

  const pmtilesProtocol = new Protocol()
  maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile)

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: buildMapStyle(store.mapTileType),
    center: [116.40, 39.90],
    zoom: 4,
    bearing: 0,
    pitch: 0,
    dragRotate: false,
    touchPitch: false,
    maxPitch: 0,
    boxZoom: false,
    preserveDrawingBuffer: true,
    attributionControl: true,
  })
  lockMapNorthUp()

  setMapGetter(getMap)
  setStoreGetter(() => store)

  map.addControl(new maplibregl.NavigationControl(), 'top-right')
  scaleControl = new maplibregl.ScaleControl({
    maxWidth: 120,
    unit: 'metric',
  })
  map.addControl(scaleControl, 'top-left')

  map.on('load', () => {
    lockMapNorthUp()
    ensureSources(map, store)
    ensureMapLayers(map, store)
    updateMapData(map, store)
    map.resize()

    onBoundaryMapLoad()

    if (store.showLanduseOverlay) {
      ensureLanduseLayer(map, store)
    }

    map.on('click', LAYER_STATIONS, handleStationClick)
    map.on('mousedown', LAYER_STATIONS, startStationDrag)
    map.on('click', LAYER_EDGES_HIT, handleEdgeClick)
    map.on('click', LAYER_EDGE_ANCHORS_HIT, handleEdgeAnchorClick)
    map.on('mousedown', LAYER_EDGE_ANCHORS_HIT, startEdgeAnchorDrag)
    map.on('mouseenter', LAYER_STATIONS, onInteractiveFeatureEnter)
    map.on('mouseleave', LAYER_STATIONS, onInteractiveFeatureLeave)
    map.on('mouseenter', LAYER_EDGES_HIT, onInteractiveFeatureEnter)
    map.on('mouseleave', LAYER_EDGES_HIT, onInteractiveFeatureLeave)
    map.on('mouseenter', LAYER_EDGE_ANCHORS_HIT, onInteractiveFeatureEnter)
    map.on('mouseleave', LAYER_EDGE_ANCHORS_HIT, onInteractiveFeatureLeave)

    initNavigation(map)
  })

  map.on('click', handleMapClick)
  map.on('contextmenu', handleMapContextMenu)
  map.on('mousedown', startBoxSelection)
  map.on('mousemove', onMouseMove)
  map.on('mouseup', stopStationDrag)
  map.on('mouseleave', stopStationDrag)
  map.on('move', refreshRouteDrawPreviewProjectedPoints)
  map.on('move', updateMeasureAndAnnotationPositions)
  map.on('zoom', updateMeasureAndAnnotationPositions)
  window.addEventListener('resize', onWindowResize)
  if (registerEscapeCallback) registerEscapeCallback(escapeHandler)
})

onBeforeUnmount(() => {
  setMapNotReady()
  store.unregisterActualRoutePngExporter(exportActualRoutePngFromMap)
  window.removeEventListener('resize', onWindowResize)
  if (unregisterEscapeCallback) unregisterEscapeCallback(escapeHandler)
  closeContextMenu()
  destroyTimelinePlayer()
  destroyNavigation()
  scaleControl = null
  maplibregl.removeProtocol('pmtiles')
  removeLanduseLayer(map)
  if (map) {
    map.remove()
  }
})

// ── Watchers ──

watch(
  () => ({
    mode: store.mode,
    pendingEdgeStartStationId: store.pendingEdgeStartStationId,
  }),
  () => {
    if (store.mode !== 'route-draw' || !store.pendingEdgeStartStationId) {
      clearRouteDrawPreview()
    }
  },
  { deep: false },
)

watch(
  () => store.mode,
  () => {
    if (contextMenu.visible) closeContextMenu()
  },
)

watch(
  () => store.navigation.active,
  (active) => {
    if (!map) return
    const opacity = active ? 0.2 : 0.88
    if (map.getLayer(LAYER_EDGES)) {
      map.setPaintProperty(LAYER_EDGES, 'line-opacity', opacity)
    }
    if (map.getLayer(LAYER_EDGES_SQUARE)) {
      map.setPaintProperty(LAYER_EDGES_SQUARE, 'line-opacity', opacity)
    }
  },
  { immediate: true },
)

watch(
  () => ({
    project: store.project,
    selectedStationId: store.selectedStationId,
    selectedStationIds: store.selectedStationIds,
    selectedEdgeId: store.selectedEdgeId,
    selectedEdgeIds: store.selectedEdgeIds,
    selectedEdgeAnchor: store.selectedEdgeAnchor,
    boundary: store.regionBoundary,
    timelineFilterYear: store.timelineFilterYear,
  }),
  () => {
    if (!map || !map.isStyleLoaded()) return
    ensureSources(map, store)
    ensureMapLayers(map, store)
    updateMapData(map, store)
  },
  { deep: true },
)

  setupBoundaryWatcher()

  watch(
    () => store.fitToNetworkTrigger,
    () => {
      if (!store.regionBoundary) return
      fitMapToBoundary(store.regionBoundary)
    },
  )

  watch(
    () => ({
      showLanduseOverlay: store.showLanduseOverlay,
      protomapsApiKey: store.protomapsApiKey,
    }),
    ({ showLanduseOverlay: visible }) => {
      if (!map || !map.isStyleLoaded()) return
      if (visible) {
        ensureLanduseLayer(map, store)
      } else {
        removeLanduseLayer(map)
      }
    },
  )

  watch(
    () => store.highlightStationLocations,
    (visible) => {
      if (!map || !map.isStyleLoaded()) return
      setStationHighlightVisibility(map, visible)
    },
  )

  watch(
    () => store.selectedStationId,
    (stationId) => {
      if (!stationId) return
      if (!store.quickRename?.active) return
      if (!store.quickRename?.stationOrder?.length) return

      setTimeout(() => {
        focusOnQuickRenameStation()
      }, 100)
    },
  )

  function focusOnQuickRenameStation() {
    if (!map || !map.isStyleLoaded()) return
    if (!store.quickRename?.active) return

    const currentIndex = store.quickRename.currentIndex
    const stationOrder = store.quickRename.stationOrder

    if (currentIndex < 0 || currentIndex >= stationOrder.length) return

    const stationId = stationOrder[currentIndex]
    const station = store.project?.stations?.find(s => s.id === stationId)
    if (!station || !station.lngLat) return

    const [lng, lat] = station.lngLat
    const currentZoom = map.getZoom()
    const targetZoom = Math.max(14, Math.min(16, currentZoom))

    map.easeTo({
      center: [lng, lat],
      zoom: targetZoom,
      duration: 300,
    })
  }

  watch(
    () => store.mapTileType,
    (newTileType) => {
      if (!map) return
      const center = map.getCenter()
      const zoom = map.getZoom()
      const bearing = map.getBearing()
      const pitch = map.getPitch()

      map.setStyle(buildMapStyle(newTileType))

      const onStyleLoad = () => {
        if (!map.isStyleLoaded()) return
        map.off('styledata', onStyleLoad)
        ensureSources(map, store)
        ensureMapLayers(map, store)
        updateMapData(map, store)
        if (store.showLanduseOverlay) {
          ensureLanduseLayer(map, store)
        }
        setStationHighlightVisibility(map, store.highlightStationLocations)
        map.setCenter(center)
        map.setZoom(zoom)
        map.setBearing(bearing)
        map.setPitch(pitch)
        lockMapNorthUp()
      }
      map.on('styledata', onStyleLoad)
    },
  )
</script>

<template>
  <section class="map-editor">
    <div class="map-editor__container">
      <div ref="mapContainer" class="map-editor__map" @contextmenu.prevent></div>
      <div v-if="selectionBox.active" class="map-editor__selection-box" :style="selectionBoxStyle"></div>
      <svg v-if="routeDrawPreview.visible" class="map-editor__route-preview" aria-hidden="true">
        <line
          :x1="routeDrawPreview.startX"
          :y1="routeDrawPreview.startY"
          :x2="routeDrawPreview.endX"
          :y2="routeDrawPreview.endY"
          :stroke="routeDrawPreview.lineColor"
          stroke-width="4"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-dasharray="8 6"
        />
      </svg>
      <div v-if="routeDrawPreview.visible" class="map-editor__distance-badge" :style="routeDrawDistanceStyle">
        {{ routeDrawDistanceLabel }}
      </div>

      <MapContextMenu
        ref="contextMenuCompRef"
        :visible="contextMenu.visible"
        :menu-style="contextMenuStyle"
        :context-menu="contextMenu"
        :mode="store.mode"
        :has-selection="hasSelection"
        :context-target-label="contextTargetLabel"
        :context-station="contextStation"
        :can-merge-at-context-station="canMergeAtContextStation"
        :is-station-english-retranslating="store.isStationEnglishRetranslating"
        @overlay-mousedown="onContextOverlayMouseDown"
        @set-mode="setModeFromContext"
        @add-station="addStationAtContext"
        @clear-selection="clearSelectionFromContext"
        @add-anchor="addEdgeAnchorFromContext"
        @remove-anchor="removeEdgeAnchorFromContext"
        @clear-anchors="clearContextEdgeAnchorsFromContext"
        @rename-station="renameContextStationFromContext"
        @delete-station="deleteContextStationFromContext"
        @delete-edge="deleteContextEdgeFromContext"
        @split-edge="splitEdgeAtContext"
        @merge-edges="mergeEdgesAtContextStation"
        @ai-translate="aiTranslateContextStationEnglishFromContext"
      />

      <MapLineSelectionMenu
        ref="lineSelectionMenuCompRef"
        :visible="lineSelectionMenu.visible"
        :menu-style="lineSelectionMenuStyle"
        :line-options="lineSelectionMenu.lineOptions"
        @overlay-mousedown="onLineSelectionMenuOverlayMouseDown"
        @select-line="selectLineFromMenu"
        @close="closeLineSelectionMenu"
      />

      <MapMeasureOverlay
        :measure-lines="measureLines"
        :measure-markers-key="measureMarkersKey"
        :measure-points="store.measure.points"
        :get-marker-style="getMeasureMarkerStyle"
      />

      <MapAnnotationMarkers
        :annotations="store.project?.annotations || []"
        :annotation-markers-key="annotationMarkersKey"
        :selected-annotation-id="store.selectedAnnotationId"
        :get-marker-style="getAnnotationMarkerStyle"
      />

      <MapNavigationOverlay
        :nav-prompt="navPrompt"
        :nav-result-visible="navResultVisible"
        :navigation-result="store.navigation.result"
        :format-nav-distance="formatNavDistance"
        @exit-navigation="store.exitNavigation()"
      />

      <button
        class="map-editor__hint-toggle"
        :class="{ 'map-editor__hint-toggle--active': showHint }"
        @click="showHint = !showHint"
        title="显示/隐藏快捷键提示"
      >
        <IconBase name="info" :size="18" />
      </button>

      <p v-if="showHint" class="map-editor__hint">
        Shift + 拖拽框选站点 | Ctrl/⌘ + 拖拽框选线段 | Alt + 点击线段选中整条线路 | Delete 删除站点/线段/锚点 | Ctrl/Cmd+A 全选站点 | Ctrl/Cmd+Z 撤销 |
        Ctrl/Cmd+Shift+Z 或 Ctrl/Cmd+Y 重做 | Esc 取消待连接起点/关闭菜单
      </p>
    </div>
    <TimelineSlider
      @year-change="onTimelineYearChange"
      @play="onTimelinePlay"
      @pause="onTimelinePause"
      @stop="onTimelineStop"
      @speed-change="onTimelineSpeedChange"
    />
    <LanduseLegend :visible="store.showLanduseOverlay" />
  </section>
</template>

<style scoped>
.map-editor {
  border: 1px solid var(--workspace-panel-border);
  border-radius: 12px;
  background: var(--workspace-panel-bg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
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
  animation: selection-appear var(--transition-fast) forwards;
}

.map-editor__route-preview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 12;
}

.map-editor__distance-badge {
  position: absolute;
  transform: translate(0, -100%);
  margin-top: -8px;
  padding: 3px 7px;
  border-radius: 999px;
  border: 1px solid var(--toolbar-border);
  background: var(--toolbar-card-bg);
  color: var(--toolbar-text);
  font-size: 11px;
  line-height: 1;
  pointer-events: none;
  z-index: 13;
}


.map-editor__ai-menu {
  position: absolute;
  width: 356px;
  max-height: calc(100% - 16px);
  overflow: auto;
  border: 1px solid var(--toolbar-border);
  border-radius: 12px;
  background: var(--toolbar-card-bg);
  color: var(--toolbar-text);
  padding: 10px;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.38);
}

.map-editor__ai-loading {
  margin: 8px 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--toolbar-muted);
}

.map-editor__ai-error {
  margin: 8px 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--toolbar-danger-border);
}

.map-editor__ai-candidate-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0;
}

.map-editor__ai-candidate {
  border: 1px solid var(--toolbar-input-border);
  border-radius: 8px;
  background: var(--toolbar-input-bg);
  color: var(--toolbar-text);
  text-align: left;
  padding: 8px 9px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 3px;
  transition: border-color var(--transition-normal), background-color var(--transition-normal);
}

.map-editor__ai-candidate:hover {
  border-color: var(--toolbar-button-hover-border);
  background: var(--toolbar-button-bg);
}

.map-editor__ai-candidate strong {
  font-size: 13px;
}

.map-editor__ai-candidate span {
  font-size: 12px;
  color: var(--toolbar-muted);
}

.map-editor__ai-candidate small {
  font-size: 11px;
  line-height: 1.35;
  color: var(--toolbar-hint);
}


.map-editor__hint-toggle {
  position: absolute;
  left: 12px;
  bottom: 10px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--toolbar-card-bg);
  color: var(--toolbar-text);
  border: 1px solid var(--toolbar-border);
  border-radius: 6px;
  cursor: pointer;
  z-index: 12;
  transition: all 0.2s ease;
  padding: 0;
}

.map-editor__hint-toggle:hover {
  background: var(--toolbar-hover-bg);
  border-color: var(--toolbar-hover-border);
}

.map-editor__hint-toggle--active {
  background: var(--toolbar-primary-bg);
  color: #fff;
  border-color: var(--toolbar-primary-border);
}

.map-editor__hint {
  position: absolute;
  left: 52px;
  bottom: 10px;
  margin: 0;
  padding: 5px 8px;
  background: var(--toolbar-card-bg);
  color: var(--toolbar-text);
  border: 1px solid var(--toolbar-border);
  border-radius: 6px;
  font-size: 11px;
  z-index: 11;
  pointer-events: none;
  opacity: 0.95;
}

:deep(.maplibregl-ctrl-scale) {
  border: 1px solid var(--toolbar-border);
  border-radius: 7px;
  background: var(--toolbar-card-bg);
  color: var(--toolbar-text);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.25;
}

.search-marker {
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  transition: transform 0.2s ease, opacity 0.2s ease;
  pointer-events: auto;
  animation: search-marker-rotate 8s linear infinite;
  opacity: 0.95;
}

.search-marker:hover {
  transform: scale(1.15);
  animation-play-state: paused;
  opacity: 1;
}

.search-marker svg {
  display: block;
}

@keyframes search-marker-rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
