/**
 * The selection funnel, reachable from outside React.
 *
 * `selectItemsInScene` (CadView.jsx) is the single funnel every selection
 * source goes through — scene pick, NavTree, search, keyboard, permalink —
 * and it owns the whole store-side contract: `selectedElements`, the anchors,
 * per-instance ids, the STEP occurrence path and the URL. It is a closure over
 * CadView's state (the viewer, the element table, the router), so it can't
 * simply be exported. The bot and WidgetApi bypass it with raw
 * `useStore.setState` and so skip anchors and instance ids
 * (ai-workspace.md §9, "Prerequisite: expose the selection funnel").
 *
 * CadView registers it here on mount and clears it on unmount; the Assist
 * view tools (`viewTools.js`) call it through {@link getSelectionFunnel}.
 * Registration changes nothing about how the funnel behaves: CadView
 * registers a stable wrapper that calls the funnel of its latest render, so a
 * caller always reaches the same code a NavTree click does.
 *
 * Module state rather than a store field: a function in the store would be
 * one more subscription target that re-renders nothing useful, and there is
 * at most one CadView mounted.
 */


let funnel = null


/**
 * @param {Function} fn `selectItemsInScene(resultIDs, updateNavigation,
 *   instanceIds, occurrencePath, solidExpressId, anchorIds, keepRootNarrowing)`
 * @return {Function} unregister; a no-op if another funnel replaced this one
 *   in the meantime (a remount that registered before this unmount ran)
 */
export function registerSelectionFunnel(fn) {
  funnel = fn
  return () => {
    if (funnel === fn) {
      funnel = null
    }
  }
}


/** @return {Function|null} the registered funnel, or null with no CadView mounted */
export function getSelectionFunnel() {
  return funnel
}
