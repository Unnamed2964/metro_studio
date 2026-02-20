<script setup>
defineProps({ visible: Boolean, progress: { type: Number, default: 0 } })
</script>

<template>
  <Transition name="progress-fade">
    <div v-if="visible" class="progress-bar">
      <div class="progress-bar__track">
        <div class="progress-bar__fill" :style="{ width: `${progress}%` }" />
      </div>
      <span class="progress-bar__label">{{ progress }}%</span>
    </div>
  </Transition>
</template>

<style scoped>
.progress-bar {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  padding: 8px 12px;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
}
.progress-bar__track {
  width: 100%;
  height: 2px;
  background: rgba(188, 31, 255, 0.1);
  overflow: hidden;
  position: relative;
}
.progress-bar__fill {
  height: 100%;
  background: linear-gradient(90deg, var(--ark-purple), var(--ark-pink));
  box-shadow: 0 0 8px var(--ark-pink-glow);
  transition: width var(--transition-slow);
  position: relative;
}
.progress-bar__fill::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  width: 20px;
  height: 100%;
  background: #fff;
  box-shadow: 0 0 10px #fff;
  filter: blur(2px);
}
.progress-bar__label {
  font-family: var(--app-font-mono);
  font-size: 10px;
  color: var(--ark-pink);
  letter-spacing: 0.1em;
  text-shadow: 0 0 4px var(--ark-pink-glow);
}

.progress-fade-enter-active, .progress-fade-leave-active { transition: all var(--transition-fast); }
.progress-fade-enter-from, .progress-fade-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
