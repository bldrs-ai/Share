import {expect, test} from '@playwright/test'
import {setupVirtualPathIntercept, waitForModelReady} from '../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


/**
 * Scene-highlight survival for an element-path permalink whose model FILENAME
 * starts with digits (the #1639 follow-up report).
 *
 * What this pins: `CadView#selectElementBasedOnFilepath` is called twice on a
 * fresh permalink load — once by the location watcher with the already-split
 * element path (which restores the right selection), and once post-load with
 * the full source path, whose last '/'-segment is the model FILENAME. For a
 * digit-prefixed filename (171210AISC_Sculpture_param.ifc here; an OPFS
 * upload's hex UUID hits the same ~62% of the time), `parseInt` used to read
 * a finite "element id" (171210) out of the filename and CLOBBER the restored
 * selection — the NavTree kept its highlight moment but the scene recolor was
 * cleared and Properties pointed at a nonexistent element. The fix normalizes
 * both callers to the element path below the file suffix and requires
 * whole-segment-numeric ids.
 *
 * The scene highlight has no DOM, so the scene-side assertions read the
 * exposed store/viewer (`window.useStore` — exposed for debugging in
 * useStore.js) rather than pixels: the batched selection layer (live batched
 * model) or the merged-path selection subsets (cache-hit model), whichever
 * render path is active.
 */
const {describe} = test

const MODEL_PATH = '/share/v/gh/bldrs-ai/test-models/main/ifc/openifcmodels/171210AISC_Sculpture_param.ifc'
// Element path written by selecting plate 'p58' — project root down to the element.
const ELEMENT_PERMALINK = `${MODEL_PATH}/120010/120020/120023/4998/2867`
const TEST_TIMEOUT_MS = 180_000
// Cache-hit test: two full loads plus the OPFS GLB write wait between them.
const CACHE_HIT_TIMEOUT_MS = 300_000
const SETTLE_MS = 3_000


/** Shared setup: mocks, returning-user cookie, model intercept. */
async function permalinkSetup(page: import('@playwright/test').Page) {
  page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))
  await homepageSetup(page)
  await setIsReturningUser(page.context())
  await setupVirtualPathIntercept(page, MODEL_PATH, '')
}

describe('Element-path permalink on a digit-prefixed filename', () => {
  test('restores selection and keeps the scene highlight', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await permalinkSetup(page)

    // Land directly on the permalink with the NavTree open (`#n:`), like a
    // shared link.
    await page.goto(`${ELEMENT_PERMALINK}#n:`, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    // Let the post-load selection pass (the clobber window) fully settle.
    await page.waitForTimeout(SETTLE_MS)

    // NavTree: exactly the one addressed row is selected.
    await expect(page.getByTestId('NavTreePanel')).toBeVisible()
    await expect(page.locator('[data-is-selected="true"]')).toHaveCount(1)

    // Store + scene: the selection is the URL's element (not a filename
    // parse), and the scene carries a live highlight for it.
    const sel = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const st = (window as any).useStore.getState()
      const v = st.viewer
      const models = v?.IFC?.context?.items?.ifcModels
      const m = models?.[0]
      let batchedSelSetTotal = 0
      const walk = (o: any) => {
        if (o.isBatchedMesh) {
          batchedSelSetTotal += o.userData?.batchedHighlight?.selSet?.size ?? 0
        }
      }
      if (m?.isBatchedMesh) {
        walk(m)
      } else {
        m?.traverse?.(walk)
      }
      return {
        selectedElements: st.selectedElements,
        batchedSelSetTotal,
        mergedSubsets: v?._conwaySelectionSubsets?.length ?? 0,
      }
      /* eslint-enable @typescript-eslint/no-explicit-any */
    })
    expect(sel.selectedElements).toEqual(['2867'])
    expect(sel.batchedSelSetTotal + sel.mergedSubsets).toBeGreaterThan(0)
  })

  // The cache-hit leg is where all three #1639 follow-up reports lived (pick
  // resolving the wrong element, highlight landing on nearby other parts,
  // face permalink losing the scene highlight): the BVH build permuted
  // geometry.index AFTER the per-triangle maps were built from
  // BLDRS_face_ids. It can't run in this harness yet: the playwright build
  // sets `OPFS_IS_ENABLED: false` (OPFS-worker fetches bypass the MSW
  // service worker — see tools/esbuild/vars.playwright.js), so a reload
  // re-parses live instead of hitting the GLB cache. fixme'd like the other
  // cacheHit specs until that harness fix lands; until then the alignment
  // invariant is pinned by Loader.restoreCacheHitPicking.test.js and the
  // selection restore by the live-path test above.
  test.fixme('cache-hit reload keeps selection, highlight, and table↔geometry alignment', async ({page}) => {
    test.setTimeout(CACHE_HIT_TIMEOUT_MS)
    await permalinkSetup(page)

    await page.goto(`${ELEMENT_PERMALINK}#n:`, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    await page.waitForTimeout(SETTLE_MS)

    // Wait for the GLB cache write, then reload into the cache-hit path.
    await page.waitForFunction(async () => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const walk = async (dir: any): Promise<boolean> => {
        for await (const [name, handle] of (dir as any).entries()) {
          if (handle.kind === 'directory') {
            if (await walk(handle)) {
              return true
            }
          } else if (name.includes('.glb')) {
            return true
          }
        }
        return false
      }
      return walk(await navigator.storage.getDirectory())
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }, undefined, {timeout: 120_000})

    await page.reload({waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    await page.waitForTimeout(SETTLE_MS)

    const hit = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const st = (window as any).useStore.getState()
      const v = st.viewer
      const m = v?.IFC?.context?.items?.ifcModels?.[0]
      let meshes = 0
      let misaligned = 0
      m?.traverse?.((o: any) => {
        if (!o.isMesh || !o.instanceMap) {
          return
        }
        meshes++
        const idx = o.geometry.index
        const instAttr = o.geometry.attributes.instanceID ?? o.geometry.attributes._INSTANCEID
        if (!idx || !instAttr) {
          return
        }
        const triCount = (idx.count / 3) | 0
        for (let t = 0; t < triCount; t++) {
          if (o.instanceMap.getInstanceIdByTriangle(t) !== instAttr.getX(idx.getX(3 * t))) {
            misaligned++
          }
        }
      })
      return {
        selectedElements: st.selectedElements,
        mergedSubsets: v?._conwaySelectionSubsets?.length ?? 0,
        meshes,
        misaligned,
        // Diagnostics (not asserted): which selection path can this model
        // take, and did the maps attach? Shown in the failure context.
        capabilities: m?.capabilities ?? null,
      }
      /* eslint-enable @typescript-eslint/no-explicit-any */
    })
    // eslint-disable-next-line no-console
    console.log('cache-hit state:', JSON.stringify(hit))
    // Selection restored from the URL on the cache-hit load too, with a
    // live merged-path highlight.
    expect(hit.selectedElements).toEqual(['2867'])
    expect(hit.mergedSubsets).toBeGreaterThan(0)
    // The picking tables agree with the geometry on every triangle — fails
    // if the BVH build ever goes back to permuting the index in place.
    expect(hit.meshes).toBeGreaterThan(0)
    expect(hit.misaligned).toBe(0)
  })
})
