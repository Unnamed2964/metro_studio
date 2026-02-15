<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { getDisplayLineName } from '../lib/lineNaming'
import { buildHudLineRoute, buildVehicleHudRenderModel } from '../lib/hud/renderModel'
import {
  JINAN_METRO_ICON_COLOR,
  JINAN_METRO_ICON_INNER_PATH,
  JINAN_METRO_ICON_MAIN_PATH,
  JINAN_METRO_ICON_TRANSFORM,
} from '../lib/hud/jinanBrand'
import jinanWordmarkImage from '../assets/jinan.png'
import { useProjectStore } from '../stores/projectStore'

const store = useProjectStore()
const selectedLineId = ref('')
const selectedDirectionKey = ref('')
const svgRef = ref(null)
const viewport = reactive({
  scale: 1,
  tx: 0,
  ty: 0,
})
const panState = reactive({
  active: false,
  lastClientX: 0,
  lastClientY: 0,
})

const lineOptions = computed(() => store.project?.lines || [])
const viewportTransform = computed(() => `translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`)

watch(
  [lineOptions, () => store.activeLineId],
  () => {
    const lines = lineOptions.value
    if (!lines.length) {
      selectedLineId.value = ''
      selectedDirectionKey.value = ''
      return
    }
    const stillExists = lines.some((line) => line.id === selectedLineId.value)
    if (stillExists) return
    selectedLineId.value =
      store.activeLineId && lines.some((line) => line.id === store.activeLineId) ? store.activeLineId : lines[0].id
  },
  { immediate: true },
)

const route = computed(() => buildHudLineRoute(store.project, selectedLineId.value))
const directionOptions = computed(() => route.value.directionOptions || [])

watch(
  directionOptions,
  (options) => {
    if (!options.length) {
      selectedDirectionKey.value = ''
      return
    }
    const exists = options.some((item) => item.key === selectedDirectionKey.value)
    if (!exists) {
      selectedDirectionKey.value = options[0].key
    }
  },
  { immediate: true },
)

const model = computed(() =>
  buildVehicleHudRenderModel(store.project, {
    lineId: selectedLineId.value,
    directionKey: selectedDirectionKey.value,
    route: route.value,
  }),
)
const headerCenterWidth = 380
const headerCenterX = computed(() => Math.max(460, model.value.width * 0.5 - headerCenterWidth / 2))
const headerRightWidth = 420
const headerRightX = computed(() => Math.max(headerCenterX.value + headerCenterWidth + 16, model.value.width - headerRightWidth - 46))

function displayLineName(line) {
  return getDisplayLineName(line, 'zh') || line?.nameZh || ''
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function resetViewport() {
  viewport.scale = 1
  viewport.tx = 0
  viewport.ty = 0
}

function toSvgPoint(clientX, clientY) {
  if (!svgRef.value) return null
  const ctm = svgRef.value.getScreenCTM()
  if (!ctm) return null
  const point = svgRef.value.createSVGPoint()
  point.x = clientX
  point.y = clientY
  return point.matrixTransform(ctm.inverse())
}

function onCanvasWheel(event) {
  const focus = toSvgPoint(event.clientX, event.clientY)
  if (!focus) return

  const oldScale = viewport.scale
  const zoomFactor = Math.exp(-event.deltaY * 0.0017)
  const nextScale = clamp(oldScale * zoomFactor, 0.32, 6)
  if (Math.abs(nextScale - oldScale) < 1e-6) return

  viewport.tx += (oldScale - nextScale) * focus.x
  viewport.ty += (oldScale - nextScale) * focus.y
  viewport.scale = nextScale
}

function onCanvasMouseDown(event) {
  if (event.button !== 1) return
  event.preventDefault()
  panState.active = true
  panState.lastClientX = event.clientX
  panState.lastClientY = event.clientY
}

function onCanvasAuxClick(event) {
  if (event.button === 1) {
    event.preventDefault()
  }
}

function endMiddlePan() {
  panState.active = false
}

function onGlobalMouseMove(event) {
  if (!panState.active) return

  const previous = toSvgPoint(panState.lastClientX, panState.lastClientY)
  const current = toSvgPoint(event.clientX, event.clientY)
  if (previous && current) {
    viewport.tx += current.x - previous.x
    viewport.ty += current.y - previous.y
  }

  panState.lastClientX = event.clientX
  panState.lastClientY = event.clientY
}

function onGlobalMouseUp(event) {
  if (!panState.active) return
  if (event.type === 'mouseup' && event.button !== 1) return
  endMiddlePan()
}

watch(
  () => [selectedLineId.value, selectedDirectionKey.value, model.value.width, model.value.height],
  async () => {
    await nextTick()
    resetViewport()
  },
  { immediate: true },
)

onMounted(() => {
  window.addEventListener('mousemove', onGlobalMouseMove)
  window.addEventListener('mouseup', onGlobalMouseUp)
  window.addEventListener('blur', onGlobalMouseUp)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onGlobalMouseMove)
  window.removeEventListener('mouseup', onGlobalMouseUp)
  window.removeEventListener('blur', onGlobalMouseUp)
})
</script>

