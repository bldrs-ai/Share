import {IfcViewerAPI} from 'web-ifc-viewer'
import IfcHighlighter from './IfcHighlighter'
import IfcIsolator from './IfcIsolator'
import IfcViewsManager from './IfcElementsStyleManager'
import IfcCustomViewSettings from './IfcCustomViewSettings'
import CustomPostProcessor from './CustomPostProcessor'
import debug from '../utils/debug'


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
  /**  */
  constructor(options) {
    super(options)
    const renderer = this.context.getRenderer()
    const scene = this.context.getScene()
    const camera = this.context.getCamera()
    this.postProcessor = new CustomPostProcessor(renderer, scene, camera)
    this.highlighter = new IfcHighlighter(this.context, this.postProcessor)
    this.isolator = new IfcIsolator(this.context, this)
    this.viewsManager = new IfcViewsManager(this.IFC.loader.ifcManager.parser, viewRules[viewParameter])
  }

  /**
   * Loads the given IFC in the current scene.
   *
   * @param {string} url IFC as URL.
   * @param {boolean} fitToFrame (optional) if true, brings the perspectiveCamera to the loaded IFC.
   * @param {Function(event)} onProgress (optional) a callback function to report on downloading progress
   * @param {Function} onError (optional) a callback function to report on loading errors
   * @param {IfcCustomViewSettings} customViewSettings (optional) override the ifc elements file colors
   * @return {IfcModel} ifcModel object
   */
  async loadIfcUrl(url, fitToFrame, onProgress, onError, customViewSettings) {
    this.viewsManager.setViewSettings(customViewSettings)
    return await this.IFC.loadIfcUrl(url, fitToFrame, onProgress, onError)
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
        debug().error('IfcViewerAPIExtended#setSelection$onError: ', e)
      }
    } else {
      this.highlighter.setHighlighted(null)
      this.IFC.selector.unpickIfcItems()
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
