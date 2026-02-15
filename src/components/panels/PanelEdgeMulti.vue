<script setup>
import { computed, reactive, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { getDisplayLineName } from '../../lib/lineNaming'
import { LINE_STYLE_OPTIONS } from '../../lib/lineStyles'

const store = useProjectStore()

const selectedEdgeCount = computed(() => store.selectedEdgeIds.length)
const edgeReassignTargets = computed(() => store.project?.lines || [])

const edgeBatchForm = reactive({
  targetLineId: '',
  lineStyle: '',
  curveMode: 'keep',
})

const canApplyBatch = computed(
  () => selectedEdgeCount.value > 0 && (Boolean(edgeBatchForm.targetLineId) || Boolean(edgeBatchForm.lineStyle) || edgeBatchForm.curveMode !== 'keep'),
)

function displayLineName(line) {
  return getDisplayLineName(line, 'zh') || line?.nameZh || ''
}

function applyBatch() {
  const edgeIds = store.selectedEdgeIds || []
  if (!edgeIds.length) return

  const patch = {}
  if (edgeBatchForm.targetLineId) patch.targetLineId = edgeBatchForm.targetLineId
  if (edgeBatchForm.lineStyle) patch.lineStyle = edgeBatchForm.lineStyle
  if (edgeBatchForm.curveMode === 'curved') patch.isCurved = true
  else if (edgeBatchForm.curveMode === 'straight') patch.isCurved = false

  if (!Object.keys(patch).length) {
    store.statusText = '请先选择至少一个批量变更项'
    return
  }

  const { updatedCount } = store.updateEdgesBatch(edgeIds, patch)
  if (!updatedCount) {
    store.statusText = '所选线段未发生变化'
    return
  }
  store.statusText = `已批量更新 ${updatedCount} 条线段`
}

function resetBatchForm() {
  edgeBatchForm.targetLineId = ''
  edgeBatchForm.lineStyle = ''
  edgeBatchForm.curveMode = 'keep'
}

watch(
  [() => store.selectedEdgeIds, () => store.project?.lines],
  ([edgeIds]) => {
    const lines = store.project?.lines || []
    const edges = (edgeIds || []).map((id) => store.project?.edges?.find((e) => e.id === id)).filter(Boolean)
    if (!edges.length || !lines.length) {
      resetBatchForm()
      return
    }
    const currentLineIds = new Set(
      edges.flatMap((edge) => (edge.sharedByLineIds || []).map((lineId) => String(lineId))),
    )
    const targetStillAvailable = lines.some((line) => line.id === edgeBatchForm.targetLineId)
    if (targetStillAvailable) return
    const preferred = lines.find((line) => !currentLineIds.has(String(line.id)))
    if (preferred) {
      edgeBatchForm.targetLineId = preferred.id
      return
    }
    edgeBatchForm.targetLineId = lines[0].id
  },
  { immediate: true },
)
</script>

<template>
  <div class="panel-edge-multi">
    <p class="pp-hint">已选 {{ selectedEdgeCount }} 条线段</p>

    <label class="pp-label">目标线路（批量）</label>
    <select v-model="edgeBatchForm.targetLineId" class="pp-select" :disabled="!edgeReassignTargets.length">
      <option value="">保持不变</option>
      <option v-for="line in edgeReassignTargets" :key="`ebm_line_${line.id}`" :value="line.id">
        {{ displayLineName(line) }}
      </option>
    </select>

    <label class="pp-label">线型（批量）</label>
    <select v-model="edgeBatchForm.lineStyle" class="pp-select">
      <option value="">保持不变</option>
      <option v-for="s in LINE_STYLE_OPTIONS" :key="`ebm_style_${s.id}`" :value="s.id">{{ s.label }}</option>
    </select>

    <label class="pp-label">曲线状态（批量）</label>
    <select v-model="edgeBatchForm.curveMode" class="pp-select">
      <option value="keep">保持不变</option>
      <option value="curved">设为曲线</option>
      <option value="straight">设为直线（清锚点）</option>
    </select>

    <div class="pp-row">
      <button class="pp-btn pp-btn--primary" :disabled="!canApplyBatch" @click="applyBatch">应用批量属性</button>
      <button class="pp-btn" @click="resetBatchForm">重置</button>
      <button class="pp-btn pp-btn--danger" @click="store.deleteSelectedEdge()">删除选中线段</button>
    </div>
  </div>
</template>

<style scoped>
.panel-edge-multi {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