<template>
  <section class="vehicle-hud">
    <header class="vehicle-hud__header">
      <div>
        <h2>车辆 HUD 生成</h2>
        <p class="vehicle-hud__subtitle">约 30 站自动折返 | 中键平移 | 滚轮缩放</p>
      </div>
      <div class="vehicle-hud__controls">
        <label class="vehicle-hud__control">
          <span>线路</span>
          <select v-model="selectedLineId">
            <option v-for="line in lineOptions" :key="line.id" :value="line.id">
              {{ displayLineName(line) }}
            </option>
          </select>
        </label>
        <label class="vehicle-hud__control">
          <span>方向</span>
          <select v-model="selectedDirectionKey" :disabled="!directionOptions.length">
            <option v-for="direction in directionOptions" :key="direction.key" :value="direction.key">
              {{ direction.labelZh }}
            </option>
          </select>
        </label>
      </div>
    </header>

    <div
      class="vehicle-hud__canvas"
      :class="{ 'vehicle-hud__canvas--panning': panState.active }"
      @wheel.prevent="onCanvasWheel"
      @mousedown="onCanvasMouseDown"
      @auxclick="onCanvasAuxClick"
    >
      <template v-if="model.ready">
        <svg
          ref="svgRef"
          :viewBox="`0 0 ${model.width} ${model.height}`"
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="hudBg" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#f2f7fe" />
              <stop offset="100%" stop-color="#e6eef8" />
            </linearGradient>
            <filter id="hudShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#000000" flood-opacity="0.13" />
            </filter>
            <g id="hudChevron">
              <path d="M -7 -7 L 0 0 L -7 7" fill="none" stroke="#f5fbff" stroke-width="2.8" stroke-linecap="round" />
            </g>
            <g id="jinanMetroIcon">
              <rect x="32.2" y="3.8" width="206.1" height="268.2" fill="#ffffff" />
              <g :transform="JINAN_METRO_ICON_TRANSFORM">
                <path :d="JINAN_METRO_ICON_MAIN_PATH" :fill="JINAN_METRO_ICON_COLOR" />
                <path :d="JINAN_METRO_ICON_INNER_PATH" :fill="JINAN_METRO_ICON_COLOR" />
              </g>
            </g>
          </defs>

          <rect width="100%" height="100%" fill="url(#hudBg)" />
          <g class="vehicle-hud__skyline" opacity="0.14">
            <path
              d="M0 400 L110 360 L170 380 L230 320 L300 350 L380 300 L430 340 L520 260 L620 330 L710 290 L780 345 L860 280 L940 355 L1010 310 L1090 350 L1170 285 L1260 360 L1340 300 L1410 345 L1490 280 L1580 355 L1660 320 L1730 360 L1810 330 L1920 385 L1920 620 L0 620 Z"
              fill="#bfd4ec"
            />
          </g>

          <g :transform="viewportTransform">
            <rect x="12" y="12" :width="model.width - 24" :height="model.height - 24" rx="22" fill="#ffffff" stroke="#d6dfeb" stroke-width="1.8" />
            <rect x="40" y="20" :width="model.width - 80" height="64" rx="6" :fill="model.lineColor" />

            <rect x="48" y="24" width="246" height="56" rx="5" fill="#ffffff" />
            <g transform="translate(56 26) scale(0.16)">
              <use href="#jinanMetroIcon" />
            </g>
            <image :href="jinanWordmarkImage" x="136" y="31" width="152" height="28" preserveAspectRatio="xMinYMid meet" />
            <text class="hud-brand-en" x="136" y="68">JINAN METRO</text>

            <rect x="302" y="24" width="116" height="56" rx="4" :fill="model.lineColor" />
            <text class="hud-line-badge-zh" x="314" y="49">{{ model.lineBadgeZh || model.lineNameZh }}</text>
            <text class="hud-line-badge-en" x="314" y="68">{{ model.lineBadgeEn || model.lineNameEn }}</text>

            <rect :x="headerCenterX" y="24" :width="headerCenterWidth" height="56" rx="4" fill="#ffffff" />
            <text class="hud-next-tag" :x="headerCenterX + 18" y="47">下一站</text>
            <text class="hud-next-tag-en" :x="headerCenterX + 18" y="64">Next</text>
            <text class="hud-next-main" :x="headerCenterX + 126" y="52">{{ model.nextStationZh || '' }}</text>
            <text class="hud-next-main-en" :x="headerCenterX + 126" y="69">{{ model.nextStationEn || '' }}</text>

            <g v-if="!model.isLoop">
              <rect :x="headerRightX" y="24" :width="headerRightWidth" height="56" rx="4" :fill="model.lineColor" />
              <text class="hud-route-zh" :x="headerRightX + 16" y="47">{{ model.routeSpanZh || '' }}</text>
              <text class="hud-route-en" :x="headerRightX + 16" y="64">{{ model.routeSpanEn || '' }}</text>
            </g>

            <path
              :d="model.trackPath"
              fill="none"
              stroke="#ffffff"
              stroke-width="22"
              stroke-linecap="round"
              stroke-linejoin="round"
              filter="url(#hudShadow)"
            />
            <path
              :d="model.trackPath"
              fill="none"
              :stroke="model.lineColor"
              stroke-width="13"
              stroke-linecap="round"
              stroke-linejoin="round"
            />

            <g v-for="mark in model.chevrons" :key="mark.id">
              <use href="#hudChevron" :transform="`translate(${mark.x} ${mark.y}) rotate(${mark.angle})`" />
              <use href="#hudChevron" :transform="`translate(${mark.x + 9} ${mark.y}) rotate(${mark.angle})`" />
            </g>

            <g v-for="station in model.stations" :key="station.id">
              <circle :cx="station.x" :cy="station.y" r="20.2" fill="#ffffff" :stroke="model.lineColor" stroke-width="6" />
              <circle v-if="station.isInterchange" :cx="station.x" :cy="station.y" r="28.4" fill="#f9fcff" :stroke="model.lineColor" stroke-width="2.6" />

              <g v-if="station.isInterchange">
                <path
                  :d="`M ${station.x - 7} ${station.connectorDotY} L ${station.x + 7} ${station.connectorDotY} L ${station.x} ${station.connectorDotY + station.transferCalloutDirection * 14} Z`"
                  :fill="station.transferBadges[0]?.color || '#e6b460'"
                  stroke="#ffffff"
                  stroke-width="1.1"
                />
                <text :x="station.x" :y="station.transferLabelZhY" text-anchor="middle" fill="#14283e" font-size="18" font-weight="700">
                  换乘
                </text>
                <text :x="station.x" :y="station.transferLabelEnY" text-anchor="middle" fill="#516984" font-size="13" font-weight="600" class="hud-text-en">
                  Transfer
                </text>

                <g
                  v-for="(badge, badgeIndex) in station.transferBadges"
                  :key="`${station.id}_badge_${badge.lineId}`"
                >
                  <rect
                    :x="station.x - badge.badgeWidth / 2 + (station.transferBadges.length > 2 ? (badgeIndex % 2 === 0 ? -badge.badgeWidth / 2 - 4 : badge.badgeWidth / 2 + 4) : 0)"
                    :y="station.transferBadgeY + (station.transferCalloutDirection > 0 ? (station.transferBadges.length > 2 ? Math.floor(badgeIndex / 2) * 36 : badgeIndex * 36) : (station.transferBadges.length > 2 ? Math.floor(badgeIndex / 2) * -36 : badgeIndex * -36))"
                    :width="badge.badgeWidth"
                    height="26"
                    rx="6"
                    :fill="badge.color || '#d5ab4f'"
                    stroke="#ffffff"
                    stroke-width="1.1"
                  />
                  <text
                    :x="station.x + (station.transferBadges.length > 2 ? (badgeIndex % 2 === 0 ? -badge.badgeWidth / 2 - 4 : badge.badgeWidth / 2 + 4) : 0)"
                    :y="station.transferBadgeY + (station.transferCalloutDirection > 0 ? (station.transferBadges.length > 2 ? Math.floor(badgeIndex / 2) * 36 : badgeIndex * 36) : (station.transferBadges.length > 2 ? Math.floor(badgeIndex / 2) * -36 : badgeIndex * -36)) + 18"
                    text-anchor="middle"
                    fill="#ffffff"
                    font-size="16"
                    font-weight="800"
                  >
                    {{ badge.text || '?' }}
                  </text>
                </g>
              </g>

              <text
                class="hud-station-zh"
                :x="station.labelX"
                :y="station.labelY"
                :text-anchor="station.labelAnchor"
                :transform="`rotate(${station.labelAngle} ${station.labelX} ${station.labelY})`"
                fill="#11263e"
                font-size="26"
                font-weight="700"
              >
                {{ station.nameZh }}
              </text>
              <text
                v-if="station.nameEn"
                class="hud-station-en"
                :x="station.labelX"
                :y="station.labelEnY"
                :text-anchor="station.labelAnchor"
                :transform="`rotate(${station.labelAngle} ${station.labelX} ${station.labelEnY})`"
                fill="#11263e"
                font-size="17"
                font-weight="700"
                letter-spacing="0.02em"
              >
                {{ station.nameEn }}
              </text>
            </g>
          </g>
        </svg>
      </template>
      <p v-else class="vehicle-hud__empty">{{ model.reason }}</p>
    </div>
  </section>
