import IfcCustomViewSettings from './IfcCustomViewSettings'


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
  constructor(parser) {
    this.parser = parser
    parser._overrideStyles = {}
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
