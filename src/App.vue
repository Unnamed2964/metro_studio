<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import MapEditor from './components/MapEditor.vue'
import SchematicView from './components/SchematicView.vue'
import ToolbarControls from './components/ToolbarControls.vue'
import { useProjectStore } from './stores/projectStore'

const store = useProjectStore()

function handleBeforeUnload(event) {
  event.preventDefault()
  event.returnValue = ''
}

onMounted(async () => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  await store.initialize()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <main class="app">
    <ToolbarControls />
    <section class="workspace">
      <MapEditor />
      <SchematicView />
    </section>
  </main>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 360px 1fr;
  background: linear-gradient(145deg, #e2e8f0, #f8fafc);
}

.workspace {
  padding: 14px;
  display: grid;
  gap: 14px;
  grid-template-rows: minmax(420px, 52vh) minmax(340px, 1fr);
}

@media (max-width: 1060px) {
  .app {
    grid-template-columns: 1fr;
  }

  .workspace {
    grid-template-rows: minmax(360px, 48vh) minmax(300px, 1fr);
  }
}
</style>
