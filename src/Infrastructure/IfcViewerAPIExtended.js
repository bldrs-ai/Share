import {IfcViewerAPI} from 'web-ifc-viewer'
import {
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Uint16BufferAttribute,
  Uint32BufferAttribute,
} from 'three'
import IfcHighlighter from './IfcHighlighter'
import IfcIsolator from './IfcIsolator'
import IfcViewsManager from './IfcElementsStyleManager'
import IfcCustomViewSettings from './IfcCustomViewSettings'
import CustomPostProcessor from './CustomPostProcessor'
import {findMeshesByElementIds} from './selectionUtils'
import debug from '../utils/debug'
import {areDefinedAndNotNull} from '../utils/assert'

/* eslint-disable new-cap */

const viewParameter = (new URLSearchParams(window.location.search)).get('view')?.toLowerCase() ?? 'default'


const viewRules = {
  'default': [],
  'ch.sia380-1.heatmap': ['Rule1', 'Rule2'],
}
/* eslint-disable jsdoc/no-undefined-types */
/**
 * Extending the original IFCViewerFunctionality
 */
export class IfcViewerAPIExtended extends IfcViewerAPI {
  // TODO: might be useful if we used a Set as well to handle large selections,
  // but for now array is more performant for small numbers
  _selectedExpressIds = []
  /**
   * @param {object} options - Configuration options
   */
  constructor(options) {
    super(options)
    const renderer = this.context.getRenderer()
    const scene = this.context.getScene()
    const camera = this.context.getCamera()
    this.postProcessor = new CustomPostProcessor(renderer, scene, camera)
    this.highlighter = new IfcHighlighter(this.context, this.postProcessor)
    this.isolator = new IfcIsolator(this.context, this)
    this.viewsManager = new IfcViewsManager(this.IFC.loader.ifcManager.parser, viewRules[viewParameter])
    this.geometricPartMetadata = new Map()
    this.geometricHighlightMeshes = []
  }

  /**
   * Loads the given IFC in the current scene.
   *
   * @param {IfcCustomViewSettings} customViewSettings (optional) override the ifc elements file colors
   */
  setCustomViewSettings(customViewSettings) {
    this.viewsManager.setViewSettings(customViewSettings)
  }

  /**
   *
   * @param {Array} hits
   * @return {Array} results
   */
  async getSelectedElementsProps(hits) {
    const manager = this.IFC.loader.ifcManager
    // TODO: Update this to use the modelID
    const modelID = 0
    const results = []
    for (const expressID of hits) {
      const props = await this.IFC.getProperties(modelID, expressID, false, false)

      props.type = manager.getIfcType(modelID, expressID)

      results.push({modelID, expressID, props})
    }
    return results
  }

  /**
   *
   * @param {number} floorNumber
   * @return {Array} structure
   */
  async getByFloor(floorNumber) {
    // 1. get the full project hierarchy (includeProperties for Elevation)
    const manager = this.IFC.loader.ifcManager
    const structure = await manager.getSpatialStructure(0, true)
    const projectNode = Array.isArray(structure) ?
      structure[0] :
      structure
    if (!projectNode) {
      console.warn('No project node found in spatial structure')
      return []
    }

    // helper: pull out every IfcBuildingStorey node
    /**
     * @param {object} node
     * @param {Array} out
     * @return {Array} storeys
     */
    function collectStoreys(node, out = []) {
      if (node.type === 'IFCBUILDINGSTOREY') {
        out.push(node)
      }
      for (const c of node.children || []) {
        collectStoreys(c, out)
      }
      return out
    }

    // 2. extract & sort by Elevation
    const storeys = collectStoreys(projectNode)
      .map((s) => ({
        id: s.expressID,
        elev: Number(s.properties?.Elevation?.value ?? 0),
        node: s,
      }))
      .sort((a, b) => a.elev - b.elev)

    // 3. pick the requested floor (1-indexed)
    const idx = floorNumber - 1
    if (idx < 0 || idx >= storeys.length) {
      console.warn(`Floor ${floorNumber} out of range (1–${storeys.length})`)
      return []
    }
    const floorNode = storeys[idx].node

    // 4. collect all expressIDs under this storey via node.children
    /**
     * @param {object} node
     * @param {Array} out
     * @return {Array} elements
     */
    function collectElements(node) {
      const out = [];
      (node.children || []).forEach((child) => {
        // grab the ID of this child
        if (typeof child.expressID === 'number') {
          out.push(child.expressID)
        }
        // recurse into its children
        out.push(...collectElements(child))
      })
      return out
    }

    // 4. get every element on that floor
    const elementIDs = collectElements(floorNode)


    return elementIDs
  }

