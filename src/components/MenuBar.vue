<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import IconBase from './IconBase.vue'
import DropdownMenu from './DropdownMenu.vue'
import TooltipWrapper from './TooltipWrapper.vue'
import { useProjectStore } from '../stores/projectStore'
import { getDisplayLineName } from '../lib/lineNaming'
import { CITY_PRESETS } from '../lib/osm/cityPresets'
import {
  DEFAULT_UI_FONT,
  DEFAULT_UI_THEME,
  UI_FONT_OPTIONS,
  UI_FONT_STORAGE_KEY,
  UI_THEME_STORAGE_KEY,
  normalizeUiFont,
  normalizeUiTheme,
} from '../lib/uiPreferences'

const props = defineProps({
  activeView: { type: String, default: 'map' },
})

const emit = defineEmits(['set-view', 'action', 'show-project-list'])

const store = useProjectStore()
const openMenuKey = ref(null)
const menuBarRef = ref(null)
const menuButtonRects = ref({})
const lineDropdownOpen = ref(false)
const lineButtonRef = ref(null)
const lineDropdownRect = ref(null)
const fileInputRef = ref(null)

const uiTheme = ref(DEFAULT_UI_THEME)
const uiFont = ref(DEFAULT_UI_FONT)

const MIN_YEAR = 1900
const MAX_YEAR = 2100
const editYearInput = ref(store.currentEditYear)

watch(() => store.currentEditYear, (v) => { editYearInput.value = v })

function normalizeEditYear(year) {
  const num = Number.isFinite(+year) ? Math.floor(+year) : 2010
  return Math.max(MIN_YEAR, Math.min(MAX_YEAR, num))
}

function onEditYearInput(event) {
  const year = normalizeEditYear(event.target.value)
  store.setCurrentEditYear(year)
  editYearInput.value = year
}

function incrementEditYear() {
  const y = normalizeEditYear(store.currentEditYear + 1)
  store.setCurrentEditYear(y)
  editYearInput.value = y
}

function decrementEditYear() {
  const y = normalizeEditYear(store.currentEditYear - 1)
  store.setCurrentEditYear(y)
  editYearInput.value = y
}

const lines = computed(() => store.project?.lines || [])
const activeLine = computed(() => {
  if (!store.project || !store.activeLineId) return null
  return store.project.lines.find((l) => l.id === store.activeLineId) || null
})
const activeLineName = computed(() => {
  if (!activeLine.value) return '无线路'
  return getDisplayLineName(activeLine.value, 'zh') || activeLine.value.nameZh || '未命名'
})

function applyUiTheme(theme) {
  const next = normalizeUiTheme(theme)
  uiTheme.value = next
  document.documentElement.setAttribute('data-ui-theme', next)
  try { window.localStorage.setItem(UI_THEME_STORAGE_KEY, next) } catch { /* noop */ }
}

function applyUiFont(fontId) {
  const next = normalizeUiFont(fontId)
  uiFont.value = next
  document.documentElement.setAttribute('data-ui-font', next)
  try { window.localStorage.setItem(UI_FONT_STORAGE_KEY, next) } catch { /* noop */ }
}

function restoreUiPreferences() {
  try {
    applyUiTheme(window.localStorage.getItem(UI_THEME_STORAGE_KEY) || DEFAULT_UI_THEME)
    applyUiFont(window.localStorage.getItem(UI_FONT_STORAGE_KEY) || DEFAULT_UI_FONT)
  } catch {
    applyUiTheme(DEFAULT_UI_THEME)
    applyUiFont(DEFAULT_UI_FONT)
  }
}

const CHINESE_CITY_IDS = new Set([
  'jinan', 'beijing', 'shanghai', 'guangzhou', 'shenzhen', 'chengdu', 'wuhan',
  'hangzhou', 'nanjing', 'chongqing', 'tianjin', 'suzhou', 'zhengzhou', 'xian',
  'changsha', 'kunming', 'dalian', 'qingdao', 'shenyang', 'harbin', 'fuzhou',
  'xiamen', 'hefei', 'nanchang', 'nanning', 'guiyang', 'urumqi', 'lanzhou',
  'taiyuan', 'shijiazhuang', 'changchun', 'wuxi', 'changzhou', 'xuzhou',
  'foshan', 'dongguan', 'ningbo', 'wenzhou', 'shaoxing', 'luoyang', 'wuhu',
  'hongkong', 'taipei',
])

