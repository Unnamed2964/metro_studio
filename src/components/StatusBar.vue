<script setup>
import { computed, inject } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { useWorldMetroRanking } from '../composables/useWorldMetroRanking'
import { NTooltip } from 'naive-ui'

const store = useProjectStore()
const { state: ranking, rankingMessage, comparisonMessage, timestamp, refresh: refreshRanking } = useWorldMetroRanking()

const saveState = inject('autoSaveSaveState')
const lastSavedAt = inject('autoSaveLastSavedAt')
const saveNow = inject('autoSaveSaveNow')

const appVersion = import.meta.env.__APP_VERSION__ || '0.1.0'

const saveIndicator = computed(() => {
  switch (saveState?.value) {
    case 'saving':
      return { label: '正在保存...', cssClass: 'status-bar__save--saving' }
    case 'unsaved':
      return { label: '未保存更改', cssClass: 'status-bar__save--unsaved' }
    case 'error':
      return { label: '保存失败', cssClass: 'status-bar__save--error' }
    case 'saved':
    default:
      return { label: '已保存', cssClass: 'status-bar__save--saved' }
  }
})

const lastSavedLabel = computed(() => {
  if (!lastSavedAt?.value) return ''
  const d = lastSavedAt.value
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
})

const MODE_LABELS = {
  select: '选择/拖拽',
  'add-station': '点站',
  'add-edge': '拉线',
  'route-draw': '连续布线',
  'style-brush': '样式刷',
  'box-select': '框选',
  'quick-link': '快速连线',
  'anchor-edit': '锚点编辑',
  'delete-mode': '删除',
  'measure-two-point': '两点测量',
  'measure-multi-point': '多点测量',
  'annotation': '注释',
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
    <div class="status-bar__edge-line"></div>
    <div class="status-bar__section">
      <span class="status-bar__label">[模式]</span>
      <span class="status-bar__badge ark-chamfer">{{ modeLabel }}</span>
      <span v-if="store.currentEditYear != null" class="status-bar__badge status-bar__badge--year">编辑年份: {{ store.currentEditYear }}</span>
    </div>
    <div class="status-bar__divider"></div>
    <div class="status-bar__section">
      <span class="status-bar__label">[选中]</span>
      <span class="status-bar__value">{{ selectionSummary }}</span>
    </div>
    <div class="status-bar__divider"></div>
    <div class="status-bar__section status-bar__section--grow">
      <span class="status-bar__label">[工程]</span>
      <span class="status-bar__value">{{ projectSummary }}</span>
    </div>
    <div class="status-bar__divider"></div>
    <div class="status-bar__section status-bar__section--save" @click="saveNow">
      <span class="status-bar__save-dot" :class="saveIndicator.cssClass"></span>
      <span class="status-bar__value">{{ saveIndicator.label }}</span>
      <span v-if="lastSavedLabel && saveState?.value !== 'saving'" class="status-bar__save-time">{{ lastSavedLabel }}</span>
    </div>
    <div v-if="store.statusText" class="status-bar__divider"></div>
    <div v-if="store.statusText" class="status-bar__section status-bar__section--status">
      <span class="status-bar__value status-bar__value--status">{{ store.statusText }}</span>
    </div>
    <div class="status-bar__divider"></div>
    <div class="status-bar__section">
      <span class="status-bar__label">[排名]</span>
      <NTooltip placement="top">
        <template #trigger>
          <span class="status-bar__value status-bar__value--ranking" @click="refreshRanking" style="cursor: pointer;">
            {{ ranking.loading ? '加载中...' : rankingMessage }}
          </span>
        </template>
        {{ `${comparisonMessage || ''}${timestamp ? ` · ${timestamp}` : ''}` }}
      </NTooltip>
    </div>
    <div class="status-bar__divider"></div>
    <div class="status-bar__section">
      <span class="status-bar__label">[版本]</span>
      <span class="status-bar__value status-bar__value--version">{{ appVersion }}</span>
    </div>
  </footer>
</template>

<style scoped>
.status-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 12px;
  background: var(--toolbar-header-bg);
  backdrop-filter: blur(12px) saturate(1.2);
  font-family: var(--app-font-mono);
  font-size: 10px;
  line-height: 1.4;
  min-height: 28px;
}

.status-bar__edge-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--ark-pink);
  opacity: 0.2;
}

.status-bar__section {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  min-width: 0;
}

.status-bar__section--grow {
  flex: 1;
  min-width: 0;
}

.status-bar__section--status {
  margin-left: auto;
  min-width: 0;
}

.status-bar__label {
  color: var(--ark-text-dim);
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  flex-shrink: 0;
}

.status-bar__badge {
  color: #fff;
  font-weight: 500;
  background: rgba(255, 45, 120, 0.15);
  border: 1px solid rgba(255, 45, 120, 0.3);
  padding: 1px 6px;
  font-size: 10px;
}

.status-bar__badge--year {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

.status-bar__value {
  color: var(--workspace-panel-text);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-bar__value--status {
  color: var(--toolbar-status);
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-bar__value--ranking {
  color: var(--toolbar-text);
  transition: color var(--transition-fast);
}

.status-bar__value--ranking:hover {
  color: var(--toolbar-tab-active-text);
}

.status-bar__value--version {
  font-size: 10px;
  color: var(--workspace-panel-muted);
  font-weight: 400;
}

.status-bar__divider {
  width: 1px;
  height: 12px;
  background: var(--workspace-panel-border);
  flex-shrink: 0;
}

.status-bar__section--save {
  cursor: pointer;
  border-radius: var(--radius-sm, 4px);
  padding: 2px 6px;
  margin: -2px 0;
  transition: background var(--transition-fast);
}

.status-bar__section--save:hover {
  background: rgba(255, 255, 255, 0.05);
}

.status-bar__save-dot {
  width: 5px;
  height: 5px;
  flex-shrink: 0;
}

.status-bar__save--saved {
  background: var(--ark-text-dim);
}

.status-bar__save--unsaved {
  background: var(--ark-pink);
  box-shadow: 0 0 4px var(--ark-pink-glow);
}

.status-bar__save--saving {
  background: var(--ark-purple);
  box-shadow: 0 0 4px var(--ark-purple-glow);
  animation: ark-pulse 1s ease-in-out infinite;
}

.status-bar__save--error {
  background: #f87171;
  box-shadow: 0 0 4px rgba(248, 113, 113, 0.4);
}

.status-bar__save-time {
  color: var(--ark-text-dim);
  font-size: 10px;
}

@media (max-width: 960px) {
  .status-bar {
    flex-wrap: wrap;
    gap: 8px;
    padding: 6px 12px;
  }

  .status-bar__section--grow {
    flex-basis: 100%;
  }
}
</style>
