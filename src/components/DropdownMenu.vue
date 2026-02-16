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
  isSubmenu: {
    type: Boolean,
    default: false,
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

  let left, top

  if (props.isSubmenu) {
    // Submenu: appear to the right of the parent item
    left = rect.left
    top = rect.top
    // If overflows right, flip to left side
    if (left + menuRect.width > window.innerWidth - padding) {
      left = rect.right - menuRect.width
    }
  } else {
    // Top-level menu: appear below the anchor
    left = rect.left
    top = rect.bottom + 2
  }

  if (left + menuRect.width > window.innerWidth - padding) {
    left = Math.max(padding, window.innerWidth - menuRect.width - padding)
  }
  if (top + menuRect.height > window.innerHeight - padding) {
    top = Math.max(padding, window.innerHeight - menuRect.height - padding)
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

function onItemMouseEnter(event, index) {
  focusedIndex.value = index
  const item = props.items[index]
  if (item?.type === 'submenu') {
    submenuOpenIndex.value = index
    const itemRect = event.currentTarget.getBoundingClientRect()
    const menuRect = menuRef.value?.getBoundingClientRect()
    if (menuRect) {
      submenuRect.value = {
        left: menuRect.right - 2,
        top: itemRect.top,
        bottom: itemRect.bottom,
        right: menuRect.right,
      }
    }
  } else {
    submenuOpenIndex.value = -1
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
    <div v-if="visible && !isSubmenu" class="dropdown-menu__backdrop" @mousedown.self="emit('close')" />
    <div v-if="visible" ref="menuRef" class="dropdown-menu" role="menu">
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
          @mouseenter="onItemMouseEnter($event, index)"
        >
          <span v-if="item.type === 'toggle'" class="dropdown-menu__check">
            <IconBase v-if="item.checked" name="check" :size="14" class="dropdown-menu__check-icon" />
          </span>
          <IconBase v-if="item.icon" :name="item.icon" :size="14" class="dropdown-menu__icon" />
          <span class="dropdown-menu__label">{{ item.label }}</span>
          <kbd v-if="item.shortcut" class="dropdown-menu__shortcut">{{ item.shortcut }}</kbd>
          <span v-if="item.type === 'submenu'" class="dropdown-menu__arrow">
            <IconBase name="chevron-right" :size="12" />
          </span>
        </div>
        <DropdownMenu
          v-if="item.type === 'submenu' && submenuOpenIndex === index && submenuRect"
          :items="item.children || []"
          :visible="true"
          :anchor-rect="submenuRect"
          :is-submenu="true"
          @select="onSubmenuSelect"
          @close="submenuOpenIndex = -1"
        />
      </template>
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
  padding: 4px;
  background: var(--toolbar-card-bg);
  border: 1px solid var(--toolbar-border);
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  z-index: 9001;
  animation: dropdown-enter var(--transition-normal);
}

.dropdown-menu__separator {
  height: 1px;
  margin: 4px 12px;
  background: var(--toolbar-divider);
}

.dropdown-menu__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 14px;
  font-size: 12px;
  color: var(--toolbar-text);
  cursor: pointer;
  white-space: nowrap;
  border-radius: 6px;
  transition: background-color var(--transition-fast, 0.1s ease);
}

.dropdown-menu__item--focused,
.dropdown-menu__item:hover:not(.dropdown-menu__item--disabled) {
  background: var(--toolbar-tab-active-bg);
}

.dropdown-menu__item--focused::before,
.dropdown-menu__item:hover:not(.dropdown-menu__item--disabled)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: var(--indicator-width, 2px);
  height: 16px;
  background: var(--indicator-color, var(--toolbar-primary-bg));
  border-radius: 0 1px 1px 0;
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

.dropdown-menu__check-icon {
  color: var(--indicator-color, var(--toolbar-primary-bg));
}

.dropdown-menu__icon {
  flex-shrink: 0;
  color: var(--toolbar-muted);
  transition: color var(--transition-fast, 0.1s ease);
}

.dropdown-menu__item--focused .dropdown-menu__icon,
.dropdown-menu__item:hover:not(.dropdown-menu__item--disabled) .dropdown-menu__icon {
  color: var(--toolbar-text);
}

.dropdown-menu__label {
  flex: 1;
  min-width: 0;
}

.dropdown-menu__shortcut {
  margin-left: auto;
  padding-left: 24px;
  font-size: 10px;
  font-family: inherit;
  color: var(--toolbar-muted);
  flex-shrink: 0;
  background: var(--toolbar-input-bg);
  padding: 1px 6px;
  border-radius: var(--radius-sm, 4px);
  border: 1px solid var(--toolbar-divider);
  line-height: 1.5;
}

.dropdown-menu__arrow {
  margin-left: auto;
  color: var(--toolbar-muted);
  flex-shrink: 0;
}

.dropdown-menu .dropdown-menu {
  animation: submenu-enter var(--transition-normal);
}
</style>
