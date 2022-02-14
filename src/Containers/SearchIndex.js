import * as Ifc from '../utils/Ifc'
import debug from '../utils/debug'
import { assertDefined } from '../utils/assert'


/** TODO(pablo): maybe refactor into {IfcSearchIndex extends SearchIndex}. */
export default class SearchIndex {
  constructor() {
    this.eltsByType = {};
    this.eltsByName = {};
    this.eltsByGlobalId = {};
    this.eltsByText = {};
  }


  /** Recursively visits elt and indexes properties. */
  indexElement(elt, viewer) {
    assertDefined(elt, viewer);
    const type = Ifc.getType(elt, viewer);
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

    const reifiedName = Ifc.reifyName(elt, viewer);
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
    for (let child of elt.children) {
      this.indexElement(child, viewer);
    }
  }


  /** Returns a set of word tokens from the string. */
  tokenize(str) {
    return new Set(str.match(/(\w+)/g))
  }


  findCreateIndexSet(index, key) {
    let set = index[key]
    if (set === undefined) {
      set = index[key] = new Set()
    }
    return set
  }


  indexElementByString(index, str, elt) {
    this.findCreateIndexSet(index, str).add(elt)
    this.findCreateIndexSet(index, str.toLowerCase()).add(elt)
  }


  indexElementByStringSet(index, strSet, elt) {
    for (const str of strSet) {
      this.indexElementByString(index, str, elt)
    }
  }


  clearIndex() {
    for (const key in this.eltsByType) {
      delete this.eltsByType[key]
    }
    for (const key in this.eltsByName) {
      delete this.eltsByName[key]
    }
    for (let key in this.eltsByGlobalId) {
      delete this.eltsByGlobalId[key];
    }
    for (let key in this.eltsByText) {
      delete this.eltsByText[key];
    }
  }


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

    debug().log(`SearchIndex#search: query rewrite: ${query}`);

    const token = query; // TODO(pablo): tokenization
    debug(2).log('SearchIndex#search: this: ', this);

    addAll(this.eltsByName[token]);
    addAll(this.eltsByType[token]);

    const lowerToken = token.toLowerCase();
    addAll(this.eltsByName[lowerToken]);
    addAll(this.eltsByType[lowerToken]);

    addAll(this.eltsByGlobalId[token]);

    addAll(this.eltsByText[token]);


    const resultIDs = toExpressIds(Array.from(resultSet));
    debug().log('result IDs: ', resultIDs);
    return resultIDs;
  }
}
