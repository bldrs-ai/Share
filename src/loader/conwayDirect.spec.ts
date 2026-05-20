import {expect, test} from '@playwright/test'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'
import {waitForModelReady} from '../tests/e2e/models'


const {beforeEach, describe} = test


// End-to-end regression coverage for the Conway-direct IFC pipeline
// (?feature=conwayDirectIfc). Tests target the integration boundary —
// did the swap run, did capabilities flip, did the model render — not
// the unit-level subset construction (that's covered exhaustively in
// IfcInstanceMap.test.js, flatMeshToBufferGeometry.test.js, etc.).
//
// What this catches that unit tests don't:
//   - The Conway parse → assembler → install path running to
//     completion on a real model.
//   - `installConwayDirectGeometry` executing in the real Loader.js
//     flow (vs the isolated unit test that drives it directly).
//   - The BVH-reorder + post-swap `instanceMapFromGeometry` rebuild
//     producing a model that still routes URL-driven selection
//     through to the property panel — i.e. the picking-offset
//     regression from earlier in this PR's history would surface
//     here if it returned.
//   - Property panel resolution still works on a Conway-direct model
//     (the IFC manager surface is preserved across the swap; this
//     spec proves it).
describe('viewer/conwayDirect: per-instance IFC pipeline', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('loads a small IFC with ?feature=conwayDirectIfc and reports the install log', async ({page}) => {
    const installLogs: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('[conwayDirect] installed')) {
        installLogs.push(text)
      }
    })

    await page.goto('/share/v/p/index.ifc?feature=conwayDirectIfc')
    await waitForModelReady(page)

    // The install log line is the integration boundary: it fires only
    // after `installConwayDirectGeometry` completes successfully on a
    // real Conway parse. Catches "the flag is on but nothing
    // happened" regressions cleanly.
    expect(installLogs.length).toBeGreaterThan(0)
    expect(installLogs[0]).toMatch(/vertices=\d+ \(wit=\d+\)/)
    expect(installLogs[0]).toMatch(/triangles=\d+ \(wit=\d+\)/)
    expect(installLogs[0]).toMatch(/instances=\d+/)
    expect(installLogs[0]).toMatch(/parents=\d+/)
    expect(installLogs[0]).toMatch(/materials=\d+/)
  })

  test('Conway counts match wit-three counts (vertices and triangles)', async ({page}) => {
    // The `(wit=…)` numbers in the install log are wit-three's totals
    // for the same input. They MUST match — a divergence means the
    // assembler is dropping or duplicating data. This was the smoke
    // signal the user validated manually across Momentum / Snowdon /
    // index; codifies it as a regression test.
    const installLogs: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('[conwayDirect] installed')) {
        installLogs.push(text)
      }
    })

    await page.goto('/share/v/p/index.ifc?feature=conwayDirectIfc')
    await waitForModelReady(page)

    expect(installLogs.length).toBeGreaterThan(0)
    const log = installLogs[0]
    const vMatch = log.match(/vertices=(\d+) \(wit=(\d+)\)/)
    const tMatch = log.match(/triangles=(\d+) \(wit=(\d+)\)/)
    expect(vMatch).toBeTruthy()
    expect(tMatch).toBeTruthy()
    if (!vMatch || !tMatch) {
      throw new Error('regex match guarded above')
    }
    expect(vMatch[1]).toBe(vMatch[2]) // Conway vertices === wit-three vertices
    expect(tMatch[1]).toBe(tMatch[2]) // Conway triangles === wit-three triangles
  })

  test('URL-driven element selection still resolves through Conway-direct path', async ({page}) => {
    // The pre-selection URL path goes:
    //   URL → `selectElementBasedOnFilepath` → Redux selectedElements →
    //   useEffect → viewer.setSelection → ShareViewer's `instancePicking`
    //   branch → `IfcInstanceMap.createSubsetMeshByParent` → highlight.
    // Catches:
    //   - capability detection — model has `instancePicking: true`
    //   - setSelection's instancePicking branch — runs without crash
    //   - properties resolution — wit-three IFC manager is preserved
    //     across the geometry swap (otherwise the panel would be empty).
    await page.goto('/share/v/p/index.ifc/81/621?feature=conwayDirectIfc')
    await waitForModelReady(page)
    await page.getByTestId('control-button-properties').click()

    const propertiesPanel = page.getByTestId('PropertiesPanel')
    await expect(propertiesPanel).toBeVisible()
    // Express Id resolves to the same value as the non-flag path (the
    // properties surface comes from the preserved IFC manager, not
    // from anything we swapped).
    const expressIdRow = propertiesPanel.locator('tr').filter({hasText: 'Express Id'})
    await expect(expressIdRow).toContainText('621')
  })
})
