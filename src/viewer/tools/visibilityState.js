/**
 * Snapshot and restore of the isolator's hide / isolate state: the undo for
 * `view.hide`, `view.isolate` and `view.showAll`.
 *
 * Undo restores the whole visibility state as it was before the call, rather
 * than reversing just the call's own delta. Hide and isolate don't compose
 * (`hideElementsById`'s UI is off during isolation, and `unHideAllElements`
 * is a no-op then), so "un-hide what this call hid" is only well defined in
 * the state the call ran in, and a snapshot is. Restore runs through the same
 * isolator entry points a `#d:` permalink applies with
 * (visibilityHash#applyVisibilityHash): clear, hide, isolate — so the store,
 * the NavTree eyes and the permalink writer all follow.
 *
 * One thing a snapshot does NOT bring back: a selection that a hide pruned
 * (`hideElementsById` drops hidden ids from `selectedElements`).
 */


/**
 * @param {object} isolator IfcIsolator
 * @return {object} the visibility state, as plain data
 */
export function captureVisibility(isolator) {
  // Each entry as the isolator holds it. The path is kept as it is: an EMPTY
  // path is a top-level STEP product's own root-level geometry, which the
  // `#d:` link writes as `e<row>`, and none (null) an occurrence hidden
  // without one, which it can't write (`IfcIsolator#hideOccurrences`).
  // `inexact` keeps such an entry out of the link once restored (#2001).
  const hiddenOccurrences = [...isolator.hiddenOccurrencePaths.entries()].map(
    ([key, {nodeId, occurrencePath, solidExpressId, inexact}]) => ({
      nodeId,
      occurrencePath: occurrencePath ? [...occurrencePath] : null,
      solidExpressId,
      instanceIds: [...(isolator.hiddenOccurrences.get(key) ?? [])],
      ...(inexact === true ? {inexact: true} : {}),
    }))
  // Which rows each product hide hid with it: restoring the hides in one
  // call would otherwise count every one of them as hidden with the product,
  // and the product's eye would then show a row the user hid on its own.
  const productHideParts = typeof isolator.productHidePartsSnapshot === 'function' ?
    isolator.productHidePartsSnapshot() : []
  let isolation = null
  if (isolator.tempIsolationModeOn) {
    if (isolator.isolatedInstanceIds) {
      // An occurrence isolation's occurrences (`isolatedOccurrences`, what
      // the link is written from). A whole top-level STEP product is there
      // as its rows (`IfcIsolator#splitProductOccurrences`, #1924): its own
      // geometry as an empty-path entry carrying its instances, its children
      // by path. A row isolated without a path is not in the list; those are
      // the isolated rows missing from it, and their instances are inside
      // `isolatedInstanceIds`.
      const occurrences = (isolator.isolatedOccurrences ?? []).map((occurrence) => ({
        ...occurrence,
        ...(Array.isArray(occurrence.instanceIds) ? {instanceIds: [...occurrence.instanceIds]} : {}),
      }))
      const pathful = new Set(occurrences.map(({nodeId}) => nodeId))
      isolation = {
        occurrences,
        pathlessNodeIds: [...new Set(isolator.isolatedIds.filter((nodeId) => !pathful.has(nodeId)))],
        instanceIds: [...isolator.isolatedInstanceIds],
      }
    } else {
      isolation = {ids: [...isolator.isolatedIds]}
    }
  }
  return {hiddenIds: [...isolator.hiddenIds], hiddenOccurrences, productHideParts, isolation}
}


/**
 * @param {object} isolator IfcIsolator
 * @param {object} snapshot from {@link captureVisibility}
 */
export function restoreVisibility(isolator, snapshot) {
  // Isolation first: `unHideAllElements` is a no-op while isolating.
  isolator.resetTempIsolation()
  isolator.unHideAllElements()
  if (snapshot.hiddenIds.length > 0) {
    isolator.hideElementsById(snapshot.hiddenIds)
  }
  if (snapshot.hiddenOccurrences.length > 0) {
    isolator.hideOccurrences(snapshot.hiddenOccurrences)
    if (typeof isolator.restoreProductHideParts === 'function') {
      isolator.restoreProductHideParts(snapshot.productHideParts)
    }
  }
  const isolation = snapshot.isolation
  if (!isolation) {
    return
  }
  if (isolation.ids) {
    isolator.isolateElementsById(isolation.ids)
    return
  }
  // The pathful occurrences resolve their own instances by path. Each
  // pathless row comes back as a pathless occurrence, so it keeps its row in
  // `isolatedIds` and its isolation glasses; the snapshot's whole instance set
  // rides on the first of them, which covers every pathless product's
  // instances (the union is all the isolator shows). Codex review on #1946:
  // restoring the pathful ones alone dropped the products.
  const pathless = isolation.pathlessNodeIds.map((nodeId, i) => ({
    nodeId,
    occurrencePath: [],
    solidExpressId: null,
    instanceIds: i === 0 ? isolation.instanceIds : [],
  }))
  isolator.isolateOccurrences([...isolation.occurrences, ...pathless])
}
