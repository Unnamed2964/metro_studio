<script setup>
import { useProjectStore } from '../../stores/projectStore'
import { useToolbarProjectManagement } from '../../composables/useToolbarProjectManagement.js'

const store = useProjectStore()

const {
  newProjectName,
  projectRenameName,
  projectFilter,
  fileInputRef,
  filteredProjectOptions,
  createProject,
  chooseProjectFile,
  onFileSelected,
  onLoadProject,
  renameCurrentProject,
  duplicateCurrentProject,
  deleteCurrentProject,
  deleteProject,
  persistProjectToDb,
  refreshProjectOptions,
  isCurrentProject,
} = useToolbarProjectManagement()
</script>

<template>
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
</template>

<style src="./toolbar-shared.css"></style>