  /**
   * Loads the given IFC in the current scene.
   *
   * @param {string} url IFC as URL.
   * @param {boolean} fitToFrame (optional) if true, brings the perspectiveCamera to the loaded IFC.
   * @param {Function} onProgress (optional) a callback function to report on downloading progress
   * @param {Function} onError (optional) a callback function to report on loading errors
   * @param {IfcCustomViewSettings} customViewSettings (optional) override the ifc elements file colors
   * @return {IfcModel} ifcModel object
   */
  async loadIfcUrl(url, fitToFrame, onProgress, onError, customViewSettings) {
    this.viewsManager.setViewSettings(customViewSettings)
    return await this.IFC.loadIfcUrl(url, fitToFrame, onProgress, onError)
  }

  /**
   * Loads the given IFC in the current scene.
   *
   * @param {string} file IFC as File.
   * @param {boolean} fitToFrame (optional) if true, brings the perspectiveCamera to the loaded IFC.
   * @param {Function} onError (optional) a callback function to report on loading errors
   * @param {IfcCustomViewSettings} customViewSettings (optional) override the ifc elements file colors
   * @return {IfcModel} ifcModel object
   */
  async loadIfcFile(file, fitToFrame, onError, customViewSettings) {
    this.viewsManager.setViewSettings(customViewSettings)
    return await this.IFC.loadIfc(file, fitToFrame, onError)
  }

  /**
   * Gets the expressId of the element that the mouse is pointing at
   *
   * @return {object} the expressId of the element and modelId
   */
  castRayToIfcScene() {
    const found = this.context.castRayIfc()
    if (!found) {
      return null
    }
    const id = this.getPickedItemId(found)
    return {modelID: found.object.modelID, id}
  }

  /**
   * gets a copy of the current selected expressIds in the scene
   *
   * @return {number[]} the selected express ids in the scene
   */
  getSelectedIds = () => [...this._selectedExpressIds]


  /**
   * Sets the current selected elements in the scene
   * Accepts elementIDs (Model interface abstraction)
   *
   * @param {number} modelID
   * @param {number[]} elementIds elementIDs of the elements (Model interface)
   * @param {boolean} focusSelection Whether to focus on selection
   */
  async setSelection(modelID, elementIds, focusSelection) {
    this._selectedExpressIds = elementIds
    const toBeSelected = this._selectedExpressIds.filter((id) => this.isolator.canBePickedInScene(id))
    if (typeof focusSelection === 'undefined') {
      // if not specified, only focus on item if it was the first one to be selected
      focusSelection = toBeSelected.length === 1
    }

    const scene = this.context.getScene()
    let selectedMeshes = []

    if (this.IFC.type === 'ifc') {
      // IFC: Use selector for selection state management, but also find meshes directly
      // This ensures highlighting works even if selector has issues
      // Note: IFC selector internally uses expressID, but elementID = expressID for IFC
      if (toBeSelected.length !== 0) {
        this.clearGeometricPartHighlight()
        try {
          debug().log('IfcViewerAPIExtended#setSelection, with Array<toBeSelected>: ', toBeSelected)
          const focusSelection2 = false // TODO(pablo): this was hardcoded as false below; why not using above
          const removePrevious = true
          await this.IFC.selector.pickIfcItemsByID(modelID, toBeSelected, focusSelection2, removePrevious)
          debug().log('IfcViewerAPIExtended#setSelection, meshes: ', this.IFC.selector.selection.meshes)
          // Use selector's meshes if available, otherwise fall back to direct search
          selectedMeshes = this.IFC.selector.selection.meshes && this.IFC.selector.selection.meshes.length > 0 ?
            Array.from(this.IFC.selector.selection.meshes) :
            findMeshesByElementIds(scene, toBeSelected)
        } catch (e) {
          console.warn('selection failure', e)
          debug().error('IfcViewerAPIExtended#setSelection$onError: ', e)
          // Fall back to direct mesh finding on error
          selectedMeshes = findMeshesByElementIds(scene, toBeSelected)
        }
      } else {
        this.clearGeometricPartHighlight()
        this.highlighter.setHighlighted(null)
        this.IFC.selector.unpickIfcItems()
        return
      }
    } else {
      // Object3D models (OBJ, FBX, GLB, etc.): Find meshes directly
      // elementID = expressID for Object3D models, so search by expressID on meshes
      selectedMeshes = findMeshesByElementIds(scene, toBeSelected)
    }

    // Unified highlighting for all formats
    if (selectedMeshes.length > 0) {
      this.highlighter.setHighlighted(selectedMeshes)
    } else {
      this.highlighter.setHighlighted(null)
    }
  }


