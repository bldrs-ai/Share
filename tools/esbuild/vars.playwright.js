import cypress from './vars.cypress.js'


export default {
  ...cypress,
  // OPFS on, so the GLB cache round-trip — writer → OPFS → reader — is
  // reachable from a spec at all. Without it `Loader.js#load` skips the whole
  // OPFS block, no artifact is ever written, and the cache-hit consumer
  // surface (NavTree from `BLDRS_spatial_tree`, Properties from
  // `BLDRS_element_properties`, picking from `BLDRS_face_ids`) has no
  // coverage. bldrs-ai/Share#1776 shipped through that gap: every automated
  // check passed on code whose second load rendered an empty NavTree.
  //
  // This was flipped on in PR #1531 and reverted, with the revert attributing
  // an ≈80-spec timeout to the OPFS worker's `fetch` racing MSW's
  // service-worker activation. That attribution does not survive checking.
  // The cache-hit specs could not have passed either way, because they waited
  // with `page.waitForFunction(pred, {logs: glbLogs})` — which serialises its
  // argument into the page ONCE and re-invokes the predicate against that
  // frozen copy, so the Node-side `page.on('console')` pushes never reached
  // it. Every line they waited for arrives after the wait starts, so each
  // wait burned its full timeout by construction. Demonstrated directly:
  // against an array appended at 1s, `waitForFunction` times out at 4s while
  // `expect.poll` resolves at 1.2s. The specs now use `expect.poll`.
  //
  // Whether the ≈80-spec regression was ever real is a separate question, and
  // this flag is the way to find out — it is compile-time and all-or-nothing
  // (`store/BrowserSlice.js` hard-gates the setter), so there is no per-spec
  // opt-in to hide behind. If it does reappear, the fix belongs at its single
  // source: `visitHomepageWaitForModel` and `navigateAndWaitForModel` gate
  // navigation on a network response, where a DOM-state gate
  // (`data-model-ready`, which `waitForModelReady` already uses) is correct
  // whether the bytes come from the network, a worker, or a cache.
  //
  // What the flip changes suite-wide, beyond the cache-hit specs, because
  // `Loader.js#load` gates the whole OPFS block on `isOpfsAvailable`: the
  // model fetch moves into `OPFS.worker.js` (so page-level `context.route`
  // handlers are no longer what keeps a GitHub-model spec hermetic — MSW's
  // service worker is); a GLTFExporter + gzip + OPFS write is scheduled on
  // `requestIdleCallback` at the tail of EVERY load; and `spillModelSource`
  // + `ReleaseModelGeometry` free Conway's native geometry mid-test. None of
  // that ran under Playwright before. It is the first thing to suspect if a
  // spec unrelated to caching starts failing.
  OPFS_IS_ENABLED: true,
  THEME_IS_ENABLED: true,
}
