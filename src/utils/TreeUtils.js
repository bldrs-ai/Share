function visitTree(elt, observeCb) {
  if (elt && elt.children) {
    for (const child of elt.children) {
      observeCb(child, elt)
      visitTree(child, observeCb)
    }
  }
}


/**
 * Visits an element tree and sets parent links for each element.
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
