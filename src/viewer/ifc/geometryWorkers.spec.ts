import {expect, test} from '@playwright/test'
import type {Page} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'


// Geometry worker pool (conway#394 M3, `?feature=workers`). Extraction moves
// off the main thread into N conway instances, each pumping a disjoint shard
// of the model's products, and the placements come back as transferable
// columns the main thread reassembles.
//
// What only an end-to-end run can establish, and unit tests cannot:
//   - the worker bundle actually loads and its conway wasm initialises in a
//     Worker, which Share has never done for conway before (only the GLB
//     writer runs in a worker today);
//   - N workers can read the same OPFS-backed source concurrently — the
//     reason the pool posts a `File` and slices it rather than taking an
//     OPFS sync access handle, which is exclusive per file;
//   - a sharded load assembles the SAME model a single-threaded one does.
//
// The pool line is asserted rather than just "the model rendered", because
// the pool declines to run on any source that is not store-backed. Without
// that assertion a route whose model never reaches the store path would let
// this whole spec pass while exercising nothing.
const POOL_LINE =
  /\[conwayDirect\] geometry workers: n=(\d+) placements=(\d+) geometries=(\d+) wasmHeapMb=(\d+) frame=\[([^\]]*)\]/
const PARSED_LINE = /\[conwayDirect\] parsed .*vertices=(\d+) triangles=(\d+) instances=(\d+)/

/* Share opens with COORDINATE_TO_ORIGIN, so the frame a load applies always
 * carries at least the Z-up -> Y-up normalize. Identity means no frame was
 * derived — see the assertion below. */
const IDENTITY_MAT4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


/* An assembly-first steel export (SDS/2, the same family as the D3D model
 * Share#1761 was reported against): 296 products, of which the first 49 are
 * IfcElementAssembly containers that emit no geometry at all.
 *
 * Both properties are load-bearing and neither holds for `index.ifc`, which
 * is what the rest of this spec runs on:
 *
 *   - 296 products genuinely span shards (index.ifc has SEVEN, so at any N
 *     most shards own nothing and the partition is never exercised);
 *   - the geometry-less prefix is what makes the frame assertion able to
 *     fail. The frame anchors on the first product that emits geometry, so a
 *     model whose product #1 has a representation — index.ifc, Momentum,
 *     Seestrasse — anchors before anything can go wrong. Here it does not
 *     anchor until product 50, which is exactly the case the pool got wrong
 *     (Share#1761).
 */
const ASSEMBLY_MODEL =
  '/share/v/gh/bldrs-ai/test-models/main/ifc/openifcmodels/171210AISC_Sculpture_param.ifc'

/* Two full loads of a 296-product model, on a cold conway wasm init each. */
const COMPARISON_TIMEOUT_MS = 300_000


/**
 * Every parent expressID the assembled model actually carries.
 *
 * Read off the scene rather than off a log line, because identity is the
 * whole point: counts agree in every failure mode this spec exists to catch
 * (a rotated model has identical vertices/triangles/instances; a dropped
 * product and a doubled one cancel in a total). `instanceParents` is stamped
 * per batch by `IncrementalBatchedBuilder.finalize`.
 *
 * @param page the Playwright page, on a loaded model
 * @return the sorted, de-duplicated expressID set
 */
function renderedProductIds(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const model = (window as any).useStore.getState()
      .viewer?.IFC?.context?.items?.ifcModels?.[0]
    const ids = new Set<number>()
    const walk = (object: any) => {
      if (!object?.isBatchedMesh) {
        return
      }
      for (const parent of object.instanceParents ?? []) {
        ids.add(parent)
      }
    }
    if (model?.isBatchedMesh) {
      walk(model)
    } else {
      model?.traverse?.(walk)
    }
    return [...ids].sort((a, b) => a - b)
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * The first console line matching `pattern`, failing with everything that
 * WAS collected when there is none — a missing milestone otherwise reads as
 * an inscrutable "cannot read property of undefined".
 *
 * @param lines collected console output
 * @param pattern the milestone to find
 * @return the match
 */
function firstMatch(lines: string[], pattern: RegExp): RegExpMatchArray {
  for (const line of lines) {
    const match = line.match(pattern)
    if (match) {
      return match
    }
  }
  throw new Error(
    `no line matching ${pattern} in:\n${lines.join('\n') || '(nothing collected)'}`)
}


/**
 * Load a model and collect the loader's console milestones.
 *
 * @param page the Playwright page
 * @param url the share URL to open
 * @return matched console lines
 */
async function loadCollectingLogs(page: Page, url: string): Promise<string[]> {
  const lines: string[] = []
  page.on('console', (msg) => {
    const text = msg.text()
    if (POOL_LINE.test(text) || PARSED_LINE.test(text)) {
      lines.push(text)
    }
  })
  page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))
  await page.goto(url)
  await waitForModelReady(page)
  return lines
}


