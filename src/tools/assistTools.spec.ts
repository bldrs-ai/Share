/* eslint-disable no-magic-numbers */
import {Page, expect, test} from '@playwright/test'
import {watchEngineWorker} from '../tests/e2e/engineWorker'
import {openLocalFile} from '../tests/e2e/export'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {waitForModelReady} from '../tests/e2e/models'
import {homepageSetup, pauseViewerRendering, setIsReturningUser} from '../tests/e2e/utils'


/**
 * The Assist viewer tools (#1674, ai-workspace.md §9), driven the way the
 * agent loop will drive them — through the tool registry — via the
 * `?feature=assist` dev hook `window.__bldrsAssistTools`
 * (tools/assistHost.js). The assertions are on what the user sees
 * and shares, not on the tools' own reports: the NavTree row the selection
 * highlights, the URL path it writes, the batched instances actually drawn,
 * and the `#d:` permalink term isolation writes.
 *
 * `index.ifc` is the Bldrs logo: seven `Together` IfcBuildingElementProxy
 * elements under Build / Every / Thing.
 */
const IFC_PATH = '/share/v/p/index.ifc?feature=assist'
const PROXY_TYPE = 'IfcBuildingElementProxy'
const PROXY_LABEL = 'Together'
const PROXY_COUNT = 7
// Two disconnected top-level parts under Conway's synthetic wrapper, every
// row at the empty occurrence path (exportGlb.spec.ts has the same fixture).
// Plates is product_definition #3007; its shells report #3008 as owner.
const TWO_ROOT_FIXTURE = 'src/tests/fixtures/twoRootShells.step'
const PLATES_ROW = 3007
const PLATES_OWNER = 3008
const TWO_ROOT_TIMEOUT_MS = 90_000
// Two storeys with a wall each, authored in millimetres with Qto_WallBaseQuantities
// sets (the file's header says how each number is derived).
const QUANTITIES_FIXTURE = 'src/tests/fixtures/storeyQuantities.ifc'


/**
 * @param engine from watchEngineWorker
 * @param worker whether the leg is the worker's
 * @return the leg's engine check
 */
function expectEngine(engine: ReturnType<typeof watchEngineWorker>, worker: boolean): Promise<void> {
  return worker ? engine.expectWorkerEngine() : engine.expectMainThreadEngine()
}


/** What `__bldrsAssistTools.call` resolves to (assistHost.js). */
interface CallResult {
  ok: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content?: {total?: any, items?: any[], [key: string]: any}
  echo?: string
  refs?: string[]
  error?: {code: string, message: string, details: Record<string, unknown>}
}


