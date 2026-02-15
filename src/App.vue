<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import IconBase from './components/IconBase.vue'
import IconSprite from './components/IconSprite.vue'
import MapEditor from './components/MapEditor.vue'
import SchematicView from './components/SchematicView.vue'
import StatusBar from './components/StatusBar.vue'
import ToolbarControls from './components/ToolbarControls.vue'
import VehicleHudView from './components/VehicleHudView.vue'
import { useProjectStore } from './stores/projectStore'

const store = useProjectStore()
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'railmap_toolbar_collapsed'
const WORKSPACE_VIEW_STORAGE_KEY = 'railmap_workspace_active_view'
const VIEW_OPTIONS = [
  {
    key: 'map',
    label: '编辑',
    icon: 'map',
    description: '在真实地图上完成站点、线段和锚点编辑',
  },
  {
    key: 'schematic',
    label: '版式',
    icon: 'layout',
    description: '检查自动排版结果与可读性评分',
  },
  {
    key: 'hud',
    label: 'HUD',
    icon: 'monitor',
    description: '按线路方向生成车辆 HUD 视图',
  },
]
const sidebarCollapsed = ref(false)
const activeWorkspaceView = ref(VIEW_OPTIONS[0].key)
const activeViewMeta = computed(
  () => VIEW_OPTIONS.find((item) => item.key === activeWorkspaceView.value) || VIEW_OPTIONS[0],
)

function handleBeforeUnload(event) {
  event.preventDefault()
  event.returnValue = ''
}

function loadSidebarCollapsedState() {
  try {
    sidebarCollapsed.value = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1'
  } catch {
    sidebarCollapsed.value = false
  }
}

function loadWorkspaceViewState() {
  try {
    const saved = window.localStorage.getItem(WORKSPACE_VIEW_STORAGE_KEY)
    if (saved && VIEW_OPTIONS.some((item) => item.key === saved)) {
      activeWorkspaceView.value = saved
    }
  } catch {
    activeWorkspaceView.value = VIEW_OPTIONS[0].key
  }
}

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, sidebarCollapsed.value ? '1' : '0')
  } catch {
    // Ignore unavailable localStorage runtime.
  }
}

function setActiveWorkspaceView(viewKey) {
  if (!VIEW_OPTIONS.some((item) => item.key === viewKey)) return
  activeWorkspaceView.value = viewKey
  try {
    window.localStorage.setItem(WORKSPACE_VIEW_STORAGE_KEY, viewKey)
  } catch {
    // Ignore unavailable localStorage runtime.
  }
}

onMounted(async () => {
  loadSidebarCollapsedState()
  loadWorkspaceViewState()
  window.addEventListener('beforeunload', handleBeforeUnload)
  await store.initialize()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <IconSprite />
  <main class="app" :class="{ 'app--sidebar-collapsed': sidebarCollapsed }">
    <ToolbarControls :collapsed="sidebarCollapsed" @toggle-collapse="toggleSidebar" />
    <section class="workspace">
      <header class="workspace__tabs" aria-label="工作区视图切换">
        <div class="workspace__tab-list">
          <button
            v-for="view in VIEW_OPTIONS"
            :key="view.key"
            class="workspace__tab"
            :class="{ 'workspace__tab--active': activeWorkspaceView === view.key }"
            type="button"
            @click="setActiveWorkspaceView(view.key)"
          >
            <IconBase :name="view.icon" :size="16" />
            <span>{{ view.label }}</span>
          </button>
        </div>
        <p class="workspace__tab-description">{{ activeViewMeta.description }}</p>
      </header>

      <div class="workspace__panels">
        <section
          class="workspace__panel"
          :class="{ 'workspace__panel--active': activeWorkspaceView === 'map' }"
          :aria-hidden="activeWorkspaceView !== 'map'"
        >
          <MapEditor />
        </section>
        <section
          class="workspace__panel"
          :class="{ 'workspace__panel--active': activeWorkspaceView === 'schematic' }"
          :aria-hidden="activeWorkspaceView !== 'schematic'"
        >
          <SchematicView />
        </section>
        <section
          class="workspace__panel"
          :class="{ 'workspace__panel--active': activeWorkspaceView === 'hud' }"
          :aria-hidden="activeWorkspaceView !== 'hud'"
        >
          <VehicleHudView />
        </section>
      </div>

      <StatusBar />
    </section>
  </main>
</template>

<style scoped>
.app {
  min-height: 100vh;
  height: 100vh;
  display: grid;
  grid-template-columns: var(--sidebar-width, 392px) 1fr;
  background: var(--app-shell-gradient);
  color: var(--app-text);
  transition: grid-template-columns 0.2s ease;
}

.app--sidebar-collapsed {
  --sidebar-width: 72px;
}

.workspace {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 0;
  overflow: hidden;
  background: var(--workspace-bg);
}

.workspace__tabs {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--workspace-panel-header-border);
  background: var(--workspace-panel-header-bg);
}

.workspace__tab-list {
  display: flex;
  gap: 8px;
}

.workspace__tab {
  border: 1px solid var(--workspace-panel-border);
  background: var(--workspace-panel-bg);
  color: var(--workspace-panel-text);
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s ease;
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}

.workspace__tab:hover:not(.workspace__tab--active) {
  border-color: var(--toolbar-button-hover-border);
  transform: translateY(-1px);
}

.workspace__tab--active {
  background: var(--toolbar-tab-active-bg);
  border-color: var(--toolbar-tab-active-border);
  color: var(--toolbar-tab-active-text);
  border-width: 2px;
  padding: 7px 15px;
}

.workspace__tab-description {
  margin: 0;
  font-size: 12px;
  color: var(--workspace-panel-muted);
}

.workspace__panels {
  position: relative;
  min-height: 0;
}

.workspace__panel {
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
  transition: opacity 0.2s ease;
}

.workspace__panel > * {
  width: 100%;
  height: 100%;
}

.workspace__panel--active {
  opacity: 1;
  pointer-events: auto;
  visibility: visible;
}

@media (max-width: 1180px) {
  .app {
    --sidebar-width: 352px;
  }

  .app--sidebar-collapsed {
    --sidebar-width: 64px;
  }
}

@media (max-width: 1060px) {
  .app {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    height: auto;
    min-height: 100vh;
  }

  .workspace {
    min-height: calc(100vh - 56px);
  }
}
</style>
