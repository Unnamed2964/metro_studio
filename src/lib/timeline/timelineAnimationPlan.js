/**
 * Timeline animation plan — barrel re-export.
 *
 * The implementation has been split into:
 *   - timelineAnimationPlanBuilder.js  (buildTimelineAnimationPlan, buildPseudoTimelineAnimationPlan)
 *   - timelineAnimationPlanGeometry.js (slicePolylineByProgress)
 */

export { buildTimelineAnimationPlan, buildPseudoTimelineAnimationPlan } from './timelineAnimationPlanBuilder'
export { slicePolylineByProgress } from './timelineAnimationPlanGeometry'
