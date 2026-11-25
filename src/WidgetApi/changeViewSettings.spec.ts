import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


/**
 * The Widget API's `ChangeViewSettings` after the `?view=` rules stack was
 * deleted (design/tracks/open-t200/layering.md §7, slice V): an embedder
 * that sends it still gets a success, and the model is not reloaded for it.
 *
 * Share runs in an iframe of a host page served at this origin, as an
 * embedder runs it, and the host speaks the Matrix widget protocol over
 * postMessage directly (matrix-widget-api's PostmessageTransport), so the
 * spec needs no fixture bundle. The skipped iframe suite
 * (Components/Apps/IframeIntegration.spec.ts, #1386) covers the rest of the
 * API through its own harness.
 */
const HOST_PATH = '/__widget-host.html'
const MODEL = '/share/v/p/index.ifc'
const WIDGET_ID = 'bldrs-share'
const MODEL_LOADED = 'ai.bldrs-share.ModelLoaded'
// How long a reload, had one been asked for, gets to show up.
const RELOAD_WINDOW_MS = 3000


/**
 * Serve a host page that embeds Share full-size and records every message
 * the widget posts to it.
 *
 * @param page
 */
async function openHost(page: Page) {
  await page.route(`**${HOST_PATH}`, (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><body style="margin:0">
      <script>
        window.widgetMessages = []
        window.addEventListener('message', (ev) => window.widgetMessages.push(ev.data))
      </script>
      <iframe id="share" src="${MODEL}" style="border:0;width:100vw;height:100vh"></iframe>
    </body></html>`,
  }))
  await page.goto(HOST_PATH)
}


/**
 * @param page
 * @param action
 * @return the widget's messages to the host with that action
 */
async function messagesWith(page: Page, action: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await page.evaluate((a) => (window as any).widgetMessages.filter((m: any) => m?.action === a), action)
}


describeMobileAndDesktop('Widget API: ChangeViewSettings', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('answers success, and does not reload the model', async ({page}) => {
    await openHost(page)
    await expect.poll(async () => (await messagesWith(page, MODEL_LOADED)).length, {timeout: 60_000}).toBe(1)
    // ModelLoaded fires when a load ends, so a slow reload could finish after
    // the window below; a load's start shows within milliseconds. Count
    // starts in Share's own store (exposed to specs as `window.store`).
    const share = page.frame({url: (url) => url.pathname === MODEL})
    if (share === null) {
      throw new Error('the Share iframe is not on the page')
    }
    await share.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      w.loadStarts = 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      w.store.subscribe((state: any, prev: any) => {
        if (state.isModelLoading && !prev.isModelLoading) {
          w.loadStarts++
        }
      })
    })

    await page.evaluate((widgetId) => {
      const frame = document.getElementById('share') as HTMLIFrameElement
      frame.contentWindow?.postMessage({
        api: 'toWidget',
        widgetId,
        requestId: 'view-settings-1',
        action: 'ai.bldrs-share.ChangeViewSettings',
        data: {customViewSettings: {defaultColor: {x: 0.5, y: 0.5, z: 0.5, w: 1}}},
      }, '*')
    }, WIDGET_ID)

    const replies = async () => (await messagesWith(page, 'ai.bldrs-share.ChangeViewSettings'))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((m: any) => m.requestId === 'view-settings-1' && m.response !== undefined)
    await expect.poll(async () => (await replies()).length).toBe(1)
    expect((await replies())[0].response).toEqual({error: false})

    // Before slice V the settings went to the store and CadView reloaded the
    // model for them, which a second ModelLoaded would show.
    await page.waitForTimeout(RELOAD_WINDOW_MS)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await share.evaluate(() => (window as any).loadStarts)).toBe(0)
    expect(await messagesWith(page, MODEL_LOADED)).toHaveLength(1)
  })
})
