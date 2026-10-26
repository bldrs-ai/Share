import {readFileSync} from 'fs'
import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {waitForModelReady} from '../tests/e2e/models'
import {homepageSetup, returningUserVisitsHomepageWaitForModel} from '../tests/e2e/utils'


const DROPPED_FILE = 'public/index.ifc'
const LOCAL_ONLY_URL = /\/share\/v\/local-only\/[0-9a-f-]{36}\.ifc/


type GaEvent = {name: string, params: Record<string, unknown>}


/**
 * GA events as gtag queued them. index.html's inline
 * `gtag(){dataLayer.push(arguments)}` runs even with the GA loader skipped in
 * tests, so every gtagEvent lands in window.dataLayer (as
 * realModelOpen.spec.ts reads real_model_open).
 *
 * @param page Playwright page
 * @param name GA event name
 * @return Matching events, params made serializable
 */
async function gaEvents(page: Page, name: string): Promise<GaEvent[]> {
  return await page.evaluate((eventName) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataLayer: any[] = (window as any).dataLayer || []
    return dataLayer
      .filter((entry) => entry?.[0] === 'event' && entry?.[1] === eventName)
      .map((entry) => ({name: String(entry[1]), params: JSON.parse(JSON.stringify(entry[2] ?? {}))}))
  }, name)
}


/**
 * Drop DROPPED_FILE on the viewer the way a user's drag would, through
 * ViewerContainer's dropzone (as localFilesUnmetered.spec.ts does).
 *
 * @param page Playwright page
 */
async function dropLocalFile(page: Page) {
  const bytes = [...readFileSync(DROPPED_FILE)]
  await page.evaluate((bytesArg) => {
    const dropzone = document.querySelector('[data-testid="cadview-dropzone"]')
    if (!dropzone) {
      throw new Error('Drop target not found')
    }
    const dt = new DataTransfer()
    dt.items.add(new File([new Uint8Array(bytesArg)], 'index.ifc'))
    dropzone.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: dt}))
  }, bytes)
}


/**
 * The normalized model_view event (design/new/quotas.md §"Analytics:
 * normalized tier events") rides beside real_model_open on every real open.
 * A signed-out user dropping a file from their computer is the cell
 * {tier: 'anon', source: 'local', route_kind: 'local', gate: 'none'}.
 *
 * The drop navigates to the upload's /v/local-only/ route, a full page load,
 * so the dataLayer read afterwards holds only that load's events, and the
 * homepage demo before it never sends either event (isRealModelOpen).
 * `open_cid` is absent here, as for real_model_open: GA has no client id on
 * localhost under automation; privacy/analytics.test.js pins its attachment.
 */
describeMobileAndDesktop('model_view GA event', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await returningUserVisitsHomepageWaitForModel(page, {pauseRenderer: true})
  })

  test('a signed-out local open sends model_view {anon, local}, once, beside real_model_open', async ({page}) => {
    const before = page.url()
    await dropLocalFile(page)
    await page.waitForURL((url) => url.href !== before && LOCAL_ONLY_URL.test(url.pathname))
    await waitForModelReady(page)

    await expect.poll(() => gaEvents(page, 'model_view')).toHaveLength(1)
    const [view] = await gaEvents(page, 'model_view')
    expect(view.params).toEqual({tier: 'anon', gate: 'none', source: 'local', route_kind: 'local'})
    // Beside the legacy event, not instead of it.
    expect(await gaEvents(page, 'real_model_open')).toHaveLength(1)
  })
})
