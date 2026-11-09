import {expect, test} from '@playwright/test'
import {doubleClickSelectsAnElement, expectModelOnCanvas} from '../tests/e2e/export'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {waitForModelReady} from '../tests/e2e/models'
import {clearOpfs, homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


// The hosted demo IFC: a batched model, opened from the project's own copy.
const MODEL_PATH = '/share/v/p/index.ifc'
const TEST_TIMEOUT_MS = 120_000
const MODEL_READY_TIMEOUT_MS = 60_000


// Share#2094. Firefox has no WEBGL_multi_draw, so three draws a BatchedMesh
// one instance at a time. Here the extension is hidden from Chromium's
// contexts: the load report has to say so, and the model has to draw and pick
// as before through three's per-instance fallback.
describeMobileAndDesktop('Renderer without WEBGL_multi_draw', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await clearOpfs(page)
  })

  test('a batched model reports the fallback, and still draws and picks', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await page.addInitScript(() => {
      // Loosely typed on purpose: lib.dom types getExtension as one overload
      // per extension name, which a pass-through wrapper cannot satisfy.
      type GetExtension = (this: unknown, name: string) => unknown
      for (const Context of [globalThis.WebGL2RenderingContext, globalThis.WebGLRenderingContext]) {
        if (!Context) {
          continue
        }
        const proto = Context.prototype as unknown as {getExtension: GetExtension}
        const getExtension = proto.getExtension
        proto.getExtension = function(name: string) {
          return name === 'WEBGL_multi_draw' ? null : getExtension.call(this, name)
        }
      }
    })
    await page.goto(MODEL_PATH, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page, MODEL_READY_TIMEOUT_MS)

    await expect.poll(() => page.evaluate(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).store.getState().loadReportLines as string[]).filter((line) =>
        line.startsWith('Renderer: WEBGL_multi_draw unsupported')).length)).toBe(1)
    // Non-vacuity: the extension really is hidden from the renderer that draws.
    expect(await page.evaluate(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).store.getState().viewer.context.getRenderer().extensions.has('WEBGL_multi_draw')))
      .toBe(false)

    await expectModelOnCanvas(page, 'a batched model drawn without multi-draw')
    await doubleClickSelectsAnElement(page, 'instanced')
  })

  test('says nothing when the renderer has WEBGL_multi_draw', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await page.goto(MODEL_PATH, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page, MODEL_READY_TIMEOUT_MS)
    await expect.poll(() => page.evaluate(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).store.getState().loadReportLines as string[]).some((line) => line.startsWith('Total'))))
      .toBe(true)
    expect(await page.evaluate(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).store.getState().loadReportLines as string[]).filter((line) =>
        line.startsWith('Renderer:')))).toEqual([])
  })
})