// Both engines (engine-worker.md §7 step 9): the worker, which is the default,
// and the main-thread engine through the kill switch. Each test's model is
// checked to have loaded on its leg's engine.
for (const {label, flags, worker} of [
  {label: 'engine worker', flags: '', worker: true},
  {label: 'main-thread engine', flags: ',disableEngineWorker', worker: false},
]) {
  describeMobileAndDesktop(`Assist view tools, ${label}`, () => {
    test.beforeEach(async ({page}) => {
      await homepageSetup(page)
      await setIsReturningUser(page.context())
      const engine = watchEngineWorker(page)
      // The kill switch rides the session across the Open dialog's navigation.
      await page.goto(`${IFC_PATH}${flags}`)
      await waitForModelReady(page)
      await expectEngine(engine, worker)
      // These tests read state (rows, instance visibility, the URL), not pixels.
      await pauseViewerRendering(page)
    })

    test('query finds the proxies; select highlights the row; isolate and undo change what is drawn', async ({page}) => {
      const query = await callTool(page, 'model.query', {ifcType: PROXY_TYPE})
      expect(query.ok, JSON.stringify(query.error)).toBe(true)
      expect(query.content?.total).toBe(PROXY_COUNT)
      expect(query.content?.items?.every(({name}) => name === PROXY_LABEL)).toBe(true)
      const ref = query.content?.items?.[1]?.ref as string
      expect(ref).toMatch(/^e\d+$/)
      const id = ref.substring(1)

      // Select: the NavTree highlights exactly that row, and the URL path names it.
      const select = await callTool(page, 'view.select', {refs: [ref]})
      expect(select.ok, JSON.stringify(select.error)).toBe(true)
      await expect.poll(() => new URL(page.url()).pathname).toMatch(new RegExp(`/${id}$`))
      const panel = await openTree(page)
      await expect(panel.locator('[data-is-selected="true"]')).toHaveCount(1)
      await expect(panel.locator('[data-is-selected="true"]')).toHaveAttribute('data-node-label', PROXY_LABEL)
      await closeTree(page)

      // Isolate: only that element's instances are drawn, and the link says so.
      const total = await visibleInstances(page)
      const own = await instancesOf(page, Number(id))
      expect(own).toBeGreaterThan(0)
      expect(own).toBeLessThan(total)
      const isolate = await callTool(page, 'view.isolate', {refs: [ref]})
      expect(isolate.ok, JSON.stringify(isolate.error)).toBe(true)
      await expect.poll(() => visibleInstances(page)).toBe(own)
      await expect.poll(() => hashToken(page, 'd')).toBe(`iso=${ref}`)

      // Undo: everything is drawn again and the term is gone.
      expect(await page.evaluate(() => (window as unknown as AssistWindow).__bldrsAssistTools.undo())).toBe(true)
      await expect.poll(() => visibleInstances(page)).toBe(total)
      await expect.poll(() => hashToken(page, 'd')).toBe(null)
    })

    // Codex review round 2 on #1946: in a file whose rows are ALL at the empty
    // occurrence path, a part's ref fell back to row ids that own no geometry,
    // and isolate blanked the model while reporting success.
    //
    // engine-worker.md §7 step 6: on the worker leg, every row of this file is
    // at the EMPTY occurrence path, and that `[]` has to survive the worker
    // boundary as `[]`, not as "no path": without it the same fallback blanks
    // the model (re-opened by a lossy encoding; engineStream.js#makeBatchEncoder).
    test('isolates one part of a root-only multi-root STEP file', async ({page}) => {
      test.setTimeout(TWO_ROOT_TIMEOUT_MS)
      const engine = watchEngineWorker(page)
      await openLocalFile(page, TWO_ROOT_FIXTURE, /\/share\/v\/local-only\/.+\.step/)
      await waitForModelReady(page)
      await expectEngine(engine, worker)
      await enableAssistInPlace(page)
      const total = await visibleInstances(page)
      const plates = await instancesOf(page, PLATES_OWNER)
      expect(plates).toBeGreaterThan(0)
      expect(plates).toBeLessThan(total)

      const isolate = await callTool(page, 'view.isolate', {refs: [`e${PLATES_ROW}`]})
      expect(isolate.ok, JSON.stringify(isolate.error)).toBe(true)
      await expect.poll(() => visibleInstances(page)).toBe(plates)
      expect(await page.evaluate(() => (window as unknown as AssistWindow).__bldrsAssistTools.undo())).toBe(true)
      await expect.poll(() => visibleInstances(page)).toBe(total)
    })

    // The analysis tools (#1674 slice 2) against a model that carries quantity
    // sets. Expected values are worked out from the fixture's own geometry
    // (storeyQuantities.ifc header), not read back from the tools:
    //   Wall A  4 x 0.2 x 3 m   area 2(0.8 + 12 + 0.6) = 26.8 m², volume 2.4 m³
    //   Wall B  0.5 x 2 x 3 m   area 2(1 + 1.5 + 6)    = 17 m²,   volume 3 m³
    // The file is in millimetres, so the scene being metres (and the tools
    // saying m²) is the conversion under test, on the worker engine and off it.
    test('quantities, measure and spatial answer for a model with quantity sets', async ({page}) => {
      test.setTimeout(TWO_ROOT_TIMEOUT_MS)
      const engine = watchEngineWorker(page)
      await openLocalFile(page, QUANTITIES_FIXTURE, /\/share\/v\/local-only\/.+\.ifc/)
      await waitForModelReady(page)
      await expectEngine(engine, worker)
      await enableAssistInPlace(page)

      const walls = await callTool(page, 'model.query', {ifcType: 'IfcWall'})
      expect(walls.ok, JSON.stringify(walls.error)).toBe(true)
      const byName = (name: string) => walls.content?.items?.find((item) => item.name === name)?.ref as string
      const [wallA, wallB] = [byName('Wall A'), byName('Wall B')]
      expect(wallA).toMatch(/^e\d+$/)
      expect(wallB).toMatch(/^e\d+$/)

      // Spatial: the storeys, one wall each, and which one Wall B is on.
      const spatial = await callTool(page, 'model.spatial', {})
      expect(spatial.ok, JSON.stringify(spatial.error)).toBe(true)
      const storeys: Array<{name: string, elements: number}> = []
      const collect = (node: {type: string, name: string, elements: number, children?: unknown[]}) => {
        if (node.type.toUpperCase() === 'IFCBUILDINGSTOREY') {
          storeys.push({name: node.name, elements: node.elements})
        }
        const children = node.children ?? []
        children.forEach((child) => collect(child as typeof node))
      }
      collect(spatial.content?.root)
      expect(storeys).toEqual([{name: 'Level 1', elements: 1}, {name: 'Level 2', elements: 1}])
      const where = await callTool(page, 'model.spatial', {ref: wallB})
      expect(where.content?.storey?.name).toBe('Level 2')

      // Quantities: the file's own numbers, summed. Length is stored in mm
      // (4000 + 2000) and reported in m; area and volume are m² / m³ already.
      const quantities = await callTool(page, 'model.quantities', {})
      expect(quantities.ok, JSON.stringify(quantities.error)).toBe(true)
      expect(quantities.content?.available).toBe(true)
      const totalOf = (name: string) =>
        (quantities.content?.totals as Array<{name: string, total: number, unit: string}>).find((t) => t.name === name)
      expect(totalOf('NetSideArea')).toMatchObject({total: 18, unit: 'm²'})
      expect(totalOf('NetVolume')).toMatchObject({total: 5.4, unit: 'm³'})
      expect(totalOf('Length')).toMatchObject({total: 6, unit: 'm'})

      // Measure: from the mesh, in metres. Agrees with the authored volume.
      const area = await callTool(page, 'model.measure', {refs: [wallA, wallB], metric: 'surfaceArea'})
      expect(area.ok, JSON.stringify(area.error)).toBe(true)
      expect(area.content?.total).toBeCloseTo(43.8, 2)
      expect(area.content?.items?.find((i) => i.ref === wallA)?.value).toBeCloseTo(26.8, 2)
      expect(area.content?.items?.find((i) => i.ref === wallB)?.value).toBeCloseTo(17, 2)
      const volume = await callTool(page, 'model.measure', {refs: [wallA, wallB], metric: 'volume'})
      expect(volume.content?.total).toBeCloseTo(5.4, 2)
      expect(volume.content?.openPieces).toBe(0)
      // Wall B, turned and raised: 0.5 (X) x 3 (Y, up) x 2 (Z) in the scene's axes.
      const extents = await callTool(page, 'model.measure', {refs: [wallB], metric: 'extents'})
      const size = extents.content?.items?.[0]?.size as number[]
      expect(size[0]).toBeCloseTo(0.5, 2)
      expect(size[1]).toBeCloseTo(3, 2)
      expect(size[2]).toBeCloseTo(2, 2)
    })

    // index.ifc (the Bldrs logo) carries no quantity sets: the tool says so
    // plainly, and the mesh fallback gives a real, positive number for it.
    test('a model without quantity sets says so, and model.measure answers from the mesh', async ({page}) => {
      const query = await callTool(page, 'model.query', {ifcType: PROXY_TYPE})
      const refs = query.content?.items?.map(({ref}) => ref) as string[]
      expect(refs).toHaveLength(PROXY_COUNT)
      const quantities = await callTool(page, 'model.quantities', {})
      expect(quantities.ok, JSON.stringify(quantities.error)).toBe(true)
      expect(quantities.content?.available).toBe(false)
      expect(quantities.content?.hint).toContain('model.measure')
      const area = await callTool(page, 'model.measure', {refs, metric: 'surfaceArea'})
      expect(area.ok, JSON.stringify(area.error)).toBe(true)
      expect(area.content?.total).toBeGreaterThan(0)
      expect(area.content?.source).toContain('mesh')
      const extents = await callTool(page, 'model.measure', {refs, metric: 'extents'})
      expect((extents.content?.total.size as number[]).every((v) => v > 0)).toBe(true)
    })

    test('a ref the model lacks fails the call, naming it, and changes nothing', async ({page}) => {
      const before = await visibleInstances(page)
      const result = await callTool(page, 'view.isolate', {refs: ['e999999']})
      expect(result.ok).toBe(false)
      expect(result.error?.code).toBe('unresolved_refs')
      expect(JSON.stringify(result.error?.details)).toContain('e999999')
      expect(await visibleInstances(page)).toBe(before)
    })
  })
}


