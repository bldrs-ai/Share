import IfcColor from './IfcColor'


/**
 * Object containig the coloring settings
 *
 * @param {IfcColor} defaultColor the color to be used if the id wasn't found in the provided map,
 * if undefined the original element color will be used instead
 * @param {object} idsToColorMap an object containing pairs of {[expressId]:[IfcColor]} to be used for those elements
 */
export default function IfcCustomViewSettings(defaultColor, idsToColorMap = {}) {
  this.defaultColor = defaultColor
  this.idsToColorMap = idsToColorMap

  this.getElementColor = (expressId) => {
    return this.idsToColorMap[expressId] ? this.idsToColorMap[expressId] : this.defaultColor
  }
}
