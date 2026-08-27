import {Locator, expect, test} from '@playwright/test'
import {
  clearOpfs,
  homepageSetup,
  setIsReturningUser,
} from '../../tests/e2e/utils'
import {waitForModelReady} from '../../tests/e2e/models'
import {captureGlbLogs, waitForGlbLog} from '../../tests/e2e/glbLogs'


const {afterEach, beforeEach, describe} = test


// Rounds of expansion, so a nested tree opens fully rather than one level.
const EXPAND_ROUNDS = 6
const EXPAND_SETTLE_MS = 400


/**
 * Expand every open-able NavTree node, repeatedly, so descendants render.
 *
 * Clicks are dispatched in-page rather than through `locator.click()`: the
 * toggles sit over a live canvas that keeps the compositor busy, and
 * Playwright's actionability wait times out against it on a GPU-less runner
 * even though the element is perfectly clickable.
 *
 * @param panel locator for the NavTree panel
 */
async function expandTree(panel: Locator) {
  for (let round = 0; round < EXPAND_ROUNDS; round++) {
    const toggles = panel.locator('[data-testid="NavTreeNodeToggle"]')
    if (await toggles.count() === 0) {
      break
    }
    await toggles.evaluateAll((els) => els.forEach((e) => (e as HTMLElement).click()))
    await panel.page().waitForTimeout(EXPAND_SETTLE_MS)
  }
}


/**
 * Cache-hit GLB NavTree e2e. Sibling to
 * `src/Components/Properties/Properties.cacheHit.spec.ts` — same
 * populate → reload pattern, asserts the OTHER half of the
 * cache-hit consumer surface: the `BLDRS_spatial_tree` extension's
 * round-trip into the NavTree DOM.
 *
 * What this catches that Properties.cacheHit doesn't:
 *
 *   - The `userData.bldrsSpatialTree` payload survives writer →
 *     OPFS → reader and arrives on the model. Properties.cacheHit
 *     focuses on `model.getItemProperties` (element-properties
 *     extension); this spec focuses on `model.getSpatialStructure`
 *     (spatial-tree extension).
 *   - `inferModelCapabilities` flips `spatialStructure: true` from
 *     the cached payload (no live IFC parser on cache HIT).
 *   - `CadView.jsx`'s NavTree-path discriminant routes through the
 *     cached payload instead of falling back to wit-three's
 *     `IFCModel.getSpatialStructure()` prototype method.
 *   - The tree renders enough nodes to be useful — a writer-side
 *     bug that captures an empty / one-element tree would surface
 *     here (e.g., `serializeNode`'s recursion stopping early).
 *
 * Design: design/new/viewer-replacement.md §3b.iii. The Phase 5a
 * follow-up tracked there ("NavTree on cache-hit GLB") that this
 * spec was tracking. Pairs with the §3c "regression-testing
 * framework" idea of bit-level data snapshot comparison — the
 * BLDRS_* payloads will eventually be golden-snapshotted; this
 * spec is the smoke gate that the round-trip is alive at all.
 */
