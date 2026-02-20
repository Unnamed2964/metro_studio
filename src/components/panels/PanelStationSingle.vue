<script setup>
import { computed, inject, nextTick, reactive, ref, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { getDisplayLineName } from '../../lib/lineNaming'
import { NTooltip } from 'naive-ui'

const store = useProjectStore()
const nameZhInputRef = ref(null)

const renameTrigger = inject('stationRenameTrigger', ref(0))

watch(renameTrigger, async () => {
  if (!selectedStation.value || !nameZhInputRef.value) return
  await nextTick()
  nameZhInputRef.value.focus()
  nameZhInputRef.value.select()
})

const selectedStation = computed(() => {
  if (!store.project || !store.selectedStationId) return null
  return store.project.stations.find((s) => s.id === store.selectedStationId) || null
})

const stationForm = reactive({
  nameZh: '',
  nameEn: '',
})

const coordinatesText = computed(() => {
  if (!selectedStation.value?.lngLat) return null
  const [lng, lat] = selectedStation.value.lngLat
  return `${lng.toFixed(6)}, ${lat.toFixed(6)}`
})

const belongingLines = computed(() => {
  if (!selectedStation.value?.lineIds?.length) return []
  const lineMap = store.lineById
  return selectedStation.value.lineIds
    .map((id) => lineMap.get(id))
    .filter(Boolean)
})

const connectedEdgesCount = computed(() => {
  if (!selectedStation.value || !store.project?.edges) return 0
  const sid = selectedStation.value.id
  return store.project.edges.filter(
    (e) => e.fromStationId === sid || e.toStationId === sid,
  ).length
})

function displayLineName(line) {
  return getDisplayLineName(line, 'zh') || line?.nameZh || ''
}

function applyStationRename() {
  if (!selectedStation.value) return
  store.updateStationName(selectedStation.value.id, {
    nameZh: stationForm.nameZh,
    nameEn: stationForm.nameEn,
  })
}

function deleteStation() {
  store.deleteSelectedStations()
}

watch(
  selectedStation,
  (station) => {
    stationForm.nameZh = station?.nameZh || ''
    stationForm.nameEn = station?.nameEn || ''
  },
  { immediate: true },
)
</script>

<template>
  <div class="panel-station-single" v-if="selectedStation">
    <p class="pp-hint">站点 ID: {{ selectedStation.id }}</p>
    <input ref="nameZhInputRef" v-model="stationForm.nameZh" class="pp-input" placeholder="车站中文名" />
    <input v-model="stationForm.nameEn" class="pp-input" placeholder="Station English Name" />

    <div class="pp-divider" />

    <label class="pp-label">坐标</label>
    <p class="pp-hint station-info-value">{{ coordinatesText }}</p>

    <label class="pp-label">所属线路</label>
    <ul v-if="belongingLines.length" class="station-line-tags">
      <li v-for="line in belongingLines" :key="line.id" :title="line.nameZh">
        <span class="station-line-swatch" :style="{ backgroundColor: line.color }" />
        <span>{{ displayLineName(line) }}</span>
      </li>
    </ul>
    <p v-else class="pp-hint">无</p>

    <label class="pp-label">换乘状态</label>
    <p class="pp-hint station-info-value">
      <span v-if="selectedStation.isInterchange" class="station-badge station-badge--interchange">
        换乘站 · {{ selectedStation.transferLineIds?.length || belongingLines.length }} 线
      </span>
      <span v-else>非换乘站</span>
    </p>

    <label class="pp-label">连接线段</label>
    <p class="pp-hint station-info-value">{{ connectedEdgesCount }} 条</p>

    <div class="pp-divider" />

    <div class="pp-row">
      <NTooltip placement="bottom">
        <template #trigger>
          <button class="pp-btn pp-btn--primary" @click="applyStationRename">保存站名</button>
        </template>
        保存站名
      </NTooltip>
      <NTooltip placement="bottom">
        <template #trigger>
          <button class="pp-btn pp-btn--danger" @click="deleteStation">删除站点</button>
        </template>
        删除站点
      </NTooltip>
    </div>
  </div>
</template>

<style scoped>
.panel-station-single {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.station-info-value {
  margin: 0;
  user-select: text;
}

.station-line-tags {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.station-line-tags li {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 4px;
  background: var(--toolbar-input-bg);
  font-size: 11px;
  color: var(--toolbar-text);
}

.station-line-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}

.station-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.station-badge--interchange {
  background: var(--toolbar-active-bg);
  border: 1px solid var(--toolbar-active-border);
  color: var(--toolbar-status);
}
</style>
