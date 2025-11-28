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
 * Uses elementID (Model interface abstraction) but maintains backward compatibility
 *
 * @param {object} element
 * @return {Array<number>} elementIds
 */
export function getDescendantExpressIds(element) {
  const descendantIds = []
  visitTree(element, (elt, parent) => {
    // Use elementID (Model interface), fall back to expressID for backward compat
    const id = elt.elementID !== undefined ? elt.elementID : elt.expressID
    descendantIds.push(id)
  })
  return descendantIds
}


/**
 * Returns the ids of path parts from root to this elt in spatial
 * structure.
 * Uses elementID (Model interface abstraction)
 *
 * @param {Map<number,object>} elementsById Map keyed by elementID
 * @param {number} elementId elementID to find path for
 * @return {Array} pathIds
 */
export function getParentPathIdsForElement(elementsById, elementId) {
  assertNumber(elementId)
  const lookupElt = elementsById[elementId]
  if (!lookupElt) {
    debug().error(`CadView#getParentPathIdsForElement(${elementId}) missing in table:`, elementsById)
    return undefined
  }
  // Use elementID (Model interface), fall back to expressID for backward compat
  const pathIds = computeElementPathIds(lookupElt, (elt) => elt.elementID !== undefined ? elt.elementID : elt.expressID)
  return pathIds
}


/**
 * Visits an element tree and sets parent links for each element.
 * Uses elementID (Model interface abstraction) as the key
 *
 * @param {object} rootElt Root element (from Model interface)
 * @param {object} elementsById Map of elements by elementID
 */
export function setupLookupAndParentLinks(rootElt, elementsById) {
  if (elementsById === undefined || elementsById === null) {
    throw new Error('Illegal argument: elementsById undefined')
  }
  visitTree(rootElt, (elt, parent) => {
    // Use elementID (Model interface), fall back to expressID for backward compat
    const parentId = parent.elementID !== undefined ? parent.elementID : parent.expressID
    const eltId = elt.elementID !== undefined ? elt.elementID : elt.expressID
    elementsById[parentId] = parent
    elementsById[eltId] = elt
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