/** The dev hook's surface, as far as these tests use it. */
interface AssistWindow {
  __bldrsAssistTools: {
    call: (name: string, input: unknown) => Promise<CallResult>
    undo: () => Promise<boolean>
  }
}


/**
 * @param page Playwright page
 * @param name tool name
 * @param input tool input
 * @return the dev hook's result
 */
function callTool(page: Page, name: string, input: unknown): Promise<CallResult> {
  return page.evaluate(([toolName, toolInput]) =>
    (window as unknown as AssistWindow).__bldrsAssistTools.call(toolName as string, toolInput),
  [name, input])
}


/**
 * Turn `?feature=assist` on without reloading. A model opened from disk
 * lives at a `/share/v/new/…` route that a reload can't reopen, and the
 * Open flow doesn't carry the query over. The router follows a popstate, and
 * the dev hook follows the router (CadView's `useExistInFeature('assist')`).
 *
 * @param page Playwright page
 */
async function enableAssistInPlace(page: Page) {
  await page.evaluate(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('feature', 'assist')
    window.history.pushState(null, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await page.waitForFunction(() => Boolean((window as unknown as Partial<AssistWindow>).__bldrsAssistTools))
}


/**
 * Open the NavTree and expand it down to the proxies.
 *
 * @param page Playwright page
 * @return the panel
 */
async function openTree(page: Page) {
  const panel = page.getByTestId('NavTreePanel')
  if (!await panel.isVisible()) {
    await page.getByTestId('control-button-navigation').click()
  }
  await expect(panel).toBeVisible()
  for (const label of ['Bldrs', 'Build', 'Every', 'Thing']) {
    const row = panel.locator(`[data-node-label="${label}"]`).first()
    if (await row.getAttribute('data-is-expanded') === 'false') {
      await row.getByTestId('NavTreeNodeToggle').click()
    }
  }
  await expect(panel.locator(`[data-node-label="${PROXY_LABEL}"]`)).toHaveCount(PROXY_COUNT)
  return panel
}


/**
 * Close the NavTree, which covers the scene on a phone.
 *
 * @param page Playwright page
 */
async function closeTree(page: Page) {
  if (await page.getByTestId('NavTreePanel').isVisible()) {
    await page.getByTestId('control-button-navigation').click()
  }
  await expect(page.getByTestId('NavTreePanel')).not.toBeVisible()
}


/**
 * @param page Playwright page
 * @return how many batched instances are drawn
 */
function visibleInstances(page: Page): Promise<number> {
  return page.evaluate(() => {
    let visible = 0
    /* eslint-disable @typescript-eslint/no-explicit-any */
    ;(window as any).useStore.getState().viewer.isolator.ifcModel.traverse((obj: any) => {
      if (obj.isBatchedMesh && obj.instanceParents) {
        // Live ids only: three's getters throw on a deleted one, and ids
        // can be sparse (robustBounds.js walks `_instanceInfo` the same way).
        obj._instanceInfo.forEach((info: any, batchId: number) => {
          visible += info.active !== false && obj.getVisibleAt(batchId) ? 1 : 0
        })
      }
    })
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return visible
  })
}


/**
 * @param page Playwright page
 * @param id a product's express id
 * @return how many batched instances belong to it
 */
function instancesOf(page: Page, id: number): Promise<number> {
  return page.evaluate((product) => {
    let count = 0
    /* eslint-disable @typescript-eslint/no-explicit-any */
    ;(window as any).useStore.getState().viewer.isolator.ifcModel.traverse((obj: any) => {
      if (obj.isBatchedMesh && obj.instanceParents) {
        obj._instanceInfo.forEach((info: any, batchId: number) => {
          count += info.active !== false && obj.instanceParents[batchId] === product ? 1 : 0
        })
      }
    })
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return count
  }, id)
}


/**
 * @param page Playwright page
 * @param name the token's prefix
 * @return the token's value, or null without one
 */
function hashToken(page: Page, name: string): string | null {
  const token = new URL(page.url()).hash.substring(1).split(';').find((part) => part.startsWith(`${name}:`))
  return token ? token.substring(name.length + 1) : null
}
