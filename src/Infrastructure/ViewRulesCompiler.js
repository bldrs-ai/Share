import IfcColor from './IfcColor'
import IfcCustomViewSettings from './IfcCustomViewSettings'
import {IFCPROPERTYSET, IFCRELDEFINESBYPROPERTIES} from 'web-ifc'
import {interpolateColors, parseColor} from './ColorHelperFunctions'


/**
 * TODO(aozien):
 * The current 'ViewRulesCompiler' file is a just dummy implementation that mimics the compilation of a bunch
 * of rules against the IFC model on loading, and returns a result of 'IfcCustomViewSettings' to be used for
 * overriding model colors.
 *
 * The compiler functionality itself, and how the 'ViewRules' are stored and shared or changed will be explored
 * in details in #475, that way it would be more generic and flexible, but for now it's fixed with the
 * predefined view rules in #603
 */


/* eslint-disable new-cap */
/* eslint-disable no-magic-numbers */
/**
 * Convert view rules into view settings object
 *
 * @param {object} api
 * @param {number} modelID
 * @param {number} rules
 * @return {IfcCustomViewSettings} the view settings
 */
export async function compileViewRules(api, modelID, rules) {
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
  const entries = objectsAndPropVal.map((a) => [a.o, calculateElementColor(min, max, a)])
  const defaultElementsColor = new IfcColor(0.96, 0.96, 0.96)
  const viewSettings = new IfcCustomViewSettings(defaultElementsColor, Object.fromEntries(entries))
  return viewSettings
}


/**
 * get element color based on its value
 *
 * @param {number} min
 * @param {number} max
 * @param {number} a
 * @return {IfcColor} the color
 */
function calculateElementColor(min, max, a) {
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
