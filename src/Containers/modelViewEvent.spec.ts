import {readFileSync} from 'fs'
import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {gaEvents} from '../tests/e2e/ga'
import {waitForModelReady} from '../tests/e2e/models'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  setupAuthenticationIntercepts,
} from '../tests/e2e/utils'


const DROPPED_FILE = 'public/index.ifc'
const LOCAL_ONLY_URL = /\/share\/v\/local-only\/[0-9a-f-]{36}\.ifc/
// A local upload's content_id: its UUID-derived storage URL, with no file name.
const LOCAL_ONLY_FILE = /^https?:\/\/[^/]+\/[0-9a-f-]{36}\.ifc$/


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
    expect(view.params).toEqual({
      tier: 'anon', gate: 'none', source: 'local', route_kind: 'local', content_id: expect.stringMatching(LOCAL_ONLY_FILE),
    })
    // Beside the legacy event, not instead of it, and keyed to the same model
    // (Share#1981): the very value real_model_open sends, so GA counts one
    // model once across both. It is the upload's UUID-derived storage URL,
    // never the dropped file's own name.
    const opens = await gaEvents(page, 'real_model_open')
    expect(opens).toHaveLength(1)
    expect(opens[0].params.content_id).toMatch(LOCAL_ONLY_FILE)
    expect(view.params.content_id).toBe(opens[0].params.content_id)
  })
})


/**
 * A signed-in free user's local open is `free`, not `anon`, though a local
 * file loads without waiting for auth. model_view is sent once auth settles
 * (privacy/modelActionTracking.js). The race itself, a load finishing
 * before the session restores, doesn't happen here: this build's mock
 * Auth0 restores the session synchronously on the drop's page load. So the
 * race is pinned by modelActionTracking.test.js, and this is the happy path
 * end to end.
 */
describeMobileAndDesktop('model_view GA event, signed in', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setupAuthenticationIntercepts(page)
    await returningUserVisitsHomepageWaitForModel(page, {pauseRenderer: true})
    await auth0Login(page)
  })

  test('a signed-in free user\'s local open is model_view {free, local}', async ({page}) => {
    const before = page.url()
    await dropLocalFile(page)
    await page.waitForURL((url) => url.href !== before && LOCAL_ONLY_URL.test(url.pathname))
    await waitForModelReady(page)
    await expect(page.getByTestId('control-button-profile-icon-authenticated')).toBeVisible()

    await expect.poll(() => gaEvents(page, 'model_view')).toHaveLength(1)
    const [view] = await gaEvents(page, 'model_view')
    expect(view.params).toEqual({
      tier: 'free', gate: 'none', source: 'local', route_kind: 'local', content_id: expect.stringMatching(LOCAL_ONLY_FILE),
    })
  })
})
