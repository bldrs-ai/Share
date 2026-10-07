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
 * Two things a snapshot does NOT bring back: a selection that a hide pruned
 * (`hideElementsById` drops hidden ids from `selectedElements`), and a whole
 * root-level STEP product isolated TOGETHER with other occurrences — it has
 * no path (`_wholeRootOccurrences`), so only the pathful ones are restored.
 * Isolated on its own, its instances are restored, under its row.
 */


/**
 * @param {object} isolator IfcIsolator
 * @return {object} the visibility state, as plain data
 */
export function captureVisibility(isolator) {
  const hiddenOccurrences = [...isolator.hiddenOccurrencePaths.entries()].map(
    ([key, {nodeId, occurrencePath, solidExpressId}]) => ({
      nodeId,
      occurrencePath: occurrencePath ? [...occurrencePath] : [],
      solidExpressId,
      instanceIds: [...(isolator.hiddenOccurrences.get(key) ?? [])],
    }))
  let isolation = null
  if (isolator.tempIsolationModeOn) {
    isolation = isolator.isolatedInstanceIds ? {
      occurrences: (isolator.isolatedOccurrences ?? []).map((occurrence) => ({...occurrence})),
      instanceIds: [...isolator.isolatedInstanceIds],
      nodeIds: [...isolator.isolatedIds],
    } : {ids: [...isolator.isolatedIds]}
  }
  return {hiddenIds: [...isolator.hiddenIds], hiddenOccurrences, isolation}
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
  }
  const isolation = snapshot.isolation
  if (!isolation) {
    return
  }
  if (isolation.ids) {
    isolator.isolateElementsById(isolation.ids)
  } else if (isolation.occurrences.length > 0) {
    isolator.isolateOccurrences(isolation.occurrences)
  } else {
    // Only pathless (whole root-level product) occurrences were isolated;
    // they carry their instances, as `_wholeRootOccurrences` builds them.
    isolator.isolateOccurrences([{
      nodeId: isolation.nodeIds[0],
      occurrencePath: [],
      solidExpressId: null,
      instanceIds: isolation.instanceIds,
    }])
  }
}
