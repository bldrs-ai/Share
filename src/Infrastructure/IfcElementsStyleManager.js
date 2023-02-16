/* eslint-disable no-magic-numbers */
import IfcCustomViewSettings from './IfcCustomViewSettings'
import {IFCPRODUCTDEFINITIONSHAPE, IFCPROPERTYSET, IFCRELDEFINESBYPROPERTIES} from 'web-ifc'
import IfcColor from './IfcColor'


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
    parser.compileViewFunction = bindCompileViewFunction(parser)
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
      await this.compileViewFunction(this.state.api, modelID)
    }
    // eslint-disable-next-line new-cap
    const shapes = await this.state.api.GetLineIDsWithType(modelID, IFCPRODUCTDEFINITIONSHAPE)
    this.loadingState.total = shapes.size()
    this.loadingState.current = 0
    this.loadingState.step = 0.1
  }

  return initializeLoadingState.bind(parser)
}


/* eslint-disable new-cap */
/**
 * Returns a new compileViewFunction function that calculates the custom view
 *
 * @param {IfcParser} parser
 * @return {Function} the new compiler function
 */
function bindCompileViewFunction(parser) {
  /**
   * called on initialization
   *
   */
  async function compileViewFunction(api, modelID) {
    // Apply desired logic on model before loading
    const propRelLines = await api.GetLineIDsWithType(modelID, IFCRELDEFINESBYPROPERTIES)
    const allPropObjects = []
    for (let i = 0; i < propRelLines.size(); i++) {
      allPropObjects.push( await api.GetLine(modelID, propRelLines.get(i), true))
    }
    const psetObjects = allPropObjects.filter((x) => x.RelatingPropertyDefinition.type === IFCPROPERTYSET)
    // Get only sets containing PSet_vyzn.Verlust
    const objectsAndPropVal = psetObjects.map((a) =>
      ({o: a.RelatedObjects[0]?.expressID,
        p: a.RelatingPropertyDefinition.HasProperties?.find(
            (s) => s.Name.value === 'Verlust' ||
             s.Name.value === 'SIA380-1.TransmissionHeatLoss')?.NominalValue?.value * 1})).filter((x) => x.p)

    const valArr = objectsAndPropVal.map((a) => a.p)
    const min = Math.min(valArr)
    const max = Math.max(...valArr)
    const entries = objectsAndPropVal.map((a) => [a.o, getElementColor(min, max, a)])
    console.log('entries', entries)
    const viewSettings = new IfcCustomViewSettings(new IfcColor(0.96, 0.96, 0.96), Object.fromEntries(entries))

    this._overrideStyles = viewSettings
  }

  return compileViewFunction.bind(parser)
}


/** */
function getElementColor(min, max, a) {
  const baseColor = new IfcColor(0.96, 0.96, 0.96)
  if (a.p === 0) {
    return baseColor
  } else if (a.p > 0) {
    return interpolateColors(baseColor, parseColor('#EB3324'), a.p, 0, max)
  } else if (a.p < 0) {
    return interpolateColors(baseColor, parseColor('#22B14C'), -1 * a.p, 0, -1 * min)
  }
  return baseColor
}


/** */
function changeValueScale(value, min, max, targetMin, targetMax) {
  const ratio = (value - min) * 1.0 / (max-min)
  const result = targetMin + (ratio * (targetMax - targetMin))
  return result
}


/** */
function parseColor(hexColor) {
  const parsed = hexColor.substr(1).split(/(?=(?:..)*$)/)
      .map((a) => parseInt(a, 16) / 256)
      .map((a) => Math.round(a * 1000) / 1000)
  return new IfcColor(...parsed)
}


/** */
function interpolateColors(startColor, targetColor, value, min, max) {
  const r = changeValueScale(value, min, max, startColor.x, targetColor.x)
  const g = changeValueScale(value, min, max, startColor.y, targetColor.y)
  const b = changeValueScale(value, min, max, startColor.z, targetColor.z)
  const result = new IfcColor(r, g, b)
  return result
}
