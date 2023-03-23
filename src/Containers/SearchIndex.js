import * as Ifc from '@bldrs-ai/ifclib'
import debug from '../utils/debug'
import {deleteProperties} from '../utils/objects'


/** TODO(pablo): maybe refactor into {IfcSearchIndex extends SearchIndex}. */
export default class SearchIndex {
  /** Initializes all the index lookup objects. */
  constructor() {
    this.eltsByType = {}
    this.eltsByName = {}
    this.eltsByGlobalId = {}
    this.eltsByExpressId = {}
    this.eltsByText = {}
  }


  /**
   * Recursively visits elt and indexes properties.
   *
   * @param {object} model IFC model.
   * @param {object} elt async callback for rendering sub-object
   */
  indexElement(model, elt) {
    const type = Ifc.getType(model, elt)
    if (type) {
      this.indexElementByString(this.eltsByType, type, elt)
      const ifcPrefix = 'IFC'
      if (type.startsWith(ifcPrefix)) {
        this.indexElementByString(this.eltsByType, type.substring(ifcPrefix.length), elt)
      }
    }

    const name = Ifc.getName(elt)
    if (name) {
      this.indexElementByString(this.eltsByName, name, elt)
      this.indexElementByStringSet(this.eltsByName, this.tokenize(name), elt)
    }

    const reifiedName = Ifc.reifyName(model, elt)
    if (reifiedName) {
      this.indexElementByString(this.eltsByName, reifiedName, elt)
      this.indexElementByStringSet(this.eltsByName, this.tokenize(reifiedName), elt)
    }

    if (elt.GlobalId && elt.GlobalId.value) {
      this.indexElementByString(this.eltsByGlobalId, elt.GlobalId.value, elt)
    }

    if (elt.expressID) {
      this.indexElementByString(this.eltsByExpressId, elt.expressID.toString(), elt)
    }

    const description = Ifc.getDescription(elt)
    if (description) {
      this.indexElementByStringSet(this.eltsByGlobalId,
          this.tokenize(description),
          elt)
    }

    // Recurse.
    for (const child of elt.children) {
      this.indexElement(model, child)
    }
  }


  /**
   * Returns a set of word tokens from the string.
   *
   * @param {str} str
   * @return {Set} token
   */
  tokenize(str) {
    return new Set(str.match(/(\w+)/g))
  }


  /**
   * Create index set of found results
   *
   * @param {object} index
   * @param {string} key
   * @return {object} The index set.
   */
  findCreateIndexSet(index, key) {
    let set = index[key]
    if (set === undefined) {
      set = index[key] = new Set()
    }
    return set
  }


  /**
   * Add entry for key in index pointing to given elt
   *
   * @param {object} index
   * @param {string} key
   * @param {object} elt
   */
  indexElementByString(index, key, elt) {
    this.findCreateIndexSet(index, key).add(elt)
    this.findCreateIndexSet(index, key.toLowerCase()).add(elt)
  }


  /**
   * Add entry for key in index pointing to given elt for each key in the set
   *
   * @param {object} index index of the element in the set
   * @param {Set} strSet set of strings
   * @param {object} elt IFC element
   */
  indexElementByStringSet(index, strSet, elt) {
    for (const str of strSet) {
      this.indexElementByString(index, str, elt)
    }
  }


  /** Clear all entries in the search index. */
  clearIndex() {
    deleteProperties(this.eltsByType)
    deleteProperties(this.eltsByName)
    deleteProperties(this.eltsByGlobalId)
    deleteProperties(this.eltsByExpressId)
    deleteProperties(this.eltsByText)
  }


  /**
   * Search the index with the given query and return the express IDs of matching IFC elements
   *
   * @param {string} query The search query.
   * @return {string} resultIDs
   */
  search(query) {
    // Need to ensure only expressID strings
    const toExpressIds = (results) => {
      results = results.filter((elt) => elt !== null &&
                               elt !== undefined &&
                               typeof elt.expressID === 'number' &&
                               !isNaN(elt.expressID))
      return results.map((elt) => elt.expressID)
    }

    const resultSet = new Set()
    const addAll = (other) => {
      if (other) {
        for (const o of other) {
          resultSet.add(o)
        }
      }
    }

    if (query.startsWith(':') && !query.startsWith('::')) {
      query = `::**[${query.substring(1)}]`
    }

    debug().log(`SearchIndex#search: query rewrite: ${query}`)

    const token = query // TODO(pablo): tokenization
    debug().log('SearchIndex#search: this: ', this)

    addAll(this.eltsByName[token])
    addAll(this.eltsByType[token])

    const lowerToken = token.toLowerCase()
    addAll(this.eltsByName[lowerToken])
    addAll(this.eltsByType[lowerToken])

    addAll(this.eltsByGlobalId[token])
    addAll(this.eltsByExpressId[token])

    addAll(this.eltsByText[token])

    const resultIDs = toExpressIds(Array.from(resultSet))
    debug().log('result IDs: ', resultIDs)
    return resultIDs
  }

  /**
   * @param {string} expressId
   * @return {string} globalId
   */
  getGlobalIdByExpressId(expressId) {
    if (Object.prototype.hasOwnProperty.call(this.eltsByExpressId, expressId)) {
      const set = this.eltsByExpressId[expressId]
      const element = (set.values().next().value)
      if (Object.prototype.hasOwnProperty.call(element, 'GlobalId')) {
        return element['GlobalId'].value
      }
    }
    return undefined
  }

  /**
   * @param {string} globalId
   * @return {string} expressId
   */
  getExpressIdByGlobalId(globalId) {
    if (Object.prototype.hasOwnProperty.call(this.eltsByGlobalId, globalId)) {
      const set = this.eltsByGlobalId[globalId]
      const element = (set.values().next().value)
      if (Object.prototype.hasOwnProperty.call(element, 'expressID')) {
        return element['expressID'].toString()
      }
    }
    return undefined
  }
}
