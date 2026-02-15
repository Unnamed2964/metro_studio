import { optimizeLayoutInWorker } from '../../../lib/layout/workerClient'
import { importJinanMetroFromOsm } from '../../../lib/osm/importJinanMetro'
import { importCityMetroNetwork } from '../../../lib/osm/genericImporter'
import { findCityPresetById, findCityPresetByRelationId } from '../../../lib/osm/cityPresets'
import { createId } from '../../../lib/ids'
import { normalizeProject } from '../../../lib/projectModel'

const importLayoutActions = {
  /**
   * Legacy shortcut: import Jinan metro network using the original Jinan-specific importer.
   */
  async importJinanNetwork() {
    if (!this.project || this.isImporting) return
    this.isImporting = true
    this.statusText = '正在保存当前工程...'
    try {
      await this.persistNow()
      this.statusText = '正在导入 OSM 济南地铁线网...'
      const imported = await importJinanMetroFromOsm({
        includeConstruction: false,
        includeProposed: false,
      })
      this._applyImportedNetwork(imported)
    } catch (error) {
      this.statusText = `导入失败: ${error.message || 'unknown error'}`
    } finally {
      this.isImporting = false
    }
  },

  /**
   * Generic city metro network import.
   * @param {string|number|object} cityPresetOrRelationId
   *   - A city preset object (from cityPresets.js)
   *   - A city preset id string (e.g. 'beijing')
   *   - A raw OSM relation ID number
   * @param {object} [importOptions]
   * @param {boolean} [importOptions.includeConstruction]  Override store toggle
   * @param {boolean} [importOptions.includeProposed]      Override store toggle
   */
  async importCityNetwork(cityPresetOrRelationId, importOptions = {}) {
    console.log('[importCityNetwork] Called with:', cityPresetOrRelationId, importOptions)
    console.log('[importCityNetwork] isImporting:', this.isImporting)
    console.log('[importCityNetwork] project exists:', !!this.project)
    
    if (!this.project || this.isImporting) {
      console.log('[importCityNetwork] Aborted: no project or already importing')
      return
    }

    let preset = null
    let relationId = null

    if (typeof cityPresetOrRelationId === 'object' && cityPresetOrRelationId !== null) {
      preset = cityPresetOrRelationId
      relationId = preset.relationId
    } else if (typeof cityPresetOrRelationId === 'string') {
      preset = findCityPresetById(cityPresetOrRelationId)
      if (!preset) {
        this.statusText = `未找到城市预设: ${cityPresetOrRelationId}`
        console.log('[importCityNetwork] City preset not found:', cityPresetOrRelationId)
        return
      }
      relationId = preset.relationId
    } else if (typeof cityPresetOrRelationId === 'number') {
      relationId = cityPresetOrRelationId
      preset = findCityPresetByRelationId(relationId)
    }

    if (!relationId || !Number.isFinite(relationId)) {
      this.statusText = '无效的 OSM 关系 ID'
      console.log('[importCityNetwork] Invalid relationId:', relationId)
      return
    }

    const displayName = preset ? preset.name : `OSM #${relationId}`
    console.log('[importCityNetwork] Starting import:', displayName, 'relationId:', relationId)

    this.isImporting = true
    this.statusText = '正在保存当前工程...'
    try {
      await this.persistNow()
      this.statusText = `正在导入 ${displayName} 地铁线网...`

      const imported = await importCityMetroNetwork(relationId, {
        includeConstruction: false,
        includeProposed: false,
      })
      
      console.log('[importCityNetwork] Import successful:', imported)
      console.log('[importCityNetwork] Imported boundary:', imported.boundary)
      console.log('[importCityNetwork] Imported stations:', imported.stations?.length)
      console.log('[importCityNetwork] Imported lines:', imported.lines?.length)

      this._applyImportedNetwork(imported)
    } catch (error) {
      console.error('[importCityNetwork] Import failed:', error)
      this.statusText = `导入失败: ${error.message || 'unknown error'}`
    } finally {
      this.isImporting = false
      console.log('[importCityNetwork] Finished, isImporting set to false')
    }
  },

  /**
   * Shared logic: apply an imported network result to the current project.
   * @param {object} imported  Return value from importJinanMetroFromOsm or importCityMetroNetwork
   */
  _applyImportedNetwork(imported) {
    console.log('[_applyImportedNetwork] Started')
    console.log('[_applyImportedNetwork] Input imported:', imported)
    
    const now = new Date().toISOString()
    const currentProjectName = String(this.project.name || '').trim() || '新建工程'
    const cityLabel = imported.region?.name || 'OSM'
    
    console.log('[_applyImportedNetwork] Creating new project:', cityLabel)
    
    this.project = normalizeProject({
      id: createId('project'),
      name: `${currentProjectName} (${cityLabel} OSM导入)`,
      region: imported.region,
      regionBoundary: imported.boundary,
      stations: imported.stations,
      manualTransfers: [],
      edges: imported.edges,
      lines: imported.lines,
      snapshots: [],
      layoutMeta: {
        stationLabels: {},
        edgeDirections: {},
      },
      layoutConfig: this.project.layoutConfig,
      meta: {
        createdAt: now,
        updatedAt: now,
      },
    })
    
    console.log('[_applyImportedNetwork] Setting regionBoundary:', imported.boundary)
    this.regionBoundary = imported.boundary
    
    this.activeLineId = this.project.lines[0]?.id || null
    this.selectedStationId = null
    this.selectedStationIds = []
    this.selectedEdgeId = null
    this.selectedEdgeIds = []
    this.selectedEdgeAnchor = null
    this.pendingEdgeStartStationId = null
    this.isStationEnglishRetranslating = false
    this.stationEnglishRetranslateProgress = {
      done: 0,
      total: 0,
      percent: 0,
      message: '',
    }
    this.recomputeStationLineMembership()
    
    console.log('[_applyImportedNetwork] Project created:', this.project.name)
    console.log('[_applyImportedNetwork] Stations:', this.project.stations.length, 'Lines:', this.project.lines.length)
    
    this.statusText = `导入完成（已新建工程）: ${this.project.lines.length} 条线 / ${this.project.stations.length} 站`
    this.resetHistoryBaseline()
    
    console.log('[_applyImportedNetwork] Calling persistNow()')
    this.persistNow().then(() => {
      console.log('[_applyImportedNetwork] persistNow() completed')
    }).catch((err) => {
      console.error('[_applyImportedNetwork] persistNow() failed:', err)
    })
    
    console.log('[_applyImportedNetwork] Finished')
  },

  async runAutoLayout() {
    if (!this.project || this.isLayoutRunning || this.project.stations.length < 2) return
    this.isLayoutRunning = true
    this.statusText = '正在执行自动排版...'
    try {
      const geoSeedScale = Number(this.project.layoutConfig?.geoSeedScale)
      const result = await optimizeLayoutInWorker({
        stations: this.project.stations,
        edges: this.project.edges,
        lines: this.project.lines,
        config: {
          geoSeedScale: Number.isFinite(geoSeedScale) ? geoSeedScale : 6,
        },
      })
      this.project.stations = result.stations
      this.project.layoutMeta = {
        stationLabels: result.layoutMeta?.stationLabels || {},
        edgeDirections: result.layoutMeta?.edgeDirections || {},
      }
      const safeScore = Number.isFinite(result.score) ? result.score : 0
      this.project.snapshots.push({
        createdAt: new Date().toISOString(),
        score: safeScore,
        breakdown: result.breakdown,
      })
      this.statusText = `自动排版完成，评分 ${safeScore.toFixed(2)}`
      this.touchProject('')
    } catch (error) {
      this.statusText = `自动排版失败: ${error.message || 'unknown error'}`
    } finally {
      this.isLayoutRunning = false
    }
  },

}

export { importLayoutActions }
