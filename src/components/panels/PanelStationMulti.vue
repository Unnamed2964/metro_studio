<script setup>
import { computed, reactive } from 'vue'
import AccordionSection from '../AccordionSection.vue'
import { useProjectStore } from '../../stores/projectStore'
import { useAiBatchNaming } from '../../composables/useAiBatchNaming'
import { useAiAutoBatchNaming } from '../../composables/useAiAutoBatchNaming'

const store = useProjectStore()

const aiBatch = useAiBatchNaming()
const aiAutoBatch = useAiAutoBatchNaming()

const selectedStationCount = computed(() => store.selectedStationIds.length)

const selectedStationsInOrder = computed(() => {
  if (!store.project) return []
  const stationMap = new Map(store.project.stations.map((s) => [s.id, s]))
  return (store.selectedStationIds || []).map((id) => stationMap.get(id)).filter(Boolean)
})

const stationBatchForm = reactive({
  zhTemplate: '',
  enTemplate: '',
  startIndex: 1,
})

const stationEnglishRetranslateProgress = computed(() => store.stationEnglishRetranslateProgress || {
  done: 0,
  total: 0,
  percent: 0,
  message: '',
})

const canEditSelectedManualTransfer = computed(() => selectedStationCount.value === 2)

const selectedManualTransferExists = computed(() => {
  if (!canEditSelectedManualTransfer.value) return false
  const [stationAId, stationBId] = store.selectedStationIds
  return store.hasManualTransferBetweenStations(stationAId, stationBId)
})

function applyBatchStationRename() {
  store.renameSelectedStationsByTemplate({
    zhTemplate: stationBatchForm.zhTemplate,
    enTemplate: stationBatchForm.enTemplate,
    startIndex: stationBatchForm.startIndex,
  })
}

function startAiBatchNaming() {
  const selected = selectedStationsInOrder.value
  if (!selected.length) return
  aiBatch.start(selected)
}

function startAiAutoBatchNaming() {
  if (aiBatch.state.active || aiBatch.state.generating) return
  const selected = selectedStationsInOrder.value
  if (!selected.length) return
  aiAutoBatch.start(selected)
}
</script>

