/**
 * Timeline playback state machine.
 *
 * States: idle → playing ⇄ paused → idle
 *
 * The player advances through sorted year keyframes, calling back on each
 * transition so the UI can animate line growth between years.
 */

export const PLAYBACK_SPEEDS = [0.5, 1, 2, 3]

const DEFAULT_YEAR_HOLD_MS = 2400
const DEFAULT_TRANSITION_MS = 1800

export function createTimelinePlayer({
  onYearChange,
  onTransitionStart,
  onTransitionProgress,
  onTransitionEnd,
  onPlaybackEnd,
  onStateChange,
}) {
  let state = 'idle'
  let speed = 1
  let years = []
  let currentIndex = -1
  let rafId = null
  let transitionStart = 0
  let holdStart = 0
  let phase = 'idle' // 'hold' | 'transition' | 'idle'

  function getYearHoldMs() {
    return DEFAULT_YEAR_HOLD_MS / speed
  }

  function getTransitionMs() {
    return DEFAULT_TRANSITION_MS / speed
  }

  function setState(next) {
    if (state === next) return
    state = next
    onStateChange?.(state)
  }

  function setYears(sortedYears) {
    years = [...sortedYears]
  }

  function setSpeed(s) {
    if (PLAYBACK_SPEEDS.includes(s)) speed = s
  }

  function getCurrentYear() {
    if (currentIndex < 0 || currentIndex >= years.length) return null
    return years[currentIndex]
  }

  function play(startFromBeginning = false) {
    if (!years.length) return
    if (state === 'playing') return

    if (startFromBeginning || state === 'idle') {
      currentIndex = 0
      onYearChange?.(years[0], 0, years.length)
    }

    setState('playing')
    phase = 'hold'
    holdStart = performance.now()
    scheduleFrame()
  }

  function pause() {
    if (state !== 'playing') return
    cancelFrame()
    setState('paused')
    phase = 'idle'
  }

  function stop() {
    cancelFrame()
    setState('idle')
    phase = 'idle'
    currentIndex = -1
  }

  function seekTo(year) {
    const idx = years.indexOf(year)
    if (idx === -1) return
    currentIndex = idx
    onYearChange?.(years[idx], idx, years.length)
  }

  function scheduleFrame() {
    cancelFrame()
    rafId = requestAnimationFrame(tick)
  }

  function cancelFrame() {
    if (rafId != null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  function tick(now) {
    if (state !== 'playing') return

    if (phase === 'hold') {
      const elapsed = now - holdStart
      if (elapsed >= getYearHoldMs()) {
        // Move to transition to next year
        if (currentIndex >= years.length - 1) {
          // Reached the end
          onPlaybackEnd?.()
          setState('idle')
          phase = 'idle'
          return
        }
        phase = 'transition'
        transitionStart = now
        onTransitionStart?.(years[currentIndex], years[currentIndex + 1])
      }
    }

    if (phase === 'transition') {
      const elapsed = now - transitionStart
      const duration = getTransitionMs()
      const progress = Math.min(elapsed / duration, 1)

      onTransitionProgress?.(progress, years[currentIndex], years[currentIndex + 1])

      if (progress >= 1) {
        currentIndex++
        onTransitionEnd?.(years[currentIndex])
        onYearChange?.(years[currentIndex], currentIndex, years.length)
        phase = 'hold'
        holdStart = now
      }
    }

    scheduleFrame()
  }

  function destroy() {
    cancelFrame()
    state = 'idle'
    phase = 'idle'
  }

  return {
    get state() { return state },
    get speed() { return speed },
    get years() { return years },
    get currentIndex() { return currentIndex },
    getCurrentYear,
    setYears,
    setSpeed,
    play,
    pause,
    stop,
    seekTo,
    destroy,
  }
}
