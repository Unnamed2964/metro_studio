<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import AccordionSection from './AccordionSection.vue'
import IconBase from './IconBase.vue'
import TooltipWrapper from './TooltipWrapper.vue'
import { generateStationNameCandidates, generateStationNameCandidatesBatch } from '../lib/ai/stationNaming'
import { buildProjectMetroRanking, computeProjectRailLengthKm, fetchWorldMetroRanking } from '../lib/ranking/worldMetroRanking'
import { getDisplayLineName } from '../lib/lineNaming'
import { LINE_STYLE_OPTIONS, normalizeLineStyle } from '../lib/lineStyles'
import { fetchNearbyStationNamingContext, STATION_NAMING_RADIUS_METERS } from '../lib/osm/nearbyStationNamingContext'
import {
  DEFAULT_UI_FONT,
  DEFAULT_UI_THEME,
  UI_FONT_OPTIONS,
  UI_FONT_STORAGE_KEY,
  UI_THEME_STORAGE_KEY,
  normalizeUiFont,
  normalizeUiTheme,
} from '../lib/uiPreferences'
import { useProjectStore } from '../stores/projectStore'

const store = useProjectStore()
const props = defineProps({
  collapsed: {
    type: Boolean,
    default: false,
  },
})
const emit = defineEmits(['toggle-collapse'])

const TAB_OPTIONS = [
  { key: 'project', label: '项目', icon: 'folder' },
  { key: 'workflow', label: '工具', icon: 'sliders' },
  { key: 'object', label: '属性', icon: 'box' },
  { key: 'publish', label: '导出', icon: 'share' },
]
const MODE_LABELS = {
  select: '选择/拖拽',
  'add-station': '点站',
  'ai-add-station': 'AI点站',
  'add-edge': '拉线',
  'route-draw': '连续布线',
}

const activeTab = ref('project')
const sectionCollapsed = reactive({
  projectManagement: false,
  dataImport: false,
  modeSwitch: false,
  operations: false,
  stationProps: false,
  edgeProps: false,
  lineProps: false,
  exportOptions: false,
})
const uiTheme = ref(DEFAULT_UI_THEME)
const uiFont = ref(DEFAULT_UI_FONT)
const newProjectName = ref('济南地铁图工程')
const projectRenameName = ref('')
const projectFilter = ref('')
const fileInputRef = ref(null)
const projectOptions = ref([])
const stationForm = reactive({
  nameZh: '',
  nameEn: '',
})
const stationBatchForm = reactive({
  zhTemplate: '',
  enTemplate: '',
  startIndex: 1,
})
const lineForm = reactive({
  nameZh: '',
  nameEn: '',
  color: '#005BBB',
  status: 'open',
  style: 'solid',
  isLoop: false,
})
const edgeBatchForm = reactive({
  targetLineId: '',
  lineStyle: '',
  curveMode: 'keep',
})
const AI_AUTO_CONTEXT_CONCURRENCY = 10
const AI_AUTO_MODEL_BATCH_SIZE = 16
const AI_AUTO_MODEL_BATCH_CONCURRENCY = 3
const aiBatchNaming = reactive({
  active: false,
  phase: 'idle',
  generating: false,
  stationIds: [],
  stationEntries: [],
  currentIndex: 0,
  error: '',
  prefetchedCount: 0,
  prefetchFailedCount: 0,
  appliedCount: 0,
  skippedCount: 0,
})
const aiAutoBatchNaming = reactive({
  active: false,
  running: false,
  stationIds: [],
  failedStationIds: [],
  failedItems: [],
  doneCount: 0,
  successCount: 0,
  failedCount: 0,
  appliedCount: 0,
  error: '',
})
const worldMetroRanking = reactive({
  loading: false,
  error: '',
  fetchedAt: '',
  entries: [],
})
let worldMetroRankingAbortController = null
let aiBatchNamingAbortController = null
let aiAutoBatchNamingAbortController = null

