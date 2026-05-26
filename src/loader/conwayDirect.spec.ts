import {expect, test} from '@playwright/test'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'
import {waitForModelReady} from '../tests/e2e/models'


const {beforeEach, describe} = test


// End-to-end regression coverage for the Conway-direct IFC pipeline.
// As of Phase-5a flag-flip (PR #1529) `conwayDirectIfc` is default-on;
// as of Phase-5b (PR #1533) the parse itself goes through Conway's
// `OpenModel` + `StreamAllMeshes` — wit-three's `IFCLoader.parse` is
// no longer in the loop. Tests target the integration boundary —
// did the parse run, did capabilities flip, did the model render —
// not the unit-level subset construction (that's covered exhaustively
// in IfcInstanceMap.test.js, flatMeshToBufferGeometry.test.js, etc.).
//
// What this catches that unit tests don't:
//   - The Conway parse → assembler → decorate path running to
//     completion on a real model.
//   - `parseIfcWithConway` + `decorateConwayDirectIfcModel`
//     executing in the real Loader.js flow (vs the isolated unit
//     tests that drive them directly).
//   - The BVH-reorder + post-swap `instanceMapFromGeometry` rebuild
//     producing a model that still routes URL-driven selection
//     through to the property panel — i.e. the picking-offset
//     regression from earlier in this PR series's history would
//     surface here if it returned.
//   - Property panel resolution still works on a Conway-direct model
//     (Conway's properties API is reached via the closures
//     `decorateConwayDirectIfcModel` attaches on the model).
describe('viewer/conwayDirect: per-instance IFC pipeline', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('loads a small IFC and reports the parsed log', async ({page}) => {
    const parsedLogs: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('[conwayDirect] parsed')) {
        parsedLogs.push(text)
      }
    })

    // `?feature=conwayDirectIfc` redundant now (default-on) but still
    // valid — keeps the URL as an explicit-intent marker so the spec
    // reads as "this exercises the conway-direct pipeline."
    await page.goto('/share/v/p/index.ifc?feature=conwayDirectIfc')
    await waitForModelReady(page)

    // The parsed log is the integration boundary — fires after
    // `parseIfcWithConway` + `buildConwayIfcModel` +
    // `decorateConwayDirectIfcModel` all complete on a real Conway
    // parse. Catches "the flag is on but nothing happened" + "OpenModel
    // returned -1" (lazy-Init failure) regressions cleanly.
    expect(parsedLogs.length).toBeGreaterThan(0)
    expect(parsedLogs[0]).toMatch(/modelID=\d+/)
    expect(parsedLogs[0]).toMatch(/vertices=\d+/)
    expect(parsedLogs[0]).toMatch(/triangles=\d+/)
    expect(parsedLogs[0]).toMatch(/instances=\d+/)
    expect(parsedLogs[0]).toMatch(/parents=\d+/)
    expect(parsedLogs[0]).toMatch(/materials=\d+/)
  })

  test('Conway parse produces nonzero geometry on the fixture IFC', async ({page}) => {
    // Smoke signal: `index.ifc` has known content; vertices,
    // triangles, instances, parents, materials must all be > 0
    // after parse. Catches an empty-FlatMesh-stream regression (the
    // `StreamAllMeshes` callback never fires) — the parsed log
    // would report all zeros, which would visibly break the
    // rendered scene but not throw.
    //
    // Pre-Slice-5b this spec also compared Conway counts against
    // wit-three counts (the `(wit=N)` numbers in the `installed`
    // log). With wit-three's IFCParser removed from the cache-miss
    // path, there's no `(wit=N)` reference to compare against —
    // Conway is now the source of truth. The non-zero check is
    // what remains useful.
    const parsedLogs: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('[conwayDirect] parsed')) {
        parsedLogs.push(text)
      }
    })

    await page.goto('/share/v/p/index.ifc?feature=conwayDirectIfc')
    await waitForModelReady(page)

    expect(parsedLogs.length).toBeGreaterThan(0)
    const log = parsedLogs[0]
    const vMatch = log.match(/vertices=(\d+)/)
    const tMatch = log.match(/triangles=(\d+)/)
    const iMatch = log.match(/instances=(\d+)/)
    expect(vMatch).toBeTruthy()
    expect(tMatch).toBeTruthy()
    expect(iMatch).toBeTruthy()
    if (!vMatch || !tMatch || !iMatch) {
      throw new Error('regex match guarded above')
    }
    expect(Number(vMatch[1])).toBeGreaterThan(0)
    expect(Number(tMatch[1])).toBeGreaterThan(0)
    expect(Number(iMatch[1])).toBeGreaterThan(0)
  })

  test('URL-driven element selection resolves through Conway-direct path', async ({page}) => {
    // The pre-selection URL path goes:
    //   URL → `selectElementBasedOnFilepath` → Redux selectedElements →
    //   useEffect → viewer.setSelection → ShareViewer's `instancePicking`
    //   branch → `IfcInstanceMap.createSubsetMeshByParent` → highlight.
    // Catches:
    //   - capability detection — model has `instancePicking: true`
    //   - setSelection's instancePicking branch — runs without crash
    //   - properties resolution — Conway-direct closures on the model
    //     (`getItemProperties` etc.) resolve to real IFC data
    await page.goto('/share/v/p/index.ifc/81/621?feature=conwayDirectIfc')
    await waitForModelReady(page)
    await page.getByTestId('control-button-properties').click()

    const propertiesPanel = page.getByTestId('PropertiesPanel')
    await expect(propertiesPanel).toBeVisible()
    // Express Id resolves to the same value as the non-flag path (the
    // properties surface comes from Conway's properties API, attached
    // to the model via `decorateConwayDirectIfcModel`).
    const expressIdRow = propertiesPanel.locator('tr').filter({hasText: 'Express Id'})
    await expect(expressIdRow).toContainText('621')
  })
})
