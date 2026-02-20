<script setup>
import { computed } from 'vue'

const props = defineProps({
  state: {
    type: String, // 'saved', 'unsaved', 'saving', 'error'
    default: 'saved'
  }
})

const colors = {
  saved: 'var(--ark-text-dim)',
  unsaved: 'var(--ark-pink)',
  saving: 'var(--ark-purple)',
  error: '#f87171'
}

const currentColor = computed(() => colors[props.state] || colors.saved)
</script>

<template>
  <div class="metro-saving-icon" :class="[`metro-saving-icon--${state}`]">
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Background Ring -->
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-dasharray="2 4"
        class="ring-bg"
      />
      
      <!-- Saving Animation: Two lines shuttling -->
      <template v-if="state === 'saving'">
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="var(--ark-pink)"
          stroke-width="2"
          stroke-dasharray="6 22"
          class="shuttle shuttle-1"
        />
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="var(--ark-purple)"
          stroke-width="2"
          stroke-dasharray="6 22"
          class="shuttle shuttle-2"
        />
      </template>

      <!-- Saved State: Full Ring -->
      <circle
        v-if="state === 'saved'"
        cx="12"
        cy="12"
        r="9"
        stroke="var(--toolbar-status)"
        stroke-width="2"
        class="ring-complete"
      />

      <!-- Error State: X -->
      <path
        v-if="state === 'error'"
        d="M8 8L16 16M16 8L8 16"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />

      <!-- Unsaved State: Gap ring -->
      <circle
        v-if="state === 'unsaved'"
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        stroke-width="2"
        stroke-dasharray="40 16"
        class="ring-unsaved"
      />
    </svg>
  </div>
</template>

<style scoped>
.metro-saving-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color var(--transition-normal);
}

.metro-saving-icon--saved { color: var(--toolbar-status); }
.metro-saving-icon--unsaved { color: var(--ark-pink); }
.metro-saving-icon--saving { color: var(--ark-purple); }
.metro-saving-icon--error { color: #f87171; }

.ring-bg {
  opacity: 0.2;
}

.shuttle {
  transform-origin: center;
  filter: drop-shadow(0 0 2px currentColor);
}

.shuttle-1 {
  animation: rotate 1.5s linear infinite;
}

.shuttle-2 {
  animation: rotate 1.5s linear infinite reverse;
  animation-delay: -0.75s;
}

.ring-complete {
  stroke-dasharray: 60;
  stroke-dashoffset: 60;
  animation: metro-line-draw 0.5s ease-out forwards;
}

.ring-unsaved {
  animation: pulse 2s infinite ease-in-out;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(0.95); }
}
</style>
