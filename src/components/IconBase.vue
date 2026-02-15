<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: {
    type: String,
    required: true,
  },
  size: {
    type: [Number, String],
    default: 16,
  },
})

const sizeValue = computed(() => {
  return typeof props.size === 'number' ? `${props.size}px` : props.size
})
</script>

<template>
  <svg
    class="icon"
    :style="{ width: sizeValue, height: sizeValue }"
    aria-hidden="true"
  >
    <use :href="`#icon-${name}`" />
  </svg>
</template>

<style scoped>
.icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
  color: currentColor;
}
</style>
