import {extractLocation} from './LocationExtractor'
import {loadTiles} from './TileManager'
import {buildTerrainGroup} from './TerrainMeshBuilder'
import debug from '../../utils/debug'


/**
 * Manages terrain overlay for the viewer.
 *
 * Orchestrates location extraction, tile download, mesh building,
 * and scene add/remove. Follows the LightManager pattern.
 */
export default class TerrainManager {
  constructor(viewer) {
    this.viewer = viewer
    this.location = null
    this.terrainGroup = null
    this.isVisible = false
    this.isLoaded = false
  }


  /**
   * Initialize terrain by extracting location from the model.
   *
   * @param {object} model - Loaded IFC model
   * @return {Promise<boolean>} true if model has valid Swiss location
   */
  async init(model) {
    this.location = await extractLocation(this.viewer, model)
    if (this.location) {
      debug().log('TerrainManager: Model has Swiss location',
        this.location.lat.toFixed(4), this.location.lon.toFixed(4))
      return true
    }
    debug().log('TerrainManager: No Swiss location found')
    return false
  }


  /**
   * Download terrain tiles and build meshes.
   *
   * @param {function} [onProgress] - Called with {downloaded, total}
   * @return {Promise<boolean>} true if terrain was loaded successfully
   */
  async loadTerrain(onProgress) {
    if (!this.location) {
      return false
    }

    try {
      const tiles = await loadTiles(
        this.location.lv95East,
        this.location.lv95North,
        1, // 3x3 grid
        onProgress,
      )

      if (tiles.length === 0) {
        debug().log('TerrainManager: No tiles loaded')
        return false
      }

      this.terrainGroup = await buildTerrainGroup(tiles, this.location)
      this.isLoaded = true
      debug().log('TerrainManager: Terrain loaded with', tiles.length, 'tiles')
      return true
    } catch (e) {
      debug().log('TerrainManager: Error loading terrain:', e)
      return false
    }
  }


  /**
   * Show terrain in the scene.
   */
  show() {
    if (!this.terrainGroup || this.isVisible) {
      return
    }
    const scene = this.viewer.context.getScene()
    scene.add(this.terrainGroup)
    this.isVisible = true
    debug().log('TerrainManager: Terrain shown')
  }


  /**
   * Hide terrain from the scene.
   */
  hide() {
    if (!this.terrainGroup || !this.isVisible) {
      return
    }
    const scene = this.viewer.context.getScene()
    scene.remove(this.terrainGroup)
    this.isVisible = false
    debug().log('TerrainManager: Terrain hidden')
  }


  /**
   * Toggle terrain visibility.
   *
   * @return {boolean} New visibility state
   */
  toggle() {
    if (this.isVisible) {
      this.hide()
    } else {
      this.show()
    }
    return this.isVisible
  }


  /**
   * Dispose all terrain resources.
   */
  dispose() {
    this.hide()
    if (this.terrainGroup) {
      this.terrainGroup.traverse((obj) => {
        if (obj.geometry) {
          obj.geometry.dispose()
        }
        if (obj.material) {
          obj.material.dispose()
        }
      })
      this.terrainGroup = null
    }
    this.isLoaded = false
    this.location = null
  }
}
