<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import MapEditor from './components/MapEditor.vue'
import SchematicView from './components/SchematicView.vue'
import ToolbarControls from './components/ToolbarControls.vue'
import VehicleHudView from './components/VehicleHudView.vue'
import { useProjectStore } from './stores/projectStore'

const store = useProjectStore()
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'railmap_toolbar_collapsed'
const sidebarCollapsed = ref(false)

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

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, sidebarCollapsed.value ? '1' : '0')
  } catch {
    // Ignore unavailable localStorage runtime.
  }
}

onMounted(async () => {
  loadSidebarCollapsedState()
  window.addEventListener('beforeunload', handleBeforeUnload)
  await store.initialize()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <main class="app" :class="{ 'app--sidebar-collapsed': sidebarCollapsed }">
    <ToolbarControls :collapsed="sidebarCollapsed" @toggle-collapse="toggleSidebar" />
    <section class="workspace">
      <MapEditor />
      <SchematicView />
      <VehicleHudView />
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
  gap: 0;
  grid-template-rows: repeat(3, minmax(100vh, 100vh));
  overflow-y: auto;
  overscroll-behavior: contain;
  scroll-snap-type: y mandatory;
  background: var(--workspace-bg);
}

.workspace > * {
  min-height: 100vh;
  height: 100vh;
  scroll-snap-align: start;
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
    grid-template-rows: repeat(3, minmax(100vh, 100vh));
  }

  .workspace > * {
    min-height: 100vh;
    height: 100vh;
  }
}
</style>
