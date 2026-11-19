import {browserModelState} from './BrowserSlice'
import {ifcModelState} from './IFCSlice'
import {navTreeModelState} from './NavTreeSlice'
import useStore from './useStore'


/**
 * The store's per-model state, as one object of fresh defaults: the fields
 * that belong to the model the view shows and go with it when the user
 * leaves it (open-205 #2019; design/new/in-app-model-switch.md §4.9). Each
 * slice declares its own (`IFCSlice#ifcModelState` and its siblings) and
 * spreads them into its initial state, so a field added there is reset here
 * without a second list to keep in step. This replaced the field list
 * CadView kept for the purpose (`forgetLoadedModelState`, step A).
 *
 * Not here, on purpose, for step 1:
 * - the selection (`selectedElements`, anchors, instances, occurrence,
 *   solid): it is cleared through CadView's selection funnel, which also
 *   unpaints the scene and keeps the URL in step; step 2 saves and restores
 *   it per session instead (#2019's "select in A, switch to B, switch back");
 * - the load overlay and snackbar (`isModelLoading`, `snackMessage`): loads
 *   run one at a time, so a load's own teardown always lands before the next
 *   load's start (CadView#onViewer's in-flight queue);
 * - the search index, which is one object cleared in place (below);
 * - hidden elements, already keyed per model (`claimHiddenElementsForModel`).
 *
 * @return {object}
 */
export function modelStateDefaults() {
  return {
    ...ifcModelState(),
    ...navTreeModelState(),
    ...browserModelState(),
  }
}


/**
 * Reset the store's per-model state to its defaults, as a page load would
 * start it. The one writer of these fields outside a model session's load
 * job (Containers/modelSession.js), and called only when the active session
 * changes or its load was given up.
 *
 * @param {object} [store] the zustand store, for tests
 */
export function resetModelState(store = useStore) {
  store.setState(modelStateDefaults())
  // One SearchIndex for the life of the page; the panels hold it.
  store.getState().searchIndex?.clearIndex?.()
}
