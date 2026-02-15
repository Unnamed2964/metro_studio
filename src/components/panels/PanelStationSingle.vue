<script setup>
import { computed, reactive, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'

const store = useProjectStore()

const selectedStation = computed(() => {
  if (!store.project || !store.selectedStationId) return null
  return store.project.stations.find((s) => s.id === store.selectedStationId) || null
})

const stationForm = reactive({
  nameZh: '',
  nameEn: '',
})

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
    <input v-model="stationForm.nameZh" class="pp-input" placeholder="车站中文名" />
    <input v-model="stationForm.nameEn" class="pp-input" placeholder="Station English Name" />
    <div class="pp-row">
      <button class="pp-btn pp-btn--primary" @click="applyStationRename">保存站名</button>
      <button class="pp-btn pp-btn--danger" @click="deleteStation">删除站点</button>
    </div>
  </div>
</template>

<style scoped>
.panel-station-single {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
