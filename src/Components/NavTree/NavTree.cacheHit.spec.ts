import {expect, test} from '@playwright/test'
import {
  clearOpfs,
  homepageSetup,
  setIsReturningUser,
} from '../../tests/e2e/utils'
import {waitForModelReady} from '../../tests/e2e/models'


const {afterEach, beforeEach, describe} = test


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
    const glbLogs: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.startsWith('[glb]')) {
        glbLogs.push(text)
      }
    })

    // First load: cache MISS, writer populates OPFS with the
    // BLDRS_spatial_tree extension. `glb` is default-on as of the
    // Phase-5a flip; no `?feature=` needed.
    const CACHE_TIMEOUT = 30_000
    await page.goto('/share/v/p/index.ifc')
    await waitForModelReady(page)
    try {
      await page.waitForFunction(
        ({logs}) => logs.some((l: string) => l.includes('writer: wrote')),
        {logs: glbLogs},
        {timeout: CACHE_TIMEOUT},
      )
    } catch (e) {
      // Diagnostic dump: which [glb] lines DID fire before the wait
      // timed out? Most useful failure mode is `writer: skipped
      // (threw)` — surfaces a writer-side exception that would
      // otherwise be invisible (the outer try/catch in
      // exportAndCacheGlb swallows the throw and only logs).
      const indented = glbLogs.map((l) => `  ${l}`).join('\n')
      console.error(
        `[NavTree.cacheHit] writer:wrote never fired in ${CACHE_TIMEOUT}ms; ` +
        `captured ${glbLogs.length} [glb] line(s):\n${indented}`)
      throw e
    }
    expect(glbLogs.some((l) => l.includes('cache MISS'))).toBe(true)

    // Second load: cache HIT — spatial-tree extension provides the
    // NavTree data without a live IFC parser. Reset log buffer.
    glbLogs.length = 0
    await page.goto('/share/v/p/index.ifc')
    await waitForModelReady(page)
    await page.waitForFunction(
      ({logs}) => logs.some((l: string) => l.includes('cache HIT')),
      {logs: glbLogs},
      {timeout: CACHE_TIMEOUT},
    )

    // Open the NavTree panel. The panel renders from the model's
    // `getSpatialStructure(0, true)` closure — on cache HIT this
    // resolves to the cached BLDRS_spatial_tree payload (slim
    // whitelist: expressID, type, Name, LongName, children) rather
    // than wit-three's full live-IFC structure. Either source is
    // valid for the rendering path.
    await page.getByTestId('control-button-navigation').click()
    const navTreePanel = page.getByTestId('NavTreePanel')
    await expect(navTreePanel).toBeVisible()

    // The tree should have at least the IfcProject root + a few
    // descendants. A writer-side bug that captures an empty /
    // single-node tree (e.g., recursion bottom-out wrong) would
    // make this fail. We don't pin a specific count because tree
    // shape depends on the fixture model (index.ifc), but anything
    // > 1 confirms the tree is actually being traversed.
    const treeItems = navTreePanel.locator('[role="treeitem"]')
    await expect(treeItems.first()).toBeVisible()
    // index.ifc has many storeys / spaces / elements; > 5 is a
    // comfortable lower bound that's still well below the real count.
    const itemCount = await treeItems.count()
    const MIN_TREE_ITEMS = 5
    expect(itemCount).toBeGreaterThan(MIN_TREE_ITEMS)
  })
})
