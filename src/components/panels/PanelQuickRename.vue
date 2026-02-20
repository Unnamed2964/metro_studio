<script setup>
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'

const props = defineProps({
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['close'])

const store = useProjectStore()
const nameInputRef = ref(null)
const tempName = ref('')

const currentIndex = computed(() => store.quickRename?.currentIndex ?? 0)
const stationOrder = computed(() => store.quickRename?.stationOrder ?? [])
const totalStations = computed(() => stationOrder.value.length)

const currentStationId = computed(() => {
  if (currentIndex.value < 0 || currentIndex.value >= stationOrder.value.length) return null
  return stationOrder.value[currentIndex.value]
})

const currentStation = computed(() => {
  if (!store.project || !currentStationId.value) return null
  return store.project.stations.find(s => s.id === currentStationId.value) || null
})

const currentLine = computed(() => {
  if (!store.project || !store.activeLineId) return null
  return store.project.lines.find(l => l.id === store.activeLineId) || null
})

const progressText = computed(() => {
  if (totalStations.value === 0) return '0/0'
  return `${currentIndex.value + 1}/${totalStations.value}`
})

watch(currentStation, (station) => {
  if (station) {
    tempName.value = station.nameZh || ''
  }
}, { immediate: true })

watch(() => store.quickRename?.active, async (active) => {
  if (active && props.visible) {
    await nextTick()
    nameInputRef.value?.focus()
    nameInputRef.value?.select()
  }
})

onMounted(() => {
  if (props.visible) {
    store.activateQuickRename()
  }
})

function handleKeydown(e) {
  if (e.key === 'Enter') {
    saveAndNext()
  } else if (e.key === 'Escape') {
    emit('close')
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    goToNext()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    goToPrev()
  } else if (e.key === 'Shift+Enter') {
    e.preventDefault()
    saveAndPrev()
  }
}

function saveAndNext() {
  if (currentStation.value && tempName.value) {
    store.updateStationName(currentStation.value.id, {
      nameZh: tempName.value.trim()
    })
  }
  if (currentIndex.value >= totalStations.value - 1) {
    emit('close')
  } else {
    goToNext()
  }
}

function saveAndPrev() {
  if (currentStation.value && tempName.value) {
    store.updateStationName(currentStation.value.id, {
      nameZh: tempName.value.trim()
    })
  }
  goToPrev()
}

function goToNext() {
  if (currentIndex.value < totalStations.value - 1) {
    store.quickRenameNext()
  }
}

function goToPrev() {
  if (currentIndex.value > 0) {
    store.quickRenamePrev()
  }
}
</script>

<template>
  <div class="panel-quick-rename" v-if="visible && currentStation">
    <div class="panel-quick-rename__header">
      <span class="panel-quick-rename__progress">{{ progressText }}</span>
      <span class="panel-quick-rename__station-id">{{ currentStation.id }}</span>
    </div>

    <div v-if="currentLine" class="panel-quick-rename__line-info">
      <span class="panel-quick-rename__line-color" :style="{ backgroundColor: currentLine.color }" />
      <span class="panel-quick-rename__line-name">{{ currentLine.nameZh }}</span>
    </div>

    <input
      ref="nameInputRef"
      v-model="tempName"
      class="panel-quick-rename__input"
      type="text"
      placeholder="输入站名"
      @keydown="handleKeydown"
    />

    <div class="panel-quick-rename__hints">
      <div class="panel-quick-rename__hint">Enter 保存并下一个</div>
      <div class="panel-quick-rename__hint">↑↓ 切换站点</div>
      <div class="panel-quick-rename__hint">Esc 退出</div>
    </div>
  </div>
</template>

<style scoped>
.panel-quick-rename {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-quick-rename__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--toolbar-active-bg);
  border-radius: 6px;
  border: 1px solid var(--toolbar-active-border);
}

.panel-quick-rename__progress {
  font-size: 18px;
  font-weight: 700;
  color: var(--toolbar-status);
  font-variant-numeric: tabular-nums;
}

.panel-quick-rename__station-id {
  font-size: 11px;
  color: var(--toolbar-muted);
}

.panel-quick-rename__line-info {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--toolbar-input-bg);
  border-radius: 6px;
  border: 1px solid var(--toolbar-input-border);
}

.panel-quick-rename__line-color {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 1.5px solid rgba(0, 0, 0, 0.12);
  flex-shrink: 0;
}

.panel-quick-rename__line-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--toolbar-text);
}

.panel-quick-rename__input {
  width: 100%;
  padding: 12px 14px;
  font-size: 16px;
  font-weight: 500;
  border: 2px solid var(--toolbar-primary-border);
  border-radius: 8px;
  background: var(--toolbar-input-bg);
  color: var(--toolbar-text);
  outline: none;
  box-sizing: border-box;
}

.panel-quick-rename__input:focus {
  border-color: #8b5cf6;
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15);
}

.panel-quick-rename__hints {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0;
}

.panel-quick-rename__hint {
  font-size: 11px;
  color: var(--toolbar-muted);
  padding: 3px 0;
}
</style>