<template>
  <div class="panel-station-multi">
    <p class="pp-hint">已选 {{ selectedStationCount }} 个站点</p>

    <AccordionSection title="AI 批量命名">
      <div class="pp-row">
        <button
          class="pp-btn"
          :disabled="store.isStationEnglishRetranslating || aiBatch.state.generating || aiBatch.state.active || aiAutoBatch.state.active"
          @click="startAiBatchNaming"
        >
          先生成后点选
        </button>
        <button
          class="pp-btn pp-btn--primary"
          :disabled="store.isStationEnglishRetranslating || aiBatch.state.active || aiBatch.state.generating || aiAutoBatch.state.active"
          @click="startAiAutoBatchNaming"
        >
          全自动命名
        </button>
      </div>

      <!-- AI 批量命名（先生成后点选）进度 -->
      <div v-if="aiBatch.state.active" class="pp-progress">
        <div class="pp-progress-head">
          <span>
            <template v-if="aiBatch.state.phase === 'prefetch'">
              候选预生成 {{ aiBatch.state.prefetchedCount }}/{{ aiBatch.total.value }}
            </template>
            <template v-else>
              逐站命名 {{ Math.min(aiBatch.state.currentIndex + 1, aiBatch.total.value) }}/{{ aiBatch.total.value }}
              {{ aiBatch.currentStation.value ? `· ${aiBatch.currentStation.value.nameZh || aiBatch.currentStation.value.id}` : '' }}
            </template>
          </span>
          <strong>{{ aiBatch.progressPercent.value }}%</strong>
        </div>
        <div class="pp-progress-track">
          <div class="pp-progress-fill" :style="{ width: `${aiBatch.progressPercent.value}%` }" />
        </div>
        <p v-if="aiBatch.state.phase === 'prefetch'" class="pp-hint">
          已成功 {{ Math.max(0, aiBatch.state.prefetchedCount - aiBatch.state.prefetchFailedCount) }}，失败 {{ aiBatch.state.prefetchFailedCount }}
        </p>
        <p v-else class="pp-hint">已应用 {{ aiBatch.state.appliedCount }}，已跳过 {{ aiBatch.state.skippedCount }}</p>
        <p v-if="aiBatch.state.generating && aiBatch.state.phase === 'prefetch'" class="pp-hint">正在批量生成全部站点候选...</p>
        <p v-if="aiBatch.state.generating && aiBatch.state.phase === 'select'" class="pp-hint">正在重试当前站候选...</p>
        <p v-if="aiBatch.state.error" class="pp-hint">{{ aiBatch.state.error }}</p>
        <p v-if="aiBatch.state.phase === 'select' && aiBatch.currentError.value" class="pp-hint">{{ aiBatch.currentError.value }}</p>

        <div v-if="aiBatch.state.phase === 'select' && !aiBatch.state.generating && aiBatch.currentCandidates.value.length" class="pp-ai-candidates">
          <button
            v-for="candidate in aiBatch.currentCandidates.value"
            :key="`${candidate.nameZh}__${candidate.nameEn}`"
            class="pp-ai-candidate-btn"
            @click="aiBatch.applyCandidate(candidate)"
          >
            <strong>{{ candidate.nameZh }}</strong>
            <span>{{ candidate.nameEn }}</span>
            <small>{{ candidate.basis }} · {{ candidate.reason }}</small>
          </button>
        </div>

        <div v-if="aiBatch.state.phase === 'select'" class="pp-row">
          <button class="pp-btn" :disabled="aiBatch.state.generating" @click="aiBatch.retryCurrent">重试</button>
          <button class="pp-btn" :disabled="aiBatch.state.generating" @click="aiBatch.skipCurrent">跳过</button>
          <button class="pp-btn pp-btn--danger" :disabled="aiBatch.state.generating" @click="aiBatch.cancel">结束</button>
        </div>
        <div v-else class="pp-row">
          <button class="pp-btn pp-btn--danger" :disabled="!aiBatch.state.generating" @click="aiBatch.cancel">取消预生成</button>
        </div>
      </div>

      <!-- AI 全自动批量命名进度 -->
      <div v-if="aiAutoBatch.state.active" class="pp-progress">
        <div class="pp-progress-head">
          <span>AI全自动命名 {{ aiAutoBatch.state.doneCount }}/{{ aiAutoBatch.total.value }}</span>
          <strong>{{ aiAutoBatch.percent.value }}%</strong>
        </div>
        <div class="pp-progress-track">
          <div class="pp-progress-fill" :style="{ width: `${aiAutoBatch.percent.value}%` }" />
        </div>
        <p class="pp-hint">
          成功 {{ aiAutoBatch.state.successCount }}，失败 {{ aiAutoBatch.state.failedCount }}，已应用 {{ aiAutoBatch.state.appliedCount }}
        </p>
        <p v-if="aiAutoBatch.state.running" class="pp-hint">正在自动生成并写回站名...</p>
        <p v-if="aiAutoBatch.state.error" class="pp-hint">{{ aiAutoBatch.state.error }}</p>
        <div v-if="!aiAutoBatch.state.running && aiAutoBatch.state.failedItems.length" class="pp-hint">
          失败示例：
          <span v-for="(item, idx) in aiAutoBatch.state.failedItems.slice(0, 3)" :key="`${item.stationId}_${idx}`">
            {{ idx === 0 ? '' : '；' }}{{ item.stationName }}（{{ item.message }}）
          </span>
        </div>
        <div class="pp-row">
          <button
            class="pp-btn"
            :disabled="aiAutoBatch.state.running || !aiAutoBatch.state.failedStationIds.length"
            @click="aiAutoBatch.retryFailed"
          >
            仅重试失败
          </button>
          <button class="pp-btn pp-btn--danger" @click="aiAutoBatch.cancel">
            {{ aiAutoBatch.state.running ? '取消' : '关闭' }}
          </button>
        </div>
      </div>
    </AccordionSection>

    <AccordionSection title="英文翻译">
      <button
        class="pp-btn"
        :disabled="!selectedStationCount || store.isStationEnglishRetranslating"
        @click="store.retranslateSelectedStationEnglishNamesWithAi()"
      >
        {{ store.isStationEnglishRetranslating ? '翻译中...' : 'AI翻译选中站英文' }}
      </button>
      <div v-if="stationEnglishRetranslateProgress.total > 0" class="pp-progress">
        <div class="pp-progress-head">
          <span>{{ stationEnglishRetranslateProgress.message || '处理中...' }}</span>
          <strong>{{ Math.round(stationEnglishRetranslateProgress.percent || 0) }}%</strong>
        </div>
        <div class="pp-progress-track">
          <div
            class="pp-progress-fill"
            :style="{ width: `${Math.max(0, Math.min(100, stationEnglishRetranslateProgress.percent || 0))}%` }"
          />
        </div>
        <p class="pp-hint">{{ stationEnglishRetranslateProgress.done || 0 }} / {{ stationEnglishRetranslateProgress.total || 0 }}</p>
      </div>
    </AccordionSection>

    <AccordionSection title="批量重命名">
      <p class="pp-hint">使用模板批量重命名（`{n}` 为序号）。</p>
      <input v-model="stationBatchForm.zhTemplate" class="pp-input" placeholder="中文模板，例如：站点 {n}" />
      <input v-model="stationBatchForm.enTemplate" class="pp-input" placeholder="English template, e.g. Station {n}" />
      <label class="pp-label">起始序号</label>
      <input v-model.number="stationBatchForm.startIndex" type="number" min="1" class="pp-input" />
      <div class="pp-row">
        <button class="pp-btn pp-btn--primary" @click="applyBatchStationRename">批量重命名</button>
        <button class="pp-btn pp-btn--danger" @click="store.deleteSelectedStations()">删除选中站点</button>
      </div>
    </AccordionSection>

    <AccordionSection title="换乘工具" :default-open="false">
      <p class="pp-hint">选择 2 个站点后，可将其视作换乘（不改原线路拓扑）。</p>
      <div class="pp-row">
        <button
          class="pp-btn"
          :disabled="!canEditSelectedManualTransfer || selectedManualTransferExists"
          @click="store.addManualTransferForSelectedStations()"
        >
          设为换乘
        </button>
        <button
          class="pp-btn"
          :disabled="!canEditSelectedManualTransfer || !selectedManualTransferExists"
          @click="store.removeManualTransferForSelectedStations()"
        >
          取消换乘
        </button>
      </div>
    </AccordionSection>
  </div>
</template>

<style scoped>
.panel-station-multi {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pp-ai-candidates {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 6px 0;
}

.pp-ai-candidate-btn {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 6px;
  background: var(--toolbar-input-bg);
  color: var(--toolbar-text);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  transition: all 0.12s ease;
}

.pp-ai-candidate-btn:hover {
  border-color: var(--toolbar-tab-active-border);
  background: var(--toolbar-tab-active-bg);
}

.pp-ai-candidate-btn strong {
  font-size: 13px;
}

.pp-ai-candidate-btn small {
  color: var(--toolbar-muted);
  font-size: 11px;
}
</style>
