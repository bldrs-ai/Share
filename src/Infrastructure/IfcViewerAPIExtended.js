import {IfcViewerAPI} from 'web-ifc-viewer'
import {Matrix4} from 'three'
import IfcHighlighter from './IfcHighlighter'
import IfcIsolator from './IfcIsolator'


/** Class IfcViewerAPIExtended*/
export default class IfcViewerAPIExtended extends IfcViewerAPI {
  // TODO: might be usefull if we used a Set as well to handle large selections,
  // but for now array is more performant for small numbers
  _selectedExpressIds = []
  /**  */
  constructor(options) {
    super(options)
    this.highlighter = new IfcHighlighter(this.context)
    this.isolator = new IfcIsolator(this.context, this)
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
   * sets the current selected expressIds in the scene
   *
   * @param {number} modelID
   * @param {number[]} expressIds express Ids of the elements
   */
  async setSelection(modelID, expressIds, focusSelection) {
    this._selectedExpressIds = expressIds
    const toBeSelected = this._selectedExpressIds.filter((id) => this.isolator.canBePickedInScene(id))
    if (typeof focusSelection === 'undefined') {
      // if not specified, only focus on item if it was the first one to be selected
      focusSelection = toBeSelected.length === 1
    }
    if (toBeSelected.length !== 0) {
      try {
        await this.IFC.selector.pickIfcItemsByID(modelID, toBeSelected, false, true)
        this.highlighter.setHighlighted(this.IFC.selector.selection.meshes)
      } catch (e) {
        console.error(e)
      }
    } else {
      this.highlighter.setHighlighted(null)
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
      this.context.getScene().add(ifcModel)
      this.context.items.ifcModels.push(ifcModel)
      this.context.items.pickableIfcModels.push(ifcModel)
      await this.isolator.setModel(ifcModel)

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
    if (this.isolator.canBePickedInScene(id)) {
      await this.IFC.selector.preselection.pick(found)
    }
  }


  /**
   *
   * Highlights the item pointed by the cursor.
   *
   * @param {object} picked item
   * @return {number} element id
   */
  getPickedItemId(picked) {
    const mesh = picked.object
    if (picked.faceIndex === undefined) {
      return null
    }
    const ifcManager = this.IFC
    return ifcManager.loader.ifcManager.getExpressId(mesh.geometry, picked.faceIndex)
  }
}
