import {expect, test} from '@playwright/test'
import {clickGate} from '../../tests/e2e/export'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {gaEvents} from '../../tests/e2e/ga'
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {auth0Login, homepageSetup, setIsReturningUser, setupAuthenticationIntercepts} from '../../tests/e2e/utils'


/**
 * Share is gated for a model opened from the user's computer (#705).
 *
 * An upload is stored only in this browser's OPFS and served from
 * `/share/v/local-only/<id>`, so the link the Share dialog used to show opened
 * nowhere else. This walks the user's own path — Open › Local › Browse, then
 * Share — and checks the button explains itself instead of offering a link,
 * and that its action leads to the Open dialog (where GitHub and Google
 * Drive are). The hosted home model is checked first, so the gate is shown
 * to follow the upload rather than being on everywhere.
 */
// Any file the loader accepts; this one is small and already served.
const PICKED_FILE = 'public/index.ifc'
// A distinctive slice of ShareControl's MSG_LOCAL_SHARE_BODY, which the spec
// can't import (it would pull the app's module graph into the test runner).
const HELP_TEXT = 'a link to it won\'t open anywhere else'
// Two model loads (the home model, then the upload) in one test; the default
// 30s ran out on a loaded machine. Same budget as shareDisplay.spec.ts.
const TEST_TIMEOUT_MS = 90_000
// A local upload's content_id: its UUID-derived storage URL, with no file name.
const UPLOAD_CONTENT_ID = /^https?:\/\/[^/]+\/[0-9a-f-]{36}\.ifc$/


describeMobileAndDesktop('Share 110: a model opened from a local file', () => {
  test.beforeEach(async ({page, context}) => {
    await homepageSetup(page)
    await setIsReturningUser(context)
    await page.goto('/share/v/p/index.ifc', {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
  })

  test('gates Share with an explanation and offers to open a file', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    // Hosted model: the ordinary, ungated Share button.
    await expect(page.getByTestId('control-button-share')).toBeVisible()
    await expect(page.getByTestId('gated-share')).toHaveCount(0)

    await page.getByTestId('control-button-open').click()
    await page.getByRole('tab', {name: 'Local'}).click()
    const chooserEvent = page.waitForEvent('filechooser')
    await page.getByTestId('button_open_file').click()
    await (await chooserEvent).setFiles(PICKED_FILE)
    await expect(page).toHaveURL(/\/share\/v\/local-only\/.+\.ifc/)
    await waitForModelReady(page)

    await expect(page.getByTestId('gated-share')).toBeVisible()
    // aria-disabled makes Playwright's own actionability check refuse the
    // click, so this goes through the shared gate helper (checks
    // aria-disabled, waits for the gate to be still and hit-testable, then
    // clicks).
    await clickGate(page, 'gated-share')

    const help = page.getByTestId('gated-help')
    await expect(help.getByText('Local-only files can\'t be shared yet')).toBeVisible()
    await expect(help.getByText(HELP_TEXT, {exact: false})).toBeVisible()
    // No link, no QR: the dialog that would show the local URL never opened.
    await expect(page.getByTestId('textfield-link')).toHaveCount(0)
    await expect(page.getByTestId('img-qrcode')).toHaveCount(0)

    await page.getByTestId('gated-help-action').click()
    await expect(page.getByTestId('dialog-open-model-tabs-stack')).toBeVisible()
  })

  // Share#1981: the gate's normalized event names the upload that is on
  // screen, with the very id real_model_open sent when it loaded, so GA can
  // count distinct models from either event.
  test('the gate\'s model_share names the upload, as real_model_open does', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await page.getByTestId('control-button-open').click()
    await page.getByRole('tab', {name: 'Local'}).click()
    const chooserEvent = page.waitForEvent('filechooser')
    await page.getByTestId('button_open_file').click()
    await (await chooserEvent).setFiles(PICKED_FILE)
    await expect(page).toHaveURL(/\/share\/v\/local-only\/.+\.ifc/)
    await waitForModelReady(page)
    await clickGate(page, 'gated-share')
    await expect(page.getByTestId('gated-help')).toBeVisible()

    await expect.poll(async () => (await gaEvents(page, 'model_share')).length).toBe(1)
    const [share] = await gaEvents(page, 'model_share')
    expect(share.params).toMatchObject({gate: 'upsell', source: 'local', route_kind: 'local'})
    const opens = await gaEvents(page, 'real_model_open')
    expect(opens).toHaveLength(1)
    expect(opens[0].params.content_id).toMatch(UPLOAD_CONTENT_ID)
    expect(share.params.content_id).toBe(opens[0].params.content_id)
  })
})


// A hosted model that is not the home demo (the demo sends no
// real_model_open): the ordinary, ungated Share dialog.
const HOSTED_MODEL = '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/box.ifc'


describeMobileAndDesktop('Share: a hosted model\'s share event', () => {
  test.beforeEach(async ({page, context}) => {
    await homepageSetup(page)
    await setIsReturningUser(context)
  })

  // Share#1981: opening the dialog sends model_share {none} naming the model
  // on screen, with the id real_model_open sent for it.
  test('model_share carries the content_id real_model_open sent for the model', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await setupVirtualPathIntercept(page, HOSTED_MODEL, 'box.ifc')
    await page.goto(HOSTED_MODEL, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    await page.getByTestId('control-button-share').click()
    await expect(page.getByTestId('textfield-link')).toBeVisible()

    await expect.poll(async () => (await gaEvents(page, 'model_share')).length).toBe(1)
    const [share] = await gaEvents(page, 'model_share')
    expect(share.params).toMatchObject({gate: 'none', source: 'hosted', route_kind: 'github'})
    const opens = await gaEvents(page, 'real_model_open')
    expect(opens).toHaveLength(1)
    expect(opens[0].params.content_id).toContain('box.ifc')
    expect(share.params.content_id).toBe(opens[0].params.content_id)
  })

  // An in-page sign-in, then Share: the user's own path through the window
  // codex flagged on Share#1976 (round 3). The page settled signed out first,
  // so model_share must wait for the NEW session's settlement and read its
  // tier, `free` here (this build's mock JWT carries no claims), not `anon`.
  // It also guards BaseRoutes' half of the fix: if the signed-in pass stopped
  // recording which state it settled (store authResolvedFor), the event would
  // sit out the 60 s cap and this poll would time out. The race itself (an
  // action between Auth0 saying signed in and the claims landing) can't be
  // held open here: the mock Auth0 resolves the token in the same tick, so
  // it is pinned by BaseRoutes.test.jsx instead.
  test('after an in-page sign-in, model_share carries the new session\'s tier', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await setupVirtualPathIntercept(page, HOSTED_MODEL, 'box.ifc')
    await setupAuthenticationIntercepts(page)
    await page.goto(HOSTED_MODEL, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    await auth0Login(page)
    await page.getByTestId('control-button-share').click()
    await expect(page.getByTestId('textfield-link')).toBeVisible()

    await expect.poll(async () => (await gaEvents(page, 'model_share')).length).toBe(1)
    const [share] = await gaEvents(page, 'model_share')
    expect(share.params).toMatchObject({tier: 'free', gate: 'none', source: 'hosted', route_kind: 'github'})
  })
})
