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
 * Generate a URL address fragment for the element.
 *
 * @param {object} elt IFC element.
 * @param {Function} getNameCb Instance of.
 * @return {string} The URL path fragment for the element.
 */
export function computeElementPath(elt, getNameCb) {
  if (getNameCb === undefined || getNameCb === null) {
    throw new Error('Illegal argument: getNameCb undefined')
  }
  return `${elt.parent ? computeElementPath(elt.parent, getNameCb) : '' }/${ getNameCb(elt)}`
}
