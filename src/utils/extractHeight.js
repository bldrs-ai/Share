/**
 * Extract related elements.
 *
 * @param {object} ifcModel
 * @return {Array} elevation values
 */
export async function extractHeight(ifcModel) {
  try {
    const ifcBuildingStoreyID = 3124254112
    const ifcBuildingStorey = ifcModel.getAllItemsOfType(ifcBuildingStoreyID, true)

    const ifcSIUnitID = 448429030
    const ifcSIUnit = ifcModel.getAllItemsOfType(ifcSIUnitID, true)

    let unitScale = 1

    const printStorey = async () => {
      const allUnits = await ifcSIUnit
      for (let i = 0; i < allUnits.length; i++) {
        if (allUnits[i].UnitType.value === 'LENGTHUNIT') {
          if (allUnits[i].Prefix.value === 'MILLI') {
            const milliValue = 0.001
            unitScale = milliValue
          }
          if (allUnits[i].Prefix.value === 'CENTI') {
            const centiValue = 0.01
            unitScale = centiValue
          }
        }
      }

      const allStor = await ifcBuildingStorey
      const elevValues = []
      for (let i = 0; i < allStor.length; i++) {
        elevValues[i] = allStor[i].Elevation.value * unitScale
      }

      return elevValues
    }
    const elevValues = []
    for (let i = 0; i < ifcBuildingStorey.length; i++) {
      elevValues[i] = ifcBuildingStorey[i].Elevation.value
    }
    return await printStorey()
  } catch {
    console.log('No Levels detected')
  }
}
