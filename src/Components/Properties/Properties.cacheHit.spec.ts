import {Locator, expect, test} from '@playwright/test'
import {
  homepageSetup,
  setIsReturningUser,
} from '../../tests/e2e/utils'
import {waitForModelReady} from '../../tests/e2e/models'


const {beforeEach, describe} = test


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

  test('cache-hit GLB renders Properties panel with full IFC entity fields', async ({page}) => {
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

    // First load with ?feature=glb: cache MISS, writer populates OPFS.
    // The writer is fire-and-forget at the call site; we wait on the
    // "writer: wrote" log to know it actually finished before the
    // reload.
    const CACHE_TIMEOUT = 30_000
    await page.goto('/share/v/p/index.ifc?feature=glb')
    await waitForModelReady(page)
    await page.waitForFunction(
      ({logs}) => logs.some((l: string) => l.includes('writer: wrote')),
      {logs: glbLogs},
      {timeout: CACHE_TIMEOUT},
    )
    expect(glbLogs.some((l) => l.includes('cache MISS'))).toBe(true)

    // Second load — same path + element permalink — to trigger a cache
    // hit AND select an element so the Properties panel has something
    // to render. Reset log buffer so the second-load assertions don't
    // see the first load's lines.
    glbLogs.length = 0
    await page.goto('/share/v/p/index.ifc/81/621?feature=glb')
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
