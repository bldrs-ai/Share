

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
    // console.log(state.selectedElements)
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

  /**
   * check if state has changed.
   *
   * @param {object} state
   * @param {string[]} lastSelectedElementIds
   * @return {boolean}
   */
  selectedElementIdsHasChanged(state, lastSelectedElementIds) {
    if (Array.isArray(state.selectedElements)) {
      const newElements = this.getSelectedElementIds(state)
      return !this.arraysAreEqual(lastSelectedElementIds, newElements)
    }
  }


  // @source https://github.com/30-seconds/30-seconds-blog/blob/master/blog_posts/javascript-array-comparison.md
  /**
   * check if two arrays are equal.
   *
   * @param {object[]} a
   * @param {object[]} b
   * @return {boolean}
   */
  arraysAreEqual(a, b) {
    if (a.length !== b.length) {
      return false
    }
    const uniqueValues = new Set([...a, ...b])
    for (const v of uniqueValues) {
      const aCount = a.filter((e) => e === v).length
      const bCount = b.filter((e) => e === v).length
      if (aCount !== bCount) {
        return false
      }
    }
    return true
  }
}
