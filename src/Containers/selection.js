import debug from '../utils/debug'
import {getDescendantExpressIds} from '../utils/TreeUtils'


/**
 * Select/Deselect items in the scene using shift+click
 * Uses elementID (Model interface abstraction) - elementsById is keyed by elementID
 *
 * @param {object} viewer
 * @param {Map<number,object>} elementsById Elements by their elementID
 * @param {Function} selectItemsInScene
 * @param {boolean} isShiftKeyDown the click event
 * @param {number} elementId the elementID of the element (Model interface)
 */
export function elementSelection(viewer, elementsById, selectItemsInScene, isShiftKeyDown, elementId) {
  if (!viewer.isolator.canBePickedInScene(elementId)) {
    debug().warn('elementSelection: Element cannot be picked in scene:', elementId)
    return
  }
  const selectedElt = elementsById[elementId]
  if (!selectedElt) {
    debug().warn('elementSelection: Element not in elementsById, treating as geometric part:', elementId)
    // Geometric parts (individual Items) aren't in elementsById, but can still be selected
    const selectedInViewer = new Set(viewer.getSelectedIds())
    if (isShiftKeyDown) {
      if (selectedInViewer.has(elementId)) {
        selectedInViewer.delete(elementId)
      } else {
        selectedInViewer.add(elementId)
      }
    } else {
      selectedInViewer.clear()
      selectedInViewer.add(elementId)
    }
    selectItemsInScene(Array.from(selectedInViewer), true)
    return
  }
  const descendantIds = getDescendantExpressIds(selectedElt)
  let updateNav = false
  const selectedInViewer = new Set(viewer.getSelectedIds())
  if (isShiftKeyDown) {
    if (selectedInViewer.has(elementId)) {
      const descendantIdsToRemove = getDescendantExpressIds(selectedElt)
      descendantIdsToRemove.forEach((descendantId) => selectedInViewer.delete(descendantId))
      selectedInViewer.delete(elementId)
    } else {
      selectedInViewer.add(elementId)
      descendantIds.forEach((id) => selectedInViewer.add(id))
    }
  } else {
    selectedInViewer.clear()
    selectedInViewer.add(elementId)
    descendantIds.forEach((descendantId) => selectedInViewer.add(descendantId))
    updateNav = true
  }
  selectItemsInScene(Array.from(selectedInViewer), updateNav)
}
