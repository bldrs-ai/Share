import {expect, test} from '@playwright/test'
import type {Page} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'
import {waitForModelReady} from '../../tests/e2e/models'


// The geometry worker pool's size gate (Share#1760).
//
// Standing the pool up is a fixed cost charged before the first product is
// touched — 0.74 s at N=1 and 1.4 s at N=4 in a browser — and `index.ifc`
// spends 0.035 s in geometry. So the bare `?feature=workers` declines below
// `MIN_POOL_SOURCE_MB` and the main-thread pump serves the load.
//
// This lives in its own spec rather than in `geometryWorkers.spec.ts` because
// it asserts the pool DOESN'T run, and every test in that file is built around
// the pool running: they pin a count precisely so it does.
//
// What only a browser run can establish here: that the size the gate reads is
// the size of the model Share actually opened. The unit tests drive
// `geometryWorkerCount` with a number and the loader with a 4-byte
// ArrayBuffer; neither can catch the loader handing over the size of the wrong
// thing — a Blob wrapper's, or a store handle's — which would read as a
// plausible number and gate on nothing.
const POOL_LINE = /\[conwayDirect\] geometry workers: n=(\d+) /
const DECLINED_LINE = /\[conwayDirect\] geometry worker pool declined: source /
const PARSED_LINE = /\[conwayDirect\] parsed .*vertices=(\d+) /


/**
 * Load a model and collect the loader's console milestones.
 *
 * @param page the Playwright page
 * @param url the share URL to open
 * @return every console line the page emitted during the load
 */
async function loadCollectingLogs(page: Page, url: string): Promise<string[]> {
  const lines: string[] = []
  page.on('console', (msg) => lines.push(msg.text()))
  await page.goto(url)
  await waitForModelReady(page)
  return lines
}


describeMobileAndDesktop('viewer/ifc: geometry worker pool size gate', (formFactor) => {
  test.beforeEach(async ({page}) => {
    await page.setViewportSize(
      formFactor.isMobile ? {width: 390, height: 844} : {width: 1280, height: 800})
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('declines the pool on a model too small to pay for it', async ({page}) => {
    const lines = await loadCollectingLogs(page, '/share/v/p/index.ifc?feature=workers')

    // Said out loud, and asserted, because `?feature=workers` followed by
    // silence is exactly what a pool that FAILED looks like — this PR's smoke
    // instructions read an absent summary line as a fallback to report, so a
    // decline that did not announce itself would be read as a bug.
    expect(lines.some((line) => DECLINED_LINE.test(line))).toBe(true)
    expect(lines.some((line) => POOL_LINE.test(line))).toBe(false)

    // ...and the load still happened, on the main-thread pump.
    const parsed = lines.find((line) => PARSED_LINE.test(line))
    expect(parsed).toBeDefined()
    expect(Number(parsed?.match(PARSED_LINE)?.[1])).toBeGreaterThan(0)
  })

  test('a pinned count overrides the gate on the same small model', async ({page}) => {
    // The escape hatch, and the reason the whole geometry-worker E2E suite
    // still means something: it pins counts on small fixtures because a tiny
    // model makes the machinery cheap to exercise. A gate that silently
    // overrode the pin would leave those specs comparing two single-threaded
    // loads and passing forever — the same "a typo produces a baseline run you
    // then believe" failure the unknown-`?feature=` warning exists to prevent.
    const lines = await loadCollectingLogs(page, '/share/v/p/index.ifc?feature=workers2')

    const pool = lines.find((line) => POOL_LINE.test(line))
    expect(pool).toBeDefined()
    expect(pool?.match(POOL_LINE)?.[1]).toBe('2')
    expect(lines.some((line) => DECLINED_LINE.test(line))).toBe(false)
  })
})
