import { reactive, ref, computed, onMounted, onBeforeUnmount } from 'vue'

/**
 * Composable that provides zoom/pan/mouse event handling and viewport transform
 * computation for an SVG-based canvas.
 *
 * @param {import('vue').Ref<SVGSVGElement|null>} svgRef - Ref to the SVG element
 * @returns Viewport state, transform computed, event handlers, and reset function
 */
export function useViewportControl(svgRef) {
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

  const viewportTransform = computed(
    () => `translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`,
  )

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

  return {
    viewport,
    panState,
    viewportTransform,
    resetViewport,
    onCanvasWheel,
    onCanvasMouseDown,
    onCanvasAuxClick,
  }
}