const CHINESE_CITY_PRESETS = CITY_PRESETS.filter((p) => CHINESE_CITY_IDS.has(p.id))
const INTERNATIONAL_CITY_PRESETS = CITY_PRESETS.filter((p) => !CHINESE_CITY_IDS.has(p.id))

function buildCityMenuItems(presets, importing) {
  console.log('[buildCityMenuItems] Presets count:', presets.length, 'importing:', importing)
  const items = presets.map((p) => ({
    type: 'item',
    label: `${p.name} ${p.nameEn}`,
    action: `importCity_${p.id}`,
    disabled: importing,
  }))
  console.log('[buildCityMenuItems] Generated items:', items.map(i => ({ label: i.label, disabled: i.disabled })))
  return items
}

const fileMenuItems = computed(() => {
  const importing = store.isImporting
  return [
    { type: 'item', label: '新建工程', action: 'createProject', icon: 'folder' },
    { type: 'item', label: '打开文件...', action: 'openFile', icon: 'upload' },
    { type: 'item', label: '打开本地库', action: 'showProjectList', icon: 'folder-open' },
    { type: 'item', label: '保存文件', action: 'exportFile', icon: 'download' },
    { type: 'item', label: '存入本地库', action: 'persistToDb', icon: 'save' },
    { type: 'separator' },
    { type: 'item', label: '复制当前工程', action: 'duplicateProject', icon: 'copy', disabled: !store.project },
    { type: 'item', label: '重命名工程', action: 'renameProject', icon: 'edit', disabled: !store.project },
    { type: 'item', label: '删除当前工程', action: 'deleteProject', icon: 'trash', disabled: !store.project },
    { type: 'separator' },
    { type: 'submenu', label: '导入线网', icon: 'route', children: [
      { type: 'item', label: '导入济南 OSM 线网', action: 'importOsm', icon: 'route', disabled: importing },
      { type: 'separator' },
      { type: 'submenu', label: '中国城市', icon: 'git-branch', children: buildCityMenuItems(CHINESE_CITY_PRESETS, importing) },
      { type: 'submenu', label: '国际城市', icon: 'git-branch', children: buildCityMenuItems(INTERNATIONAL_CITY_PRESETS, importing) },
    ]},
    { type: 'separator' },
    { type: 'item', label: '查看本地库', action: 'showProjectList', icon: 'layers' },
  ]
})

const editMenuItems = computed(() => [
  { type: 'item', label: '撤销', action: 'undo', shortcut: 'Ctrl+Z', icon: 'undo', disabled: !store.canUndo },
  { type: 'item', label: '重做', action: 'redo', shortcut: 'Ctrl+Shift+Z', icon: 'redo', disabled: !store.canRedo },
  { type: 'separator' },
  { type: 'item', label: '全选站点', action: 'selectAll', shortcut: 'Ctrl+A', icon: 'check-circle' },
  { type: 'item', label: '清空选择', action: 'clearSelection', shortcut: 'Esc', icon: 'x-circle' },
  { type: 'separator' },
  { type: 'item', label: '删除选中站点', action: 'deleteStations', shortcut: 'Del', icon: 'trash', disabled: !store.selectedStationIds.length },
  { type: 'item', label: '删除选中线段', action: 'deleteEdges', shortcut: 'Del', icon: 'trash', disabled: !(store.selectedEdgeIds?.length) },
])

const viewMenuItems = computed(() => [
  { type: 'submenu', label: '主题', icon: 'palette', children: [
    { type: 'toggle', label: '日间', checked: uiTheme.value === 'light', action: 'themeLight', icon: 'sun' },
    { type: 'toggle', label: '夜间', checked: uiTheme.value === 'dark', action: 'themeDark', icon: 'moon' },
  ]},
  { type: 'submenu', label: '字体', icon: 'sliders', children: UI_FONT_OPTIONS.map((f) => ({
    type: 'toggle', label: f.label, checked: uiFont.value === f.id, action: `font_${f.id}`,
  }))},
  { type: 'separator' },
  { type: 'item', label: '自动生成官方风', action: 'runAutoLayout', icon: 'sparkles', disabled: store.isLayoutRunning || !store.project?.stations?.length },
])

