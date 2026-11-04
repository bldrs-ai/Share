import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {waitForModelReady} from '../tests/e2e/models'
import {homepageSetup, pauseViewerRendering, setIsReturningUser} from '../tests/e2e/utils'


/**
 * The engine session layer (engine-worker.md §7 step 2), driven through the
 * `?feature=engineWorker` dev hook `window.__bldrsEngine`
 * (src/engine/engineDevHook.js). No product load goes through it yet, so
 * the page's own load is just the way to get an app with the hook
 * installed; the session under test opens its own copy of `index.ifc`.
 *
 * What it proves, on the REAL pinned Conway (Jest only runs a stub):
 *   - the engine runs in a module Worker built from `Engine.worker.js` —
 *     which is also what proves conway#540's platform prelude works, since
 *     without it `Init()` dies loading the Node wasm;
 *   - an index-only open, the spatial tree and property reads answer across
 *     the boundary;
 *   - the in-process transport (the permanent main-thread fallback, §8 item
 *     6) gives the same answers through the same protocol.
 *
 * `index.ifc` is the Bldrs logo: seven `Together` IfcBuildingElementProxy
 * elements.
 */
const IFC_PATH = '/share/v/p/index.ifc?feature=engineWorker'
const PROXY_TYPE = 'IFCBUILDINGELEMENTPROXY'
const PROXY_LABEL = 'Together'
const PROXY_COUNT = 7


interface ProbeResult {
  kind: string
  wasmBytesAtInit: number
  opened: {modelID: number, windowed: boolean}
  rootType: string
  proxyIds: number[]
  proxyNames: string[]
  closedRead: string
}


/**
 * Spawn a session, open `index.ifc` in it, read the tree and every proxy's
 * name, then close it and make one more read, which must be refused.
 *
 * @param page
 * @param inProcess force the main-thread transport
 * @return what the session answered, as plain data
 */
async function probe(page: Page, inProcess: boolean): Promise<ProbeResult> {
  return await page.evaluate(async ({inProcess: forceInProcess, proxyType}) => {
    interface Node {expressID: number, type: string, children?: Node[]}
    const engine = (window as unknown as {__bldrsEngine: Record<string, (...args: unknown[]) => Promise<unknown>>})
      .__bldrsEngine
    const spawned = await engine.spawn({inProcess: forceInProcess}) as {handle: number, kind: string, wasmBytes: number}
    const opened = await engine.open(spawned.handle, '/index.ifc') as {modelID: number, windowed: boolean}
    const tree = await engine.tree(spawned.handle, {mode: 'names'}) as Node
    const proxyIds: number[] = []
    const stack: Node[] = [tree]
    while (stack.length > 0) {
      const node = stack.pop() as Node
      if (node.type === proxyType) {
        proxyIds.push(node.expressID)
      }
      stack.push(...(node.children ?? []))
    }
    const proxyNames: string[] = []
    for (const id of proxyIds) {
      const record = await engine.properties(spawned.handle, id) as {Name?: {value?: string}}
      proxyNames.push(record?.Name?.value ?? '')
    }
    await engine.close(spawned.handle)
    let closedRead = 'answered'
    try {
      await engine.tree(spawned.handle)
    } catch (e) {
      closedRead = (e as Error).message
    }
    return {
      kind: spawned.kind,
      wasmBytesAtInit: spawned.wasmBytes,
      opened: {modelID: opened.modelID, windowed: opened.windowed},
      rootType: tree.type,
      proxyIds,
      proxyNames,
      closedRead,
    }
  }, {inProcess, proxyType: PROXY_TYPE})
}


describeMobileAndDesktop('Engine session', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await page.goto(IFC_PATH)
    await waitForModelReady(page)
    await pauseViewerRendering(page)
    await page.waitForFunction(() => typeof (window as unknown as Record<string, unknown>).__bldrsEngine === 'object')
  })

  test('a worker engine opens index.ifc at its index and answers the tree and properties', async ({page}) => {
    const workerUrls: string[] = []
    // close() must terminate the worker, which is what frees its engine
    // (engine-worker.md §3): Playwright sees a terminated worker close.
    const engineWorkerClosed = new Promise<boolean>((resolve) => {
      page.on('worker', (worker) => {
        workerUrls.push(worker.url())
        if (worker.url().endsWith('/Engine.worker.js')) {
          worker.on('close', () => resolve(true))
        }
      })
    })
    const result = await probe(page, false)
    const CLOSE_WAIT_MS = 10_000
    expect(await Promise.race([
      engineWorkerClosed,
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), CLOSE_WAIT_MS)),
    ])).toBe(true)

    expect(result.kind).toBe('worker')
    // The engine really is the worker bundle, not the page's own Conway.
    expect(workerUrls.some((url) => url.endsWith('/Engine.worker.js')), workerUrls.join(', ')).toBe(true)
    // Init ran in the worker: an instantiated wasm heap (16 MB on the pin).
    expect(result.wasmBytesAtInit).toBeGreaterThan(0)
    // A fetched Blob opens windowed, as an OPFS-staged File does.
    expect(result.opened).toEqual({modelID: 0, windowed: true})
    expect(result.rootType).toBe('IFCPROJECT')
    expect(result.proxyIds).toHaveLength(PROXY_COUNT)
    expect(result.proxyNames).toEqual(Array(PROXY_COUNT).fill(PROXY_LABEL))
    expect(result.closedRead).toBe('engine session closed')
  })

  test('the in-process fallback gives the same answers through the same protocol', async ({page}) => {
    const inProcess = await probe(page, true)
    const worker = await probe(page, false)
    expect(inProcess.kind).toBe('inProcess')
    expect(worker.kind).toBe('worker')
    // Everything the model answered, which must not depend on the transport.
    // (Not the wasm heap size: that is the engine's, and need not match.)
    const answers = ({opened, rootType, proxyIds, proxyNames, closedRead}: ProbeResult) =>
      ({opened, rootType, proxyIds, proxyNames, closedRead})
    expect(inProcess.proxyNames).toEqual(Array(PROXY_COUNT).fill(PROXY_LABEL))
    expect(answers(inProcess)).toEqual(answers(worker))
  })
})
