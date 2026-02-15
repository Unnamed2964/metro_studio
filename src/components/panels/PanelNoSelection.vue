<script setup>
import { computed, reactive, ref, watch } from 'vue'
import AccordionSection from '../AccordionSection.vue'
import IconBase from '../IconBase.vue'
import { useProjectStore } from '../../stores/projectStore'
import { getDisplayLineName } from '../../lib/lineNaming'
import { LINE_STYLE_OPTIONS, normalizeLineStyle } from '../../lib/lineStyles'
import { useWorldMetroRanking } from '../../composables/useWorldMetroRanking'

const store = useProjectStore()
const { state: ranking, rankingMessage, comparisonMessage, timestamp, refresh: refreshRanking } = useWorldMetroRanking()

const activeLine = computed(() => {
  if (!store.project || !store.activeLineId) return null
  return store.project.lines.find((l) => l.id === store.activeLineId) || null
})

const lineForm = reactive({
  nameZh: '',
  nameEn: '',
  color: '#005BBB',
  status: 'open',
  style: 'solid',
  isLoop: false,
})

const layoutGeoSeedScale = computed({
  get: () => Number(store.project?.layoutConfig?.geoSeedScale ?? 6),
  set: (value) => store.setLayoutGeoSeedScale(value),
})

function displayLineName(line) {
  return getDisplayLineName(line, 'zh') || line?.nameZh || ''
}

function addLine() {
  store.addLine({})
}

function applyLineChanges() {
  if (!activeLine.value) return
  store.updateLine(activeLine.value.id, {
    nameZh: lineForm.nameZh,
    nameEn: lineForm.nameEn,
    color: lineForm.color,
    status: lineForm.status,
    style: lineForm.style,
    isLoop: lineForm.isLoop,
  })
}

function deleteActiveLine() {
  if (!activeLine.value) return
  store.deleteLine(activeLine.value.id)
}

watch(
  activeLine,
  (line) => {
    lineForm.nameZh = line?.nameZh || ''
    lineForm.nameEn = line?.nameEn || ''
    lineForm.color = line?.color || '#005BBB'
    lineForm.status = line?.status || 'open'
    lineForm.style = normalizeLineStyle(line?.style)
    lineForm.isLoop = Boolean(line?.isLoop)
  },
  { immediate: true },
)
</script>

<template>
  <div class="panel-no-sel">
    <AccordionSection title="线路管理">
      <button class="pp-btn pp-btn--primary" @click="addLine">
        <IconBase name="plus-circle" :size="14" />
        新增线路
      </button>
      <ul class="line-list">
        <li v-for="line in store.project?.lines || []" :key="line.id">
          <button
            class="line-item"
            :class="{ active: store.activeLineId === line.id }"
            @click="store.setActiveLine(line.id)"
          >
            <span class="line-swatch" :style="{ backgroundColor: line.color }" />
            <span>{{ displayLineName(line) }}</span>
          </button>
        </li>
      </ul>

      <template v-if="activeLine">
        <div class="pp-divider" />
        <p class="pp-hint">当前线路: {{ displayLineName(activeLine) }}</p>
        <input v-model="lineForm.nameZh" class="pp-input" placeholder="中文线路名" />
        <input v-model="lineForm.nameEn" class="pp-input" placeholder="English line name" />
        <input v-model="lineForm.color" type="color" class="pp-color" />
        <div class="pp-row">
          <select v-model="lineForm.status" class="pp-select">
            <option value="open">运营</option>
            <option value="construction">在建</option>
            <option value="proposed">规划</option>
          </select>
          <select v-model="lineForm.style" class="pp-select">
            <option v-for="s in LINE_STYLE_OPTIONS" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select>
        </div>
        <label class="pp-checkbox">
          <input v-model="lineForm.isLoop" type="checkbox" />
          环线
        </label>
        <div class="pp-row">
          <button class="pp-btn pp-btn--primary" @click="applyLineChanges">保存线路</button>
          <button class="pp-btn pp-btn--danger" @click="deleteActiveLine">删除线路</button>
        </div>
      </template>
    </AccordionSection>

    <AccordionSection title="排版控制">
      <label class="pp-label">地理种子缩放</label>
      <div class="pp-range-row">
        <input
          v-model.number="layoutGeoSeedScale"
          class="pp-range"
          type="range"
          min="0.1"
          max="16"
          step="0.1"
          :disabled="!store.project || store.isLayoutRunning"
        />
        <span class="pp-range-value">{{ layoutGeoSeedScale.toFixed(1) }}</span>
      </div>
      <p class="pp-hint">值越大，初始地理骨架展开越明显。</p>
      <button
        class="pp-btn pp-btn--primary"
        :disabled="store.isLayoutRunning || !store.project?.stations?.length"
        @click="store.runAutoLayout()"
      >
        {{ store.isLayoutRunning ? '排版中...' : '自动生成官方风' }}
      </button>
    </AccordionSection>

    <AccordionSection title="全球排名" :default-open="false">
      <p v-if="ranking.loading" class="pp-hint">排行榜加载中...</p>
      <p v-else class="pp-ranking-main">{{ rankingMessage }}</p>
      <p v-if="!ranking.loading && ranking.error" class="pp-hint">{{ ranking.error }}</p>
      <p v-else-if="!ranking.loading && comparisonMessage" class="pp-hint">{{ comparisonMessage }}</p>
      <p v-if="timestamp" class="pp-hint">数据时间: {{ timestamp }}</p>
      <button class="pp-btn pp-btn--small" :disabled="ranking.loading" @click="refreshRanking">刷新排名</button>
    </AccordionSection>
  </div>
</template>

<style scoped>
.panel-no-sel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.line-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.line-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 6px;
  background: var(--toolbar-input-bg);
  color: var(--toolbar-text);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.12s ease;
}

.line-item:hover { border-color: var(--toolbar-button-hover-border); }
.line-item.active {
  background: var(--toolbar-tab-active-bg);
  border-color: var(--toolbar-tab-active-border);
}

.line-swatch {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  flex-shrink: 0;
}

.pp-ranking-main {
  margin: 0;
  font-size: 12px;
  color: var(--toolbar-text);
}
</style>