  /**
   * Highlights the item pointed by the cursor.
   *
   */
  async highlightIfcItem() {
    const found = this.context.castRayIfc()
    if (!found) {
      this.IFC.selector.preselection.toggleVisibility(false)
      return
    }
    const id = this.getPickedItemId(found)
    if (this.IFC.type === 'ifc' && this.isolator.canBePickedInScene(id)) {
      await this.IFC.selector.preselection.pick(found)
      this.highlightPreselection()
    }
  }


  /**
   * applies Preselection effect on an Element by Id
   *
   * @param {number} modelId
   * @param {number[]} expressIds express Ids of the elements
   */
  async preselectElementsByIds(modelId, expressIds) {
    const filteredIds = expressIds.filter((id) => this.isolator.canBePickedInScene(id)).map((a) => parseInt(a))
    debug().log('IfcViewerAPIExtended#preselectElementsByIds, filteredIds:', filteredIds)
    if (filteredIds.length) {
      await this.IFC.selector.preselection.pickByID(modelId, filteredIds, false, true)
      this.highlightPreselection()
    }
  }

  /**
   * adds the highlighting (outline effect) to the currently preselected element in the viewer
   */
  highlightPreselection() {
    // Deconstruct the preselection meshes set to get the first element in set
    // The preselection set always contains only one element or none
    const [targetMesh] = this.IFC.selector.preselection.meshes
    this.highlighter.addToHighlighting(targetMesh)
  }


  /** @param {Mesh} mesh */
  addToHighlighting(mesh) {
    this.highlighter.addToHighlighting(mesh)
  }


  /** @param {Array<Mesh>} meshes */
  setHighlighted(meshes) {
    this.highlighter.setHighlighted(meshes)
  }


  /**
   *
   * @param {*} partExpressID
   * @param {*} metadata
   * @return {void}
   */
  registerGeometricPart(partExpressID, metadata = {}) {
    if (!Number.isFinite(partExpressID)) {
      return
    }
    const safeMetadata = this.geometricPartMetadata.get(partExpressID) ?? {}
    this.geometricPartMetadata.set(partExpressID, {
      parentExpressID: typeof metadata.parentExpressID === 'number' ? metadata.parentExpressID : safeMetadata.parentExpressID,
      modelID: Number.isFinite(metadata.modelID) ? metadata.modelID : (safeMetadata.modelID ?? 0),
      partIndex: Number.isInteger(metadata.partIndex) ? metadata.partIndex : safeMetadata.partIndex,
      geometryExpressID: Number.isFinite(metadata.geometryExpressID) ? metadata.geometryExpressID : safeMetadata.geometryExpressID,
    })
  }


  /**
   *
   * @param {*} modelID
   * @param {*} expressIds
   */
  highlightGeometricParts(modelID, expressIds) {
    if (!Array.isArray(expressIds) || expressIds.length === 0) {
      this.clearGeometricPartHighlight()
      return
    }
    this.clearGeometricPartHighlight()
    const uniqueIds = [...new Set(expressIds.filter((id) => Number.isFinite(id)))]
    uniqueIds.forEach((partId) => {
      this.buildHighlightMeshesForPart(modelID, partId)
    })
    this.applyCombinedHighlight()
  }


  /**
   * Clears geometric part highlight
   */
  clearGeometricPartHighlight() {
    if (!this.geometricHighlightMeshes || this.geometricHighlightMeshes.length === 0) {
      this.applyBaseHighlight()
      return
    }
    const scene = this.context.getScene()
    this.geometricHighlightMeshes.forEach((mesh) => {
      scene.remove(mesh)
      mesh.geometry?.dispose()
      mesh.material?.dispose()
    })
    this.geometricHighlightMeshes = []
    this.applyBaseHighlight()
  }


