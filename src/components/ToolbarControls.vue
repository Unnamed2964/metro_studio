<script setup>
import { onMounted, ref } from 'vue'
import { useProjectStore } from '../stores/projectStore'

const store = useProjectStore()

const newProjectName = ref('济南地铁图工程')
const newLineZh = ref('')
const newLineEn = ref('')
const newLineColor = ref('#005BBB')
const fileInputRef = ref(null)
const projectOptions = ref([])

async function refreshProjectOptions() {
  projectOptions.value = await store.listProjects()
}

async function createProject() {
  await store.createNewProject(newProjectName.value.trim() || '新建工程')
  await refreshProjectOptions()
}

async function importFromOsm() {
  await store.importJinanNetwork()
  await refreshProjectOptions()
}

function addLine() {
  store.addLine({
    nameZh: newLineZh.value,
    nameEn: newLineEn.value,
    color: newLineColor.value,
  })
  newLineZh.value = ''
  newLineEn.value = ''
}

function chooseProjectFile() {
  fileInputRef.value?.click()
}

async function onFileSelected(event) {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    await store.importProjectFile(file)
    await refreshProjectOptions()
  } catch (error) {
    store.statusText = `加载工程失败: ${error.message || '未知错误'}`
  } finally {
    event.target.value = ''
  }
}

async function onLoadProject(projectId) {
  await store.loadProjectById(projectId)
}

onMounted(async () => {
  await refreshProjectOptions()
})
</script>

<template>
  <aside class="toolbar">
    <section class="toolbar__section">
      <h1>RailMap</h1>
      <p class="toolbar__subtitle">济南地铁图生成与编辑</p>
      <p class="toolbar__status">{{ store.statusText }}</p>
    </section>

    <section class="toolbar__section">
      <h3>工程管理</h3>
      <label class="toolbar__label">工程名</label>
      <input v-model="newProjectName" class="toolbar__input" placeholder="输入工程名" />
      <div class="toolbar__row">
        <button class="toolbar__btn toolbar__btn--primary" @click="createProject">新建工程</button>
        <button class="toolbar__btn" @click="store.exportProjectFile()">保存文件</button>
      </div>
      <div class="toolbar__row">
        <button class="toolbar__btn" @click="chooseProjectFile">加载文件</button>
        <button class="toolbar__btn" @click="store.persistNow()">存入本地库</button>
      </div>
      <input ref="fileInputRef" type="file" accept=".json,.railmap.json" class="hidden" @change="onFileSelected" />
    </section>

    <section class="toolbar__section">
      <h3>OSM 导入</h3>
      <label class="toolbar__checkbox">
        <input v-model="store.includeConstruction" type="checkbox" />
        包含在建线路与车站
      </label>
      <label class="toolbar__checkbox">
        <input v-model="store.includeProposed" type="checkbox" />
        包含规划线路与车站
      </label>
      <button
        class="toolbar__btn toolbar__btn--primary"
        :disabled="store.isImporting"
        @click="importFromOsm"
      >
        {{ store.isImporting ? '导入中...' : '导入济南 OSM 线网' }}
      </button>
    </section>

    <section class="toolbar__section">
      <h3>编辑模式</h3>
      <div class="toolbar__row">
        <button class="toolbar__btn" :class="{ active: store.mode === 'select' }" @click="store.setMode('select')">
          选择/拖拽
        </button>
        <button
          class="toolbar__btn"
          :class="{ active: store.mode === 'add-station' }"
          @click="store.setMode('add-station')"
        >
          点站
        </button>
        <button class="toolbar__btn" :class="{ active: store.mode === 'add-edge' }" @click="store.setMode('add-edge')">
          拉线
        </button>
      </div>
      <button
        class="toolbar__btn toolbar__btn--primary"
        :disabled="store.isLayoutRunning || !store.project?.stations?.length"
        @click="store.runAutoLayout()"
      >
        {{ store.isLayoutRunning ? '排版中...' : '自动生成官方风' }}
      </button>
    </section>

    <section class="toolbar__section">
      <h3>线路</h3>
      <input v-model="newLineZh" class="toolbar__input" placeholder="中文线路名" />
      <input v-model="newLineEn" class="toolbar__input" placeholder="English line name" />
      <input v-model="newLineColor" type="color" class="toolbar__color" />
      <button class="toolbar__btn" @click="addLine">新增线路</button>
      <ul class="toolbar__line-list">
        <li v-for="line in store.project?.lines || []" :key="line.id">
          <button
            class="toolbar__line-item"
            :class="{ active: store.activeLineId === line.id }"
            @click="store.setActiveLine(line.id)"
          >
            <span class="toolbar__line-swatch" :style="{ backgroundColor: line.color }"></span>
            <span>{{ line.nameZh }}</span>
          </button>
        </li>
      </ul>
    </section>

    <section class="toolbar__section">
      <h3>导出</h3>
      <div class="toolbar__row">
        <button class="toolbar__btn" @click="store.exportSvg()">导出 SVG</button>
        <button class="toolbar__btn" @click="store.exportPng()">导出 PNG</button>
      </div>
    </section>

    <section class="toolbar__section">
      <h3>本地工程记录</h3>
      <ul class="toolbar__project-list">
        <li v-for="project in projectOptions" :key="project.id">
          <button class="toolbar__project-item" @click="onLoadProject(project.id)">
            <span>{{ project.name }}</span>
            <small>{{ new Date(project.meta.updatedAt).toLocaleString() }}</small>
          </button>
        </li>
      </ul>
    </section>
  </aside>
</template>

<style scoped>
.toolbar {
  width: 360px;
  background: #0f172a;
  color: #e2e8f0;
  overflow: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.toolbar__section {
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 12px;
  background: rgba(15, 23, 42, 0.65);
}

.toolbar__section h1 {
  margin: 0;
  font-size: 24px;
}

.toolbar__subtitle {
  margin: 6px 0 0;
  color: #94a3b8;
  font-size: 12px;
}

.toolbar__status {
  margin: 10px 0 0;
  color: #d1fae5;
  font-size: 12px;
  line-height: 1.4;
}

.toolbar__section h3 {
  margin: 0 0 10px;
  font-size: 14px;
}

.toolbar__input {
  width: 100%;
  background: #111827;
  border: 1px solid #334155;
  color: #f8fafc;
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 8px;
}

.toolbar__label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: #93c5fd;
}

.toolbar__row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.toolbar__btn {
  border: 1px solid #334155;
  color: #e2e8f0;
  background: #111827;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  font-size: 12px;
}

.toolbar__btn:hover {
  border-color: #64748b;
}

.toolbar__btn--primary {
  background: #1d4ed8;
  border-color: #2563eb;
}

.toolbar__btn.active {
  background: #14532d;
  border-color: #22c55e;
}

.toolbar__checkbox {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
}

.toolbar__color {
  width: 100%;
  height: 34px;
  border-radius: 8px;
  border: 1px solid #334155;
  margin-bottom: 8px;
}

.toolbar__line-list,
.toolbar__project-list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 180px;
  overflow: auto;
}

.toolbar__line-item,
.toolbar__project-item {
  width: 100%;
  border: 1px solid #334155;
  border-radius: 8px;
  background: #0b1220;
  color: #e2e8f0;
  padding: 8px;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
}

.toolbar__line-item.active {
  border-color: #22c55e;
}

.toolbar__line-swatch {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  flex-shrink: 0;
}

.toolbar__project-item {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.toolbar__project-item small {
  color: #94a3b8;
}

.hidden {
  display: none;
}
</style>
