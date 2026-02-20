<script setup>
import { computed } from 'vue'
import IconBase from './IconBase.vue'
import { NTooltip } from 'naive-ui'
import { getEffectiveBindings, formatBindingDisplay } from '../lib/shortcutRegistry'

const props = defineProps({
  mode: { type: String, default: 'select' },
  canUndo: { type: Boolean, default: false },
  canRedo: { type: Boolean, default: false },
})

const emit = defineEmits(['set-mode', 'undo', 'redo'])

const TOOL_SHORTCUT_MAP = {
  'select': 'tool.select',
  'add-station': 'tool.addStation',
  'add-edge': 'tool.addEdge',
  'route-draw': 'tool.routeDraw',
  'style-brush': 'tool.styleBrush',
  'box-select': 'tool.boxSelect',
  'quick-link': 'tool.quickLink',
  'anchor-edit': 'tool.anchorEdit',
  'delete-mode': 'tool.delete',
  'measure-two-point': 'tool.measureTwoPoint',
  'measure-multi-point': 'tool.measureMultiPoint',
  'annotation': 'tool.annotation',
  'quick-rename': 'tool.quickRename',
}

const tools = computed(() => {
  const bindings = getEffectiveBindings()
  const bindingMap = new Map(bindings.map((b) => [b.id, b.binding]))
  return [
    { mode: 'select', icon: 'cursor', label: '选择' },
    { mode: 'add-station', icon: 'plus-circle', label: '点站' },
    { mode: 'add-edge', icon: 'git-branch', label: '拉线' },
    { mode: 'route-draw', icon: 'route', label: '布线' },
    { mode: 'quick-rename', icon: 'edit-3', label: '线改' },
    { mode: 'style-brush', icon: 'paintbrush', label: '样式刷' },
    { mode: 'box-select', icon: 'box-select', label: '框选' },
    { mode: 'quick-link', icon: 'link', label: '连线' },
    { mode: 'anchor-edit', icon: 'edit-3', label: '锚点' },
    { mode: 'delete-mode', icon: 'trash', label: '删除' },
    { mode: 'measure-two-point', icon: 'move', label: '两点测' },
    { mode: 'measure-multi-point', icon: 'git-commit', label: '多点测' },
    { mode: 'annotation', icon: 'message-square', label: '注释' },
  ].map((t) => ({
    ...t,
    shortcut: formatBindingDisplay(bindingMap.get(TOOL_SHORTCUT_MAP[t.mode]) || ''),
  }))
})

const undoShortcut = computed(() => {
  const bindings = getEffectiveBindings()
  const b = bindings.find((x) => x.id === 'edit.undo')
  return b ? formatBindingDisplay(b.binding) : 'Ctrl+Z'
})

const redoShortcut = computed(() => {
  const bindings = getEffectiveBindings()
  const b = bindings.find((x) => x.id === 'edit.redo')
  return b ? formatBindingDisplay(b.binding) : 'Ctrl+Shift+Z'
})
</script>

<template>
  <aside class="tool-strip">
    <div class="tool-strip__accent-bar"></div>
    <div class="tool-strip__tools">
      <NTooltip
        v-for="tool in tools"
        :key="tool.mode"
        placement="right"
        :delay="300"
      >
        <template #trigger>
          <button
            class="tool-strip__btn"
            :class="{ 'tool-strip__btn--active': mode === tool.mode }"
            type="button"
            @click="emit('set-mode', tool.mode)"
          >
            <IconBase :name="tool.icon" :size="18" />
          </button>
        </template>
        {{ tool.label }}{{ tool.shortcut ? ` (${tool.shortcut})` : '' }}
      </NTooltip>
    </div>

    <div class="tool-strip__divider" />

    <div class="tool-strip__actions">
      <NTooltip placement="right" :delay="300">
        <template #trigger>
          <button class="tool-strip__btn" :disabled="!canUndo" type="button" @click="emit('undo')">
            <IconBase name="undo" :size="18" />
          </button>
        </template>
        撤销 ({{ undoShortcut }})
      </NTooltip>
      <NTooltip placement="right" :delay="300">
        <template #trigger>
          <button class="tool-strip__btn" :disabled="!canRedo" type="button" @click="emit('redo')">
            <IconBase name="redo" :size="18" />
          </button>
        </template>
        重做 ({{ redoShortcut }})
      </NTooltip>
    </div>
  </aside>
</template>

<style scoped>
.tool-strip {
  width: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 0 8px;
  background: var(--ark-bg-base);
  border-right: 1px solid var(--toolbar-border);
  overflow-y: auto;
  flex-shrink: 0;
}

.tool-strip__accent-bar {
  width: 100%;
  height: 2px;
  background: var(--ark-pink);
  opacity: 0.5;
  margin-bottom: 4px;
  flex-shrink: 0;
}

.tool-strip__tools {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 100%;
  padding: 0 6px;
}

.tool-strip__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 100%;
  padding: 0 6px;
}

.tool-strip__divider {
  width: 20px;
  height: 1px;
  margin: 8px 0;
  background: var(--toolbar-divider);
  flex-shrink: 0;
}

.tool-strip__btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  color: var(--toolbar-muted);
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast);
}

.tool-strip__btn:hover:not(:disabled) {
  background: rgba(255, 45, 120, 0.08);
  color: var(--toolbar-text);
}

.tool-strip__btn--active {
  color: var(--ark-pink);
  background: transparent;
}

.tool-strip__btn--active::before {
  content: '';
  position: absolute;
  left: -7px;
  top: 50%;
  transform: translateY(-50%);
  width: var(--indicator-width, 2px);
  height: 20px;
  background: var(--ark-pink);
  box-shadow: 0 0 6px var(--ark-pink-glow);
}

.tool-strip__btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