  /**
   *
   * @param {*} modelID
   * @param {*} partExpressID
   */
  buildHighlightMeshesForPart(modelID, partExpressID) {
    const metadata = this.geometricPartMetadata.get(partExpressID)
    if (!metadata || typeof metadata.parentExpressID !== 'number') {
      return
    }
    const manager = this.IFC?.loader?.ifcManager
    const ifcAPI = manager?.ifcAPI
    if (!ifcAPI?.GetFlatMesh || !ifcAPI?.GetGeometry) {
      console.warn('highlightGeometricParts: IFC API missing flat mesh helpers')
      return
    }
    const targetModelID = typeof metadata.modelID === 'number' ? metadata.modelID : modelID
    let flatMesh
    try {
      flatMesh = ifcAPI.GetFlatMesh(targetModelID, metadata.parentExpressID)
    } catch (error) {
      console.warn('highlightGeometricParts: unable to fetch flat mesh for parent', metadata.parentExpressID, error)
      return
    }
    const geometries = flatMesh?.geometries
    const size = typeof geometries?.size === 'function' ? geometries.size() : 0
    if (!size) {
      return
    }
    const hasGeometryHint = Number.isFinite(metadata.geometryExpressID)
    const targetGeometryExpressID = hasGeometryHint ? metadata.geometryExpressID : null
    const targetIndex = Number.isInteger(metadata.partIndex) ? metadata.partIndex : null
    let matched = false
    if (targetIndex !== null && targetIndex >= 0 && targetIndex < size) {
      const hintedGeometry = geometries.get(targetIndex)
      matched = this.addGeometricHighlightMeshIfMatch(
        targetModelID,
        partExpressID,
        hintedGeometry,
        hasGeometryHint ? targetGeometryExpressID : partExpressID,
        hasGeometryHint,
      )
      if (matched) {
        return
      }
    }
    const scanTargetExpressID = hasGeometryHint ? targetGeometryExpressID : partExpressID
    for (let idx = 0; idx < size; idx += 1) {
      const placedGeometry = geometries.get(idx)
      matched = this.addGeometricHighlightMeshIfMatch(
        targetModelID,
        partExpressID,
        placedGeometry,
        scanTargetExpressID,
        true,
      ) || matched
    }
    if (!matched) {
      debug().warn('highlightGeometricParts: no matching geometry found for part', partExpressID, metadata)
    }
  }


  /**
   *
   * @param {*} modelID
   * @param {*} partExpressID
   * @param {*} placedGeometry
   * @param {*} targetGeometryExpressID
   * @param {*} enforceMatch
   * @return {boolean}
   */
  addGeometricHighlightMeshIfMatch(modelID, partExpressID, placedGeometry, targetGeometryExpressID, enforceMatch) {
    if (!placedGeometry) {
      return false
    }
    if (enforceMatch) {
      if (!Number.isFinite(targetGeometryExpressID)) {
        return false
      }
      if (!Number.isFinite(placedGeometry.geometryExpressID)) {
        return false
      }
      if (placedGeometry.geometryExpressID !== targetGeometryExpressID) {
        return false
      }
    }
    this.addGeometricHighlightMesh(modelID, partExpressID, placedGeometry)
    return true
  }


  /**
   *
   * @param {*} modelID
   * @param {*} partExpressID
   * @param {*} placedGeometry
   */
  addGeometricHighlightMesh(modelID, partExpressID, placedGeometry) {
    if (!placedGeometry) {
      return
    }
    const geometry = this.createGeometryFromPlacedGeometry(modelID, placedGeometry)
    if (!geometry) {
      return
    }
    const highlightMesh = new Mesh(geometry, this.getGeometricHighlightMaterial())
    highlightMesh.renderOrder = 999
    highlightMesh.userData = {customID: 'geometric-part-selection', expressID: partExpressID}
    this.context.getScene().add(highlightMesh)
    this.geometricHighlightMeshes.push(highlightMesh)
  }


