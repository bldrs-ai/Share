import {Locator, expect, test} from '@playwright/test'
import {
  clearOpfs,
  homepageSetup,
  setIsReturningUser,
} from '../../tests/e2e/utils'
import {waitForModelReady} from '../../tests/e2e/models'
import {captureGlbLogs, resetGlbLogs, waitForGlbLog} from '../../tests/e2e/glbLogs'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'


const {beforeEach} = test


/**
 * Cache-hit GLB Properties-panel e2e. Pairs with Properties.spec.ts
 * (which covers the cache-miss / live-IFC path) and verifies the
 * `BLDRS_element_properties` extension's full round-trip — capture →
 * GLB cache → reload → lazy decode → Properties panel renders the
 * full IFC entity (not just the slim spatial-tree-node whitelist).
 *
 * Runs at both form factors (bldrs-ai/Share#1787): the round-trip
 * itself is form-factor blind, but `control-button-properties` and
 * the panel it opens are not — on a phone the panel is a tab in the
 * bottom drawer (`TabbedPanels`), not a side drawer.
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
describeMobileAndDesktop('View 100: Properties panel on cache-hit GLB', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    // Belt-and-suspenders, and deliberately BEFORE rather than after: each
    // test gets a fresh `BrowserContext` and Chromium partitions OPFS per
    // context, so this is normally a no-op. The case it is insurance against —
    // a run interrupted mid-write — is exactly the case where an `afterEach`
    // does not execute, so clearing afterwards could not have provided it.
    await clearOpfs(page)
  })


  // Un-skipped in bldrs-ai/Share#1779. These ran green for the first time
  // once the `expect.poll` fix above landed and OPFS was enabled under
  // Playwright; the previous skip reason (an OPFS-worker / MSW-service-worker
  // race) is discussed in `tools/esbuild/vars.playwright.js`.
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
    const glbLogs = captureGlbLogs(page)

    // First load: cache MISS, writer populates OPFS. The writer is
    // fire-and-forget at the call site; we wait on the "writer: wrote"
    // log to know it actually finished before the reload. `glb` is
    // default-on as of the Phase-5a flip; no `?feature=` needed.
    const CACHE_TIMEOUT = 30_000
    await page.goto('/share/v/p/index.ifc?feature=glbVerbose')
    await waitForModelReady(page)
    await waitForGlbLog(glbLogs, 'writer: wrote', CACHE_TIMEOUT)
    expect(glbLogs.some((l) => l.includes('cache MISS'))).toBe(true)

    // Second load — same path + element permalink — to trigger a cache
    // hit AND select an element so the Properties panel has something
    // to render. Reset log buffer so the second-load assertions don't
    // see the first load's lines.
    resetGlbLogs(glbLogs)
    await page.goto('/share/v/p/index.ifc/81/621?feature=glbVerbose')
    await waitForModelReady(page)
    await waitForGlbLog(glbLogs, 'cache HIT', CACHE_TIMEOUT)

    // BLDRS_element_properties hydration log fires at convertToShareModel
    // time — confirms the closure was attached. (The lazy-decode log
    // is gated on first call to getItemProperties; the Properties
    // panel open below triggers it.)
    //
    // A wait, not a bare `.some()`: this line is emitted AFTER the `cache HIT`
    // above, and console events reach the Node-side buffer asynchronously over
    // CDP with no flush barrier — so the poll can return on `cache HIT` before
    // this one has been dispatched. A synchronous read there is a false-failure
    // flake, and this is the only assertion in the file guarding the
    // element-properties closure attachment.
    await waitForGlbLog(
      glbLogs, 'hydrated Properties panel from BLDRS_element_properties', CACHE_TIMEOUT)

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
    await waitForGlbLog(glbLogs, 'decoded payload', DECODE_TIMEOUT)
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
    // No GlobalId assertion, though the entity has one (`#621=
    // IFCBUILDINGELEMENTPROXY('02uD5Qe8H3mek2PYnMWHk1',…)` in index.ifc).
    // This spec used to assert it as a canary for "full entity rendered, not
    // just the slim spatial-tree whitelist" — but a fresh parse of the same
    // element renders exactly these three rows too, so it never distinguished
    // anything. It could not have been noticed while the spec was `fixme`'d.
    //
    // What does the distinguishing here is the pair of log assertions above:
    // `hydrated Properties panel from BLDRS_element_properties` proves the
    // closure was attached, and `decoded payload … N entities` with N > 0
    // proves the payload survived gzip + JSON and inflated. Those are what
    // bldrs-ai/Share#1776 broke — the writer dropped the extension entirely
    // and the reload fell back to the scene graph.
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
