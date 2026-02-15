import { createTimelinePlayer } from '../lib/timeline/timelinePlayer.js'

/**
 * Timeline player lifecycle management.
 *
 * @param {Object} deps
 * @param {import('pinia').Store} deps.store - The project store
 */
export function useMapTimelinePlayer({ store }) {
  let timelinePlayer = null

  function ensureTimelinePlayer() {
    if (timelinePlayer) return timelinePlayer
    timelinePlayer = createTimelinePlayer({
      onYearChange(year) {
        store.setTimelineFilterYear(year)
      },
      onStateChange(state) {
        store.setTimelinePlaybackState(state)
      },
      onPlaybackEnd() {
        store.setTimelinePlaybackState('idle')
      },
    })
    return timelinePlayer
  }

  function onTimelineYearChange(year) {
    store.setTimelineFilterYear(year)
    if (timelinePlayer) timelinePlayer.seekTo(year)
  }

  function onTimelinePlay() {
    const player = ensureTimelinePlayer()
    player.setYears(store.timelineYears)
    player.setSpeed(store.timelinePlayback.speed)
    player.play(store.timelinePlayback.state === 'idle')
  }

  function onTimelinePause() {
    timelinePlayer?.pause()
  }

  function onTimelineStop() {
    timelinePlayer?.stop()
    store.setTimelineFilterYear(null)
  }

  function onTimelineSpeedChange(speed) {
    store.setTimelinePlaybackSpeed(speed)
    if (timelinePlayer) timelinePlayer.setSpeed(speed)
  }

  function destroy() {
    timelinePlayer?.destroy()
    timelinePlayer = null
  }

  return {
    onTimelineYearChange,
    onTimelinePlay,
    onTimelinePause,
    onTimelineStop,
    onTimelineSpeedChange,
    destroy,
  }
}
