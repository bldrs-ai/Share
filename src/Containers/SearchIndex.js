import jsonata from 'jsonata'
import * as Ifc from '../utils/Ifc.js'
import {deleteProperties} from '../utils/objects'


const debug = 0


/** TODO(pablo): maybe refactor into {IfcSearchIndex extends SearchIndex}. */
export default class SearchIndex {
/**
Constructor of the Search index class
 * @param {Object} ifcElement async callback for rendering sub-object
 * @param {Object} viewer async callback for rendering sub-object
 */
  constructor(ifcElement, viewer) {
    this.ifcElement = ifcElement
    this.viewer = viewer
    this.eltsByType = {}
    this.eltsByName = {}
    this.eltsByGlobalId = {}
    this.eltsByText = {}
  }


  /**
  Recursively visits elt and indexes properties.
  * @param {Object} elt async callback for rendering sub-object
  */
  indexElement(elt) {
    const type = Ifc.getType(elt, this.viewer)
    if (type) {
      this.indexElementByString(this.eltsByType, type, elt)
      if (type.startsWith('IFC')) {
        this.indexElementByString(this.eltsByType, type.substring(3), elt)
      }
    }

    const name = Ifc.getName(elt)
    if (name) {
      this.indexElementByString(this.eltsByName, name, elt)
      this.indexElementByStringSet(this.eltsByName, this.tokenize(name), elt)
    }

    const reifiedName = Ifc.reifyName(elt, this.viewer)
    if (reifiedName) {
      this.indexElementByString(this.eltsByName, reifiedName, elt)
      this.indexElementByStringSet(this.eltsByName, this.tokenize(reifiedName), elt)
    }

    if (elt.GlobalId && elt.GlobalId.value) {
      this.indexElementByString(this.eltsByGlobalId, elt.GlobalId.value, elt)
    }

    const description = Ifc.getDescription(elt)
    if (description) {
      this.indexElementByStringSet(this.eltsByGlobalId,
          this.tokenize(description),
          elt)
    }

    // Recurse.
    for (const child of elt.children) {
      this.indexElement(child)
    }
  }


  /**
  * Returns a set of word tokens from the string.
  * @param {str} str
  * @return {Set} token
  */
  tokenize(str) {
    return new Set(str.match(/(\w+)/g))
  }

  /**
  * TODO: pablo to confirm
  * Create index set of found results
  * @param {string} index
  * @param {string} key
  * @return {str} set
  */
  findCreateIndexSet(index, key) {
    let set = index[key]
    if (set === undefined) {
      set = index[key] = new Set()
    }
    return set
  }

  /**
  * TODO: pablo to confirm
  * Create an index for found ifc element
  * @param {string} index
  * @param {string} str
  * @param {Object} elt
  */
  indexElementByString(index, str, elt) {
    this.findCreateIndexSet(index, str).add(elt)
    this.findCreateIndexSet(index, str.toLowerCase()).add(elt)
  }

  /**
  * TODO: pablo to confirm
  * Create an index for found ifc element
  * @param {string} index index of the element in the set
  * @param {Set} strSet set of strings
  * @param {Object} elt IFC element
  */
  indexElementByStringSet(index, strSet, elt) {
    for (const str of strSet) {
      this.indexElementByString(index, str, elt)
    }
  }

  /**
  * TODO: pablo to confirm
  * fix this error:The body of a for-in should be wrapped in an if statement
  * to filter unwanted properties from the prototype  guard-fo
  */
  clearIndex() {
    deleteProperties(this.eltsByType)
    deleteProperties(this.eltsByName)
  }

  /**
  * TODO: pablo to confirm
  * Seach the if Tree
  * @param {string} query index of the element in the set
  * @param {Set} strSet set of strings
  * @param {Object} elt IFC element
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

    if (debug) {
      console.log(`SearchIndex#search: query rewrite: ${query}`)
    }

    if (query.startsWith('::')) {
      query = query.substring(2)
      // https://docs.jsonata.org/
      let jsonResults = jsonata(query).evaluate(this.ifcElement)
      if (debug) {
        console.log('CadView#onSearch: JSONata results: ', query, jsonResults)
      }
      if (jsonResults) {
        if (!Array.isArray(jsonResults)) {
          jsonResults = [jsonResults]
        }
        addAll(new Set(jsonResults))
      }
    } else {
      const token = query // TODO(pablo): tokenization
      if (debug >= 2) {
        console.log('searching: ',
            this.eltsByName,
            this.eltsByType,
            this.eltsByGlobalId,
            this.eltsByText)
      }

      addAll(this.eltsByName[token])
      addAll(this.eltsByType[token])

      const lowerToken = token.toLowerCase()
      addAll(this.eltsByName[lowerToken])
      addAll(this.eltsByType[lowerToken])

      addAll(this.eltsByGlobalId[token])

      addAll(this.eltsByText[token])
    }

    const resultIDs = toExpressIds(Array.from(resultSet))
    if (debug) {
      console.log('result IDs: ', resultIDs)
    }
    return resultIDs
  }
}
