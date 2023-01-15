
import {IfcViewerAPI} from 'web-ifc-viewer'
import {Matrix4} from 'three'

/** Class CustomViewerAPI*/
export default class CustomViewerAPI extends IfcViewerAPI {
  subsets = {}

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
      // this.IFC.addIfcModel(ifcModel)
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
}
