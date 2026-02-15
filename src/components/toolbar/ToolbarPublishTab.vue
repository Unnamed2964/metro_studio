<script setup>
import { computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'

const store = useProjectStore()

const exportStationVisibilityMode = computed({
  get: () => store.exportStationVisibilityMode || 'all',
  set: (value) => store.setExportStationVisibilityMode(value),
})
</script>

<template>
  <section class="toolbar__section">
    <h3>发布导出</h3>
    <p class="toolbar__section-intro">按目标输出格式导出当前工程成果。</p>
    <label class="toolbar__label">车站显示</label>
    <select v-model="exportStationVisibilityMode" class="toolbar__input">
      <option value="interchange">仅显示换乘站</option>
      <option value="none">隐藏所有车站</option>
      <option value="all">显示所有车站</option>
    </select>
    <div class="toolbar__row">
      <button class="toolbar__btn" @click="store.exportActualRoutePng()">导出实际走向图 PNG</button>
      <button class="toolbar__btn" @click="store.exportOfficialSchematicPng()">导出官方风格图 PNG</button>
    </div>
    <div class="toolbar__row">
      <button class="toolbar__btn" @click="store.exportAllLineHudZip()">导出车辆 HUD 打包</button>
    </div>
  </section>
</template>

<style src="./toolbar-shared.css"></style>
