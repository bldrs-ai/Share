import cypress from './vars.cypress.js'


export default {
  ...cypress,
  // OPFS_IS_ENABLED reverted to false (was flipped to true in PR #1531
  // to unblock `Properties.cacheHit.spec.ts`). With it on, the
  // loader's first IFC fetch goes through the OPFS worker
  // (`downloadToOPFS` → `OPFS.worker.js` → `fetch(objectUrl)`); that
  // worker-context fetch races MSW's service-worker activation, and
  // when MSW isn't yet controlling the page the fetch fails to match
  // the page-level `waitForResponse` listener in
  // `visitHomepageWaitForModel` — ALL tests that wait for the model
  // to load (≈80 specs) then time out at the 30s budget.
  //
  // The cacheHit specs that needed OPFS are still `test.fixme`'d
  // (the OPFS-worker / MSW-SW interaction needs the proper fix
  // tracked in design/new/viewer-replacement.md §4b.2 — gate the
  // first `page.goto` on `waitForServiceWorker`, or add an MSW
  // handler that fulfils worker-context fetches). Until that lands,
  // flipping the flag is pure regression.
  OPFS_IS_ENABLED: false,
  THEME_IS_ENABLED: true,
}
