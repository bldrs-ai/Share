const IFC_TYPE_ID_BUILDING_STOREY = 3124254112
const IFC_TYPE_ID_SI_UNIT = 448429030
const SI_PREFIX_VALUE_MILLI = 0.001
const SI_PREFIX_VALUE_CENTI = 0.01

/**
 * Extract related elements.
 *
 * @param {object} ifcModel
 * @return {Array} elevation values
 */
export async function extractHeight(ifcModel) {
  try {
    const elevValues = []

    const storeys = await ifcModel.getAllItemsOfType(IFC_TYPE_ID_BUILDING_STOREY, true)
    const siUnits = await ifcModel.getAllItemsOfType(IFC_TYPE_ID_SI_UNIT, true)

    let unitScale = 1

    for (let i = 0; i < siUnits.length; i++) {
      if (siUnits[i].UnitType.value === 'LENGTHUNIT') {
        try {
          const prefix = siUnits[i].Prefix.value
          switch (prefix) {
            case 'MILLI': unitScale = SI_PREFIX_VALUE_MILLI; break
            case 'CENTI': unitScale = SI_PREFIX_VALUE_CENTI; break
            default: {
              console.warn('Unhandled length unit: ', prefix)
              unitScale = 1
            }
          }
        } catch {
          console.warn('No length unit found')
        }
      }
    }

    for (let i = 0; i < storeys.length; i++) {
      const elevation = storeys[i].Elevation.value
      if (!isFinite(elevation)) {
        console.warn('Found invalid elevation value: ', elevation)
        continue
      }
      elevValues[i] = elevation * unitScale
    }

    return elevValues
  } catch {
    console.warn('No levels found')
  }
}