const aiMenuItems = computed(() => [
  { type: 'separator' },
  { type: 'item', label: 'AI全自动批量命名', action: 'aiAutoBatchNaming', icon: 'sparkles', disabled: !store.selectedStationIds.length },
  { type: 'separator' },
  { type: 'item', label: 'AI翻译选中站英文', action: 'aiTranslateSelected', icon: 'languages', disabled: !store.selectedStationIds.length || store.isStationEnglishRetranslating },
  { type: 'item', label: '按规范重译全图英文', action: 'aiTranslateAll', icon: 'languages', disabled: !store.project?.stations?.length || store.isStationEnglishRetranslating },
])

const exportMenuItems = computed(() => [
  { type: 'item', label: '导出实际走向图 PNG', action: 'exportActualRoute', icon: 'map' },
  { type: 'item', label: '导出官方风格图 PNG', action: 'exportSchematic', icon: 'layout' },
  { type: 'item', label: '导出车辆 HUD 打包', action: 'exportHudZip', icon: 'monitor' },
  { type: 'separator' },
  { type: 'item', label: '导出时间轴动画', action: 'exportTimeline', icon: 'clock', disabled: !store.timelineHasData },
  { type: 'separator' },
  { type: 'submenu', label: '车站显示模式', icon: 'eye', children: [
    { type: 'toggle', label: '显示所有车站', checked: store.exportStationVisibilityMode === 'all', action: 'stationVisAll', icon: 'eye' },
    { type: 'toggle', label: '仅显示换乘站', checked: store.exportStationVisibilityMode === 'interchange', action: 'stationVisInterchange', icon: 'eye' },
    { type: 'toggle', label: '隐藏所有车站', checked: store.exportStationVisibilityMode === 'none', action: 'stationVisNone', icon: 'eye-off' },
  ]},
])

const menus = computed(() => [
  { key: 'file', label: '文件', items: fileMenuItems.value },
  { key: 'edit', label: '编辑', items: editMenuItems.value },
  { key: 'view', label: '视图', items: viewMenuItems.value },
  { key: 'ai', label: 'AI', items: aiMenuItems.value },
  { key: 'export', label: '导出', items: exportMenuItems.value },
])

const viewButtons = [
  { view: 'map', icon: 'map', label: '地图' },
  { view: 'schematic', icon: 'layout', label: '版式' },
  { view: 'hud', icon: 'monitor', label: 'HUD' },
  { view: 'preview', icon: 'film', label: '预览' },
]

function toggleMenu(key) {
  if (openMenuKey.value === key) {
    openMenuKey.value = null
    return
  }
  openMenuKey.value = key
  captureMenuButtonRect(key)
}

function onMenuBarMouseEnter(key) {
  if (openMenuKey.value && openMenuKey.value !== key) {
    openMenuKey.value = key
    captureMenuButtonRect(key)
  }
}

function captureMenuButtonRect(key) {
  const btn = menuBarRef.value?.querySelector(`[data-menu-key="${key}"]`)
  if (btn) {
    menuButtonRects.value[key] = btn.getBoundingClientRect()
  }
}

function closeMenu() {
  openMenuKey.value = null
}

function onMenuSelect(item) {
  closeMenu()
  handleAction(item.action)
}

function handleAction(action) {
  if (!action) return

  if (action === 'openFile') {
    fileInputRef.value?.click()
    return
  }
  if (action === 'themeLight') { applyUiTheme('light'); return }
  if (action === 'themeDark') { applyUiTheme('dark'); return }
  if (action.startsWith('font_')) { applyUiFont(action.slice(5)); return }
  if (action.startsWith('importCity_')) { emit('action', action); return }
  if (action === 'stationVisAll') { store.setExportStationVisibilityMode('all'); return }
  if (action === 'stationVisInterchange') { store.setExportStationVisibilityMode('interchange'); return }
  if (action === 'stationVisNone') { store.setExportStationVisibilityMode('none'); return }
  if (action === 'modeAiAddStation') { store.setMode('ai-add-station'); return }
  if (action === 'showProjectList') { emit('show-project-list'); return }

  // Simple store actions
  const simpleActions = {
    undo: () => store.undo(),
    redo: () => store.redo(),
    selectAll: () => store.selectAllStations(),
    clearSelection: () => store.clearSelection(),
    deleteStations: () => store.deleteSelectedStations(),
    deleteEdges: () => store.deleteSelectedEdge(),
    exportActualRoute: () => store.exportActualRoutePng(),
    exportSchematic: () => store.exportOfficialSchematicPng(),
    exportHudZip: () => store.exportAllLineHudZip(),
    exportTimeline: () => store.exportTimelineVideo(),
    exportFile: () => store.exportProjectFile(),
    persistToDb: () => store.persistNow(),
    runAutoLayout: () => store.runAutoLayout(),
    aiTranslateSelected: () => store.retranslateSelectedStationEnglishNamesWithAi(),
    aiTranslateAll: () => store.retranslateAllStationEnglishNamesWithAi(),
  }

  if (simpleActions[action]) {
    simpleActions[action]()
    return
  }

  // Actions that need prompts or emit to parent
  emit('action', action)
}

