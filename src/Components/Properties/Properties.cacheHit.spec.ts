import {Locator, expect, test} from '@playwright/test'
import {
  clearOpfs,
  homepageSetup,
  setIsReturningUser,
} from '../../tests/e2e/utils'
import {waitForModelReady} from '../../tests/e2e/models'


const {afterEach, beforeEach, describe} = test


/**
 * Cache-hit GLB Properties-panel e2e. Pairs with Properties.spec.ts
 * (which covers the cache-miss / live-IFC path) and verifies the
 * `BLDRS_element_properties` extension's full round-trip — capture →
 * GLB cache → reload → lazy decode → Properties panel renders the
 * full IFC entity (not just the slim spatial-tree-node whitelist).
 *
 * Design: design/new/viewer-replacement.md §3b.iii default-on gating;
 * Phase 3 prereq for `conwayDirectIfc` default-on. Pairs with the
 * follow-up "NavTree on cache-hit GLB" e2e that's tracked but not
 * yet covered.
 *
 * The two `page.goto()` calls in this spec rely on OPFS persisting
 * within the test's browser context: the first call populates the
 * cache, the second triggers a cache hit and exercises every consumer
 * surface (`model.getSpatialStructure` from the spatial-tree
 * extension, `model.getItemProperties` from the element-properties
 * extension, `inferModelCapabilities` flips for both).
 */
