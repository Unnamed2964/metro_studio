<script setup>
import { computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'

const store = useProjectStore()

const anchor = computed(() => store.selectedEdgeAnchor)

function deleteAnchor() {
  if (!anchor.value) return
  store.removeSelectedEdgeAnchor()
}
</script>

<template>
  <div class="panel-anchor" v-if="anchor">
    <p class="pp-hint">锚点索引: {{ anchor.anchorIndex }}</p>
    <p class="pp-hint">所属线段: {{ anchor.edgeId }}</p>
    <div class="pp-row">
      <button class="pp-btn pp-btn--danger" @click="deleteAnchor">删除锚点</button>
    </div>
  </div>
</template>

<style scoped>
.panel-anchor {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
