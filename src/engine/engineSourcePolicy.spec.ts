import {Page, expect, test} from '@playwright/test'
import {watchEngineWorker} from '../tests/e2e/engineWorker'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {captureGlbLogs, resetGlbLogs, waitForGlbLog} from '../tests/e2e/glbLogs'
import {waitForModelReady} from '../tests/e2e/models'
import {homepageSetup, pauseViewerRendering, resumeViewerRendering, setIsReturningUser} from '../tests/e2e/utils'


/**
 * The engine's source policy (engine/sourcePolicy.js, Share#2139;
 * engine-worker.md §"Source policy: buffer for the parse, window at rest"),
 * end to end in a real Chromium: a model staged in OPFS opens BUFFERED by
 * default (the whole file read once through the sync access handle, under
 * the device's cap), still saves its index sidecar, and a reopen from that
 * sidecar comes up WINDOWED from the index with the same tree; IFC and STEP
 * alike, through the same code.
 *
 * The signal is the load report's `Engine source:` line
 * (engine/engineModelLoad.js#sourceModeLine), beside `Engine index:` and the
 * worker pump's `windowed=` console line, which says what conway actually
 * opened. The two switches: `disableBufferedSource` (the kill switch) gives
 * back the windowed open over the sync access handle, and
 * `disableEngineSyncHandle` (the Firefox/Safari path forced in Chromium)
 * gives the buffered open over the bytes the Blob store held.
 *
 * Both fixtures are tiny, so every form factor is under every cap; the cap
 * itself is unit-tested (sourcePolicy.test.js), as is the allocation
 * fallback (engineSourcePolicy.test.js), which a real browser can't be made
 * to hit on a small file.
 */
const MODELS = [
  {name: 'IFC', path: '/share/v/p/index.ifc'},
  {name: 'STEP', path: '/share/v/p/index.step'},
]
const LOAD_TIMEOUT_MS = 90_000
const CACHE_TIMEOUT_MS = 60_000


/** What the spec reads off a finished load. */
interface LoadSignals {
  sourceLine: string | undefined
  sourceIoLine: string | undefined
  indexLine: string | undefined
}


/**
 * Wait for the load, then read its report lines.
 *
 * @param page
 * @return the three engine lines of the finished load
 */
async function loadSignals(page: Page): Promise<LoadSignals> {
  await waitForModelReady(page, LOAD_TIMEOUT_MS)
  await page.waitForFunction(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lines = (window as any).store.getState().loadReportLines as string[]
    return lines.some((line) => line.startsWith('Engine index:'))
  }, null, {timeout: LOAD_TIMEOUT_MS})
  return await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lines = (window as any).store.getState().loadReportLines as string[]
    const find = (prefix: string) => lines.find((line) => line.startsWith(prefix))
    return {
      sourceLine: find('Engine source:'),
      sourceIoLine: find('Engine source I/O:'),
      indexLine: find('Engine index:'),
    }
  })
}


/**
 * The worker pump's console line, which says whether conway opened the
 * model windowed (engine/engineModelLoad.js).
 *
 * @param page
 * @return the lines seen so far, live
 */
function watchPumpLines(page: Page): string[] {
  const lines: string[] = []
  page.on('console', (msg) => {
    if (msg.text().includes('engine worker pump:')) {
      lines.push(msg.text())
    }
  })
  return lines
}


/**
 * The model's tree, as the NavTree reads it (the store's `rootElement`),
 * and one property read through the engine: the middle leaf's
 * `getItemProperties`. The same signature the source-mode bench takes
 * (tools/bench/sourceModes/pageProbe.mjs), so a reopen can be compared with
 * its cold load.
 *
 * @param page
 * @return node rows, and the leaf's id and property record as JSON
 */
async function modelSignature(page: Page): Promise<{rows: string[], leafId: number, props: string}> {
  return await page.evaluate(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const state = (window as any).store.getState()
    const rows: string[] = []
    const leaves: number[] = []
    const visit = (node: any) => {
      const kids = node.children ?? []
      rows.push(`${node.expressID ?? ''}|${node.Name?.value ?? node.name ?? ''}|${kids.length}`)
      if (kids.length === 0 && Number.isInteger(node.expressID)) {
        leaves.push(node.expressID)
      }
      kids.forEach(visit)
    }
    visit(state.rootElement)
    const leafId = leaves[Math.floor(leaves.length / 2)]
    const props = await state.model.getItemProperties(leafId)
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return {rows, leafId, props: JSON.stringify(props)}
  })
}


/**
 * Wait for this load's GLB artifact, then remove every `.glb` from OPFS, so
 * the reload opens through its engine and the sidecar (as
 * engineSidecar.spec.ts#dropGlbArtifact does, and for the same reason).
 *
 * @param page
 * @param glbLogs
 * @return how many artifacts were removed
 */
