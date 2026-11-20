/**
 * Which open of a model a route result is: a number per open, for state
 * that is deduped per open rather than per page (open-205, #2022;
 * design/new/in-app-model-switch.md §5).
 *
 * **An open is one `setModelPath`.** Share.jsx's route effect is the only
 * writer of the store's `modelPath`, and it sets a new route result only
 * when the route names another model (`modelIdentity`, plus kind, provider
 * and uploaded-ness). So:
 * - in-app A → B → A is three opens, the second A a new route result, as
 *   decided on #2011 (decision 1: returning to a model counts as a new open);
 * - a theme toggle, a Widget API view-settings change, an auth-state re-run
 *   or StrictMode's double effect re-run the load with the SAME route result,
 *   so they are the same open (a theme rebuild is not an open: it is the
 *   same model, reloaded for the user's look, not opened by them);
 * - selecting an element changes the path but not the model, so Share keeps
 *   the route result and it is the same open;
 * - on a page load the page and its first open coincide, so a dedupe keyed
 *   per open behaves as one keyed per page did whenever every open is a page
 *   load (the `?feature=disableSpaModelNav` kill switch).
 *
 * That single writer is the premise, pinned by modelOpenWriter.test.js: any
 * other `setModelPath` caller has to be added there with its reason.
 *
 * Kept in a WeakMap rather than stamped on the route result, so nothing that
 * copies or compares route results sees a new field, and an open's number
 * goes with its route result.
 */
const openIds = new WeakMap<object, number>()
let lastOpenId = 0


/**
 * @param modelPath a route result (routes.ts#handleRoute), as the store's
 *   `modelPath` holds it
 * @return its open's number, stable for that object; 0 for none
 */
export function modelOpenId(modelPath: object | null | undefined): number {
  if (modelPath === null || typeof modelPath !== 'object') {
    return 0
  }
  let id = openIds.get(modelPath)
  if (id === undefined) {
    lastOpenId += 1
    id = lastOpenId
    openIds.set(modelPath, id)
  }
  return id
}