async function onFileSelected(event) {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    await store.importProjectFile(file)
  } catch (error) {
    store.statusText = `加载工程失败: ${error.message || '未知错误'}`
  } finally {
    event.target.value = ''
  }
}

function toggleLineDropdown() {
  openMenuKey.value = null
  lineDropdownOpen.value = !lineDropdownOpen.value
  if (lineDropdownOpen.value && lineButtonRef.value) {
    lineDropdownRect.value = lineButtonRef.value.getBoundingClientRect()
  }
}

function onLineSelect(item) {
  lineDropdownOpen.value = false
  if (item.action?.startsWith('line_')) {
    store.setActiveLine(item.action.slice(5))
  }
}

const lineMenuItems = computed(() =>
  lines.value.map((line) => ({
    type: 'item',
    label: getDisplayLineName(line, 'zh') || line.nameZh || '未命名',
    action: `line_${line.id}`,
  })),
)

onMounted(() => {
  restoreUiPreferences()
})
</script>

<template>
  <header ref="menuBarRef" class="menu-bar">
    <div class="menu-bar__left">
      <span class="menu-bar__brand">RailMap</span>
      <span class="menu-bar__brand-sep" />

      <nav class="menu-bar__menus">
        <button
          v-for="menu in menus"
          :key="menu.key"
          :data-menu-key="menu.key"
          class="menu-bar__menu-btn"
          :class="{ 'menu-bar__menu-btn--open': openMenuKey === menu.key }"
          type="button"
          @click="toggleMenu(menu.key)"
          @mouseenter="onMenuBarMouseEnter(menu.key)"
        >
          {{ menu.label }}
        </button>
      </nav>

      <template v-for="menu in menus" :key="`dropdown_${menu.key}`">
        <DropdownMenu
          v-if="openMenuKey === menu.key && menuButtonRects[menu.key]"
          :items="menu.items"
          :visible="true"
          :anchor-rect="menuButtonRects[menu.key]"
          @select="onMenuSelect"
          @close="closeMenu"
        />
      </template>
    </div>

    <div class="menu-bar__right">
      <div class="menu-bar__line-switcher">
        <button
          ref="lineButtonRef"
          class="menu-bar__line-btn"
          type="button"
          @click="toggleLineDropdown"
        >
          <span
            class="menu-bar__line-swatch"
            :style="{ backgroundColor: activeLine?.color || '#555' }"
          />
          <span class="menu-bar__line-name">{{ activeLineName }}</span>
          <IconBase name="chevron-down" :size="12" class="menu-bar__line-chevron" :class="{ 'menu-bar__line-chevron--open': lineDropdownOpen }" />
        </button>
        <DropdownMenu
          v-if="lineDropdownOpen && lineDropdownRect"
          :items="lineMenuItems"
          :visible="true"
          :anchor-rect="lineDropdownRect"
          @select="onLineSelect"
          @close="lineDropdownOpen = false"
        />
      </div>

      <div class="menu-bar__year-selector">
        <span class="menu-bar__year-label">建设年份</span>
        <button
          class="menu-bar__year-btn"
          type="button"
          :disabled="store.currentEditYear <= MIN_YEAR"
          @click="decrementEditYear"
          aria-label="减少年份"
        >−</button>
        <input
          type="number"
          class="menu-bar__year-input"
          :value="editYearInput"
          :min="MIN_YEAR"
          :max="MAX_YEAR"
          step="1"
          @change="onEditYearInput"
        />
        <button
          class="menu-bar__year-btn"
          type="button"
          :disabled="store.currentEditYear >= MAX_YEAR"
          @click="incrementEditYear"
          aria-label="增加年份"
        >+</button>
      </div>

      <div class="menu-bar__view-switcher">
        <TooltipWrapper
          v-for="btn in viewButtons"
          :key="btn.view"
          :text="btn.label"
          placement="bottom"
          :delay="300"
        >
          <button
            class="menu-bar__view-btn"
            :class="{ 'menu-bar__view-btn--active': activeView === btn.view }"
            type="button"
            @click="emit('set-view', btn.view)"
          >
            <IconBase :name="btn.icon" :size="16" />
          </button>
        </TooltipWrapper>
      </div>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      accept=".json,.railmap.json"
      class="menu-bar__file-input"
      @change="onFileSelected"
    />
  </header>
