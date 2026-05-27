import cypress from './vars.cypress.js'


export default {
  ...cypress,
  // OPFS used to be off in playwright because the cypress baseline kept
  // it off and we hadn't audited specs for cross-test leak risk.
  // Re-enabled to unblock the `Properties.cacheHit.spec.ts` round-trip
  // (writer → OPFS → reader → BLDRS_element_properties), which needs
  // OPFS available so the cache-key path actually executes in
  // `Loader.js#load`.
  //
  // Per-test isolation: Playwright's `fullyParallel: true` config
  // creates a fresh `BrowserContext` per test, each with its own OPFS
  // slot. The cacheHit spec deliberately uses two `page.goto()` calls
  // within ONE test (populate → reload) to round-trip through the
  // same OPFS state — that pattern keeps working because the same
  // Page/Context is reused across both gotos.
  //
  // Belt-and-suspenders cleanup runs in `homepageSetup` via
  // `clearOpfs` — clears any OPFS entries that survived a previous
  // test's BrowserContext (shouldn't happen in normal operation but
  // defends against unexpected context-pool reuse / browser bugs).
  OPFS_IS_ENABLED: true,
  THEME_IS_ENABLED: true,
}
