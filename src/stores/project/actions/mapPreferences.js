/**
 * Map display preferences actions.
 * Handles map overlay settings like landuse visualization.
 */
const mapPreferencesActions = {
  toggleStationLabels() {
    this.showStationLabels = !this.showStationLabels
  },

  toggleLineLabels() {
    this.showLineLabels = !this.showLineLabels
  },

  toggleInterchangeMarkers() {
    this.showInterchangeMarkers = !this.showInterchangeMarkers
  },

  toggleLanduseOverlay() {
    this.showLanduseOverlay = !this.showLanduseOverlay
  },

  setShowLanduseOverlay(visible) {
    this.showLanduseOverlay = Boolean(visible)
  },

  toggleHighlightStationLocations() {
    this.highlightStationLocations = !this.highlightStationLocations
  },

  toggleMapGrid() {
    this.showMapGrid = !this.showMapGrid
  },

  toggleMapCoordinates() {
    this.showMapCoordinates = !this.showMapCoordinates
  },

  setProtomapsApiKey(key) {
    this.protomapsApiKey = key || ''
  },

  setMapTileType(tileType) {
    this.mapTileType = tileType || 'osm'
  },
}

export { mapPreferencesActions }
