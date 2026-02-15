/**
 * Timeline animation plan — geometry utilities.
 *
 * Polyline slicing for progressive drawing during timeline playback.
 */

import { haversineDistanceMeters } from '../geo'

/**
 * Slice a polyline of [lng,lat] points by a progress value (0..1).
 * Returns the subset of points up to the given progress, plus the
 * interpolated tip point.
 *
 * @param {number[][]} points  Array of [lng, lat]
 * @param {number} progress    0..1
 * @returns {{ points: number[][], tipPoint: number[] }}
 */
export function slicePolylineByProgress(points, progress) {
  if (!points || points.length < 2) return { points: points || [], tipPoint: null }
  if (progress <= 0) return { points: [points[0]], tipPoint: points[0] }
  if (progress >= 1) return { points, tipPoint: points[points.length - 1] }

  // Compute cumulative distances
  const distances = [0]
  for (let i = 1; i < points.length; i++) {
    distances.push(distances[i - 1] + haversineDistanceMeters(points[i - 1], points[i]))
  }
  const totalLen = distances[distances.length - 1]
  if (totalLen <= 0) return { points: [points[0]], tipPoint: points[0] }

  const targetDist = progress * totalLen

  // Find the segment containing the target distance
  for (let i = 1; i < distances.length; i++) {
    if (distances[i] >= targetDist) {
      const segStart = distances[i - 1]
      const segLen = distances[i] - segStart
      const segT = segLen > 0 ? (targetDist - segStart) / segLen : 0
      const tipPoint = [
        points[i - 1][0] + (points[i][0] - points[i - 1][0]) * segT,
        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * segT,
      ]
      return {
        points: [...points.slice(0, i), tipPoint],
        tipPoint,
      }
    }
  }

  return { points, tipPoint: points[points.length - 1] }
}
