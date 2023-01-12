import {IfcViewerAPI} from 'web-ifc-viewer'

/**
 * Extending the originla IFCViewerFunctionality
 */
export class IfcViewerAPIExtended extends IfcViewerAPI {
  // TODO: might be usefull if we used a Set as well to handle large selections,
  // but for now array is more performant for small numbers
  #selectedExpressIds = []
  /**
   * Gets the expressId of the element that the mouse is pointing at
   *
   * @return {object} the expressId of the element and modelId
   */
  castRayToIfcScene() {
    const ifcManager = this.IFC
    const found = this.context.castRayIfc()
    if (!found) {
      return null
    }
    const mesh = found.object
    if (found.faceIndex === undefined) {
      return null
    }
    const id = ifcManager.loader.ifcManager.getExpressId(mesh.geometry, found.faceIndex)
    return {modelID: mesh.modelID, id}
  }
  /**
   * gets a copy of the current selected expressIds in the scene
   *
   * @return {number[]} the selected express ids in the scene
   */
  getSelectedIds = () => [...this.#selectedExpressIds]

  /**
   * sets the current selected expressIds in the scene
   *
   * @param {number} modelID
   * @param {number[]} expressIds express Ids of the elements
   */
  async setSelection(modelID, expressIds, focusSelection) {
    this.#selectedExpressIds = expressIds
    if (typeof focusSelection === 'undefined') {
      focusSelection = this.#selectedExpressIds.length === 1
    }
    if (this.#selectedExpressIds.length !== 0) {
      try {
        await this.pickIfcItemsByID(modelID, this.#selectedExpressIds, focusSelection, true)
      } catch (e) {
        console.error(e)
      }
    } else {
      this.IFC.selector.unpickIfcItems()
    }
  }
}