async function dropGlbArtifact(page: Page, glbLogs: string[]): Promise<number> {
  await pauseViewerRendering(page)
  await waitForGlbLog(glbLogs, 'writer: wrote', CACHE_TIMEOUT_MS)
  await resumeViewerRendering(page)
  return await page.evaluate(async () => {
    let removed = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const walk = async (dir: any) => {
      const names: string[] = []
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'directory') {
          await walk(handle)
        } else if (name.includes('.glb')) {
          names.push(name)
        }
      }
      for (const name of names) {
        await dir.removeEntry(name)
        removed++
      }
    }
    await walk(await navigator.storage.getDirectory())
    return removed
  })
}


describeMobileAndDesktop('Engine source policy', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  for (const {name, path} of MODELS) {
    test(`a ${name} opens buffered by default, saves its sidecar, and reopens windowed from it`, async ({page}) => {
      test.setTimeout(3 * LOAD_TIMEOUT_MS)
      const glbLogs = captureGlbLogs(page)
      const pump = watchPumpLines(page)
      const engine = watchEngineWorker(page)
      await page.goto(path)
      const cold = await loadSignals(page)
      await engine.expectWorkerEngine()
      expect(cold.sourceLine).toMatch(/^Engine source: buffered \(\d+\.\d MB, cap \d+ MB\)$/)
      // Buffered: nothing pages from a store, so no source I/O line; and the
      // engine itself says so.
      expect(cold.sourceIoLine).toBeUndefined()
      expect(pump, pump.join('\n')).toHaveLength(1)
      expect(pump[0]).toContain('windowed=no')
      expect(cold.indexLine).toMatch(/^Engine index: parsed; sidecar saved \(\d+\.\d MB\)$/)
      const coldModel = await modelSignature(page)
      expect(coldModel.rows.length).toBeGreaterThan(1)
      expect(coldModel.props).toContain(`"expressID":${coldModel.leafId}`)
      // The writer's spill releases the buffered source to windows.
      await pauseViewerRendering(page)
      await waitForGlbLog(glbLogs, 'released resident source buffer', CACHE_TIMEOUT_MS)
      await resumeViewerRendering(page)
      expect(await dropGlbArtifact(page, glbLogs), 'the load cached one artifact').toBe(1)

      resetGlbLogs(glbLogs)
      pump.length = 0
      const reopenEngine = watchEngineWorker(page)
      await page.reload()
      const reopen = await loadSignals(page)
      await reopenEngine.expectWorkerEngine()
      expect(reopen.indexLine).toMatch(/^Engine index: from sidecar \(\d+\.\d MB\), no parse$/)
      expect(reopen.sourceLine).toBe('Engine source: windowed (index reopen)')
      expect(reopen.sourceIoLine).toMatch(/^Engine source I\/O: OPFS sync access handle, [1-9]\d* reads/)
      expect(pump.at(-1)).toContain('windowed=yes')
      const reopenModel = await modelSignature(page)
      expect(reopenModel.rows).toEqual(coldModel.rows)
      expect(reopenModel.props).toEqual(coldModel.props)
    })
  }

  for (const {name, path} of MODELS) {
    test(`with disableBufferedSource a ${name} opens windowed over the sync access handle`, async ({page}) => {
      test.setTimeout(LOAD_TIMEOUT_MS)
      const pump = watchPumpLines(page)
      const engine = watchEngineWorker(page)
      await page.goto(`${path}?feature=disableBufferedSource`)
      const signals = await loadSignals(page)
      await engine.expectWorkerEngine()
      expect(signals.sourceLine).toBe('Engine source: windowed (disableBufferedSource)')
      expect(signals.sourceIoLine).toMatch(/^Engine source I\/O: OPFS sync access handle, [1-9]\d* reads/)
      expect(pump.at(-1)).toContain('windowed=yes')
      expect(signals.indexLine).toMatch(/^Engine index: parsed; sidecar saved/)
    })
  }

  for (const {name, path} of MODELS) {
    test(`on the Blob store (the Firefox/Safari path) a ${name} opens buffered over the held bytes`, async ({page}) => {
      test.setTimeout(LOAD_TIMEOUT_MS + CACHE_TIMEOUT_MS)
      const glbLogs = captureGlbLogs(page)
      const pump = watchPumpLines(page)
      const engine = watchEngineWorker(page)
      await page.goto(`${path}?feature=disableEngineSyncHandle`)
      const signals = await loadSignals(page)
      await engine.expectWorkerEngine()
      expect(signals.sourceLine).toMatch(/^Engine source: buffered \(\d+\.\d MB, held by the Blob store\)$/)
      expect(signals.sourceIoLine).toBeUndefined()
      expect(pump.at(-1)).toContain('windowed=no')
      expect(signals.indexLine).toMatch(/^Engine index: parsed; sidecar saved/)
      const model = await modelSignature(page)
      expect(model.props).toContain(`"expressID":${model.leafId}`)
      // The writer's spill releases the held bytes the open was given: the
      // default path on Firefox and Safari must not keep the file resident.
      await pauseViewerRendering(page)
      await waitForGlbLog(glbLogs, 'released resident source buffer', CACHE_TIMEOUT_MS)
      await resumeViewerRendering(page)
    })
  }
})