describeMobileAndDesktop('viewer/ifc: geometry worker pool', (formFactor) => {
  test.beforeEach(async ({page}) => {
    await page.setViewportSize(
      formFactor.isMobile ? {width: 390, height: 844} : {width: 1280, height: 800})
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('extracts a model across two workers and renders it', async ({page}) => {
    const lines = await loadCollectingLogs(
      page, '/share/v/p/index.ifc?feature=workers2')

    const pool = firstMatch(lines, POOL_LINE)

    // The pool ran, at the pinned width, and delivered work. `n=2` is the
    // pinned count rather than the machine's, so this reads the same on a
    // CI runner as on a workstation.
    expect(pool[1]).toBe('2')
    expect(Number(pool[2])).toBeGreaterThan(0)
    expect(Number(pool[3])).toBeGreaterThan(0)

    // The frame handed to the workers must be the one a single-threaded load
    // would apply — NOT identity.
    //
    // This is the assertion the first version of this spec was missing, and
    // the bug it missed: the frame is derived from the first geometry a model
    // captures, so read before anything is pumped it comes back identity, and
    // supplying identity SUPPRESSES the recentre each worker would otherwise
    // derive. The Z-up -> Y-up normalize lives in that frame, so the whole
    // model rendered 90 degrees out — while vertices, triangles and instances,
    // which is all this spec compared, stayed identical, because they are
    // rotation-invariant.
    const frame = pool[5].split(',').map(Number)
    expect(frame.length).toBe(IDENTITY_MAT4.length)
    expect(frame).not.toEqual(IDENTITY_MAT4)

    // And the durable model built from what the workers sent.
    const parsed = firstMatch(lines, PARSED_LINE)
    expect(Number(parsed[1])).toBeGreaterThan(0)
    expect(Number(parsed[3])).toBeGreaterThan(0)
  })

  test('assembles the same model a single-threaded load does', async ({page}) => {
    // The milestone's bar: sharding changes WHERE extraction runs, not what
    // it produces. Vertices, triangles and instances are the three counts
    // that move if a shard dropped a product, claimed one twice, or rebuilt
    // shared geometry the other shard already had.
    const sharded = await loadCollectingLogs(
      page, '/share/v/p/index.ifc?feature=workers2')

    // Asserted here too, not just in the test above: without it a change
    // that stopped the pool engaging would leave this comparing two
    // single-threaded loads and passing forever.
    expect(firstMatch(sharded, POOL_LINE)[1]).toBe('2')

    const shardedStats = firstMatch(sharded, PARSED_LINE)

    await page.goto('about:blank')

    const single = await loadCollectingLogs(page, '/share/v/p/index.ifc')
    const singleStats = firstMatch(single, PARSED_LINE)

    expect(shardedStats.slice(1, 4)).toEqual(singleStats.slice(1, 4))
  })

  test('anchors the frame on a model that leads with geometry-less products', async ({page}) => {
    // Share#1761. The pool used to seed exactly ONE product to derive the
    // frame, on the reasoning that a single-threaded load anchors on the
    // first product too. It does — but `extracted` counts PRODUCTS, and a
    // product with no representation anchors nothing. This model's first 49
    // are assembly containers, so the seed read conway's not-yet-anchored
    // IDENTITY and handed it to every worker, where it was APPLIED:
    // suppressing the recentre and the Z-up -> Y-up normalize with it, and
    // rendering the whole model on its side.
    //
    // Nothing in the test above can catch that. It runs on index.ifc, whose
    // product #1 has geometry, so the one-product seed anchors correctly
    // there — and vertices, triangles and instances are rotation-invariant
    // anyway, which is the same blind spot that let the first revision of
    // this PR ship a 90-degree rotation through the whole suite.
    test.setTimeout(COMPARISON_TIMEOUT_MS)
    await setupVirtualPathIntercept(page, ASSEMBLY_MODEL, '')

    const lines = await loadCollectingLogs(page, `${ASSEMBLY_MODEL}?feature=workers4`)

    const pool = firstMatch(lines, POOL_LINE)
    expect(pool[1]).toBe('4')

    const frame = pool[5].split(',').map(Number)
    expect(frame.length).toBe(IDENTITY_MAT4.length)
    expect(frame).not.toEqual(IDENTITY_MAT4)
  })

  test('renders the same products across four shards as a single-threaded load', async ({page}) => {
    // The identity assertion #1761 asked for: which products reached the
    // model, not how many vertices they carried between them. A count says
    // something is wrong; a set difference names the product and lets you go
    // read its records.
    //
    // Four shards over 296 products means every shard owns ~74 of them, so a
    // partition that dropped a product, claimed one twice, or resolved an
    // ownership key differently in one worker than another shows up here as
    // a concrete missing or extra expressID.
    test.setTimeout(COMPARISON_TIMEOUT_MS)
    await setupVirtualPathIntercept(page, ASSEMBLY_MODEL, '')

    const sharded = await loadCollectingLogs(page, `${ASSEMBLY_MODEL}?feature=workers4`)
    // Without this the whole test degrades to comparing two single-threaded
    // loads and passes forever.
    expect(firstMatch(sharded, POOL_LINE)[1]).toBe('4')
    const shardedIds = await renderedProductIds(page)
    const shardedStats = firstMatch(sharded, PARSED_LINE)

    await page.goto('about:blank')

    const single = await loadCollectingLogs(page, ASSEMBLY_MODEL)
    const singleIds = await renderedProductIds(page)
    const singleStats = firstMatch(single, PARSED_LINE)

    // The fixture has to actually reach the batched path for the sets to
    // mean anything — an empty set equals an empty set.
    expect(singleIds.length).toBeGreaterThan(0)
    expect(shardedIds).toEqual(singleIds)
    // Totals too, which catch a shard that rebuilt shared geometry the
    // other already had — same products, different vertex count.
    expect(shardedStats.slice(1, 4)).toEqual(singleStats.slice(1, 4))
  })
})
