/**
 * Visits an element tree and sets parent links for each element.
 */
function setupParentLinks(elt) {
  if (elt && elt.children) {
    for (const child of elt.children) {
      child.parent = elt;
      setupParentLinks(child);
    }
  }
}


function computeElementPath(elt, getNameCb) {
  return (elt.parent ? computeElementPath(elt.parent, getNameCb) : '' ) + '/' + getNameCb(elt);
}


export {
  computeElementPath,
  setupParentLinks
}
