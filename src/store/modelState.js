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
 * job (session/modelSession.js), and called only when the active session
 * changes or its load was given up.
 *
 * @param {object} [store] the zustand store, for tests
 */
export function resetModelState(store = useStore) {
  store.setState(modelStateDefaults())
  // One SearchIndex for the life of the page; the panels hold it.
  store.getState().searchIndex?.clearIndex?.()
}


/**
 * Forget the model the view showed, in the store, when the active model
 * session changes or its run was given up mid-load (CadView#forgetLoadedModel).
 *
 * @param {object} options
 * @param {boolean} options.isFullReset under the in-app switch: every
 *   per-model field (resetModelState). With the kill switch or the rollback
 *   on, only what a load in flight showed early goes, as before step A
 *   (design/new/in-app-model-switch.md §4.5a): the first mesh, and a tree
 *   brought up at the index.
 * @param {object} [store] the zustand store, for tests
 */
export function forgetModelState({isFullReset}, store = useStore) {
  if (isFullReset) {
    resetModelState(store)
    return
  }
  // The left load's first mesh lifted the overlay (#2043); the model about
  // to be shown has put nothing on screen yet.
  store.setState({isFirstMeshShown: false})
  if (store.getState().indexedModel !== null) {
    forgetIndexedTreeInStore(store)
  }
}


/**
 * Take down a tree brought up at a load's index (open-205 #2029): the store's
 * half; the view's element lookup is CadView's.
 *
 * @param {object} [store] the zustand store, for tests
 */
export function forgetIndexedTreeInStore(store = useStore) {
  store.setState({indexedModel: null, rootElement: null, elementTypesMap: []})
  store.getState().searchIndex?.clearIndex?.()
}
