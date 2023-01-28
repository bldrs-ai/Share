
import {IfcViewerAPI} from 'web-ifc-viewer'
import {Matrix4} from 'three'

/** Class IfcViewerAPIExtended*/
export default class IfcViewerAPIExtended extends IfcViewerAPI {
  subsets = {}
  // TODO: might be usefull if we used a Set as well to handle large selections,
  // but for now array is more performant for small numbers
  _selectedExpressIds = []

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
    const mesh = found.object
    if (found.faceIndex === undefined) {
      return null
    }
    const ifcManager = this.IFC
    const id = ifcManager.loader.ifcManager.getExpressId(mesh.geometry, found.faceIndex)
    return {modelID: mesh.modelID, id}
  }

  /**
   * gets a copy of the current selected expressIds in the scene
   *
   * @return {number[]} the selected express ids in the scene
   */
  getSelectedIds = () => [...this._selectedExpressIds]

  /**
   * sets the current selected expressIds in the scene
   *
   * @param {number} modelID
   * @param {number[]} expressIds express Ids of the elements
   */
  async setSelection(modelID, expressIds, focusSelection) {
    this._selectedExpressIds = expressIds
    if (typeof focusSelection === 'undefined') {
      // if not specified, only focus on item if it was the first one to be selected
      focusSelection = this._selectedExpressIds.length === 1
    }
    if (this._selectedExpressIds.length !== 0) {
      try {
        await this.pickByID(modelID, this._selectedExpressIds, focusSelection, true)
      } catch (e) {
        console.error(e)
      }
    } else {
      this.IFC.selector.unpickIfcItems()
    }
  }

  /**
   * Loads the given IFC in the current scene.
   *
   * @param {string} url IFC as URL.
   * @param {object} onProgress (optional) a callback function to report on downloading progress
   * @param {object} onError (optional) a callback function to report on loading errors
   * @param {boolean} fitToFrame (optional) if true, brings the perspectiveCamera to the loaded IFC.
   */
  async loadIfcUrl(url, onProgress, onError, fitToFrame = false) {
    try {
      const firstModel = Boolean(this.IFC.context.items.ifcModels.length === 0)
      const settings = this.IFC.loader.ifcManager.state.webIfcSettings
      const fastBools = (settings === null || settings === void 0 ? void 0 : settings.USE_FAST_BOOLS) || true
      await this.IFC.loader.ifcManager.applyWebIfcConfig({
        COORDINATE_TO_ORIGIN: firstModel,
        USE_FAST_BOOLS: fastBools,
      })
      const ifcModel = await this.IFC.loader.loadAsync(url, onProgress)
      // subset ops
      const rootElement = await ifcModel.ifcManager.getSpatialStructure(0, true)
      this.createSubsetForElementsTree(rootElement)

      if (firstModel) {
        // eslint-disable-next-line new-cap
        const matrixArr = await this.IFC.loader.ifcManager.ifcAPI.GetCoordinationMatrix(ifcModel.modelID)
        const matrix = new Matrix4().fromArray(matrixArr)
        this.IFC.loader.ifcManager.setupCoordinationMatrix(matrix)
      }
      if (fitToFrame) {
        this.IFC.context.fitToFrame()
      }
      return ifcModel
    } catch (err) {
      console.error('Error loading IFC.')
      console.error(err)
      if (onError) {
        onError(err)
      }
    }
  }

  /**
   * Creates a subset of the given IFC element in the current scene.
   *
   * @param {object} IFC spatial root element
   */
  createSubsetForElementsTree(rootElement) {
    rootElement.children.forEach((e) => {
      this.createSubsetForElementsTree(e)
    })
    const subset = this.IFC.loader.ifcManager.createSubset({
      modelID: 0,
      scene: this.context.getScene(),
      ids: [rootElement.expressID],
      removePrevious: true,
      customID: rootElement.expressID,
    })
    this.context.getScene().add(subset)
    this.context.items.pickableIfcModels.push(subset)
    if (subset) {
      this.subsets[rootElement.expressID] = subset
    }
  }

  /**
   * Pick elements by their ids
   *
   * @param {number} modelID
   * @param {Array} elements ids
   * @param {boolean} focus selection
   * @param {boolean} remove previous selection
   */
  async pickByID(modelID, ids, focusSelection = false, removePrevious = true) {
    if (removePrevious) {
      this.IFC.selector.selection.modelIDs.clear()
    }
    this.IFC.selector.selection.modelIDs.add(modelID)
    const selected = this.IFC.selector.selection.newSelection(modelID, ids, removePrevious)
    selected.visible = true
    selected.renderOrder = this.IFC.selector.selection.renderOrder
    if (focusSelection) {
      await this.IFC.selector.selection.focusSelection(selected)
    }
  }
}
