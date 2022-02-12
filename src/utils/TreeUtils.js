/**
 * Recursively visit nodes if the node has children
 * @param {Elt} elt tree element
 * @param {function} observeCb obeserve function
 */
function visitTree(elt, observeCb) {
/**
 * if ifc element has children
 * @param {array}  elt.children tree element
 */
  if (elt && elt.children) {
    for (const child of elt.children) {
      observeCb(child, elt)
      visitTree(child, observeCb)
    }
  }
}


/**
 * add parent links to the tree
 * @param {Object} rootElt IFC element.
 * @param {string} elementsById Instance of.
 */
function setupLookupAndParentLinks(rootElt, elementsById) {
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
 * generate URL address to the element
 * @param {Object} elt IFC element.
 * @param {string} getNameCb Instance of.
 * @return {string} The sum of the two numbers.
 */
function computeElementPath(elt, getNameCb) {
  if (getNameCb === undefined || getNameCb == null) {
    throw new Error('Illegal argument: getNameCb undefined')
  }
  return (elt.parent ? computeElementPath(elt.parent, getNameCb) : '' ) + '/' + getNameCb(elt)
}


export {
  computeElementPath,
  setupLookupAndParentLinks,
  visitTree,
}
