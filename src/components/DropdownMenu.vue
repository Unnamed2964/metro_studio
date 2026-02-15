<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import IconBase from './IconBase.vue'

const props = defineProps({
  items: {
    type: Array,
    required: true,
  },
  visible: {
    type: Boolean,
    default: false,
  },
  anchorRect: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['select', 'close'])

const menuRef = ref(null)
const focusedIndex = ref(-1)
const submenuOpenIndex = ref(-1)
const submenuRect = ref(null)

const actionableItems = computed(() =>
  props.items
    .map((item, index) => ({ ...item, _index: index }))
    .filter((item) => item.type !== 'separator'),
)

function positionMenu() {
  if (!menuRef.value || !props.anchorRect) return
  const menu = menuRef.value
  const rect = props.anchorRect
  const menuRect = menu.getBoundingClientRect()
  const padding = 4

  let left = rect.left
  let top = rect.bottom + 2

  if (left + menuRect.width > window.innerWidth - padding) {
    left = Math.max(padding, window.innerWidth - menuRect.width - padding)
  }
  if (top + menuRect.height > window.innerHeight - padding) {
    top = Math.max(padding, rect.top - menuRect.height - 2)
  }

  menu.style.left = `${left}px`
  menu.style.top = `${top}px`
}

function onItemClick(item) {
  if (item.disabled) return
  if (item.type === 'separator') return
  if (item.type === 'submenu') return
  emit('select', item)
}

function onItemMouseEnter(index) {
  focusedIndex.value = index
  const item = props.items[index]
  if (item?.type === 'submenu') {
    submenuOpenIndex.value = index
    nextTick(positionSubmenu)
  } else {
    submenuOpenIndex.value = -1
  }
}

function positionSubmenu() {
  if (submenuOpenIndex.value < 0 || !menuRef.value) return
  const menuEl = menuRef.value
  const itemEls = menuEl.querySelectorAll('.dropdown-menu__item')
  const itemEl = itemEls[submenuOpenIndex.value]
  if (!itemEl) return
  const itemRect = itemEl.getBoundingClientRect()
  const menuRect = menuEl.getBoundingClientRect()
  submenuRect.value = {
    left: menuRect.right - 2,
    top: itemRect.top,
    bottom: itemRect.bottom,
    right: menuRect.right,
  }
}

function onSubmenuSelect(item) {
  emit('select', item)
}

function onKeyDown(event) {
  if (!props.visible) return
  const key = event.key
  if (key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('close')
    return
  }
  if (key === 'ArrowDown') {
    event.preventDefault()
    moveFocus(1)
    return
  }
  if (key === 'ArrowUp') {
    event.preventDefault()
    moveFocus(-1)
    return
  }
  if (key === 'Enter' || key === ' ') {
    event.preventDefault()
    const item = props.items[focusedIndex.value]
    if (item && !item.disabled && item.type !== 'separator') {
      onItemClick(item)
    }
  }
}

function moveFocus(direction) {
  if (!actionableItems.value.length) return
  const currentActionIndex = actionableItems.value.findIndex(
    (item) => item._index === focusedIndex.value,
  )
  let nextActionIndex = currentActionIndex + direction
  if (nextActionIndex < 0) nextActionIndex = actionableItems.value.length - 1
  if (nextActionIndex >= actionableItems.value.length) nextActionIndex = 0
  focusedIndex.value = actionableItems.value[nextActionIndex]._index
}

watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      focusedIndex.value = -1
      submenuOpenIndex.value = -1
      await nextTick()
      positionMenu()
      window.addEventListener('keydown', onKeyDown, true)
    } else {
      window.removeEventListener('keydown', onKeyDown, true)
    }
  },
)

onMounted(() => {
  if (props.visible) {
    nextTick(positionMenu)
    window.addEventListener('keydown', onKeyDown, true)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown, true)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="dropdown-menu__backdrop" @mousedown.self="emit('close')">
      <div ref="menuRef" class="dropdown-menu" role="menu">
        <template v-for="(item, index) in items" :key="index">
          <div v-if="item.type === 'separator'" class="dropdown-menu__separator" role="separator" />
          <div
            v-else
            class="dropdown-menu__item"
            :class="{
              'dropdown-menu__item--disabled': item.disabled,
              'dropdown-menu__item--focused': focusedIndex === index,
              'dropdown-menu__item--toggle': item.type === 'toggle',
              'dropdown-menu__item--submenu': item.type === 'submenu',
            }"
            role="menuitem"
            :aria-disabled="item.disabled || undefined"
            @click.stop="onItemClick(item)"
            @mouseenter="onItemMouseEnter(index)"
          >
            <span v-if="item.type === 'toggle'" class="dropdown-menu__check">
              <IconBase v-if="item.checked" name="check" :size="14" />
            </span>
            <IconBase v-if="item.icon" :name="item.icon" :size="14" class="dropdown-menu__icon" />
            <span class="dropdown-menu__label">{{ item.label }}</span>
            <span v-if="item.shortcut" class="dropdown-menu__shortcut">{{ item.shortcut }}</span>
            <span v-if="item.type === 'submenu'" class="dropdown-menu__arrow">
              <IconBase name="chevron-right" :size="12" />
            </span>
          </div>
          <DropdownMenu
            v-if="item.type === 'submenu' && submenuOpenIndex === index && submenuRect"
            :items="item.children || []"
            :visible="true"
            :anchor-rect="submenuRect"
            @select="onSubmenuSelect"
            @close="submenuOpenIndex = -1"
          />
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dropdown-menu__backdrop {
  position: fixed;
  inset: 0;
  z-index: 9000;
}

.dropdown-menu {
  position: fixed;
  min-width: 200px;
  max-width: 320px;
  max-height: calc(100vh - 16px);
  overflow-y: auto;
  padding: 4px 0;
  background: var(--toolbar-card-bg);
  border: 1px solid var(--toolbar-border);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  z-index: 9001;
}

.dropdown-menu__separator {
  height: 1px;
  margin: 4px 8px;
  background: var(--toolbar-divider);
}

.dropdown-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 12px;
  color: var(--toolbar-text);
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.1s ease;
}

.dropdown-menu__item--focused,
.dropdown-menu__item:hover:not(.dropdown-menu__item--disabled) {
  background: var(--toolbar-tab-active-bg);
}

.dropdown-menu__item--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.dropdown-menu__check {
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.dropdown-menu__icon {
  flex-shrink: 0;
  color: var(--toolbar-muted);
}

.dropdown-menu__label {
  flex: 1;
  min-width: 0;
}

.dropdown-menu__shortcut {
  margin-left: auto;
  padding-left: 24px;
  font-size: 11px;
  color: var(--toolbar-muted);
  flex-shrink: 0;
}

.dropdown-menu__arrow {
  margin-left: auto;
  color: var(--toolbar-muted);
  flex-shrink: 0;
}
</style>
