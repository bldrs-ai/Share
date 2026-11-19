import {Page, expect, test} from '@playwright/test'
import {SCRIPT} from '../../assist/openrouterSse.fixture'
import type {MockAiRelay} from '../../__mocks__/api-handlers-openrouter'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, pauseViewerRendering, setIsReturningUser} from '../../tests/e2e/utils'


/**
 * The hosted assistant's credits meter and out-of-credits dialog
 * (assist-310, #1933), against MSW's stand-in for the relay
 * (src/__mocks__/api-handlers-openrouter.ts). A spec steers what the relay
 * reports next through `window.__mockAiRelay`, the way the quota specs steer
 * record-load: the headers it sets are the real relay's
 * (netlify/functions/ai-chat.js metaHeaders), and its refusal is the real
 * 402 `ai_credits_exhausted` (replay scenario credits-exhausted.json). The
 * numbers are micro-USD, as on the wire; the user is shown only a share.
 */
const IFC_PATH = '/share/v/p/index.ifc?feature=assist'
const LIMIT = 20000
const LOW_USED = 17000


type FunnelEvent = {name: string, params: Record<string, unknown>}


describeMobileAndDesktop('Assistant credits', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await page.goto(IFC_PATH)
    await waitForModelReady(page)
    await pauseViewerRendering(page)
    await page.getByTestId('control-button-ai-assistant').click()
    await expect(page.getByTestId('BotChat')).toBeVisible()
  })

  test('the meter appears with the first reply and follows each one: normal, then low', async ({page}) => {
    await expect(page.getByTestId('BotChat-CreditsMeter')).toHaveCount(0)

    await setRelay(page, {used: 0, limit: LIMIT})
    await sendAndWaitForReply(page, 'hello there', 1)
    const meter = page.getByTestId('BotChat-CreditsMeter')
    await expect(meter).toHaveAttribute('data-state', 'normal')
    await expect(meter).toContainText('0% of today\'s AI credits used')
    // Credits, not money, for a signed-out user.
    await expect(meter).not.toContainText('$')

    await setRelay(page, {used: LOW_USED, limit: LIMIT})
    await sendAndWaitForReply(page, 'hello again', 2)
    await expect(meter).toHaveAttribute('data-state', 'low')
    await expect(meter).toContainText('85% of today\'s AI credits used')
    await expect(meter.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '85')
  })

  test('out of credits, signed out: the dialog says sign in, once counted, and Sign in opens login', async ({page}) => {
    await setRelay(page, {used: LIMIT - 10, limit: LIMIT, exhausted: true})
    await send(page, 'hello there')

    const dialog = page.getByTestId('dialog-ai-credits')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Out of assistant credits for today')
    await expect(dialog).toContainText('Sign in for more')
    // The panel keeps its own record of it, and the meter shows the wall.
    await expect(page.getByTestId('BotChat-Error')).toContainText('Sign in for more')
    await expect(page.getByTestId('BotChat-CreditsMeter')).toHaveAttribute('data-state', 'exhausted')

    // One wall, one event: the dialog's, not a second from the panel.
    await expect.poll(() => funnelEvents(page, 'quota_limit_reached')).toHaveLength(1)
    const [event] = await funnelEvents(page, 'quota_limit_reached')
    expect(event.params).toMatchObject({tier: 'anonymous', feature: 'ai_credits'})

    // Dismissed, the meter still offers the way out.
    await dialog.getByRole('button', {name: 'Not now'}).click()
    await expect(dialog).toHaveCount(0)
    await page.getByTestId('BotChat-CreditsMeterMore').click()
    await expect(dialog).toBeVisible()

    await dialog.getByTestId('button-quota-sign-in').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('login-with-github')).toBeVisible()
  })

  test('out of credits, free tier: the dialog offers Upgrade to Pro', async ({page}) => {
    await setRelay(page, {tier: 'free', used: LIMIT, limit: LIMIT, exhausted: true})
    await send(page, 'hello there')

    const dialog = page.getByTestId('dialog-ai-credits')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('last 30 days')
    await expect(dialog.getByTestId('button-quota-subscribe')).toHaveText('Upgrade to Pro')
    await expect(dialog.getByTestId('button-quota-sign-in')).toHaveCount(0)
    await expect.poll(() => funnelEvents(page, 'quota_limit_reached')).toHaveLength(1)
    expect((await funnelEvents(page, 'quota_limit_reached'))[0].params).toMatchObject({tier: 'free', feature: 'ai_credits'})
  })

  test('out of credits, Pro: the dialog only says to wait', async ({page}) => {
    await setRelay(page, {tier: 'pro', used: LIMIT, limit: LIMIT, exhausted: true})
    await send(page, 'hello there')

    const dialog = page.getByTestId('dialog-ai-credits')
    await expect(dialog).toContainText('They come back as the days roll on')
    await expect(dialog.getByTestId('button-quota-subscribe')).toHaveCount(0)
    await expect(dialog.getByTestId('button-quota-sign-in')).toHaveCount(0)
    await dialog.getByRole('button', {name: 'Close'}).click()
    await expect(dialog).toHaveCount(0)
    // Nothing to buy, so the meter has no button either.
    await expect(page.getByTestId('BotChat-CreditsMeter')).toHaveAttribute('data-state', 'exhausted')
    await expect(page.getByTestId('BotChat-CreditsMeterMore')).toHaveCount(0)
  })
})


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
 * @param page
 * @param text the message
 */
async function send(page: Page, text: string) {
  await page.getByRole('textbox', {name: 'Message the assistant'}).fill(text)
  await page.keyboard.press('Enter')
}


/**
 * @param page
 * @param text the message
 * @param replies how many fallback replies the chat should hold afterwards
 */
async function sendAndWaitForReply(page: Page, text: string, replies: number) {
  await send(page, text)
  await expect(page.getByText(SCRIPT.fallback)).toHaveCount(replies)
}


/**
 * Funnel events as gtag queued them (same reading as QuotaLimitDialog.spec.ts).
 *
 * @param page
 * @param name GA event name
 * @return matching events
 */
async function funnelEvents(page: Page, name: string): Promise<FunnelEvent[]> {
  return await page.evaluate((eventName) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataLayer: any[] = (window as any).dataLayer || []
    return dataLayer
      .filter((entry) => entry?.[0] === 'event' && entry?.[1] === eventName)
      .map((entry) => ({name: String(entry[1]), params: JSON.parse(JSON.stringify(entry[2] ?? {}))}))
  }, name)
}
