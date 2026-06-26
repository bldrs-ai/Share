import debug from '../utils/debug'
import {getDescendantExpressIds} from '../utils/TreeUtils'


/**
 * Select/Deselect items in the scene using shift+click
 *
 * @param {object} viewer
 * @param {Map<number,object>} elementsById Express elts by their expressID
 * @param {Function} selectItemsInScene
 * @param {boolean} isShiftKeyDown the click event
 * @param {number} expressId the express id of the element
 */
export function elementSelection(viewer, elementsById, selectItemsInScene, isShiftKeyDown, expressId) {
  // NavTree click handlers pass `node.expressID.toString()` (a string)
  // while scene picks pass a numeric `mesh.expressID`. Normalise to a
  // number so the Set-membership test (shift toggle, below) and the
  // isolator's numeric `Array.includes` checks behave identically
  // regardless of which surface initiated the selection — otherwise a
  // string id silently fails `selectedInViewer.has(expressId)` and
  // `isolatedIds.includes(expressId)`.
  expressId = Number(expressId)
  if (!Number.isFinite(expressId)) {
    return
  }
  if (!viewer.isolator.canBePickedInScene(expressId)) {
    return
  }
  const selectedElt = elementsById[expressId]
  if (!selectedElt) {
    debug().error(`selection#getParentPathIdsForElement(${expressId}) missing in table:`, elementsById)
    return
  }
  const descendantIds = getDescendantExpressIds(selectedElt)
  let updateNav = false
  const selectedInViewer = new Set(viewer.getSelectedIds())
  if (isShiftKeyDown) {
    if (selectedInViewer.has(expressId)) {
      const descendantIdsToRemove = getDescendantExpressIds(selectedElt)
      descendantIdsToRemove.forEach((descendantId) => selectedInViewer.delete(descendantId))
      selectedInViewer.delete(expressId)
    } else {
      selectedInViewer.add(expressId)
      descendantIds.forEach((id) => selectedInViewer.add(id))
    }
  } else {
    selectedInViewer.clear()
    selectedInViewer.add(expressId)
    descendantIds.forEach((descendantId) => selectedInViewer.add(descendantId))
    updateNav = true
  }
  selectItemsInScene(Array.from(selectedInViewer), updateNav)
}
