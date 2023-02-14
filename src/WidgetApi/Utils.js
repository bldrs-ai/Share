/**
 * get ids of selected elements.
 */
export default class Utils {
  searchIndex = null

  /**
   * constructor
   *
   * @param {object} searchIndex SearchIndex
   */
  constructor(searchIndex) {
    this.searchIndex = searchIndex
  }

  /**
   * get ids of selected elements.
   *
   * @param {object} state
   * @return {string[]} array of GlobalIds.
   */
  getSelectedElementIds(state) {
    const elementIds = []
    if (state.selectedElements === null || state.selectedElements.length === 0) {
      return elementIds
    }

    for (const expressId of state.selectedElements) {
      const globalId = this.searchIndex.getGlobalIdByExpressId(expressId)
      if (globalId) {
        elementIds.push(globalId)
      }
    }
    return elementIds
  }
}
