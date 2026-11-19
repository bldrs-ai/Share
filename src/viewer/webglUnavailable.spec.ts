import {Page, Request, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


const {beforeEach} = test

const CAPABILITY_REPORT_PATH = '/.netlify/functions/client-capabilities'


/**
 * A browser where three gets no WebGL context (SHARE-1DZ, #659): no GPU,
 * hardware acceleration off, a blocklisted driver. three's WebGLRenderer
 * throws from its constructor, which used to take the whole app down into its
 * error boundary ("Oh no! We're not quite sure what went wrong"). Now CadView
 * shows a "3D view not available" notice in the viewer's place
 * (Components/WebglUnavailable.jsx) and sends one `webgl_unavailable`
 * client-capability report.
 *
 * The browser here has a GPU (or SwiftShader), so the spec takes WebGL away:
 * every `getContext('webgl…')` returns null, which is what three sees on such
 * a machine.
 */
describeMobileAndDesktop('viewer/webglUnavailable', () => {
  beforeEach(async ({page}) => {
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext
      // A method replacement has to forward its receiver; the overloads don't
      // admit a typed passthrough.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type: string, ...rest: any[]) {
        // eslint-disable-next-line no-invalid-this
        return type.startsWith('webgl') ? null : getContext.call(this, type, ...rest)
      } as typeof getContext
    })
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })


  test('explains, instead of crashing, and reports the capability once', async ({page}) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    const report = waitForCapabilityReport(page)

    await page.goto('/share/v/p/index.ifc')

    const notice = page.getByTestId('webgl-unavailable')
    await expect(notice.getByText('3D view not available')).toBeVisible()
    await expect(notice.getByText(/hardware acceleration/)).toBeVisible()
    await expect(page.getByText('not quite sure what went wrong')).toHaveCount(0)
    expect(JSON.parse((await report).postData() ?? '{}')).toEqual(expect.objectContaining({
      condition: 'webgl_unavailable', blocker: 'none',
    }))
    expect(pageErrors.filter((message) => /WebGL/.test(message))).toEqual([])
  })
})


/**
 * @param page
 * @return the next request to Share's capability function
 */
function waitForCapabilityReport(page: Page): Promise<Request> {
  return page.waitForRequest((request) => new URL(request.url()).pathname === CAPABILITY_REPORT_PATH)
}
