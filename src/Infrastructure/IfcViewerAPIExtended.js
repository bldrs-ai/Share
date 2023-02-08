import {IfcViewerAPI} from 'web-ifc-viewer'
import IfcHighlighter from './IfcHighlighter'

/**
 * Extending the original IFCViewerFunctionality
 */
export class IfcViewerAPIExtended extends IfcViewerAPI {
  // TODO: might be usefull if we used a Set as well to handle large selections,
  // but for now array is more performant for small numbers
  _selectedExpressIds = []
  /**  */
  constructor(options) {
    super(options)
    this.highlighter = new IfcHighlighter(this.context)
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
        await this.pickIfcItemsByID(modelID, this._selectedExpressIds, focusSelection, true)
        this.highlighter.setHighlighted(this.IFC.selector.selection.meshes)
      } catch (e) {
        console.error(e)
      }
    } else {
      this.highlighter.setHighlighted(null)
      this.IFC.selector.unpickIfcItems()
    }
  }
}
