import {assertNumber} from './assert'
import debug from './debug'


/**
 * Generate a URL address fragment for the element.
 *
 * @param {object} elt IFC element.
 * @param {Function} getIdCb Instance of.
 * @return {Array} The element path array
 */
export function computeElementPathIds(elt, getIdCb) {
  if (elt === undefined || elt === null) {
    throw new Error('Illegal argument: elt undefined')
  }
  if (getIdCb === undefined || getIdCb === null) {
    throw new Error('Illegal argument: getIdCb undefined')
  }
  const id = getIdCb(elt)
  return elt.parent ? computeElementPathIds(elt.parent, getIdCb).concat(id) : [id]
}


/**
 * Returns the ids of descendents.
 *
 * @param {object} element
 * @return {Array<number>} expressIds
 */
export function getDescendantExpressIds(element) {
  const descendantIds = []
  visitTree(element, (elt, parent) => descendantIds.push(elt.expressID))
  return descendantIds
}


/**
 * Returns the ids of path parts from root to this elt in spatial
 * structure.
 *
 * @param {Map<number,object>} elementsById
 * @param {number} expressId
 * @return {Array} pathIds
 */
export function getParentPathIdsForElement(elementsById, expressId) {
  assertNumber(expressId)
  const lookupElt = elementsById[expressId]
  if (!lookupElt) {
    debug().error(`CadView#getParentPathIdsForElement(${expressId}) missing in table:`, elementsById)
    return undefined
  }
  const pathIds = computeElementPathIds(lookupElt, (elt) => elt.expressID)
  return pathIds
}


/**
 * Visits an element tree and sets parent links for each element.
 *
 * @param {object} rootElt Root IFC element.
 * @param {object} elementsById An already existing map of elements by ID.
 */
export function setupLookupAndParentLinks(rootElt, elementsById) {
  if (elementsById === undefined || elementsById === null) {
    throw new Error('Illegal argument: elementsById undefined')
  }
  visitTree(rootElt, (elt, parent) => {
    elementsById[parent.expressID] = parent
    elementsById[elt.expressID] = elt
    elt.parent = parent
  })
}


/**
 * Recursively visit nodes if the node has children
 *
 * @param {object} elt tree element
 * @param {Function} observeCb Callback for each child/element pair:
 * observeCb(child, elt).
 */
export function visitTree(elt, observeCb) {
  if (elt && elt.children) {
    for (const child of elt.children) {
      observeCb(child, elt)
      visitTree(child, observeCb)
    }
  }
}
