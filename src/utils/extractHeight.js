/**
 * Extract related elements.
 * @param {object} ifcModel
 * @return {array} elevation values
 */
export async function extractHeight(ifcModel) {
  try {
    const ifcBuildingStoreyID = 3124254112
    const ifcBuildingStorey = ifcModel.getAllItemsOfType(ifcBuildingStoreyID, true)

    const printStorey = async () => {
      const allStor = await ifcBuildingStorey
      const elevValues = []
      for (let i = 0; i < allStor.length; i++) {
        elevValues[i] = allStor[i].Elevation.value
      }
      // console.log(elevValues)
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
