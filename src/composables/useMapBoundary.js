import { nextTick, watch } from 'vue'

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function extractBboxFromGeoJson(geoJson) {
  try {
    if (!geoJson || !geoJson.type || !geoJson.coordinates) return null

    const coords = []
    const geometry = geoJson

    function flattenPolygon(rings) {
      if (!Array.isArray(rings)) return
      for (const ring of rings) {
        if (!Array.isArray(ring)) continue
        for (const coord of ring) {
          if (Array.isArray(coord) && coord.length >= 2) {
            const [lng, lat] = coord
            if (Number.isFinite(lng) && Number.isFinite(lat)) {
              coords.push([lng, lat])
            }
          }
        }
      }
    }

    if (geometry.type === 'Polygon') {
      flattenPolygon(geometry.coordinates)
    } else if (geometry.type === 'MultiPolygon') {
      if (!Array.isArray(geometry.coordinates)) return null
      for (const polygon of geometry.coordinates) {
        flattenPolygon(polygon)
      }
    } else {
      return null
    }

    if (!coords.length) return null

    let minLng = Infinity
    let minLat = Infinity
    let maxLng = -Infinity
    let maxLat = -Infinity

    for (const [lng, lat] of coords) {
      minLng = Math.min(minLng, lng)
      minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng)
      maxLat = Math.max(maxLat, lat)
    }

    if (!Number.isFinite(minLng) || !Number.isFinite(minLat) ||
        !Number.isFinite(maxLng) || !Number.isFinite(maxLat)) {
      return null
    }

    return { minLng, minLat, maxLng, maxLat }
  } catch (error) {
    console.error('Error extracting bbox from geojson:', error)
    return null
  }
}

/**
 * Boundary hash computation, fitMapToBoundary, and boundary watcher.
 *
 * @param {Object} deps
 * @param {import('pinia').Store} deps.store - The project store
 * @param {() => maplibregl.Map|null} deps.getMap - Getter for the map instance
 */
export function useMapBoundary({ store, getMap }) {
  let lastRegionBoundaryHash = null
  let isMapReadyForBoundary = false

  function computeBoundaryHash(boundary) {
    try {
      if (!boundary || !boundary.type) return null

      const bbox = extractBboxFromGeoJson(boundary)
      if (!bbox) return null

      const hash = `${boundary.type}_${bbox.minLng.toFixed(6)}_${bbox.minLat.toFixed(6)}_${bbox.maxLng.toFixed(6)}_${bbox.maxLat.toFixed(6)}`
      console.log('[computeBoundaryHash] Generated hash:', hash)
      return hash
    } catch (error) {
      console.error('Error computing boundary hash:', error)
      return null
    }
  }

  function fitMapToBoundary(boundary) {
    try {
      console.log('[fitMapToBoundary] Called with boundary:', boundary)
      const map = getMap()

      if (!map) {
        console.log('[fitMapToBoundary] Map is null, returning')
        return
      }

      if (!boundary) {
        console.log('[fitMapToBoundary] Boundary is null, returning')
        return
      }

      const bbox = extractBboxFromGeoJson(boundary)
      console.log('[fitMapToBoundary] Extracted bbox:', bbox)

      if (!bbox) {
        console.log('[fitMapToBoundary] Failed to extract bbox, returning')
        return
      }

      const lngSpan = Math.abs(bbox.maxLng - bbox.minLng)
      const latSpan = Math.abs(bbox.maxLat - bbox.minLat)
      console.log('[fitMapToBoundary] Span:', lngSpan, latSpan)

      if (lngSpan < 1e-6 && latSpan < 1e-6) {
        console.log('[fitMapToBoundary] Using easeTo (small span)')
        map.easeTo({
          center: [bbox.minLng, bbox.minLat],
          zoom: Math.max(map.getZoom(), 12),
          bearing: 0,
          pitch: 0,
          duration: 1000,
          easing: easeInOutCubic,
        })
      } else {
        console.log('[fitMapToBoundary] Using fitBounds')
        map.fitBounds(
          [
            [bbox.minLng, bbox.minLat],
            [bbox.maxLng, bbox.maxLat],
          ],
          {
            padding: { top: 80, bottom: 80, left: 80, right: 80 },
            maxZoom: 14,
            bearing: 0,
            pitch: 0,
            duration: 1200,
            easing: easeInOutCubic,
          },
        )
      }

      console.log('[fitMapToBoundary] Map fit completed')
    } catch (error) {
      console.error('[fitMapToBoundary] Failed to fit map to boundary:', error)
    }
  }

  function setMapReady() {
    isMapReadyForBoundary = true
  }

  function setMapNotReady() {
    isMapReadyForBoundary = false
  }

  function onMapLoad() {
    setMapReady()
    if (store.regionBoundary) {
      console.log('[MapEditor on load] Found existing boundary, fitting to it')
      fitMapToBoundary(store.regionBoundary)
    }
  }

  function setupBoundaryWatcher() {
    return watch(
      () => store.regionBoundary,
      async (newBoundary) => {
        console.log('[MapEditor watch] regionBoundary changed:', newBoundary)

        if (!isMapReadyForBoundary) {
          console.log('[MapEditor watch] Map not ready yet, skipping')
          return
        }

        if (!newBoundary) {
          console.log('[MapEditor watch] Boundary is null, skipping')
          return
        }

        const boundaryHash = computeBoundaryHash(newBoundary)
        console.log('[MapEditor watch] boundaryHash:', boundaryHash, 'lastHash:', lastRegionBoundaryHash)

        if (boundaryHash && boundaryHash !== lastRegionBoundaryHash) {
          lastRegionBoundaryHash = boundaryHash
          console.log('[MapEditor watch] Boundary hash changed, will fit map')

          await nextTick()
          const map = getMap()

          if (!map.isStyleLoaded()) {
            console.log('[MapEditor watch] Waiting for map style to load...')
            await new Promise((resolve) => {
              const checkInterval = setInterval(() => {
                if (map.isStyleLoaded()) {
                  clearInterval(checkInterval)
                  resolve()
                }
              }, 50)

              setTimeout(() => {
                clearInterval(checkInterval)
                resolve()
              }, 5000)
            })
          }

          fitMapToBoundary(newBoundary)
        } else {
          console.log('[MapEditor watch] Boundary hash unchanged or null, skipping')
        }
      },
      { deep: false },
    )
  }

  return {
    fitMapToBoundary,
    setMapReady,
    setMapNotReady,
    onMapLoad,
    setupBoundaryWatcher,
  }
}
