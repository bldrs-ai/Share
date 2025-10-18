import IfcColor from './IfcColor'


/**
 * Object containig the coloring settings
 *
 * @param {IfcColor} defaultColor the color to be used if the id wasn't found in the provided map,
 * if undefined the original element color will be used instead
 * @param {object} expressIdsToColorMap an object containing pairs of {[expressId]:[IfcColor]} to be used for those elements
 * @param {object} globalIdsToColorMap an object containing pairs of {[globalId]:[IfcColor]} to be used for those elements
 */
export default function IfcCustomViewSettings(defaultColor, expressIdsToColorMap = {}, globalIdsToColorMap = {}) {
  this.defaultColor = defaultColor
  this.expressIdsToColorMap = expressIdsToColorMap
  this.globalIdsToColorMap = globalIdsToColorMap


  this.getElementColor = (expressId) => {
    return this.expressIdsToColorMap[expressId] ? this.expressIdsToColorMap[expressId] : this.defaultColor
  }


  /**
   * Convert the color mapping for [globalId]:[color] to be [expressId]:[color] as well
   *
   * @param {object} api
   * @param {number} modelID
   * @param {IfcCustomViewSettings} customViewSettings
   */
  this.normalizeGlobalIdSettings = (api, modelID) => {
    const hasGlobalIdSettings = Object.keys(this.globalIdsToColorMap ?? []).length !== 0
    if (hasGlobalIdSettings) {
      const globalIds = Object.entries(this.globalIdsToColorMap)
      // eslint-disable-next-line new-cap
      api.CreateIfcGuidToExpressIdMapping(modelID)
      const mappedToExpressIds = globalIds.map((pair) => [api.ifcGuidMap.get(modelID).get(pair[0]), pair[1]])
      mappedToExpressIds.filter((pair) => pair[0]) // Remove global ids that weren't found
        .forEach((pair) => {
          this.expressIdsToColorMap[pair[0]] = pair[1] // Override the setting in the customViewSettingsObject
        })
      api.ifcGuidMap.delete(modelID)
    }
  }
}