</template>

<style scoped>
.vehicle-hud {
  border: 1px solid var(--workspace-panel-border);
  border-radius: 12px;
  background: var(--workspace-panel-bg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.vehicle-hud__header {
  padding: 12px 14px;
  border-bottom: 1px solid var(--workspace-panel-header-border);
  background: var(--workspace-panel-header-bg);
  color: var(--workspace-panel-text);
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.vehicle-hud__header h2 {
  margin: 0;
  font-size: 16px;
  color: var(--workspace-panel-text);
}

.vehicle-hud__subtitle {
  margin: 4px 0 0;
  color: var(--workspace-panel-muted);
  font-size: 12px;
}

.vehicle-hud__controls {
  display: flex;
  gap: 10px;
}

.vehicle-hud__control {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--workspace-panel-muted);
  font-size: 12px;
  min-width: 190px;
}

.vehicle-hud__control select {
  border: 1px solid var(--toolbar-input-border);
  border-radius: 8px;
  background: var(--toolbar-input-bg);
  color: var(--toolbar-input-text);
  padding: 7px 10px;
}

.vehicle-hud__canvas {
  flex: 1;
  min-height: 0;
  background: var(--workspace-canvas-bg);
  display: flex;
  user-select: none;
  cursor: default;
}

.vehicle-hud__canvas--panning {
  cursor: grabbing;
}

.vehicle-hud__canvas svg {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}

.vehicle-hud__empty {
  margin: auto;
  color: var(--workspace-panel-muted);
  font-size: 14px;
}

.hud-brand-zh,
.hud-line-badge-zh,
.hud-next-tag,
.hud-next-main,
.hud-route-zh,
.hud-station-zh {
  font-family: 'Source Han Sans SC', 'Noto Sans CJK SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.hud-brand-en,
.hud-line-badge-en,
.hud-next-tag-en,
.hud-next-main-en,
.hud-route-en,
.hud-station-en,
.hud-text-en {
  font-family: 'DIN Alternate', 'Bahnschrift', 'Roboto Condensed', 'Arial Narrow', 'Noto Sans', sans-serif;
}

.hud-brand-zh {
  fill: #111827;
  font-size: 23px;
  font-weight: 750;
}

.hud-brand-en {
  fill: #374151;
  font-size: 12px;
  letter-spacing: 0.04em;
  font-weight: 700;
}

.hud-line-badge-zh {
  fill: #ffffff;
  font-size: 19px;
  font-weight: 760;
}

.hud-line-badge-en {
  fill: #e5edff;
  font-size: 12px;
  letter-spacing: 0.03em;
  font-weight: 700;
}

.hud-next-tag {
  fill: #4b5563;
  font-size: 15px;
  font-weight: 700;
}

.hud-next-tag-en {
  fill: #9ca3af;
  font-size: 11px;
  letter-spacing: 0.03em;
  font-weight: 680;
}

.hud-next-main {
  fill: #1f2937;
  font-size: 29px;
  font-weight: 760;
}

.hud-next-main-en {
  fill: #374151;
  font-size: 14px;
  letter-spacing: 0.03em;
  font-weight: 680;
}

.hud-route-zh {
  fill: #ffffff;
  font-size: 20px;
  font-weight: 760;
}

.hud-route-en {
  fill: #e5edff;
  font-size: 12px;
  letter-spacing: 0.03em;
  font-weight: 700;
}

.hud-station-zh {
  font-size: 26px;
  font-weight: 760;
}

.hud-station-en {
  font-size: 17px;
  font-weight: 680;
  letter-spacing: 0.01em;
}
</style>
