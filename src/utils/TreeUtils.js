/**
 * Recursively visit nodes if the node has children
 * @param {Elt} elt tree element
 * @param {function} observeCb obeserve function
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
 * @param {Object} rootElt Root IFC element.
 * @param {Object} elementsById An already existing map of elements by ID.
 */
export function setupLookupAndParentLinks(rootElt, elementsById) {
  if (elementsById === undefined || elementsById == null) {
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
 * @param {Object} elt IFC element.
 * @param {function} getNameCb Instance of.
 * @return {string} The URL path fragment for the element.
 */
export function computeElementPath(elt, getNameCb) {
  if (getNameCb === undefined || getNameCb == null) {
    throw new Error('Illegal argument: getNameCb undefined')
  }
  return (elt.parent ? computeElementPath(elt.parent, getNameCb) : '' ) + '/' + getNameCb(elt)
}
