import {Locator, expect, test} from '@playwright/test'
import {
  clearOpfs,
  homepageSetup,
  setIsReturningUser,
} from '../../tests/e2e/utils'
import {waitForModelReady} from '../../tests/e2e/models'
import {captureGlbLogs, resetGlbLogs, waitForGlbLog} from '../../tests/e2e/glbLogs'


const {beforeEach, describe} = test


// Upper bound on toggles clicked. One click per iteration (see below), so this
// is a click budget, not a depth: generous enough to open the whole mounted
// window of either fixture, small enough that a runaway can't eat the timeout.
const MAX_EXPAND_CLICKS = 40
const EXPAND_SETTLE_MS = 150
// Distinct labels a real hierarchy must beat. The bug this guards produces a
// root whose children repeat the root's own name, so DISTINCT labels — not
// rows — is the discriminant; see the count assertion for why.
const MIN_DISTINCT_LABELS = 5


const COLLAPSED_TOGGLE =
  '[data-node-label][data-is-expanded="false"] [data-testid="NavTreeNodeToggle"]'


/**
 * Expand NavTree nodes until nothing mounted is still collapsed.
 *
 * Two things this has to work around, neither obvious:
 *
 *   - **One click per turn, not a batch.** `NavTreePanel`'s `handleToggle`
 *     closes over the render-time `expandedNodeIds` and calls
 *     `setExpandedNodeIds([...expandedNodeIds, nodeId])`, and
 *     `NavTreeSlice.setExpandedElements` REPLACES the array. Dispatching N
 *     clicks in one synchronous task gives every handler the same stale
 *     snapshot and the last write wins, so a batch of N expands exactly one
 *     node. Clicking one at a time with a settle between lets React re-render
 *     and the next click read fresh state.
 *   - **Clicks are dispatched in-page** rather than through `locator.click()`:
 *     the toggles sit over a live canvas that keeps the compositor busy, and
 *     Playwright's actionability wait times out against it on a GPU-less
 *     runner even though the element is perfectly clickable.
 *
 * Termination is bounded by what is MOUNTED: the panel renders through
 * `react-window`'s `VariableSizeList`, so rows below the fold are absent from
 * the DOM and their collapsed state is invisible here. This opens the visible
 * window, which is all the assertions below need — it is not a whole-tree
 * expansion and shouldn't be read as one.
 *
 * @param panel locator for the NavTree panel
 */
async function expandTree(panel: Locator) {
  for (let click = 0; click < MAX_EXPAND_CLICKS; click++) {
    const next = panel.locator(COLLAPSED_TOGGLE).first()
    if (await next.count() === 0) {
      break
    }
    await next.evaluate((e) => (e as HTMLElement).click())
    await panel.page().waitForTimeout(EXPAND_SETTLE_MS)
  }
}


/**
 * Assert the panel shows a real hierarchy rather than the #1776 fallback.
 *
 * Counts DISTINCT `data-node-label` values, not rows. Two reasons rows are the
 * wrong measure: the list is virtualized, so the row count saturates at the
 * viewport (~25-30 at the config's 1280x800) and no threshold above that is
 * even expressible; and the failure being guarded — `Loader.js`'s
 * `ifcManager.getSpatialStructure = () => model` fallback walking the GLB
 * scene graph — emits a root whose children carry the root's own name, which
 * is plenty of ROWS and one label.
 *
 * @param panel locator for the NavTree panel
 */
async function expectRealHierarchy(panel: Locator) {
  const labels = await panel.locator('[data-node-label]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-node-label')))
  const distinct = new Set(labels).size
  expect(distinct, `expanded tree had ${distinct} distinct label(s) over ` +
    `${labels.length} row(s): ${JSON.stringify(labels)}`)
    .toBeGreaterThanOrEqual(MIN_DISTINCT_LABELS)
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
    // Belt-and-suspenders, and deliberately BEFORE rather than after: each
    // test gets a fresh `BrowserContext` and Chromium partitions OPFS per
    // context, so this is normally a no-op. The case it is insurance against —
    // a run interrupted mid-write — is exactly the case where an `afterEach`
    // does not execute, so clearing afterwards could not have provided it.
    // Clearing here guarantees the populate half starts from a known-empty
    // store whatever preceded it.
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
    resetGlbLogs(glbLogs)
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

    // The tree renders collapsed, so measuring without expanding sees exactly
    // the root — which is also what the bug this guards against produced. In
    // bldrs-ai/Share#1776 the cache-hit tree was the GLB scene graph walked by
    // `Loader.js`'s fallback, a root whose children repeat the root's own
    // name. Expanding is what tells the two apart.
    await expandTree(navTreePanel)
    await expectRealHierarchy(navTreePanel)
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

    resetGlbLogs(glbLogs)
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

    // The log line above is the discriminant for "which source fed the tree",
    // but it says nothing about what that source CONTAINED: a captured tree
    // that is a bare root, or whose children `mapSpatialNode` filters out for
    // want of an `expressID`, hydrates and logs exactly the same. Since this
    // is the test for the regression #1776 actually was, it carries the
    // content assertion too.
    await expandTree(navTreePanel)
    await expectRealHierarchy(navTreePanel)
  })
})
