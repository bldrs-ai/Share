import IfcCustomViewSettings from './IfcCustomViewSettings'
import {IFCPRODUCTDEFINITIONSHAPE} from 'web-ifc'
import {compileViewRules} from './ViewRulesCompiler'


/* eslint-disable jsdoc/no-undefined-types */
/**
 *  Overrides the default render functionality in the viewer
 * and adds a postprocessing effect (outlining selected elements)
 */
export default class IfcElementsStyleManager {
  /**
   * constructs new class
   *
   * @param {IfcParser} the parser of the viewer
   */
  constructor(parser, rules) {
    this.parser = parser
    parser._rules = rules
    parser._overrideStyles = {}
    parser.initializeLoadingState = newInitializeLoadingStateFunction(parser)
    parser.streamMesh = newStreamMeshFunction(parser)
  }


  /**
   * Applys view settings to the next load call
   *
   * @param {IfcCustomViewSettings} settings an object containing expressId:IfcColor pairs
   */
  setViewSettings(settings) {
    this.parser._overrideStyles = settings ? settings : new IfcCustomViewSettings()
  }
}


/* eslint-disable no-invalid-this */
/**
 * Returns a new stream mesh function that uses
 * the custom coloring provided
 *
 * @param {IfcParser} parser
 * @return {Function} the new render function
 */
function newStreamMeshFunction(parser) {
  /**
   * Overrides the default stream function in the ifc parser
   *
   */
  function streamMesh(modelID, mesh) {
    const placedGeometries = mesh.geometries
    const size = placedGeometries.size()
    for (let i = 0; i < size; i++) {
      const placedGeometry = placedGeometries.get(i)
      const itemMesh = this.getPlacedGeometry(modelID, mesh.expressID, placedGeometry)
      const geom = itemMesh.geometry.applyMatrix4(itemMesh.matrix)
      const overrideStyle = this._overrideStyles.getElementColor(mesh.expressID)
      const color = overrideStyle !== undefined ? overrideStyle : placedGeometry.color
      this.storeGeometryByMaterial(color, geom)
    }
  }

  return streamMesh.bind(parser)
}


/**
 * Returns a new initializeLoadingState function that uses
 * the custom coloring provided
 *
 * @param {IfcParser} parser
 * @return {Function} the new render function
 */
function newInitializeLoadingStateFunction(parser) {
  /**
   * Overrides the default initializeLoadingState function in the ifc parser
   *
   */
  async function initializeLoadingState(modelID) {
    if (this._rules?.length > 0) {
      const viewSettings = await compileViewRules(this.state.api, modelID, this._rules)
      this._overrideStyles = viewSettings
    }
    // eslint-disable-next-line new-cap
    const shapes = await this.state.api.GetLineIDsWithType(modelID, IFCPRODUCTDEFINITIONSHAPE)
    this.loadingState.total = shapes.size()
    this.loadingState.current = 0
    this.loadingState.step = 0.1
  }

  return initializeLoadingState.bind(parser)
}
