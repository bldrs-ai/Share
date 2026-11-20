import {BrowserContext, Page, expect, test} from '@playwright/test'
import {SCRIPT} from '../../assist/openrouterSse.fixture'
import {AI_RELAY_PATH} from '../../__mocks__/api-handlers-openrouter'
import type {MockAiRelay} from '../../__mocks__/api-handlers-openrouter'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, pauseViewerRendering, setIsReturningUser} from '../../tests/e2e/utils'


/**
 * A hosted turn refused for credits with a time they come back (`resumeAt`)
 * waits in the panel and sends itself then (assist-310, assistForward.js),
 * through MSW's stand-in for the relay (src/__mocks__/api-handlers-openrouter.ts):
 * `window.__mockAiRelay = {exhausted, resumeAt}` refuses with the real
 * relay's 402 and its `resumeAt` until that time, then serves again, as the
 * relay does when its window turns over.
 *
 * The turn is stored and forwarded through the session log in localStorage
 * (assistLog.js), so it also survives a reload, and two tabs on one model
 * send it once between them.
 *
 * Real time, not `page.clock`: the reply streams through MSW's timers, which
 * a paused clock would stall. The waits are a few seconds plus the resend's
 * jitter (at most 4 s).
 */
const IFC_PATH = '/share/v/p/index.ifc?feature=assist'
const PAUSED = /^Paused: today's AI credits are used up\. Resumes at \d{1,2}:\d{2}\s(AM|PM)\.$/
const SLOW_TEST_MS = 90000
const JITTER_MAX_MS = 4000
// How far ahead each test's resumeAt is: long enough to see the pause (and,
// for the reload and the second tab, to load the model again) first.
const RESUME_IN_MS = 4000
const CANCEL_RESUME_IN_MS = 2000
const RELOAD_RESUME_IN_MS = 12000
const TWO_TAB_RESUME_IN_MS = 20000
// Past resumeAt and the jitter, how long a reply may take to stream in.
const REPLY_MS = 15000
const AFTER_MS = 1000


