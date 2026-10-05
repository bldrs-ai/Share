import debug from '../utils/debug'
import useStore from '../store/useStore'
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
  let selectedInViewer = new Set(viewer.getSelectedIds())
  // Anchors are the ids the user actually clicked. The viewer set also
  // carries their descendants, because a container's geometry lives in
  // its children and must highlight in the scene — but treating that
  // whole set as "the selection" made every child row look selected in
  // NavTree, and left Properties and the breadcrumb showing whichever
  // descendant happened to land last in the set.
  let anchors = new Set(
    (useStore.getState().selectedAnchorIds || []).map(Number).filter(Number.isFinite))
  // A single STEP occurrence selection is keyed by its occurrence path, and
  // after a scene pick by the geometry's shared product_definition_shape id,
  // which is no tree row. A multi-selection is rows, so re-express it as its
  // row before adding to it, or the first pick drops out of the highlight.
  const {selectedOccurrencePath: path, selectedSolidExpressId: solid} = useStore.getState()
  if (isShiftKeyDown && Array.isArray(path) && path.length > 0) {
    const row = Number(solid ?? path[path.length - 1])
    const rowElt = elementsById[row]
    selectedInViewer = new Set([row, ...(rowElt ? getDescendantExpressIds(rowElt) : [])])
    anchors = new Set([row])
  }
  if (isShiftKeyDown) {
    if (selectedInViewer.has(expressId)) {
      const descendantIdsToRemove = getDescendantExpressIds(selectedElt)
      descendantIdsToRemove.forEach((descendantId) => selectedInViewer.delete(descendantId))
      selectedInViewer.delete(expressId)
      anchors.delete(expressId)
    } else {
      selectedInViewer.add(expressId)
      descendantIds.forEach((id) => selectedInViewer.add(id))
      // Re-added last so shift-click keeps showing the newest pick.
      anchors.delete(expressId)
      anchors.add(expressId)
    }
  } else {
    selectedInViewer.clear()
    selectedInViewer.add(expressId)
    descendantIds.forEach((descendantId) => selectedInViewer.add(descendantId))
    anchors.clear()
    anchors.add(expressId)
    updateNav = true
  }
  // The last argument: a shift-click keeps the root-level shells already
  // picked (see `rootLevelSelectionForAnchors`); a plain click means the whole row.
  selectItemsInScene(
    Array.from(selectedInViewer), updateNav, [], null, null, Array.from(anchors), isShiftKeyDown)
}
