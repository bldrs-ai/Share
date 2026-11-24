import {expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {waitForModelReady} from '../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


const {beforeEach} = test


/**
 * One viewer per model. The Playwright build is a development build, so
 * React StrictMode runs CadView's mount effects twice. The [modelPath] effect
 * used to build a ShareViewer, and a WebGL context, on each run, disposing the
 * first ~80 ms later (CadView.jsx, `viewerBuiltForRef`). Counted at
 * `getContext`, the way the browser sees it.
 */
describeMobileAndDesktop('Containers/viewerInit', () => {
  beforeEach(async ({page}) => {
    await page.addInitScript(() => {
      const w = window as unknown as {__webglContexts: number}
      w.__webglContexts = 0
      const counted = new WeakSet<object>()
      // A Proxy, so the canvas arrives as an argument rather than `this`.
      HTMLCanvasElement.prototype.getContext = new Proxy(HTMLCanvasElement.prototype.getContext, {
        apply(target, canvas, args) {
          if (String(args[0]).startsWith('webgl') && !counted.has(canvas)) {
            counted.add(canvas)
            w.__webglContexts++
          }
          return Reflect.apply(target, canvas, args)
        },
      })
    })
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })


  test('a page load builds one viewer and one WebGL context', async ({page}) => {
    await page.goto('/share/v/p/index.ifc')
    await waitForModelReady(page)
    expect(await page.evaluate(() => (window as unknown as {__webglContexts: number}).__webglContexts)).toBe(1)
  })
})