describe('View 100: Properties panel on cache-hit GLB', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  // Belt-and-suspenders: each test's BrowserContext is per-test under
  // `fullyParallel: true`, so OPFS is naturally fresh — but if a test
  // run is interrupted mid-write (kill -9, CI timeout), the next run
  // on the same worker could see a half-written artifact. Clearing
  // after every test in this describe block makes the populate→hit
  // pattern's first-half always start from a known-empty state.
  afterEach(async ({page}) => {
    await clearOpfs(page)
  })

  test('cache-hit GLB renders Properties panel with full IFC entity fields', async ({page}) => {
    // Two `page.goto` round-trips (cache-populate + cache-hit) plus the
    // writer's async element-properties BFS can easily exceed
    // Playwright's default 30s per-test budget on CI. Bump to 120s so
    // the writer has room without the test being killed mid-flight.
    // The per-`waitForFunction` timeouts below (CACHE_TIMEOUT,
    // DECODE_TIMEOUT) still cap the individual waits — this is the
    // overall budget, not a wait extension.
    const TEST_TIMEOUT = 120_000
    test.setTimeout(TEST_TIMEOUT)
    // Capture the GLB pipeline's `[glb]` log lines so we can assert on
    // observable state transitions (cache MISS / HIT, writer wrote,
    // reader decoded) rather than racing on timing alone.
    const glbLogs: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.startsWith('[glb]')) {
        glbLogs.push(text)
      }
    })

    // First load: cache MISS, writer populates OPFS. The writer is
    // fire-and-forget at the call site; we wait on the "writer: wrote"
    // log to know it actually finished before the reload. `glb` is
    // default-on as of the Phase-5a flip; no `?feature=` needed.
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
      // timed out? Most useful failure mode is `writer: skipped (threw)`
      // — surfaces a writer-side exception that would otherwise be
      // invisible (the outer try/catch in exportAndCacheGlb swallows
      // the throw and only logs).
      const indented = glbLogs.map((l) => `  ${l}`).join('\n')
      console.error(
        `[cacheHit.spec] writer:wrote never fired in ${CACHE_TIMEOUT}ms; captured ${glbLogs.length} [glb] line(s):\n${indented}`)
      throw e
    }
    expect(glbLogs.some((l) => l.includes('cache MISS'))).toBe(true)

    // Second load — same path + element permalink — to trigger a cache
    // hit AND select an element so the Properties panel has something
    // to render. Reset log buffer so the second-load assertions don't
    // see the first load's lines.
    glbLogs.length = 0
    await page.goto('/share/v/p/index.ifc/81/621')
    await waitForModelReady(page)
    await page.waitForFunction(
      ({logs}) => logs.some((l: string) => l.includes('cache HIT')),
      {logs: glbLogs},
      {timeout: CACHE_TIMEOUT},
    )

    // BLDRS_element_properties hydration log fires at convertToShareModel
    // time — confirms the closure was attached. (The lazy-decode log
    // is gated on first call to getItemProperties; the Properties
    // panel open below triggers it.)
    expect(glbLogs.some((l) =>
      l.includes('hydrated Properties panel from BLDRS_element_properties'))).toBe(true)

    // Open the Properties panel — opening triggers the first
    // `model.getItemProperties(expressID)` call, which inflates the
    // BLDRS_element_properties payload and resolves `element` to the
    // full IFC entity (vs the slim spatial-tree node).
    await page.getByTestId('control-button-properties').click()
    const propertiesPanel = page.getByTestId('PropertiesPanel')
    await expect(propertiesPanel).toBeVisible()

    // Lazy-decode log proves the cached payload actually exists and
    // round-tripped through gzip + JSON.parse. The entity count is
    // the most useful diagnostic — a count of 0 would mean the writer
    // captured nothing, which is the failure mode this test exists
    // to catch.
    const DECODE_TIMEOUT = 5_000
    await page.waitForFunction(
      ({logs}) => logs.some((l: string) => l.includes('decoded payload')),
      {logs: glbLogs},
      {timeout: DECODE_TIMEOUT},
    )
    const decodeLog = glbLogs.find((l) => l.includes('decoded payload'))
    expect(decodeLog).toBeDefined()
    expect(decodeLog).toMatch(/(\d+) entities/)
    const match = decodeLog && decodeLog.match(/(\d+) entities/)
    const entityCount = match ? Number(match[1]) : 0
    expect(entityCount).toBeGreaterThan(0)

    // Properties panel content: the same field surface Properties.spec.ts
    // asserts on the cache-MISS path. If this asserts pass on cache-hit,
    // the `Properties.jsx` resolve-via-getItemProperties path is
    // functioning end-to-end.
    const propertiesTable = propertiesPanel.locator('table').first()
    await expect(propertiesTable).toBeVisible()
    await assertPropertyValue(propertiesPanel, 'Express Id', '621')
    await assertPropertyValue(propertiesPanel, 'Name', 'Together')
    // GlobalId is the canary for "full entity rendered, not just the
    // slim spatial-tree-node whitelist" — it's a typed-primitive field
    // (`{type: 1, value: <string>}`) that the spatial-tree capture
    // strips on write (the whitelist is `{expressID, type, Name,
    // LongName, children}` — see `bldrsSpatialTree.js#serializeNode`),
    // but the element-properties extension preserves verbatim. If the
    // selection effect at `CadView.jsx`'s `selectedElements` watcher
    // ever regresses back to setting `selectedElement` to the slim
    // tree node (or to `null` because viewer.getProperties returned
    // nothing on cache-hit), this assertion fails — caught before the
    // bug ships.
    await assertPropertyValue(propertiesPanel, 'GlobalId', '02uD5Qe8H3mek2PYnMWHk1')
  })
})


/**
 * Look up a property by name (column 1) and assert its rendered value
 * (column 2). Same helper as Properties.spec.ts uses — kept inline
 * rather than imported so this file stays self-contained.
 *
 * @param propertiesPanel locator scoped to the Properties panel
 * @param propertyName label rendered in the first column
 * @param expectedValue text the second column should contain
 */
async function assertPropertyValue(propertiesPanel: Locator, propertyName: string, expectedValue: string) {
  const propertyRow = propertiesPanel.locator('tr').filter({hasText: propertyName})
  await expect(propertyRow).toBeVisible()
  await expect(propertyRow).toContainText(expectedValue)
}
