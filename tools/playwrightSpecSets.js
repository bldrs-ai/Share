// Which Conway-flow specs CI shards as the "heavy" set, and how
// `PW_SPEC_SET` selects between them. Kept dependency-free: the CI shard
// containers install only `@playwright/test` and `http-server`, and
// `tools/playwright.config.js` imports this module there.
//
// Why a separate set at all: Playwright 1.56.1's `--shard=N/M` assigns
// tests by COUNT, as contiguous ranges in file order
// (`node_modules/playwright/lib/runner/testGroups.js#filterForShard`; with
// `fullyParallel: true` each test is its own group). It has no notion of
// duration. The share-140 export specs below take 11 s - 1.6 min PER TEST
// in CI (desktop ones average ~50 s; most other tests take 4-20 s), and
// they sit next to each other in file order, so a plain `--shard=N/4` put
// all of them in shard 2: 11-14.5 min against the others' 4.5-7 min, two
// cancellations at the 15-min job limit (#1892).
//
// CI therefore runs each shard as two passes with the same `--shard=N/4`:
// `PW_SPEC_SET=light` (everything except these files), then
// `PW_SPEC_SET=heavy` (only these files). Each shard gets a quarter of
// each set. Nothing is skipped: `light` is exactly "all specs minus these
// paths" and `heavy` is exactly "these paths", so the two passes together
// run the same tests as one unfiltered run.
//
// If a file here is renamed or removed without updating this list, its
// tests still run (in the light pass, because `light` only ignores the
// paths listed); the shards just go back to being unbalanced.
// `playwrightSpecSets.test.js` fails on a listed path that no longer
// exists, so that drift shows up in `yarn test` rather than as slow CI.
//
// Add a file here only when its tests are several times the suite's
// median AND it clusters with other slow files in file order. Paths are
// relative to the config's `testDir` (`src/`).
export const HEAVY_SPEC_FILES = [
  'Components/Share/exportCollapsed.spec.ts',
  'Components/Share/exportGlb.spec.ts',
]


/** @return {Array<string>} Globs for `testMatch` / `testIgnore`. */
export function heavySpecGlobs() {
  return HEAVY_SPEC_FILES.map((file) => `**/${file}`)
}


/**
 * Resolve `PW_SPEC_SET` to the `testMatch` / `testIgnore` additions the
 * Conway Playwright config should use.
 *
 * Unset (every local run, `yarn test-flows`) means all specs, unchanged.
 * An unrecognised value throws rather than silently running everything,
 * because a typo in the workflow would otherwise run the whole suite
 * twice per shard (light + heavy would both be "all").
 *
 * @param {string} [specSet] `process.env.PW_SPEC_SET`
 * @return {object} `{testMatch, testIgnore}`: `testMatch` is an array of
 *   globs, or null to keep the config's default; `testIgnore` is an array
 *   of globs to add to the config's.
 */
export function resolveSpecSet(specSet) {
  if (specSet === undefined || specSet === '') {
    return {testMatch: null, testIgnore: []}
  }
  if (specSet === 'heavy') {
    return {testMatch: heavySpecGlobs(), testIgnore: []}
  }
  if (specSet === 'light') {
    return {testMatch: null, testIgnore: heavySpecGlobs()}
  }
  throw new Error(`PW_SPEC_SET must be 'light', 'heavy' or unset, got '${specSet}'`)
}
