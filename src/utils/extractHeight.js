/**
 * Extract related elements.
 *
 * @param {object} ifcModel
 * @return {Array} elevation values
 */
export async function extractHeight(ifcModel) {
  const ifcBuildingStoreyID = 3124254112
  const storeys = await ifcModel.getAllItemsOfType(ifcBuildingStoreyID, true)

  const elevValues = []
  for (let i = 0; i < storeys.length; i++) {
    elevValues[i] = storeys[i].Elevation.value
  }
  return elevValues
}
