<script setup>
import { onMounted, ref, computed } from 'vue'
import IconBase from './IconBase.vue'
import { useProjectStore } from '../stores/projectStore'

const props = defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const store = useProjectStore()
const projectOptions = ref([])
const projectFilter = ref('')

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

async function refreshList() {
  projectOptions.value = await store.listProjects()
}

async function loadProject(projectId) {
  await store.loadProjectById(projectId)
  await refreshList()
  emit('close')
}

async function deleteProject(projectId) {
  const target = projectOptions.value.find((p) => p.id === projectId)
  const targetName = target?.name || projectId
  if (!window.confirm(`确认删除工程「${targetName}」吗？此操作不可撤销。`)) return
  await store.deleteProjectById(projectId)
  await refreshList()
}

function isCurrentProject(projectId) {
  return currentProjectId.value === projectId
}

onMounted(() => {
  refreshList()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-backdrop" @mousedown.self="emit('close')">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="工程列表">
        <header class="dialog__header">
          <h2 class="dialog__title">工程列表</h2>
          <button class="dialog__close" type="button" @click="emit('close')">
            <IconBase name="x" :size="16" />
          </button>
        </header>
        <div class="dialog__body">
          <div class="dialog__search-row">
            <input
              v-model="projectFilter"
              class="dialog__search"
              placeholder="搜索工程名或 ID..."
            />
            <button class="dialog__refresh-btn" type="button" @click="refreshList">刷新</button>
          </div>
          <ul class="dialog__list">
            <li v-for="project in filteredProjectOptions" :key="project.id">
              <div class="dialog__item" :class="{ 'dialog__item--active': isCurrentProject(project.id) }">
                <div class="dialog__item-main">
                  <span class="dialog__item-name">{{ project.name }}</span>
                  <small class="dialog__item-meta">{{ new Date(project.meta.updatedAt).toLocaleString() }}</small>
                </div>
                <div class="dialog__item-actions">
                  <button class="dialog__action-btn" @click="loadProject(project.id)">加载</button>
                  <button class="dialog__action-btn dialog__action-btn--danger" @click="deleteProject(project.id)">删除</button>
                </div>
              </div>
            </li>
            <li v-if="!filteredProjectOptions.length" class="dialog__empty">
              无匹配工程
            </li>
          </ul>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 8000;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog {
  width: 520px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 64px);
  background: var(--toolbar-card-bg);
  border: 1px solid var(--toolbar-border);
  border-radius: 12px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--toolbar-border);
}

.dialog__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--toolbar-text);
}

.dialog__close {
  border: none;
  background: transparent;
  color: var(--toolbar-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
}

.dialog__close:hover {
  background: var(--toolbar-button-bg);
  color: var(--toolbar-text);
}

.dialog__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px;
}

.dialog__search-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.dialog__search {
  flex: 1;
  padding: 7px 10px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 6px;
  background: var(--toolbar-input-bg);
  color: var(--toolbar-text);
  font-size: 12px;
  outline: none;
}

.dialog__search:focus {
  border-color: var(--toolbar-tab-active-border);
}

.dialog__refresh-btn {
  padding: 7px 12px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 6px;
  background: var(--toolbar-input-bg);
  color: var(--toolbar-text);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.dialog__refresh-btn:hover {
  border-color: var(--toolbar-button-hover-border);
}

.dialog__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dialog__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 8px;
  background: var(--toolbar-input-bg);
  transition: border-color 0.12s ease;
}

.dialog__item--active {
  border-color: var(--toolbar-tab-active-border);
  background: var(--toolbar-tab-active-bg);
}

.dialog__item-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.dialog__item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--toolbar-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dialog__item-meta {
  font-size: 11px;
  color: var(--toolbar-muted);
}

.dialog__item-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.dialog__action-btn {
  padding: 4px 10px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 5px;
  background: var(--toolbar-input-bg);
  color: var(--toolbar-text);
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}

.dialog__action-btn:hover {
  border-color: var(--toolbar-button-hover-border);
}

.dialog__action-btn--danger {
  color: var(--toolbar-danger, #e74c3c);
}

.dialog__action-btn--danger:hover {
  border-color: var(--toolbar-danger, #e74c3c);
}

.dialog__empty {
  text-align: center;
  padding: 24px;
  color: var(--toolbar-muted);
  font-size: 13px;
}
</style>
