const timelineActions = {
  setTimelineFilterYear(year) {
    this.timelineFilterYear = year == null ? null : Number(year)
  },

  setTimelinePlaybackState(state) {
    if (!['idle', 'playing', 'paused'].includes(state)) return
    this.timelinePlayback.state = state
  },

  setTimelinePlaybackSpeed(speed) {
    const num = Number(speed)
    if (!Number.isFinite(num) || num <= 0) return
    this.timelinePlayback.speed = num
  },

  addTimelineEvent(year, description) {
    if (!this.project) return
    const numYear = Number(year)
    if (!Number.isFinite(numYear)) return
    const text = String(description || '').trim()
    if (!text) return
    if (!Array.isArray(this.project.timelineEvents)) {
      this.project.timelineEvents = []
    }
    const existing = this.project.timelineEvents.find((e) => e.year === numYear)
    if (existing) {
      existing.description = text
    } else {
      this.project.timelineEvents.push({ year: numYear, description: text })
    }
    this.touchProject(`更新时间轴事件: ${numYear}`)
  },

  removeTimelineEvent(year) {
    if (!this.project || !Array.isArray(this.project.timelineEvents)) return
    const numYear = Number(year)
    if (!Number.isFinite(numYear)) return
    const before = this.project.timelineEvents.length
    this.project.timelineEvents = this.project.timelineEvents.filter((e) => e.year !== numYear)
    if (this.project.timelineEvents.length < before) {
      this.touchProject(`删除时间轴事件: ${numYear}`)
    }
  },
}

export { timelineActions }