const selectedStationCount = computed(() => store.selectedStationIds.length)
const selectedStationsInOrder = computed(() => {
  if (!store.project) return []
  const stationMap = new Map(store.project.stations.map((station) => [station.id, station]))
  return (store.selectedStationIds || []).map((id) => stationMap.get(id)).filter(Boolean)
})
const aiBatchCurrentStation = computed(() => {
  if (!aiBatchNaming.active || !store.project) return null
  const stationId = aiBatchNaming.stationIds[aiBatchNaming.currentIndex]
  if (!stationId) return null
  return store.project.stations.find((station) => station.id === stationId) || null
})
const aiBatchCurrentEntry = computed(() => {
  if (!aiBatchNaming.active) return null
  const stationId = aiBatchNaming.stationIds[aiBatchNaming.currentIndex]
  if (!stationId) return null
  return aiBatchNaming.stationEntries.find((entry) => entry.stationId === stationId) || null
})
const aiBatchCurrentCandidates = computed(() => (Array.isArray(aiBatchCurrentEntry.value?.candidates) ? aiBatchCurrentEntry.value.candidates : []))
const aiBatchCurrentError = computed(() => String(aiBatchCurrentEntry.value?.error || '').trim())
const aiBatchTotal = computed(() => aiBatchNaming.stationIds.length)
const aiBatchPrefetchPercent = computed(() => {
  const total = aiBatchTotal.value
  if (!total) return 0
  return Math.round((aiBatchNaming.prefetchedCount / total) * 100)
})
const aiBatchPercent = computed(() => {
  const total = aiBatchTotal.value
  if (!total) return 0
  const finished = aiBatchNaming.appliedCount + aiBatchNaming.skippedCount
  return Math.round((finished / total) * 100)
})
const aiBatchProgressPercent = computed(() => (aiBatchNaming.phase === 'prefetch' ? aiBatchPrefetchPercent.value : aiBatchPercent.value))
const aiAutoBatchTotal = computed(() => aiAutoBatchNaming.stationIds.length)
const aiAutoBatchPercent = computed(() => {
  const total = aiAutoBatchTotal.value
  if (!total) return 0
  return Math.round((aiAutoBatchNaming.doneCount / total) * 100)
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
const exportStationVisibilityMode = computed({
  get: () => store.exportStationVisibilityMode || 'all',
  set: (value) => store.setExportStationVisibilityMode(value),
})
const layoutGeoSeedScale = computed({
  get: () => Number(store.project?.layoutConfig?.geoSeedScale ?? 6),
  set: (value) => store.setLayoutGeoSeedScale(value),
})
const currentProjectId = computed(() => store.project?.id || '')
const filteredProjectOptions = computed(() => {
  const keyword = String(projectFilter.value || '').trim().toLowerCase()
  if (!keyword) return projectOptions.value
  return projectOptions.value.filter((project) => {
    const name = String(project.name || '').toLowerCase()
    const id = String(project.id || '').toLowerCase()
    return name.includes(keyword) || id.includes(keyword)
  })
})

const selectedStation = computed(() => {
  if (!store.project || !store.selectedStationId) return null
  return store.project.stations.find((station) => station.id === store.selectedStationId) || null
})
const selectedEdgeCount = computed(() => store.selectedEdgeIds.length)
const selectedEdges = computed(() => {
  if (!store.project || !store.selectedEdgeIds.length) return []
  const edgeMap = new Map(store.project.edges.map((edge) => [edge.id, edge]))
  return store.selectedEdgeIds.map((edgeId) => edgeMap.get(edgeId)).filter(Boolean)
})
const activeLine = computed(() => {
  if (!store.project || !store.activeLineId) return null
  return store.project.lines.find((line) => line.id === store.activeLineId) || null
})
const selectedEdge = computed(() => {
  if (!store.project || !store.selectedEdgeIds.length) return null
  const primaryEdgeId = store.selectedEdgeId || store.selectedEdgeIds[store.selectedEdgeIds.length - 1]
  return store.project.edges.find((edge) => edge.id === primaryEdgeId) || null
})
const selectedEdgeStations = computed(() => {
  if (!selectedEdge.value || !store.project) {
    return { from: null, to: null }
  }
  const stationMap = new Map(store.project.stations.map((station) => [station.id, station]))
  return {
    from: stationMap.get(selectedEdge.value.fromStationId) || null,
    to: stationMap.get(selectedEdge.value.toStationId) || null,
  }
})
const selectedEdgeLines = computed(() => {
  if (!selectedEdge.value || !store.project) return []
  const lineMap = new Map(store.project.lines.map((line) => [line.id, line]))
  return (selectedEdge.value.sharedByLineIds || []).map((lineId) => lineMap.get(lineId)).filter(Boolean)
})
const edgeReassignTargets = computed(() => store.project?.lines || [])
const edgeSelectionCanApplyBatch = computed(
  () => selectedEdgeCount.value > 0 && (Boolean(edgeBatchForm.targetLineId) || Boolean(edgeBatchForm.lineStyle) || edgeBatchForm.curveMode !== 'keep'),
)
const activeModeLabel = computed(() => MODE_LABELS[store.mode] || store.mode)
const activeObjectLabel = computed(() => {
  if (store.selectedEdgeAnchor) return '锚点'
  if (selectedEdgeCount.value > 1) return `多线段（${selectedEdgeCount.value}）`
  if (selectedEdge.value) return '线段'
  if (selectedStationCount.value === 1 && selectedStation.value) return '站点'
  if (selectedStationCount.value > 1) return `多站点（${selectedStationCount.value}）`
  if (activeLine.value) return '线路'
  return '无'
})
const contextSummary = computed(() => {
  if (store.selectedEdgeAnchor) {
    return `锚点 ${store.selectedEdgeAnchor.anchorIndex}（线段 ${store.selectedEdgeAnchor.edgeId}）`
  }
  if (selectedEdgeCount.value > 1) {
    return `已选 ${selectedEdgeCount.value} 条线段`
  }
  if (selectedEdge.value) {
    return `线段 ${selectedEdge.value.id}`
  }
  if (selectedStationCount.value === 1 && selectedStation.value) {
    return selectedStation.value.nameZh || selectedStation.value.id
  }
  if (selectedStationCount.value > 1) {
    return `已选 ${selectedStationCount.value} 个站点`
  }
  if (activeLine.value) {
    return `当前线路：${displayLineName(activeLine.value)}`
  }
  return '未选择对象'
})
const projectRailLengthKm = computed(() => computeProjectRailLengthKm(store.project))
const projectMetroRanking = computed(() =>
  buildProjectMetroRanking(projectRailLengthKm.value, worldMetroRanking.entries),
)
const projectMetroRankingMessage = computed(() => {
  const ranking = projectMetroRanking.value
  const distance = ranking.playerLengthKm.toFixed(1)
  if (!worldMetroRanking.entries.length) {
    return `已建 ${distance} km`
  }
  return `已建 ${distance} km · 第 ${ranking.rank} / ${ranking.total} 名`
})
const worldMetroComparisonMessage = computed(() => {
  const ranking = projectMetroRanking.value
  if (!worldMetroRanking.entries.length) return ''
  if (ranking.rank === 1) {
    const second = ranking.below
    if (!second) return '已超过当前榜单所有城市地铁系统'
    const lead = (ranking.playerLengthKm - second.lengthKm).toFixed(1)
    return `领先第 2 名 ${lead} km（${second.city} · ${second.systemName}）`
  }
  if (!ranking.above) return ''
  const gap = (ranking.above.lengthKm - ranking.playerLengthKm).toFixed(1)
  return `距离上一名 ${gap} km（${ranking.above.city} · ${ranking.above.systemName}）`
})
const worldMetroRankingTimestamp = computed(() => {
  if (!worldMetroRanking.fetchedAt) return ''
  const date = new Date(worldMetroRanking.fetchedAt)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString()
})

function cancelWorldMetroRankingRequest() {
  if (!worldMetroRankingAbortController) return
  worldMetroRankingAbortController.abort(new Error('aborted'))
  worldMetroRankingAbortController = null
}

async function refreshWorldMetroRanking() {
  cancelWorldMetroRankingRequest()
  const controller = new AbortController()
  worldMetroRankingAbortController = controller
  worldMetroRanking.loading = true
  worldMetroRanking.error = ''

  try {
    const result = await fetchWorldMetroRanking({ signal: controller.signal })
    if (controller.signal.aborted) return
    worldMetroRanking.entries = result.entries
    worldMetroRanking.fetchedAt = result.fetchedAt
  } catch (error) {
    if (controller.signal.aborted) return
    worldMetroRanking.error = String(error?.message || '全球排行榜加载失败')
  } finally {
    if (worldMetroRankingAbortController === controller) {
      worldMetroRankingAbortController = null
    }
    worldMetroRanking.loading = false
  }
}

function applyUiTheme(theme) {
  const nextTheme = normalizeUiTheme(theme)
  uiTheme.value = nextTheme
  document.documentElement.setAttribute('data-ui-theme', nextTheme)
  try {
    window.localStorage.setItem(UI_THEME_STORAGE_KEY, nextTheme)
  } catch {
    // Ignore unavailable localStorage runtime.
  }
}

function restoreUiTheme() {
  try {
    const cachedTheme = window.localStorage.getItem(UI_THEME_STORAGE_KEY)
    applyUiTheme(cachedTheme || DEFAULT_UI_THEME)
    return
  } catch {
    // Fall through to default theme.
  }
  applyUiTheme(DEFAULT_UI_THEME)
}

function applyUiFont(fontId) {
  const nextFont = normalizeUiFont(fontId)
  uiFont.value = nextFont
  document.documentElement.setAttribute('data-ui-font', nextFont)
  try {
    window.localStorage.setItem(UI_FONT_STORAGE_KEY, nextFont)
  } catch {
    // Ignore unavailable localStorage runtime.
  }
}

function restoreUiFont() {
  try {
    const cachedFont = window.localStorage.getItem(UI_FONT_STORAGE_KEY)
    applyUiFont(cachedFont || DEFAULT_UI_FONT)
    return
  } catch {
    // Fall through to default font.
  }
  applyUiFont(DEFAULT_UI_FONT)
}

async function refreshProjectOptions() {
  projectOptions.value = await store.listProjects()
}

async function createProject() {
  await store.createNewProject(newProjectName.value.trim() || '新建工程')
  projectRenameName.value = store.project?.name || ''
  await refreshProjectOptions()
}

async function importFromOsm() {
  await store.importJinanNetwork()
  projectRenameName.value = store.project?.name || ''
  await refreshProjectOptions()
}

function addLine() {
  store.addLine({})
}

function chooseProjectFile() {
  fileInputRef.value?.click()
}

async function onFileSelected(event) {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    await store.importProjectFile(file)
    projectRenameName.value = store.project?.name || ''
    await refreshProjectOptions()
  } catch (error) {
    store.statusText = `加载工程失败: ${error.message || '未知错误'}`
  } finally {
    event.target.value = ''
  }
}

async function onLoadProject(projectId) {
  await store.loadProjectById(projectId)
  projectRenameName.value = store.project?.name || ''
  await refreshProjectOptions()
}

async function renameCurrentProject() {
  if (!store.project) return
  await store.renameCurrentProject(projectRenameName.value || store.project.name)
  projectRenameName.value = store.project?.name || ''
  await refreshProjectOptions()
}

async function duplicateCurrentProject() {
  if (!store.project) return
  await store.duplicateCurrentProject(projectRenameName.value || `${store.project.name} 副本`)
  projectRenameName.value = store.project?.name || ''
  await refreshProjectOptions()
}

async function deleteProject(projectId) {
  const target = projectOptions.value.find((project) => project.id === projectId)
  const targetName = target?.name || projectId
  if (!window.confirm(`确认删除工程「${targetName}」吗？此操作不可撤销。`)) return
  await store.deleteProjectById(projectId)
  projectRenameName.value = store.project?.name || ''
  await refreshProjectOptions()
}

async function deleteCurrentProject() {
  if (!store.project) return
  await deleteProject(store.project.id)
}

async function persistProjectToDb() {
  await store.persistNow()
  await refreshProjectOptions()
}

function applyStationRename() {
  if (!selectedStation.value) return
  store.updateStationName(selectedStation.value.id, {
    nameZh: stationForm.nameZh,
    nameEn: stationForm.nameEn,
  })
}

function applyBatchStationRename() {
  store.renameSelectedStationsByTemplate({
    zhTemplate: stationBatchForm.zhTemplate,
    enTemplate: stationBatchForm.enTemplate,
    startIndex: stationBatchForm.startIndex,
  })
}

function isAbortError(error) {
  const message = String(error?.message || '').toLowerCase()
  return error?.name === 'AbortError' || message.includes('aborted') || message.includes('abort')
}

function abortAiBatchNamingRequest() {
  if (!aiBatchNamingAbortController) return
  aiBatchNamingAbortController.abort(new Error('aborted'))
  aiBatchNamingAbortController = null
}

function abortAiAutoBatchNamingRequest() {
  if (!aiAutoBatchNamingAbortController) return
  aiAutoBatchNamingAbortController.abort(new Error('aborted'))
  aiAutoBatchNamingAbortController = null
}

function findStationById(stationId) {
  if (!store.project || !stationId) return null
  return store.project.stations.find((station) => station.id === stationId) || null
}

function findAiBatchEntry(stationId) {
  if (!stationId) return null
  return aiBatchNaming.stationEntries.find((entry) => entry.stationId === stationId) || null
}

function buildStationDisplayName(stationId) {
  const station = findStationById(stationId)
  return station?.nameZh || station?.id || stationId
}

function chunkArray(items, chunkSize) {
  const source = Array.isArray(items) ? items : []
  const size = Math.max(1, Number(chunkSize) || 1)
  const chunks = []
  for (let index = 0; index < source.length; index += size) {
    chunks.push(source.slice(index, index + size))
  }
  return chunks
}

function appendAiAutoBatchFailure(stationId, message, failedStationIds, failedItems) {
  const item = {
    stationId,
    stationName: buildStationDisplayName(stationId),
    message: String(message || '生成失败'),
  }
  aiAutoBatchNaming.failedCount += 1
  failedStationIds.push(stationId)
  failedItems.push(item)
  if (aiAutoBatchNaming.failedItems.length < 12) {
    aiAutoBatchNaming.failedItems.push(item)
  }
}

function resetAiBatchNamingState() {
  abortAiBatchNamingRequest()
  aiBatchNaming.active = false
  aiBatchNaming.phase = 'idle'
  aiBatchNaming.generating = false
  aiBatchNaming.stationIds = []
  aiBatchNaming.stationEntries = []
  aiBatchNaming.currentIndex = 0
  aiBatchNaming.error = ''
  aiBatchNaming.prefetchedCount = 0
  aiBatchNaming.prefetchFailedCount = 0
  aiBatchNaming.appliedCount = 0
  aiBatchNaming.skippedCount = 0
}

function resetAiAutoBatchNamingState() {
  abortAiAutoBatchNamingRequest()
  aiAutoBatchNaming.active = false
  aiAutoBatchNaming.running = false
  aiAutoBatchNaming.stationIds = []
  aiAutoBatchNaming.failedStationIds = []
  aiAutoBatchNaming.failedItems = []
  aiAutoBatchNaming.doneCount = 0
  aiAutoBatchNaming.successCount = 0
  aiAutoBatchNaming.failedCount = 0
  aiAutoBatchNaming.appliedCount = 0
  aiAutoBatchNaming.error = ''
}

async function requestAiBatchCandidatesForStation(stationId, { signal, strictModel = false } = {}) {
  const station = findStationById(stationId)
  if (!station || !Array.isArray(station.lngLat)) {
    throw new Error('当前站点不存在或坐标无效')
  }
  const context = await fetchNearbyStationNamingContext(station.lngLat, {
    radiusMeters: STATION_NAMING_RADIUS_METERS,
    signal,
  })
  const candidates = await generateStationNameCandidates({
    context,
    lngLat: station.lngLat,
    signal,
    strictModel,
  })
  if (!Array.isArray(candidates) || !candidates.length) {
    throw new Error('未生成候选站名')
  }
  return {
    station,
    candidates,
  }
}

async function prefetchAiBatchCandidatesForSelection() {
  const total = aiBatchNaming.stationIds.length
  if (!total) return

  abortAiBatchNamingRequest()
  const controller = new AbortController()
  aiBatchNamingAbortController = controller

  aiBatchNaming.phase = 'prefetch'
  aiBatchNaming.generating = true
  aiBatchNaming.error = ''
  aiBatchNaming.prefetchedCount = 0
  aiBatchNaming.prefetchFailedCount = 0
  store.statusText = `AI批量命名：正在为 ${total} 个站点批量生成候选...`

  try {
    for (let index = 0; index < total; index += 1) {
      if (controller.signal.aborted) return
      const stationId = aiBatchNaming.stationIds[index]
      const entry = findAiBatchEntry(stationId)
      if (entry) {
        entry.status = 'pending'
        entry.error = ''
        entry.candidates = []
      }
      try {
        const { station, candidates } = await requestAiBatchCandidatesForStation(stationId, {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        if (entry) {
          entry.status = 'ready'
          entry.error = ''
          entry.candidates = candidates
        }
        const displayName = station.nameZh || station.id
        store.statusText = `AI批量命名：候选生成 ${aiBatchNaming.prefetchedCount + 1}/${total} · ${displayName}`
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return
        const message = String(error?.message || '生成失败')
        if (entry) {
          entry.status = 'failed'
          entry.error = message
          entry.candidates = []
        }
        aiBatchNaming.prefetchFailedCount += 1
      } finally {
        if (!controller.signal.aborted) {
          aiBatchNaming.prefetchedCount += 1
        }
      }
    }
  } finally {
    if (aiBatchNamingAbortController === controller) {
      aiBatchNamingAbortController = null
    }
    if (controller.signal.aborted) return
    aiBatchNaming.generating = false
    aiBatchNaming.phase = 'select'
  }

  const successCount = aiBatchNaming.stationEntries.filter((entry) => entry.status === 'ready' && entry.candidates.length > 0).length
  if (!successCount) {
    aiBatchNaming.error = '所有站点候选生成失败，请重试或结束批量命名'
    store.statusText = 'AI批量命名：候选已全部生成，但均失败'
    return
  }
  aiBatchNaming.error = ''
  store.statusText = `AI批量命名：候选已全部生成，成功 ${successCount}/${total}，请逐站选择`
}

function moveToNextAiBatchStation() {
  aiBatchNaming.currentIndex += 1
  if (aiBatchNaming.currentIndex >= aiBatchNaming.stationIds.length) {
    const total = aiBatchNaming.stationIds.length
    const applied = aiBatchNaming.appliedCount
    const skipped = aiBatchNaming.skippedCount
    store.statusText = `AI批量命名完成：已应用 ${applied}/${total}，跳过 ${skipped}`
    resetAiBatchNamingState()
    return
  }
  const station = aiBatchCurrentStation.value
  const entry = aiBatchCurrentEntry.value
  if (!station) return
  if (entry?.status === 'ready' && aiBatchCurrentCandidates.value.length) {
    store.statusText = `AI批量命名：请为 ${station.nameZh || station.id} 选择候选站名`
    return
  }
  store.statusText = `AI批量命名：${station.nameZh || station.id} 暂无可用候选，请重试或跳过`
}

async function startAiBatchNamingForSelectedStations() {
  const selected = selectedStationsInOrder.value
  if (!selected.length) return
  aiBatchNaming.active = true
  aiBatchNaming.phase = 'prefetch'
  aiBatchNaming.generating = false
  aiBatchNaming.stationIds = selected.map((station) => station.id)
  aiBatchNaming.stationEntries = aiBatchNaming.stationIds.map((stationId) => ({
    stationId,
    status: 'pending',
    candidates: [],
    error: '',
  }))
  aiBatchNaming.currentIndex = 0
  aiBatchNaming.error = ''
  aiBatchNaming.prefetchedCount = 0
  aiBatchNaming.prefetchFailedCount = 0
  aiBatchNaming.appliedCount = 0
  aiBatchNaming.skippedCount = 0
  await prefetchAiBatchCandidatesForSelection()
}

async function runAiAutoBatchNamingByStationIds(stationIds, options = {}) {
  const normalizedStationIds = [...new Set((stationIds || []).map((id) => String(id || '').trim()).filter(Boolean))]
  if (!normalizedStationIds.length) return

  abortAiAutoBatchNamingRequest()
  const controller = new AbortController()
  aiAutoBatchNamingAbortController = controller

  aiAutoBatchNaming.active = true
  aiAutoBatchNaming.running = true
  aiAutoBatchNaming.stationIds = normalizedStationIds
  aiAutoBatchNaming.failedStationIds = []
  aiAutoBatchNaming.failedItems = []
  aiAutoBatchNaming.doneCount = 0
  aiAutoBatchNaming.successCount = 0
  aiAutoBatchNaming.failedCount = 0
  aiAutoBatchNaming.appliedCount = 0
  aiAutoBatchNaming.error = ''

  const total = normalizedStationIds.length
  const updates = []
  const failedItems = []
  const failedStationIds = []
  const runningLabel = options.retryFailedOnly ? 'AI全自动批量命名（失败重试）' : 'AI全自动批量命名'
  store.statusText = `${runningLabel}：正在抓取站点上下文 0/${total}`

  const contextItems = []
  let contextCursor = 0
  const contextWorkerCount = Math.max(1, Math.min(AI_AUTO_CONTEXT_CONCURRENCY, total))

  const contextWorker = async () => {
    while (true) {
      if (controller.signal.aborted) return
      const index = contextCursor
      if (index >= total) return
      contextCursor += 1
      const stationId = normalizedStationIds[index]
      const station = findStationById(stationId)
      if (!station || !Array.isArray(station.lngLat)) {
        appendAiAutoBatchFailure(stationId, '当前站点不存在或坐标无效', failedStationIds, failedItems)
        aiAutoBatchNaming.doneCount += 1
        continue
      }
      try {
        const context = await fetchNearbyStationNamingContext(station.lngLat, {
          radiusMeters: STATION_NAMING_RADIUS_METERS,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        contextItems.push({
          stationId,
          lngLat: station.lngLat,
          context,
        })
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return
        appendAiAutoBatchFailure(stationId, String(error?.message || '上下文抓取失败'), failedStationIds, failedItems)
        aiAutoBatchNaming.doneCount += 1
      } finally {
        if (!controller.signal.aborted) {
          const fetchedCount = contextItems.length + failedStationIds.length
          if (fetchedCount === total || fetchedCount % 10 === 0) {
            store.statusText = `${runningLabel}：正在抓取站点上下文 ${fetchedCount}/${total}`
          }
        }
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: contextWorkerCount }, () => contextWorker()))
    if (controller.signal.aborted) return

    if (!contextItems.length) {
      aiAutoBatchNaming.error = '全部站点上下文抓取失败，请检查网络后重试'
      store.statusText = `${runningLabel}失败：无可用上下文`
      return
    }

    const batches = chunkArray(contextItems, AI_AUTO_MODEL_BATCH_SIZE)
    let batchCursor = 0
    const batchWorkerCount = Math.max(1, Math.min(AI_AUTO_MODEL_BATCH_CONCURRENCY, batches.length))
    store.statusText = `${runningLabel}：正在批量请求 AI 0/${total}`

    const batchWorker = async () => {
      while (true) {
        if (controller.signal.aborted) return
        const index = batchCursor
        if (index >= batches.length) return
        batchCursor += 1
        const batchItems = batches[index]
        let batchResults = []
        try {
          batchResults = await generateStationNameCandidatesBatch({
            stations: batchItems,
            signal: controller.signal,
            strictModel: true,
          })
        } catch (error) {
          if (controller.signal.aborted || isAbortError(error)) return
          const message = String(error?.message || 'AI 批量请求失败')
          for (const item of batchItems) {
            appendAiAutoBatchFailure(item.stationId, message, failedStationIds, failedItems)
            aiAutoBatchNaming.doneCount += 1
          }
          continue
        }
        if (controller.signal.aborted) return

        const resultMap = new Map()
        for (const result of batchResults) {
          const stationId = String(result?.stationId || '').trim()
          if (!stationId || resultMap.has(stationId)) continue
          resultMap.set(stationId, result)
        }

        for (const item of batchItems) {
          const result = resultMap.get(item.stationId)
          const candidates = Array.isArray(result?.candidates) ? result.candidates : []
          const bestCandidate = candidates.length ? candidates[0] : null
          if (!bestCandidate) {
            appendAiAutoBatchFailure(item.stationId, result?.error || 'AI 未返回可用候选', failedStationIds, failedItems)
          } else {
            updates.push({
              stationId: item.stationId,
              nameZh: bestCandidate.nameZh,
              nameEn: bestCandidate.nameEn,
            })
            aiAutoBatchNaming.successCount += 1
          }
          aiAutoBatchNaming.doneCount += 1
        }

        if (aiAutoBatchNaming.doneCount === total || aiAutoBatchNaming.doneCount % 10 === 0) {
          store.statusText = `${runningLabel}：正在批量请求 AI ${aiAutoBatchNaming.doneCount}/${total}`
        }
      }
    }

    await Promise.all(Array.from({ length: batchWorkerCount }, () => batchWorker()))
    if (controller.signal.aborted) return

    const { updatedCount } = store.updateStationNamesBatch(updates, {
      reason: `${runningLabel}: 更新 ${updates.length}/${total} 站`,
    })
    aiAutoBatchNaming.appliedCount = updatedCount
    aiAutoBatchNaming.failedStationIds = failedStationIds
    if (!updatedCount && failedItems.length) {
      aiAutoBatchNaming.error = '全部站点自动命名失败，请检查网络或模型配置后重试'
    }
    const failedCount = aiAutoBatchNaming.failedCount
    store.statusText = failedCount
      ? `${runningLabel}完成：已应用 ${updatedCount}/${total}，失败 ${failedCount}`
      : `${runningLabel}完成：已应用 ${updatedCount}/${total}`
  } finally {
    if (aiAutoBatchNamingAbortController === controller) {
      aiAutoBatchNamingAbortController = null
    }
    aiAutoBatchNaming.running = false
  }
}

async function startAiAutoBatchNamingForSelectedStations() {
  if (aiBatchNaming.active || aiBatchNaming.generating) return
  const selected = selectedStationsInOrder.value
  if (!selected.length) return
  const stationIds = selected.map((station) => station.id)
  await runAiAutoBatchNamingByStationIds(stationIds, { retryFailedOnly: false })
}

async function retryAiAutoBatchFailedStations() {
  if (!aiAutoBatchNaming.active || aiAutoBatchNaming.running) return
  const failedStationIds = [...(aiAutoBatchNaming.failedStationIds || [])]
  if (!failedStationIds.length) return
  await runAiAutoBatchNamingByStationIds(failedStationIds, { retryFailedOnly: true })
}

function cancelAiAutoBatchNaming() {
  if (aiAutoBatchNaming.running) {
    abortAiAutoBatchNamingRequest()
    aiAutoBatchNaming.running = false
    store.statusText = '已取消 AI 全自动批量命名'
    return
  }
  resetAiAutoBatchNamingState()
}

async function retryAiBatchCurrentStation() {
  if (!aiBatchNaming.active || aiBatchNaming.phase !== 'select' || aiBatchNaming.generating) return
  const station = aiBatchCurrentStation.value
  if (!station) return
  const entry = findAiBatchEntry(station.id)
  if (!entry) return

  abortAiBatchNamingRequest()
  const controller = new AbortController()
  aiBatchNamingAbortController = controller
  aiBatchNaming.generating = true
  aiBatchNaming.error = ''
  entry.status = 'pending'
  entry.error = ''
  entry.candidates = []

  try {
    const { candidates } = await requestAiBatchCandidatesForStation(station.id, { signal: controller.signal })
    if (controller.signal.aborted) return
    entry.status = 'ready'
    entry.error = ''
    entry.candidates = candidates
    store.statusText = `AI批量命名：已为 ${station.nameZh || station.id} 生成 ${candidates.length} 个候选`
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) return
    const message = String(error?.message || '生成失败')
    entry.status = 'failed'
    entry.error = message
    entry.candidates = []
    aiBatchNaming.error = message
    store.statusText = `AI批量命名失败: ${message}`
  } finally {
    if (aiBatchNamingAbortController === controller) {
      aiBatchNamingAbortController = null
    }
    aiBatchNaming.generating = false
  }
}

function skipAiBatchCurrentStation() {
  if (!aiBatchNaming.active || aiBatchNaming.phase !== 'select' || aiBatchNaming.generating) return
  aiBatchNaming.skippedCount += 1
  moveToNextAiBatchStation()
}

function applyAiBatchCandidate(candidate) {
  if (!candidate || !aiBatchCurrentStation.value || aiBatchNaming.phase !== 'select' || aiBatchNaming.generating) return
  const station = aiBatchCurrentStation.value
  store.updateStationName(station.id, {
    nameZh: candidate.nameZh,
    nameEn: candidate.nameEn,
  })
  aiBatchNaming.appliedCount += 1
  moveToNextAiBatchStation()
}

function cancelAiBatchNaming() {
  resetAiBatchNamingState()
  store.statusText = '已取消 AI 批量命名'
}

async function retranslateAllStationEnglishNames() {
  await store.retranslateAllStationEnglishNamesWithAi()
}

async function retranslateSelectedStationEnglishNames() {
  await store.retranslateSelectedStationEnglishNamesWithAi()
}

function addManualTransferForSelectedStations() {
  store.addManualTransferForSelectedStations()
}

function removeManualTransferForSelectedStations() {
  store.removeManualTransferForSelectedStations()
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

function deleteSelectedStations() {
  store.deleteSelectedStations()
}

function selectAllStations() {
  store.selectAllStations()
}

function deleteSelectedEdge() {
  store.deleteSelectedEdge()
}

function undoEdit() {
  store.undo()
}

function redoEdit() {
  store.redo()
}

function deleteActiveLine() {
  if (!activeLine.value) return
  store.deleteLine(activeLine.value.id)
}

function applySelectedEdgesBatch() {
  const edgeIds = store.selectedEdgeIds || []
  if (!edgeIds.length) return

  const patch = {}
  if (edgeBatchForm.targetLineId) {
    patch.targetLineId = edgeBatchForm.targetLineId
  }
  if (edgeBatchForm.lineStyle) {
    patch.lineStyle = edgeBatchForm.lineStyle
  }
  if (edgeBatchForm.curveMode === 'curved') {
    patch.isCurved = true
  } else if (edgeBatchForm.curveMode === 'straight') {
    patch.isCurved = false
  }

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

function resetEdgeBatchForm() {
  edgeBatchForm.targetLineId = ''
  edgeBatchForm.lineStyle = ''
  edgeBatchForm.curveMode = 'keep'
}

function isCurrentProject(projectId) {
  return currentProjectId.value === projectId
}

function displayLineName(line) {
  return getDisplayLineName(line, 'zh') || line?.nameZh || ''
}

watch(
  selectedStation,
  (station) => {
    stationForm.nameZh = station?.nameZh || ''
    stationForm.nameEn = station?.nameEn || ''
  },
  { immediate: true },
)

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

watch(
  [selectedEdges, () => store.project?.lines],
  ([edges]) => {
    const lines = store.project?.lines || []
    if (!edges?.length || !lines.length) {
      edgeBatchForm.targetLineId = ''
      resetEdgeBatchForm()
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

watch(
  () => store.project?.id,
  () => {
    projectRenameName.value = store.project?.name || ''
  },
  { immediate: true },
)

onMounted(async () => {
  restoreUiTheme()
  restoreUiFont()
  await refreshProjectOptions()
  projectRenameName.value = store.project?.name || ''
  void refreshWorldMetroRanking()
})

onBeforeUnmount(() => {
  abortAiBatchNamingRequest()
  abortAiAutoBatchNamingRequest()
  cancelWorldMetroRankingRequest()
})
</script>

<template>
  <aside class="toolbar" :class="{ 'toolbar--collapsed': props.collapsed }">
    <section class="toolbar__section toolbar__section--header">
      <div class="toolbar__header-top">
        <div class="toolbar__brand">
          <h1>{{ props.collapsed ? 'RM' : 'RailMap' }}</h1>
          <p v-if="!props.collapsed" class="toolbar__subtitle">济南地铁图生成与编辑</p>
        </div>
        <button
          class="toolbar__collapse-btn"
          type="button"
          :aria-label="props.collapsed ? '展开侧边栏' : '收起侧边栏'"
          :title="props.collapsed ? '展开侧边栏' : '收起侧边栏'"
          @click="emit('toggle-collapse')"
        >
          {{ props.collapsed ? '»' : '«' }}
        </button>
      </div>

      <template v-if="!props.collapsed">
        <div class="toolbar__header-metrics">
          <div class="toolbar__display-settings">
            <div class="toolbar__theme-switch" role="group" aria-label="界面主题">
              <button class="toolbar__theme-btn" :class="{ active: uiTheme === 'light' }" @click="applyUiTheme('light')">日间</button>
              <button class="toolbar__theme-btn" :class="{ active: uiTheme === 'dark' }" @click="applyUiTheme('dark')">夜间</button>
            </div>
            <label class="toolbar__label toolbar__label--compact" for="toolbar-ui-font-select">界面字体</label>
            <select id="toolbar-ui-font-select" v-model="uiFont" class="toolbar__select toolbar__font-select" @change="applyUiFont(uiFont)">
              <option v-for="font in UI_FONT_OPTIONS" :key="font.id" :value="font.id">
                {{ font.label }}
              </option>
            </select>
          </div>
          <section class="toolbar__world-ranking" aria-live="polite">
            <p class="toolbar__world-ranking-title">全球轨道交通长度排名</p>
            <p v-if="worldMetroRanking.loading" class="toolbar__world-ranking-main">排行榜加载中...</p>
            <p v-else class="toolbar__world-ranking-main">{{ projectMetroRankingMessage }}</p>
            <p v-if="!worldMetroRanking.loading && worldMetroRanking.error" class="toolbar__world-ranking-meta">
              {{ worldMetroRanking.error }}
            </p>
            <p v-else-if="!worldMetroRanking.loading && worldMetroComparisonMessage" class="toolbar__world-ranking-meta">
              {{ worldMetroComparisonMessage }}
            </p>
            <p v-if="worldMetroRankingTimestamp" class="toolbar__world-ranking-meta">
              数据时间: {{ worldMetroRankingTimestamp }}
            </p>
          </section>
        </div>

        <p class="toolbar__status">{{ store.statusText }}</p>
        <p class="toolbar__hint">当前工程 ID: {{ currentProjectId || '-' }}</p>
      </template>
    </section>

    <nav v-if="!props.collapsed" class="toolbar__tabs" aria-label="侧边栏功能选项卡">
      <button
        v-for="tab in TAB_OPTIONS"
        :key="tab.key"
        class="toolbar__tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        <IconBase :name="tab.icon" :size="14" />
        <span>{{ tab.label }}</span>
      </button>
    </nav>

    <section v-if="!props.collapsed" class="toolbar__section toolbar__section--context">
      <h3>当前上下文</h3>
      <div class="toolbar__context-grid">
        <p><span>编辑模式</span><strong>{{ activeModeLabel }}</strong></p>
        <p><span>对象类型</span><strong>{{ activeObjectLabel }}</strong></p>
        <p><span>对象摘要</span><strong>{{ contextSummary }}</strong></p>
      </div>
    </section>

    <div v-if="!props.collapsed" class="toolbar__content">
      <template v-if="activeTab === 'project'">
        <section class="toolbar__section">
          <h3>工程管理</h3>
          <p class="toolbar__section-intro">管理工程生命周期与本地版本。</p>

          <label class="toolbar__label">新建工程名</label>
          <input v-model="newProjectName" class="toolbar__input" placeholder="输入新工程名" />
          <div class="toolbar__row">
            <button class="toolbar__btn toolbar__btn--primary" @click="createProject">新建工程</button>
            <button class="toolbar__btn" :disabled="!store.project" @click="duplicateCurrentProject">复制当前</button>
          </div>

          <label class="toolbar__label">当前工程名</label>
          <input v-model="projectRenameName" class="toolbar__input" placeholder="重命名当前工程" />
          <div class="toolbar__row">
            <button class="toolbar__btn" :disabled="!store.project" @click="renameCurrentProject">重命名</button>
            <button class="toolbar__btn toolbar__btn--danger" :disabled="!store.project" @click="deleteCurrentProject">
              删除当前
            </button>
          </div>

          <div class="toolbar__row">
            <button class="toolbar__btn" @click="store.exportProjectFile()">保存文件</button>
            <button class="toolbar__btn" @click="chooseProjectFile">加载文件</button>
          </div>
          <div class="toolbar__row">
            <button class="toolbar__btn" :disabled="!store.project" @click="persistProjectToDb">存入本地库</button>
          </div>
          <input ref="fileInputRef" type="file" accept=".json,.railmap.json" class="hidden" @change="onFileSelected" />

          <div class="toolbar__divider"></div>
          <label class="toolbar__label">本地工程检索</label>
          <input v-model="projectFilter" class="toolbar__input" placeholder="输入工程名或 ID 过滤" />
          <div class="toolbar__row">
            <button class="toolbar__btn toolbar__btn--small" @click="refreshProjectOptions">刷新列表</button>
          </div>
          <ul class="toolbar__project-list">
            <li v-for="project in filteredProjectOptions" :key="project.id">
              <div class="toolbar__project-item" :class="{ active: isCurrentProject(project.id) }">
                <div class="toolbar__project-main">
                  <span>{{ project.name }}</span>
                  <small>{{ new Date(project.meta.updatedAt).toLocaleString() }}</small>
                </div>
                <div class="toolbar__project-actions">
                  <button class="toolbar__btn toolbar__btn--small" @click="onLoadProject(project.id)">加载</button>
                  <button class="toolbar__btn toolbar__btn--small toolbar__btn--danger" @click="deleteProject(project.id)">
                    删除
                  </button>
                </div>
              </div>
            </li>
          </ul>
        </section>

        <section class="toolbar__section">
          <h3>外部数据导入</h3>
          <p class="toolbar__section-intro">控制 OSM 导入范围，并以当前工程为模板新建导入工程（不会覆盖当前工程）。</p>
          <label class="toolbar__checkbox">
            <input v-model="store.includeConstruction" type="checkbox" />
            包含在建线路与车站
          </label>
          <label class="toolbar__checkbox">
            <input v-model="store.includeProposed" type="checkbox" />
            包含规划线路与车站
          </label>
          <button class="toolbar__btn toolbar__btn--primary" :disabled="store.isImporting" @click="importFromOsm">
            {{ store.isImporting ? '导入中...' : '导入济南 OSM 线网' }}
          </button>
        </section>
      </template>

      <template v-else-if="activeTab === 'workflow'">
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

      <template v-else-if="activeTab === 'object'">
        <section class="toolbar__section">
          <h3>站点属性</h3>
          <p class="toolbar__section-intro">编辑当前选中站点，或对多站点做批量操作。</p>
          <div class="toolbar__row">
            <button
              class="toolbar__btn"
              :disabled="!store.project?.stations?.length || store.isStationEnglishRetranslating"
              @click="retranslateAllStationEnglishNames"
            >
              {{ store.isStationEnglishRetranslating ? '全图英文重译中...' : '按规范重译全图英文' }}
            </button>
          </div>
          <div v-if="stationEnglishRetranslateProgress.total > 0" class="toolbar__progress">
            <div class="toolbar__progress-head">
              <span>{{ stationEnglishRetranslateProgress.message || '处理中...' }}</span>
              <strong>{{ Math.round(stationEnglishRetranslateProgress.percent || 0) }}%</strong>
            </div>
            <div class="toolbar__progress-track">
              <div
                class="toolbar__progress-fill"
                :style="{ width: `${Math.max(0, Math.min(100, stationEnglishRetranslateProgress.percent || 0))}%` }"
              ></div>
            </div>
            <p class="toolbar__hint">
              {{ stationEnglishRetranslateProgress.done || 0 }} / {{ stationEnglishRetranslateProgress.total || 0 }}
            </p>
          </div>
          <template v-if="selectedStation && selectedStationCount === 1">
            <p class="toolbar__hint">当前站点 ID: {{ selectedStation.id }}</p>
            <input v-model="stationForm.nameZh" class="toolbar__input" placeholder="车站中文名" />
            <input v-model="stationForm.nameEn" class="toolbar__input" placeholder="Station English Name" />
            <div class="toolbar__row">
              <button class="toolbar__btn toolbar__btn--primary" @click="applyStationRename">保存站名</button>
              <button class="toolbar__btn toolbar__btn--danger" @click="deleteSelectedStations">删除选中站点</button>
            </div>
          </template>
          <template v-else-if="selectedStationCount > 1">
            <p class="toolbar__hint">已选 {{ selectedStationCount }} 个站点，可用模板批量重命名（`{n}` 为序号）。</p>
            <div class="toolbar__row">
              <button
                class="toolbar__btn"
                :disabled="store.isStationEnglishRetranslating || aiBatchNaming.generating || aiBatchNaming.active || aiAutoBatchNaming.active"
                @click="startAiBatchNamingForSelectedStations"
              >
                AI批量命名（先批量生成后点选）
              </button>
              <button
                class="toolbar__btn toolbar__btn--primary"
                :disabled="store.isStationEnglishRetranslating || aiBatchNaming.active || aiBatchNaming.generating || aiAutoBatchNaming.active"
                @click="startAiAutoBatchNamingForSelectedStations"
              >
                AI全自动批量命名（不筛选）
              </button>
            </div>
            <input v-model="stationBatchForm.zhTemplate" class="toolbar__input" placeholder="中文模板，例如：站点 {n}" />
            <input
              v-model="stationBatchForm.enTemplate"
              class="toolbar__input"
              placeholder="English template, e.g. Station {n}"
            />
            <label class="toolbar__label">起始序号</label>
            <input v-model.number="stationBatchForm.startIndex" type="number" min="1" class="toolbar__input" />
            <div class="toolbar__row">
              <button class="toolbar__btn toolbar__btn--primary" @click="applyBatchStationRename">批量重命名</button>
              <button class="toolbar__btn toolbar__btn--danger" @click="deleteSelectedStations">删除选中站点</button>
            </div>
            <div v-if="aiBatchNaming.active" class="toolbar__progress">
              <div class="toolbar__progress-head">
                <span>
                  <template v-if="aiBatchNaming.phase === 'prefetch'">
                    候选预生成 {{ aiBatchNaming.prefetchedCount }}/{{ aiBatchTotal }}
                  </template>
                  <template v-else>
                    逐站命名 {{ Math.min(aiBatchNaming.currentIndex + 1, aiBatchTotal) }}/{{ aiBatchTotal }}
                    {{ aiBatchCurrentStation ? `· ${aiBatchCurrentStation.nameZh || aiBatchCurrentStation.id}` : '' }}
                  </template>
                </span>
                <strong>{{ aiBatchProgressPercent }}%</strong>
              </div>
              <div class="toolbar__progress-track">
                <div class="toolbar__progress-fill" :style="{ width: `${aiBatchProgressPercent}%` }"></div>
              </div>
              <p v-if="aiBatchNaming.phase === 'prefetch'" class="toolbar__hint">
                已成功 {{ Math.max(0, aiBatchNaming.prefetchedCount - aiBatchNaming.prefetchFailedCount) }}，失败 {{ aiBatchNaming.prefetchFailedCount }}
              </p>
              <p v-else class="toolbar__hint">已应用 {{ aiBatchNaming.appliedCount }}，已跳过 {{ aiBatchNaming.skippedCount }}</p>
              <p v-if="aiBatchNaming.generating && aiBatchNaming.phase === 'prefetch'" class="toolbar__hint">正在批量生成全部站点候选...</p>
              <p v-if="aiBatchNaming.generating && aiBatchNaming.phase === 'select'" class="toolbar__hint">正在重试当前站候选...</p>
              <p v-if="aiBatchNaming.error" class="toolbar__hint">{{ aiBatchNaming.error }}</p>
              <p v-if="aiBatchNaming.phase === 'select' && aiBatchCurrentError" class="toolbar__hint">{{ aiBatchCurrentError }}</p>

              <div v-if="aiBatchNaming.phase === 'select' && !aiBatchNaming.generating && aiBatchCurrentCandidates.length" class="toolbar__ai-candidates">
                <button
                  v-for="candidate in aiBatchCurrentCandidates"
                  :key="`${candidate.nameZh}__${candidate.nameEn}`"
                  class="toolbar__ai-candidate-btn"
                  @click="applyAiBatchCandidate(candidate)"
                >
                  <strong>{{ candidate.nameZh }}</strong>
                  <span>{{ candidate.nameEn }}</span>
                  <small>{{ candidate.basis }} · {{ candidate.reason }}</small>
                </button>
              </div>

              <div class="toolbar__row" v-if="aiBatchNaming.phase === 'select'">
                <button class="toolbar__btn" :disabled="aiBatchNaming.generating" @click="retryAiBatchCurrentStation">重试当前站</button>
                <button class="toolbar__btn" :disabled="aiBatchNaming.generating" @click="skipAiBatchCurrentStation">跳过当前站</button>
                <button class="toolbar__btn toolbar__btn--danger" :disabled="aiBatchNaming.generating" @click="cancelAiBatchNaming">
                  结束批量命名
                </button>
              </div>
              <div class="toolbar__row" v-else>
                <button class="toolbar__btn toolbar__btn--danger" :disabled="!aiBatchNaming.generating" @click="cancelAiBatchNaming">
                  取消预生成
                </button>
              </div>
            </div>
            <div v-if="aiAutoBatchNaming.active" class="toolbar__progress">
              <div class="toolbar__progress-head">
                <span>AI全自动命名 {{ aiAutoBatchNaming.doneCount }}/{{ aiAutoBatchTotal }}</span>
                <strong>{{ aiAutoBatchPercent }}%</strong>
              </div>
              <div class="toolbar__progress-track">
                <div class="toolbar__progress-fill" :style="{ width: `${aiAutoBatchPercent}%` }"></div>
              </div>
              <p class="toolbar__hint">
                成功 {{ aiAutoBatchNaming.successCount }}，失败 {{ aiAutoBatchNaming.failedCount }}，已应用 {{ aiAutoBatchNaming.appliedCount }}
              </p>
              <p v-if="aiAutoBatchNaming.running" class="toolbar__hint">正在自动生成并写回站名（适合几百站）...</p>
              <p v-if="aiAutoBatchNaming.error" class="toolbar__hint">{{ aiAutoBatchNaming.error }}</p>
              <div v-if="!aiAutoBatchNaming.running && aiAutoBatchNaming.failedItems.length" class="toolbar__hint">
                失败示例：
                <span v-for="(item, idx) in aiAutoBatchNaming.failedItems.slice(0, 3)" :key="`${item.stationId}_${idx}`">
                  {{ idx === 0 ? '' : '；' }}{{ item.stationName }}（{{ item.message }}）
                </span>
              </div>
              <div class="toolbar__row">
                <button
                  class="toolbar__btn"
                  :disabled="aiAutoBatchNaming.running || !aiAutoBatchNaming.failedStationIds.length"
                  @click="retryAiAutoBatchFailedStations"
                >
                  仅重试失败站点
                </button>
                <button class="toolbar__btn toolbar__btn--danger" @click="cancelAiAutoBatchNaming">
                  {{ aiAutoBatchNaming.running ? '取消全自动命名' : '关闭全自动结果' }}
                </button>
              </div>
            </div>
            <div class="toolbar__divider"></div>
            <p class="toolbar__hint">
              手动换乘工具：请选择 2 个站点后，可将其视作换乘（不改原线路拓扑）。
            </p>
            <div class="toolbar__row">
              <button
                class="toolbar__btn"
                :disabled="!canEditSelectedManualTransfer || selectedManualTransferExists"
                @click="addManualTransferForSelectedStations"
              >
                设为换乘
              </button>
              <button
                class="toolbar__btn"
                :disabled="!canEditSelectedManualTransfer || !selectedManualTransferExists"
                @click="removeManualTransferForSelectedStations"
              >
                取消换乘
              </button>
            </div>
          </template>
          <p v-else class="toolbar__hint">请先在地图中选择站点</p>
        </section>

        <section class="toolbar__section">
          <h3>线段属性</h3>
          <p class="toolbar__section-intro">支持多选线段批量改所属线、线型和曲线状态。</p>
          <template v-if="selectedEdgeCount > 0">
            <p class="toolbar__hint">已选线段: {{ selectedEdgeCount }} 条</p>
            <template v-if="selectedEdgeCount === 1 && selectedEdge">
              <p class="toolbar__hint">线段 ID: {{ selectedEdge.id }}</p>
              <p class="toolbar__hint">
                连接:
                {{ selectedEdgeStations.from?.nameZh || selectedEdge.fromStationId }}
                ↔
                {{ selectedEdgeStations.to?.nameZh || selectedEdge.toStationId }}
              </p>
              <p class="toolbar__hint">所属线路:</p>
              <ul class="toolbar__line-tags">
                <li v-for="line in selectedEdgeLines" :key="line.id" :title="line.nameZh">
                  <span class="toolbar__line-swatch" :style="{ backgroundColor: line.color }"></span>
                  <span>{{ displayLineName(line) }}</span>
                </li>
              </ul>
            </template>

            <label class="toolbar__label">目标线路（批量）</label>
            <select v-model="edgeBatchForm.targetLineId" class="toolbar__select" :disabled="!edgeReassignTargets.length">
              <option value="">保持不变</option>
              <option v-for="line in edgeReassignTargets" :key="`edge_batch_line_${line.id}`" :value="line.id">
                {{ displayLineName(line) }}
              </option>
            </select>

            <label class="toolbar__label">线型（批量）</label>
            <select v-model="edgeBatchForm.lineStyle" class="toolbar__select">
              <option value="">保持不变</option>
              <option v-for="style in LINE_STYLE_OPTIONS" :key="`edge_batch_style_${style.id}`" :value="style.id">
                {{ style.label }}
              </option>
            </select>

            <label class="toolbar__label">曲线状态（批量）</label>
            <select v-model="edgeBatchForm.curveMode" class="toolbar__select">
              <option value="keep">保持不变</option>
              <option value="curved">设为曲线</option>
              <option value="straight">设为直线（清锚点）</option>
            </select>

            <div class="toolbar__row">
              <button class="toolbar__btn toolbar__btn--primary" :disabled="!edgeSelectionCanApplyBatch" @click="applySelectedEdgesBatch">
                应用批量属性
              </button>
              <button class="toolbar__btn" @click="resetEdgeBatchForm">重置批量项</button>
              <button class="toolbar__btn toolbar__btn--danger" @click="deleteSelectedEdge">删除选中线段</button>
            </div>
          </template>
          <p v-else class="toolbar__hint">在真实地图中点击或框选线段后，可执行批量属性编辑。</p>
        </section>

        <section class="toolbar__section">
          <h3>线路属性</h3>
          <p class="toolbar__section-intro">一键新增线路（自动生成与现有线路差异更大的颜色），然后可在下方编辑详细属性。</p>
          <button class="toolbar__btn toolbar__btn--primary" @click="addLine">一键新增线路</button>
          <ul class="toolbar__line-list">
            <li v-for="line in store.project?.lines || []" :key="line.id">
              <button class="toolbar__line-item" :class="{ active: store.activeLineId === line.id }" @click="store.setActiveLine(line.id)">
                <span class="toolbar__line-swatch" :style="{ backgroundColor: line.color }"></span>
                <span>{{ displayLineName(line) }}</span>
              </button>
            </li>
          </ul>
          <template v-if="activeLine">
            <div class="toolbar__divider"></div>
            <p class="toolbar__hint">当前线路: {{ displayLineName(activeLine) }}</p>
            <input v-model="lineForm.nameZh" class="toolbar__input" placeholder="中文线路名" />
            <input v-model="lineForm.nameEn" class="toolbar__input" placeholder="English line name" />
            <input v-model="lineForm.color" type="color" class="toolbar__color" />
            <div class="toolbar__row">
              <select v-model="lineForm.status" class="toolbar__select">
                <option value="open">运营</option>
                <option value="construction">在建</option>
                <option value="proposed">规划</option>
              </select>
              <select v-model="lineForm.style" class="toolbar__select">
                <option v-for="style in LINE_STYLE_OPTIONS" :key="`edit_${style.id}`" :value="style.id">
                  {{ style.label }}
                </option>
              </select>
            </div>
            <label class="toolbar__checkbox">
              <input v-model="lineForm.isLoop" type="checkbox" />
              环线（不显示从哪到哪）
            </label>
            <div class="toolbar__row">
              <button class="toolbar__btn toolbar__btn--primary" @click="applyLineChanges">保存线路</button>
              <button class="toolbar__btn toolbar__btn--danger" @click="deleteActiveLine">删除线路</button>
            </div>
          </template>
        </section>
      </template>

      <template v-else>
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
    </div>
    <div v-else class="toolbar__collapsed-body">
      <p class="toolbar__hint">侧栏已收起</p>
      <button class="toolbar__btn toolbar__btn--small" type="button" @click="emit('toggle-collapse')">展开</button>
    </div>
  </aside>
</template>

<style scoped>
.toolbar {
  width: 100%;
  background: var(--toolbar-bg);
  color: var(--toolbar-text);
  overflow: hidden;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-right: 1px solid var(--toolbar-border);
}

.toolbar--collapsed {
  align-items: stretch;
}

.toolbar__header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.toolbar__content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 2px;
}

.toolbar__content::-webkit-scrollbar,
.toolbar__line-list::-webkit-scrollbar,
.toolbar__project-list::-webkit-scrollbar {
  width: 8px;
}

.toolbar__content::-webkit-scrollbar-thumb,
.toolbar__line-list::-webkit-scrollbar-thumb,
.toolbar__project-list::-webkit-scrollbar-thumb {
  background: var(--toolbar-scrollbar-thumb);
  border-radius: 999px;
}

.toolbar__section {
  border: 1px solid var(--toolbar-card-border);
  border-radius: 12px;
  padding: 12px;
  background: var(--toolbar-card-bg);
}

.toolbar__section--header {
  background: var(--toolbar-header-bg);
}

.toolbar__section--context {
  padding: 10px 12px;
}

.toolbar__brand {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.toolbar__collapse-btn {
  border: 1px solid var(--toolbar-input-border);
  color: var(--toolbar-text);
  background: var(--toolbar-input-bg);
  border-radius: 8px;
  width: 30px;
  height: 30px;
  line-height: 1;
  cursor: pointer;
}

.toolbar__section h1 {
  margin: 0;
  font-size: 24px;
  letter-spacing: 0.01em;
}

.toolbar__subtitle {
  margin: 0;
  color: var(--toolbar-muted);
  font-size: 12px;
}

.toolbar__header-metrics {
  margin-top: 10px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: stretch;
}

.toolbar__display-settings {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-self: start;
}

.toolbar__theme-switch {
  display: inline-flex;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 9px;
  overflow: hidden;
  width: fit-content;
  align-self: start;
}

.toolbar__theme-btn {
  border: none;
  color: var(--toolbar-muted);
  background: var(--toolbar-input-bg);
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
}

.toolbar__theme-btn.active {
  background: var(--toolbar-tab-active-bg);
  color: var(--toolbar-tab-active-text);
}

.toolbar__label--compact {
  margin: 0;
}

.toolbar__font-select {
  min-width: 132px;
}

.toolbar__world-ranking {
  border: 1px solid var(--toolbar-card-border);
  background: var(--toolbar-item-bg);
  border-radius: 8px;
  padding: 7px 9px;
  min-width: 0;
}

.toolbar__world-ranking-title {
  margin: 0;
  font-size: 11px;
  line-height: 1.25;
  color: var(--toolbar-muted);
}

.toolbar__world-ranking-main {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.35;
  color: var(--toolbar-text);
  word-break: break-word;
}

.toolbar__world-ranking-meta {
  margin: 2px 0 0;
  font-size: 11px;
  line-height: 1.35;
  color: var(--toolbar-hint);
  word-break: break-word;
}

.toolbar__status {
  margin: 10px 0 0;
  color: var(--toolbar-status);
  font-size: 12px;
  line-height: 1.45;
  padding: 8px 10px;
  border: 1px solid var(--toolbar-card-border);
  border-radius: 8px;
  background: var(--toolbar-item-bg);
}

.toolbar__hint {
  margin: 8px 0 0;
  color: var(--toolbar-hint);
  font-size: 12px;
  line-height: 1.45;
}

.toolbar__meta {
  font-size: 12px;
  color: var(--toolbar-muted);
  align-self: center;
}

.toolbar__section h3 {
  margin: 0 0 10px;
  font-size: 14px;
  color: var(--toolbar-text);
}

.toolbar__section-intro {
  margin: -4px 0 10px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--toolbar-muted);
}

.toolbar__tabs {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.toolbar__tab {
  border: 1px solid var(--toolbar-input-border);
  color: var(--toolbar-muted);
  background: var(--toolbar-tab-bg);
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.3;
  font-weight: 600;
  text-align: center;
  transition: all 0.18s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.toolbar__tab:hover:not(.active) {
  border-color: var(--toolbar-button-hover-border);
}

.toolbar__tab.active {
  background: var(--toolbar-tab-active-bg);
  border-color: var(--toolbar-tab-active-border);
  color: var(--toolbar-tab-active-text);
}

.toolbar__context-grid {
  display: grid;
  gap: 6px;
}

.toolbar__context-grid p {
  margin: 0;
  padding: 6px 8px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 8px;
  background: var(--toolbar-item-bg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.toolbar__context-grid span {
  font-size: 11px;
  color: var(--toolbar-muted);
}

.toolbar__context-grid strong {
  min-width: 0;
  text-align: right;
  font-size: 12px;
  color: var(--toolbar-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar__input {
  width: 100%;
  background: var(--toolbar-input-bg);
  border: 1px solid var(--toolbar-input-border);
  color: var(--toolbar-input-text);
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 8px;
  transition: border-color 0.15s ease;
}

.toolbar__input:focus {
  outline: none;
  border-color: var(--toolbar-tab-active-border);
}

.toolbar__label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--toolbar-hint);
}

.toolbar__range-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 2px;
}

.toolbar__range {
  width: 100%;
}

.toolbar__range-value {
  min-width: 34px;
  text-align: right;
  font-size: 12px;
  color: var(--toolbar-text);
}

.toolbar__row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.toolbar__progress {
  margin-top: 8px;
  padding: 8px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 8px;
  background: var(--toolbar-item-bg);
}

.toolbar__progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--toolbar-muted);
}

.toolbar__progress-head strong {
  color: var(--toolbar-text);
}

.toolbar__progress-track {
  margin-top: 8px;
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: var(--toolbar-input-bg);
  border: 1px solid var(--toolbar-input-border);
  overflow: hidden;
}

.toolbar__progress-fill {
  height: 100%;
  background: var(--toolbar-primary-border);
  transition: width 180ms ease;
}

.toolbar__ai-candidates {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toolbar__ai-candidate-btn {
  border: 1px solid var(--toolbar-input-border);
  border-radius: 8px;
  background: var(--toolbar-input-bg);
  color: var(--toolbar-text);
  text-align: left;
  padding: 8px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 3px;
  transition: all 0.15s ease;
}

.toolbar__ai-candidate-btn:hover {
  border-color: var(--toolbar-button-hover-border);
  background: var(--toolbar-button-bg);
}

.toolbar__ai-candidate-btn strong {
  font-size: 13px;
}

.toolbar__ai-candidate-btn span {
  font-size: 12px;
  color: var(--toolbar-muted);
}

.toolbar__ai-candidate-btn small {
  font-size: 11px;
  line-height: 1.35;
  color: var(--toolbar-hint);
}

.toolbar__btn {
  border: 1px solid var(--toolbar-button-border);
  color: var(--toolbar-button-text);
  background: var(--toolbar-button-bg);
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  font-size: 12px;
  min-width: 0;
  flex: 1 1 120px;
  transition: all 0.15s ease;
}

.toolbar__btn:hover:not(:disabled) {
  border-color: var(--toolbar-button-hover-border);
  transform: translateY(-1px);
}

.toolbar__btn:active:not(:disabled) {
  transform: translateY(0);
}

.toolbar__btn:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.toolbar__btn--primary {
  background: var(--toolbar-primary-bg);
  border-color: var(--toolbar-primary-border);
  border-width: 2px;
  font-weight: 600;
  padding: 7px 9px;
}

.toolbar__btn--primary:hover:not(:disabled) {
  filter: brightness(1.1);
  box-shadow: 0 2px 8px rgba(29, 78, 216, 0.3);
}

.toolbar__btn--danger {
  background: var(--toolbar-danger-bg);
  border-color: var(--toolbar-danger-border);
}

.toolbar__btn--danger:hover:not(:disabled) {
  filter: brightness(1.15);
  box-shadow: 0 2px 8px rgba(185, 50, 66, 0.3);
}

.toolbar__btn.active {
  background: var(--toolbar-active-bg);
  border-color: var(--toolbar-active-border);
}

.toolbar__btn--small {
  padding: 5px 8px;
  font-size: 11px;
  flex: 0 0 auto;
}

.toolbar__checkbox {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--toolbar-text);
}

.toolbar__color {
  width: 100%;
  height: 34px;
  border-radius: 8px;
  border: 1px solid var(--toolbar-input-border);
  margin-bottom: 8px;
}

.toolbar__select {
  width: 100%;
  background: var(--toolbar-input-bg);
  border: 1px solid var(--toolbar-input-border);
  color: var(--toolbar-input-text);
  border-radius: 8px;
  padding: 8px 10px;
  transition: border-color 0.15s ease;
}

.toolbar__select:focus {
  outline: none;
  border-color: var(--toolbar-tab-active-border);
}

.toolbar__divider {
  height: 1px;
  margin: 10px 0;
  background: var(--toolbar-divider);
}

.toolbar__line-list,
.toolbar__project-list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  overflow: auto;
}

.toolbar__line-tags {
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.toolbar__line-tags li {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--toolbar-muted);
  font-size: 12px;
}

.toolbar__line-item,
.toolbar__project-item {
  width: 100%;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 8px;
  background: var(--toolbar-item-bg);
  color: var(--toolbar-text);
  padding: 8px;
  text-align: left;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  justify-content: space-between;
  transition: all 0.15s ease;
}

.toolbar__line-item.active,
.toolbar__project-item.active {
  border-color: var(--toolbar-active-border);
  border-width: 2px;
  padding: 7px;
}

.toolbar__line-item {
  cursor: pointer;
  align-items: center;
}

.toolbar__line-item:hover:not(.active) {
  border-color: var(--toolbar-button-hover-border);
  transform: translateX(2px);
}

.toolbar__line-swatch {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  flex-shrink: 0;
}

.toolbar__project-item {
  padding: 8px 9px;
}

.toolbar__project-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.toolbar__project-main span {
  word-break: break-word;
}

.toolbar__project-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-shrink: 0;
}

.toolbar__project-item small {
  color: var(--toolbar-muted);
}

.hidden {
  display: none;
}

.toolbar__collapsed-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

@media (max-width: 1060px) {
  .toolbar {
    padding: 12px;
  }
}
</style>
