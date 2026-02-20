<script setup>
defineProps({
  measureLines: { type: Array, required: true },
  measureMarkersKey: { type: Number, required: true },
  measurePoints: { type: Array, required: true },
  getMarkerStyle: { type: Function, required: true },
})
</script>

<template>
  <svg v-if="measureLines.length > 0" class="map-editor__measure-lines" aria-hidden="true">
    <line
      v-for="(line, index) in measureLines"
      :key="`measure-line-${index}-${measureMarkersKey}`"
      :x1="line.x1"
      :y1="line.y1"
      :x2="line.x2"
      :y2="line.y2"
      stroke="#3b82f6"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-dasharray="8 4"
    />
  </svg>

  <div
    v-for="(point, index) in measurePoints"
    :key="`measure-${index}-${measureMarkersKey}`"
    class="map-editor__measure-marker"
    :style="getMarkerStyle(point.lngLat)"
  >
    <div class="map-editor__measure-marker-icon">{{ index + 1 }}</div>
  </div>
</template>

<style scoped>
.map-editor__measure-lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 18;
}

.map-editor__measure-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 20;
  animation: measure-marker-appear 0.2s ease-out;
}

@keyframes measure-marker-appear {
  from {
    transform: translate(-50%, -50%) scale(0);
    opacity: 0;
  }
  to {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
}

.map-editor__measure-marker-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  border: 3px solid white;
  box-shadow: 0 3px 12px rgba(59, 130, 246, 0.4), 0 1px 4px rgba(0, 0, 0, 0.2);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
</style>
