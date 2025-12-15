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
   * get global ids of elements.
   *
   * @param {string[]} elementsExpressIds array of express ids
   * @return {string[]} array of global ids
   */
  getElementsGlobalIds(elementsExpressIds) {
    const elementIds = []
    if (elementsExpressIds === null || elementsExpressIds.length === 0) {
      return elementIds
    }

    for (const expressId of elementsExpressIds) {
      const globalId = this.searchIndex.getGlobalIdByExpressId(expressId)
      if (globalId) {
        elementIds.push(globalId)
      }
    }
    return elementIds
  }
}