  /**
   *
   * @param {*} modelID
   * @param {*} placedGeometry
   * @return {BufferGeometry|null}
   */
  createGeometryFromPlacedGeometry(modelID, placedGeometry) {
    const manager = this.IFC?.loader?.ifcManager
    const ifcAPI = manager?.ifcAPI
    if (!ifcAPI?.GetGeometry || !placedGeometry?.geometryExpressID) {
      return null
    }
    let ifcGeometry
    try {
      ifcGeometry = ifcAPI.GetGeometry(modelID, placedGeometry.geometryExpressID)
      if (!ifcGeometry) {
        return null
      }
      const vertexArray = ifcAPI.GetVertexArray(ifcGeometry.GetVertexData(), ifcGeometry.GetVertexDataSize())
      const indexArray = ifcAPI.GetIndexArray(ifcGeometry.GetIndexData(), ifcGeometry.GetIndexDataSize())
      if (!vertexArray?.length || !indexArray?.length) {
        return null
      }
      const geometry = this.buildBufferGeometry(vertexArray, indexArray)
      if (!geometry) {
        return null
      }
      const transform = placedGeometry.flatTransformation
      const TRANSFORM_LENGTH = 16
      if (Array.isArray(transform) && transform.length === TRANSFORM_LENGTH) {
        const matrix = new Matrix4()
        matrix.fromArray(transform)
        geometry.applyMatrix4(matrix)
      }
      geometry.computeBoundingBox()
      geometry.computeBoundingSphere()
      return geometry
    } catch (error) {
      console.warn('highlightGeometricParts: failed to build geometry for part', placedGeometry.geometryExpressID, error)
      return null
    } finally {
      if (ifcGeometry?.delete) {
        ifcGeometry.delete()
      }
    }
  }


  /**
   *
   * @param {*} vertexData
   * @param {*} indexData
   * @return {BufferGeometry|null}
   */
  buildBufferGeometry(vertexData, indexData) {
    if (!vertexData || vertexData.length % 6 !== 0 || !indexData || indexData.length === 0) {
      return null
    }
    const positions = new Float32Array(vertexData.length / 2)
    const normals = new Float32Array(vertexData.length / 2)
    for (let i = 0; i < vertexData.length; i += 6) {
      const vertexBase = i / 2
      positions[vertexBase] = vertexData[i]
      positions[vertexBase + 1] = vertexData[i + 1]
      positions[vertexBase + 2] = vertexData[i + 2]
      normals[vertexBase] = vertexData[i + 3]
      normals[vertexBase + 1] = vertexData[i + 4]
      normals[vertexBase + 2] = vertexData[i + 5]
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
    const MAX_SIZE = 65535
    if (positions.length / 3 > MAX_SIZE) {
      geometry.setIndex(new Uint32BufferAttribute(indexData, 1))
    } else {
      geometry.setIndex(new Uint16BufferAttribute(new Uint16Array(indexData), 1))
    }
    return geometry
  }


  /**
   *
   * @return {MeshLambertMaterial}
   */
  getGeometricHighlightMaterial() {
    return new MeshLambertMaterial({
      color: 0x00f0ff,
      transparent: true,
      depthTest: true,
      clippingPlanes: this.context.getClippingPlanes(),
    })
  }


  /**
   * applies Base Highlight
   */
  applyBaseHighlight() {
    const selectionMeshes = this.IFC?.selector?.selection?.meshes
    if (!selectionMeshes || selectionMeshes.size === 0) {
      this.highlighter.setHighlighted([])
      return
    }
    this.highlighter.setHighlighted(Array.from(selectionMeshes))
  }


  /**
   * Applies Combined Highlight
   */
  applyCombinedHighlight() {
    const selectionMeshes = this.IFC?.selector?.selection?.meshes
    const base = selectionMeshes && selectionMeshes.size > 0 ? Array.from(selectionMeshes) : []
    this.highlighter.setHighlighted([...base, ...this.geometricHighlightMeshes])
  }


  /**
   * Highlights the item pointed by the cursor.
   *
   * @param {object} picked item
   * @return {number} element id
   */
  getPickedItemId(picked) {
    const mesh = picked.object
    if (!areDefinedAndNotNull(mesh.geometry, picked.faceIndex)) {
      return null
    }
    const ifcManager = this.IFC
    return ifcManager.loader.ifcManager.getExpressId(mesh.geometry, picked.faceIndex)
  }


  /**
   * Uses the internal renderer to take screenshot of current scene.
   *
   * The image may be fetched to bytes with:
   *
   *   const res = await fetch(dataURI)
   *   const img = await res.blob()
   *
   * @return {string}
   */
  takeScreenshot() {
    const renderer = this.context.renderer
    const dataURI = renderer.newScreenshot()
    return dataURI
  }
}

/* eslint-enable new-cap */