</template>

<style scoped>
.menu-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 8px;
  background: var(--toolbar-header-bg);
  border-bottom: 1px solid var(--toolbar-border);
  flex-shrink: 0;
  z-index: 100;
}

.menu-bar__left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.menu-bar__brand {
  font-size: 14px;
  font-weight: 700;
  color: var(--toolbar-text);
  padding: 0 8px 0 4px;
  letter-spacing: 0.05em;
}

.menu-bar__brand-sep {
  width: 1px;
  height: 16px;
  background: var(--toolbar-divider);
  margin-right: 4px;
  flex-shrink: 0;
}

.menu-bar__menus {
  display: flex;
  align-items: center;
  gap: 0;
}

.menu-bar__menu-btn {
  position: relative;
  border: none;
  background: transparent;
  color: var(--toolbar-muted);
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: color var(--transition-fast, 0.1s ease), background var(--transition-fast, 0.1s ease);
}

.menu-bar__menu-btn:hover {
  backdrop-filter: brightness(1.2);
  color: var(--toolbar-text);
}

.menu-bar__menu-btn--open {
  color: var(--toolbar-text);
  background: var(--toolbar-tab-active-bg);
}

.menu-bar__menu-btn--open::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 16px);
  height: 2px;
  background: var(--indicator-color, var(--toolbar-primary-bg));
  border-radius: 1px 1px 0 0;
}

.menu-bar__right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.menu-bar__line-switcher {
  position: relative;
}

.menu-bar__line-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--toolbar-input-border);
  background: var(--toolbar-input-bg);
  color: var(--toolbar-text);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.12s ease;
  max-width: 180px;
}

.menu-bar__line-btn:hover {
  border-color: var(--toolbar-button-hover-border);
}

.menu-bar__line-swatch {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.menu-bar__line-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-bar__line-chevron {
  transition: transform var(--transition-normal, 0.15s ease);
  flex-shrink: 0;
}

.menu-bar__line-chevron--open {
  transform: rotate(180deg);
}

.menu-bar__view-switcher {
  display: flex;
  align-items: center;
  gap: 0;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--toolbar-input-bg);
}

.menu-bar__view-btn {
  position: relative;
  border: none;
  background: transparent;
  color: var(--toolbar-muted);
  padding: 5px 10px;
  cursor: pointer;
  transition: color var(--transition-fast, 0.1s ease), background var(--transition-fast, 0.1s ease);
  display: flex;
  align-items: center;
}

.menu-bar__view-btn:hover {
  color: var(--toolbar-text);
  background: rgba(255, 255, 255, 0.04);
}

.menu-bar__view-btn--active {
  background: var(--toolbar-tab-active-bg);
  color: var(--toolbar-tab-active-text);
}

.menu-bar__year-selector {
  display: flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 6px;
  background: var(--toolbar-input-bg);
  padding: 2px 4px;
}

.menu-bar__year-label {
  font-size: 11px;
  color: var(--toolbar-muted);
  padding: 0 4px 0 2px;
  white-space: nowrap;
}

.menu-bar__year-btn {
  border: none;
  background: transparent;
  color: var(--toolbar-muted);
  font-size: 14px;
  font-weight: 600;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  transition: color 0.1s, background 0.1s;
}

.menu-bar__year-btn:hover:not(:disabled) {
  color: var(--toolbar-text);
  background: rgba(255, 255, 255, 0.08);
}

.menu-bar__year-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.menu-bar__year-input {
  width: 52px;
  border: none;
  background: transparent;
  color: var(--toolbar-text);
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  padding: 2px 0;
  font-variant-numeric: tabular-nums;
  -moz-appearance: textfield;
}

.menu-bar__year-input:focus {
  outline: none;
}

.menu-bar__year-input::-webkit-inner-spin-button,
.menu-bar__year-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.menu-bar__file-input {
  display: none;
}
</style>
