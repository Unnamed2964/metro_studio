<script setup>
import { computed } from 'vue'
import { useProjectStore } from '../stores/projectStore'

const store = useProjectStore()

const MODE_LABELS = {
  select: '选择/拖拽',
  'add-station': '点站',
  'ai-add-station': 'AI点站',
  'add-edge': '拉线',
  'route-draw': '连续布线',
}

const modeLabel = computed(() => MODE_LABELS[store.mode] || store.mode)

const selectionSummary = computed(() => {
  const stationCount = store.selectedStationIds?.length || 0
  const edgeCount = store.selectedEdgeIds?.length || 0
  const anchorSelected = store.selectedEdgeAnchor ? 1 : 0

  const parts = []
  if (stationCount > 0) parts.push(`${stationCount} 站点`)
  if (edgeCount > 0) parts.push(`${edgeCount} 线段`)
  if (anchorSelected > 0) parts.push(`${anchorSelected} 锚点`)

  return parts.length > 0 ? parts.join(', ') : '无选中'
})

const projectSummary = computed(() => {
  if (!store.project) return '无工程'
  const stationCount = store.project.stations?.length || 0
  const edgeCount = store.project.edges?.length || 0
  const lineCount = store.project.lines?.length || 0
  return `${lineCount} 线路 · ${stationCount} 站点 · ${edgeCount} 线段`
})
</script>

<template>
  <footer class="status-bar">
    <div class="status-bar__section">
      <span class="status-bar__label">模式</span>
      <span class="status-bar__value">{{ modeLabel }}</span>
    </div>
    <div class="status-bar__divider"></div>
    <div class="status-bar__section">
      <span class="status-bar__label">选中</span>
      <span class="status-bar__value">{{ selectionSummary }}</span>
    </div>
    <div class="status-bar__divider"></div>
    <div class="status-bar__section status-bar__section--grow">
      <span class="status-bar__label">工程</span>
      <span class="status-bar__value">{{ projectSummary }}</span>
    </div>
    <div v-if="store.statusText" class="status-bar__divider"></div>
    <div v-if="store.statusText" class="status-bar__section status-bar__section--status">
      <span class="status-bar__value status-bar__value--status">{{ store.statusText }}</span>
    </div>
  </footer>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  background: var(--workspace-panel-header-bg);
  border-top: 1px solid var(--workspace-panel-header-border);
  font-size: 11px;
  line-height: 1.4;
  min-height: 32px;
}

.status-bar__section {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.status-bar__section--grow {
  flex: 1;
  min-width: 0;
}

.status-bar__section--status {
  margin-left: auto;
}

.status-bar__label {
  color: var(--workspace-panel-muted);
  font-weight: 600;
}

.status-bar__value {
  color: var(--workspace-panel-text);
  font-weight: 500;
}

.status-bar__value--status {
  color: var(--toolbar-status);
}

.status-bar__divider {
  width: 1px;
  height: 16px;
  background: var(--workspace-panel-border);
  flex-shrink: 0;
}

@media (max-width: 960px) {
  .status-bar {
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 12px;
  }

  .status-bar__section--grow {
    flex-basis: 100%;
  }
}
</style>