describe('View 100: NavTree on cache-hit GLB', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  // Belt-and-suspenders: per-test BrowserContext isolation already
  // gives fresh OPFS, but clearing after every test in this describe
  // block defends against an interrupted run leaving a partial
  // artifact behind that a subsequent test would read as HIT.
  afterEach(async ({page}) => {
    await clearOpfs(page)
  })

  // Un-skipped in bldrs-ai/Share#1779 — see the sibling note in
  // `Properties.cacheHit.spec.ts` and `tools/esbuild/vars.playwright.js`.
  test('cache-hit GLB renders NavTree from BLDRS_spatial_tree extension', async ({page}) => {
    // Two `page.goto` round-trips (cache-populate + cache-hit) plus
    // the writer's async element-properties BFS can easily exceed
    // Playwright's default 30s per-test budget on CI. Bump to 120s so
    // the writer has room without the test being killed mid-flight.
    const TEST_TIMEOUT = 120_000
    test.setTimeout(TEST_TIMEOUT)

    // Capture the GLB pipeline's `[glb]` log lines so we can assert
    // on observable state transitions (cache MISS / HIT, writer wrote)
    // rather than racing on timing alone.
    const glbLogs = captureGlbLogs(page)

    // First load: cache MISS, writer populates OPFS with the
    // BLDRS_spatial_tree extension. `glb` is default-on as of the
    // Phase-5a flip; no `?feature=` needed.
    const CACHE_TIMEOUT = 30_000
    await page.goto('/share/v/p/index.ifc?feature=glbVerbose')
    await waitForModelReady(page)
    await waitForGlbLog(glbLogs, 'writer: wrote', CACHE_TIMEOUT)
    expect(glbLogs.some((l) => l.includes('cache MISS'))).toBe(true)

    // Second load: cache HIT — spatial-tree extension provides the
    // NavTree data without a live IFC parser. Reset log buffer.
    glbLogs.length = 0
    await page.goto('/share/v/p/index.ifc?feature=glbVerbose')
    await waitForModelReady(page)
    await waitForGlbLog(glbLogs, 'cache HIT', CACHE_TIMEOUT)

    // Open the NavTree panel. The panel renders from the model's
    // `getSpatialStructure(0, true)` closure — on cache HIT this
    // resolves to the cached BLDRS_spatial_tree payload (slim
    // whitelist: expressID, type, Name, LongName, children) rather
    // than wit-three's full live-IFC structure. Either source is
    // valid for the rendering path.
    await page.getByTestId('control-button-navigation').click()
    const navTreePanel = page.getByTestId('NavTreePanel')
    await expect(navTreePanel).toBeVisible()

    // `data-node-label` is the hook `NavTreeNode.jsx` actually sets. The
    // `role="treeitem"` this spec used predates the current tree and matched
    // nothing — invisible while the spec was `fixme`'d.
    const treeItems = navTreePanel.locator('[data-node-label]')
    await expect(treeItems.first()).toBeVisible()

    // The tree renders collapsed, so counting without expanding sees exactly
    // the root — which is also what the bug this guards against produced. In
    // bldrs-ai/Share#1776 the cache-hit tree was the GLB scene graph walked by
    // `Loader.js`'s fallback, a root whose children repeat the root's own
    // name. Expanding is what tells the two apart.
    await expandTree(navTreePanel)
    const itemCount = await treeItems.count()
    const MIN_TREE_ITEMS = 5
    expect(itemCount,
      `expanded tree had ${itemCount} node(s): ` +
        `${JSON.stringify(await treeItems.evaluateAll(
          (els) => els.map((e) => e.getAttribute('data-node-label'))))}`)
      .toBeGreaterThan(MIN_TREE_ITEMS)
  })

  // Worth having as its own test rather than a parameterisation of the one
  // above, because the two formats reach the writer through different Conway
  // opens and a STEP-only regression is invisible to an IFC fixture. That is
  // exactly what bldrs-ai/Share#1776 was: Conway's store-backed open reserves
  // the model handle before it sniffs the format and is IFC-only, so a STEP
  // file burned handle 0 and parsed as handle 1, the writer's captures went to
  // a handle Conway had never opened, and the artifact cached with neither
  // BLDRS_spatial_tree nor BLDRS_element_properties. The IFC path was
  // untouched throughout. The observable symptom is the assertion below: the
  // cache-hit tree collapses to the model root repeated a couple of times
  // (Loader.js's `ifcManager.getSpatialStructure = () => model` fallback,
  // walking the GLB scene graph) instead of the real assembly hierarchy.
  test('cache-hit GLB renders NavTree for a STEP model', async ({page}) => {
    const TEST_TIMEOUT = 120_000
    test.setTimeout(TEST_TIMEOUT)

    const glbLogs = captureGlbLogs(page)

    const CACHE_TIMEOUT = 30_000
    await page.goto('/share/v/p/index.step?feature=glbVerbose')
    await waitForModelReady(page)
    await waitForGlbLog(glbLogs, 'writer: wrote', CACHE_TIMEOUT)
    expect(glbLogs.some((l) => l.includes('cache MISS'))).toBe(true)

    glbLogs.length = 0
    await page.goto('/share/v/p/index.step?feature=glbVerbose')
    await waitForModelReady(page)
    await waitForGlbLog(glbLogs, 'cache HIT', CACHE_TIMEOUT)

    // The tree must come from the cached extension, not the scene-graph
    // fallback. This log line IS the discriminant — without it the panel
    // still renders rows, just the wrong ones.
    await waitForGlbLog(glbLogs, 'hydrated NavTree from BLDRS_spatial_tree', CACHE_TIMEOUT)

    await page.getByTestId('control-button-navigation').click()
    const navTreePanel = page.getByTestId('NavTreePanel')
    await expect(navTreePanel).toBeVisible()
    await expect(navTreePanel.locator('[data-node-label]').first()).toBeVisible()
  })
})
