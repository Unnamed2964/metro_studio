<script setup>
import maplibregl from 'maplibre-gl'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useProjectStore } from '../stores/projectStore'

const store = useProjectStore()
const mapContainer = ref(null)
let map = null
let draggingStationId = null

const stationCount = computed(() => store.project?.stations.length || 0)
const edgeCount = computed(() => store.project?.edges.length || 0)

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
  if (!map || !map.getSource('railmap-stations')) return

  if (!map.getLayer('railmap-edges')) {
    map.addLayer({
      id: 'railmap-edges',
      type: 'line',
      source: 'railmap-edges',
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#2563EB'],
        'line-width': 5,
        'line-opacity': 0.88,
      },
    })
  }

  if (!map.getLayer('railmap-stations-layer')) {
    map.addLayer({
      id: 'railmap-stations-layer',
      type: 'circle',
      source: 'railmap-stations',
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
      source: 'railmap-stations',
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

  if (!map.getSource('railmap-stations')) {
    map.addSource('railmap-stations', {
      type: 'geojson',
      data: buildStationsGeoJson(),
    })
  }

  if (!map.getSource('railmap-edges')) {
    map.addSource('railmap-edges', {
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
        isSelected: station.id === store.selectedStationId,
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
            sharedCount: edge.sharedByLineIds.length,
          },
        }
      })
      .filter(Boolean),
  }
}

function updateMapData() {
  if (!map) return
  const stationSource = map.getSource('railmap-stations')
  const edgeSource = map.getSource('railmap-edges')
  if (stationSource) {
    stationSource.setData(buildStationsGeoJson())
  }
  if (edgeSource) {
    edgeSource.setData(buildEdgesGeoJson())
  }
}

function handleStationClick(event) {
  const stationId = event.features?.[0]?.properties?.id
  if (!stationId) return
  store.selectStation(stationId)
}

function handleMapClick(event) {
  if (!map) return
  const hitStations = map.queryRenderedFeatures(event.point, { layers: ['railmap-stations-layer'] })
  if (hitStations.length) return
  if (store.mode === 'add-station') {
    store.addStationAt([event.lngLat.lng, event.lngLat.lat])
  }
}

function startStationDrag(event) {
  if (store.mode !== 'select') return
  const stationId = event.features?.[0]?.properties?.id
  if (!stationId) return
  draggingStationId = stationId
  map.getCanvas().style.cursor = 'grabbing'
  map.dragPan.disable()
}

function onMouseMove(event) {
  if (!draggingStationId) return
  store.updateStationPosition(draggingStationId, [event.lngLat.lng, event.lngLat.lat])
}

function stopStationDrag() {
  if (!draggingStationId) return
  draggingStationId = null
  map.getCanvas().style.cursor = ''
  map.dragPan.enable()
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

    map.on('click', 'railmap-stations-layer', handleStationClick)
    map.on('mousedown', 'railmap-stations-layer', startStationDrag)
  })

  map.on('click', handleMapClick)
  map.on('mousemove', onMouseMove)
  map.on('mouseup', stopStationDrag)
  map.on('mouseleave', stopStationDrag)
})

onBeforeUnmount(() => {
  if (map) {
    map.remove()
  }
})

watch(
  () => ({
    project: store.project,
    selectedStationId: store.selectedStationId,
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
        <span>模式: {{ store.mode }}</span>
      </div>
    </header>
    <div ref="mapContainer" class="map-editor__container"></div>
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
  min-height: 420px;
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
  min-height: 360px;
}
</style>