describeMobileAndDesktop('Assistant paused turn', () => {
  test.use({locale: 'en-US', timezoneId: 'America/Los_Angeles'})

  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await page.goto(IFC_PATH)
    await waitForModelReady(page)
    await pauseViewerRendering(page)
    await openAssistant(page)
  })

  test('a turn refused for credits waits, then sends itself at its time and the answer arrives', async ({page}) => {
    test.setTimeout(SLOW_TEST_MS)
    const posts = relayPosts(page)
    await setRelay(page, {exhausted: true, resumeAt: inMs(RESUME_IN_MS)})
    await send(page, 'hello there')
    await dismissCreditsDialog(page)

    const notice = page.getByTestId('BotChat-PausedText')
    await expect(notice).toHaveText(PAUSED)
    // Paused, not failed: no error bubble, the message stays, nothing answered yet.
    await expect(page.getByTestId('BotChat-Error')).toHaveCount(0)
    await expect(page.getByTestId('BotChat-Messages').getByText('hello there')).toBeVisible()
    await expect(page.getByText(SCRIPT.fallback)).toHaveCount(0)
    expect(posts).toHaveLength(1)
    // The tier's way out sits beside it; the meter shows the wall.
    await expect(page.getByTestId('BotChat-PausedAction')).toHaveText('Sign in')
    await expect(page.getByTestId('BotChat-CreditsMeter')).toHaveAttribute('data-state', 'exhausted')

    await expect(page.getByText(SCRIPT.fallback)).toHaveCount(1, {timeout: RESUME_IN_MS + JITTER_MAX_MS + REPLY_MS})
    await expect(page.getByTestId('BotChat-Paused')).toHaveCount(0)
    // Sent once more, and only once.
    expect(posts).toHaveLength(2)
    await expect(page.getByTestId('BotChat-Messages').getByText('hello there')).toHaveCount(1)
  })

  test('Cancel drops the queued turn and puts its text back in the input', async ({page}) => {
    test.setTimeout(SLOW_TEST_MS)
    const posts = relayPosts(page)
    await setRelay(page, {exhausted: true, resumeAt: inMs(CANCEL_RESUME_IN_MS)})
    await send(page, 'count the doors please')
    await dismissCreditsDialog(page)
    await expect(page.getByTestId('BotChat-PausedText')).toHaveText(PAUSED)

    await page.getByTestId('BotChat-PausedCancel').click()
    await expect(page.getByTestId('BotChat-Paused')).toHaveCount(0)
    await expect(page.getByRole('textbox', {name: 'Message the assistant'})).toHaveValue('count the doors please')
    await expect(page.getByTestId('BotChat-Messages').getByText('count the doors please')).toHaveCount(0)
    // Its time comes and goes: nothing is sent.
    await page.waitForTimeout(CANCEL_RESUME_IN_MS + JITTER_MAX_MS + AFTER_MS)
    expect(posts).toHaveLength(1)
    await expect(page.getByText(SCRIPT.fallback)).toHaveCount(0)
  })

  test('a paused turn survives a reload, and is sent once after it, at its time', async ({page, context}) => {
    test.setTimeout(SLOW_TEST_MS)
    const relay = {exhausted: true, resumeAt: inMs(RELOAD_RESUME_IN_MS)}
    // The relay keeps refusing until resumeAt on the reloaded page too.
    await setRelayOnEveryPage(context, relay)
    await setRelay(page, relay)
    await send(page, 'hello there')
    await dismissCreditsDialog(page)
    await expect(page.getByTestId('BotChat-PausedText')).toHaveText(PAUSED)

    await page.reload()
    await waitForModelReady(page)
    await pauseViewerRendering(page)
    const posts = relayPosts(page)
    await openAssistant(page)
    // Restored from the log: the message and its wait, no dialog again.
    await expect(page.getByTestId('BotChat-PausedText')).toHaveText(PAUSED)
    await expect(page.getByTestId('BotChat-Messages').getByText('hello there')).toBeVisible()
    await expect(page.getByTestId('dialog-ai-credits')).toHaveCount(0)
    expect(posts).toHaveLength(0)

    await expect(page.getByText(SCRIPT.fallback)).toHaveCount(1, {timeout: RELOAD_RESUME_IN_MS + JITTER_MAX_MS + REPLY_MS})
    await expect(page.getByTestId('BotChat-Paused')).toHaveCount(0)
    expect(posts).toHaveLength(1)
  })

  test('two tabs on one model send the paused turn once between them', async ({page, context}) => {
    test.setTimeout(SLOW_TEST_MS)
    const relay = {exhausted: true, resumeAt: inMs(TWO_TAB_RESUME_IN_MS)}
    await setRelayOnEveryPage(context, relay)
    await setRelay(page, relay)
    const posts = relayPosts(page)
    await send(page, 'hello there')
    await dismissCreditsDialog(page)
    await expect(page.getByTestId('BotChat-PausedText')).toHaveText(PAUSED)

    const second = await context.newPage()
    const secondPosts = relayPosts(second)
    await second.goto(IFC_PATH)
    await waitForModelReady(second)
    await pauseViewerRendering(second)
    await openAssistant(second)
    // The second tab finds the same paused turn in the log.
    await expect(second.getByTestId('BotChat-PausedText')).toHaveText(PAUSED)

    // Both tabs' timers fire; one sends, and the other says so.
    const answers = async () => await page.getByText(SCRIPT.fallback).count() +
      await second.getByText(SCRIPT.fallback).count()
    await expect.poll(answers, {timeout: TWO_TAB_RESUME_IN_MS + JITTER_MAX_MS + REPLY_MS}).toBe(1)
    await expect.poll(async () => await page.getByText('This message was sent from another tab.').count() +
      await second.getByText('This message was sent from another tab.').count()).toBe(1)
    // One refusal and one forward, across both tabs.
    expect(posts.length + secondPosts.length).toBe(2)
    await expect(page.getByTestId('BotChat-Paused')).toHaveCount(0)
    await expect(second.getByTestId('BotChat-Paused')).toHaveCount(0)
  })
})


/**
 * @param ms from now
 * @return an ISO instant
 */
function inMs(ms: number): string {
  return new Date(Date.now() + ms).toISOString()
}


/**
 * @param page
 * @return the relay POSTs this page makes from now on (a live array)
 */
function relayPosts(page: Page): string[] {
  const posts: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === AI_RELAY_PATH) {
      posts.push(request.url())
    }
  })
  return posts
}


/**
 * @param page
 * @param relay what the mock relay reports from the next request on
 */
async function setRelay(page: Page, relay: MockAiRelay) {
  await page.evaluate((r) => {
    (window as unknown as {__mockAiRelay?: unknown}).__mockAiRelay = r
  }, relay)
}


/**
 * @param context
 * @param relay what the mock relay reports on every page loaded from now on
 */
async function setRelayOnEveryPage(context: BrowserContext, relay: MockAiRelay) {
  await context.addInitScript((r) => {
    (window as unknown as {__mockAiRelay?: unknown}).__mockAiRelay = r
  }, relay)
}


/** @param page */
async function openAssistant(page: Page) {
  if (!await page.getByTestId('BotChat').isVisible()) {
    await page.getByTestId('control-button-ai-assistant').click()
  }
  await expect(page.getByTestId('BotChat')).toBeVisible()
}


/**
 * @param page
 * @param text the message
 */
async function send(page: Page, text: string) {
  await page.getByRole('textbox', {name: 'Message the assistant'}).fill(text)
  await page.keyboard.press('Enter')
}


/**
 * The upsell opens with each refusal, as before the pause (CreditsMeter.spec.ts).
 *
 * @param page
 */
async function dismissCreditsDialog(page: Page) {
  const dialog = page.getByTestId('dialog-ai-credits')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', {name: 'Not now'}).click()
  await expect(dialog).toHaveCount(0)
}
