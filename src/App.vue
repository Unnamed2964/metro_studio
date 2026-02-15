<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import IconSprite from './components/IconSprite.vue'
import MenuBar from './components/MenuBar.vue'
import ToolStrip from './components/ToolStrip.vue'
import PropertiesPanel from './components/PropertiesPanel.vue'
import MapEditor from './components/MapEditor.vue'
import SchematicView from './components/SchematicView.vue'
import VehicleHudView from './components/VehicleHudView.vue'
import StatusBar from './components/StatusBar.vue'
import ProjectListDialog from './components/ProjectListDialog.vue'
import { useProjectStore } from './stores/projectStore'

const store = useProjectStore()
const WORKSPACE_VIEW_STORAGE_KEY = 'railmap_workspace_active_view'
const activeView = ref('map')
const projectListVisible = ref(false)

function handleBeforeUnload(event) {
  event.preventDefault()
  event.returnValue = ''
}

function loadWorkspaceViewState() {
  try {
    const saved = window.localStorage.getItem(WORKSPACE_VIEW_STORAGE_KEY)
    if (saved && ['map', 'schematic', 'hud'].includes(saved)) {
      activeView.value = saved
    }
  } catch {
    activeView.value = 'map'
  }
}

function setActiveView(viewKey) {
  if (!['map', 'schematic', 'hud'].includes(viewKey)) return
  activeView.value = viewKey
  try {
    window.localStorage.setItem(WORKSPACE_VIEW_STORAGE_KEY, viewKey)
  } catch { /* noop */ }
}

function handleMenuAction(action) {
  if (!action) return

  const actionMap = {
    createProject: async () => {
      const name = window.prompt('新工程名称', '新建工程')
      if (name === null) return
      await store.createNewProject(name.trim() || '新建工程')
    },
    duplicateProject: async () => {
      if (!store.project) return
      const name = window.prompt('副本名称', `${store.project.name} 副本`)
      if (name === null) return
      await store.duplicateCurrentProject(name.trim() || `${store.project.name} 副本`)
    },
    renameProject: async () => {
      if (!store.project) return
      const name = window.prompt('新名称', store.project.name)
      if (name === null) return
      await store.renameCurrentProject(name.trim() || store.project.name)
    },
    deleteProject: async () => {
      if (!store.project) return
      if (!window.confirm(`确认删除工程「${store.project.name}」吗？此操作不可撤销。`)) return
      await store.deleteProjectById(store.project.id)
    },
    importOsm: () => store.importJinanNetwork(),
    aiBatchNaming: () => { /* handled in PanelStationMulti */ },
    aiAutoBatchNaming: () => { /* handled in PanelStationMulti */ },
  }

  if (actionMap[action]) {
    actionMap[action]()
  }
}

onMounted(async () => {
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
  <main class="app">
    <MenuBar
      :active-view="activeView"
      @set-view="setActiveView"
      @action="handleMenuAction"
      @show-project-list="projectListVisible = true"
    />
    <div class="app__body">
      <ToolStrip
        :mode="store.mode"
        :can-undo="store.canUndo"
        :can-redo="store.canRedo"
        @set-mode="store.setMode($event)"
        @undo="store.undo()"
        @redo="store.redo()"
      />
      <div class="app__canvas">
        <section
          class="app__panel"
          :class="{ 'app__panel--active': activeView === 'map' }"
          :aria-hidden="activeView !== 'map'"
        >
          <MapEditor />
        </section>
        <section
          class="app__panel"
          :class="{ 'app__panel--active': activeView === 'schematic' }"
          :aria-hidden="activeView !== 'schematic'"
        >
          <SchematicView />
        </section>
        <section
          class="app__panel"
          :class="{ 'app__panel--active': activeView === 'hud' }"
          :aria-hidden="activeView !== 'hud'"
        >
          <VehicleHudView />
        </section>
      </div>
      <PropertiesPanel />
    </div>
    <StatusBar />
  </main>
  <ProjectListDialog :visible="projectListVisible" @close="projectListVisible = false" />
</template>

<style scoped>
.app {
  min-height: 100vh;
  height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr auto;
  background: var(--app-shell-gradient);
  color: var(--app-text);
}

.app__body {
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.app__canvas {
  flex: 1;
  position: relative;
  min-width: 0;
  min-height: 0;
  background: var(--workspace-bg);
}

.app__panel {
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
  transition: opacity 0.2s ease;
}

.app__panel > * {
  width: 100%;
  height: 100%;
}

.app__panel--active {
  opacity: 1;
  pointer-events: auto;
  visibility: visible;
}
</style>
