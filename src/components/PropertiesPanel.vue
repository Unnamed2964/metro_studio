<script setup>
import { computed } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { usePanelResize } from '../composables/usePanelResize'
import PanelNoSelection from './panels/PanelNoSelection.vue'
import PanelStationSingle from './panels/PanelStationSingle.vue'
import PanelStationMulti from './panels/PanelStationMulti.vue'
import PanelEdgeSingle from './panels/PanelEdgeSingle.vue'
import PanelEdgeMulti from './panels/PanelEdgeMulti.vue'
import PanelAnchor from './panels/PanelAnchor.vue'

const store = useProjectStore()
const { width, onPointerDown } = usePanelResize()

const selectedStationCount = computed(() => store.selectedStationIds.length)
const selectedEdgeCount = computed(() => store.selectedEdgeIds.length)

const selectedStation = computed(() => {
  if (!store.project || !store.selectedStationId) return null
  return store.project.stations.find((s) => s.id === store.selectedStationId) || null
})

const panelType = computed(() => {
  if (store.selectedEdgeAnchor) return 'anchor'
  if (selectedEdgeCount.value > 1) return 'edge-multi'
  if (selectedEdgeCount.value === 1) return 'edge-single'
  if (selectedStationCount.value === 1 && selectedStation.value) return 'station-single'
  if (selectedStationCount.value > 1) return 'station-multi'
  return 'none'
})

const panelTitle = computed(() => {
  switch (panelType.value) {
    case 'anchor': return '锚点'
    case 'edge-multi': return `线段（${selectedEdgeCount.value}）`
    case 'edge-single': return '线段'
    case 'station-single': return '站点'
    case 'station-multi': return `站点（${selectedStationCount.value}）`
    default: return '属性'
  }
})
</script>

<template>
  <aside class="properties-panel" :style="{ width: `${width}px` }">
    <div class="properties-panel__resize-handle" @pointerdown="onPointerDown" />
    <div class="properties-panel__header">
      <span class="properties-panel__title">{{ panelTitle }}</span>
    </div>
    <div class="properties-panel__body">
      <PanelAnchor v-if="panelType === 'anchor'" />
      <PanelEdgeMulti v-else-if="panelType === 'edge-multi'" />
      <PanelEdgeSingle v-else-if="panelType === 'edge-single'" />
      <PanelStationSingle v-else-if="panelType === 'station-single'" />
      <PanelStationMulti v-else-if="panelType === 'station-multi'" />
      <PanelNoSelection v-else />
    </div>
  </aside>
</template>

<style scoped>
.properties-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--toolbar-bg);
  border-left: 1px solid var(--toolbar-border);
  overflow: hidden;
  flex-shrink: 0;
}

.properties-panel__resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  z-index: 10;
  transition: background-color 0.15s ease;
}

.properties-panel__resize-handle:hover,
.properties-panel__resize-handle:active {
  background: var(--toolbar-tab-active-border);
}

.properties-panel__header {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--toolbar-border);
  background: var(--toolbar-header-bg);
  flex-shrink: 0;
}

.properties-panel__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--toolbar-text);
}

.properties-panel__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 12px;
}

.properties-panel__body::-webkit-scrollbar {
  width: 6px;
}

.properties-panel__body::-webkit-scrollbar-thumb {
  background: var(--toolbar-scrollbar-thumb);
  border-radius: 999px;
}
</style>
