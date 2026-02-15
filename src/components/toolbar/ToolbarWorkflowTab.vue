<script setup>
import { computed } from 'vue'
import IconBase from '../IconBase.vue'
import TooltipWrapper from '../TooltipWrapper.vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolbarStationOps } from '../../composables/useToolbarStationOps.js'
import { useToolbarEdgeOps } from '../../composables/useToolbarEdgeOps.js'

const store = useProjectStore()

const {
  selectedStationCount,
  selectAllStations,
  retranslateSelectedStationEnglishNames,
} = useToolbarStationOps()

const { selectedEdgeCount } = useToolbarEdgeOps()

const layoutGeoSeedScale = computed({
  get: () => Number(store.project?.layoutConfig?.geoSeedScale ?? 6),
  set: (value) => store.setLayoutGeoSeedScale(value),
})

function undoEdit() {
  store.undo()
}

function redoEdit() {
  store.redo()
}
</script>

<template>
  <section class="toolbar__section">
    <h3>工具</h3>
    <p class="toolbar__section-intro">选择编辑模式，执行选择与排版控制</p>
    <div class="toolbar__row">
      <TooltipWrapper text="选择/拖拽工具" shortcut="V">
        <button class="toolbar__btn" :class="{ active: store.mode === 'select' }" @click="store.setMode('select')">
          <IconBase name="cursor" :size="14" />
          <span>选择</span>
        </button>
      </TooltipWrapper>
      <TooltipWrapper text="点击添加站点" shortcut="S">
        <button class="toolbar__btn" :class="{ active: store.mode === 'add-station' }" @click="store.setMode('add-station')">
          <IconBase name="plus-circle" :size="14" />
          <span>点站</span>
        </button>
      </TooltipWrapper>
      <TooltipWrapper text="AI 智能点站" shortcut="A">
        <button class="toolbar__btn" :class="{ active: store.mode === 'ai-add-station' }" @click="store.setMode('ai-add-station')">
          <IconBase name="sparkles" :size="14" />
          <span>AI点站</span>
        </button>
      </TooltipWrapper>
    </div>
    <div class="toolbar__row">
      <TooltipWrapper text="连接两个站点" shortcut="E">
        <button class="toolbar__btn" :class="{ active: store.mode === 'add-edge' }" @click="store.setMode('add-edge')">
          <IconBase name="git-branch" :size="14" />
          <span>拉线</span>
        </button>
      </TooltipWrapper>
      <TooltipWrapper text="连续布线模式" shortcut="R">
        <button class="toolbar__btn" :class="{ active: store.mode === 'route-draw' }" @click="store.setMode('route-draw')">
          <IconBase name="route" :size="14" />
          <span>连续布线</span>
        </button>
      </TooltipWrapper>
    </div>
    <div class="toolbar__row">
      <span class="toolbar__meta">已选站点: {{ selectedStationCount }}</span>
      <span class="toolbar__meta">已选线段: {{ selectedEdgeCount }}</span>
    </div>
    <div class="toolbar__row">
      <TooltipWrapper text="撤销上一步操作" shortcut="Ctrl+Z">
        <button class="toolbar__btn" :disabled="!store.canUndo" @click="undoEdit">
          <IconBase name="undo" :size="14" />
        </button>
      </TooltipWrapper>
      <TooltipWrapper text="重做上一步操作" shortcut="Ctrl+Shift+Z">
        <button class="toolbar__btn" :disabled="!store.canRedo" @click="redoEdit">
          <IconBase name="redo" :size="14" />
        </button>
      </TooltipWrapper>
      <button class="toolbar__btn" @click="selectAllStations">全选站点</button>
      <button class="toolbar__btn" @click="store.clearSelection()">清空选择</button>
    </div>
    <button
      class="toolbar__btn"
      :disabled="selectedStationCount < 1 || store.isStationEnglishRetranslating"
      @click="retranslateSelectedStationEnglishNames"
    >
      {{ store.isStationEnglishRetranslating ? '翻译中...' : 'AI翻译选中站英文' }}
    </button>
    <label class="toolbar__label">地理种子缩放（geoSeedScale）</label>
    <div class="toolbar__range-row">
      <input
        v-model.number="layoutGeoSeedScale"
        class="toolbar__range"
        type="range"
        min="0.1"
        max="16"
        step="0.1"
        :disabled="!store.project || store.isLayoutRunning"
      />
      <span class="toolbar__range-value">{{ layoutGeoSeedScale.toFixed(1) }}</span>
    </div>
    <p class="toolbar__hint">值越大，初始地理骨架展开越明显。</p>
    <button
      class="toolbar__btn toolbar__btn--primary"
      :disabled="store.isLayoutRunning || !store.project?.stations?.length"
      @click="store.runAutoLayout()"
    >
      {{ store.isLayoutRunning ? '排版中...' : '自动生成官方风' }}
    </button>
  </section>
</template>

<style src="./toolbar-shared.css"></style>
