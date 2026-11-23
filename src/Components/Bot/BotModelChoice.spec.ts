import {Page, expect, test} from '@playwright/test'
import {SCRIPT} from '../../assist/openrouterSse.fixture'
import type {MockAiRelay} from '../../__mocks__/api-handlers-openrouter'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {
  auth0Login,
  homepageSetup,
  pauseViewerRendering,
  setIsReturningUser,
  setupAuthenticationIntercepts,
} from '../../tests/e2e/utils'


/**
 * Choosing which model answers (assist-310, #1934), against MSW's stand-in
 * for the hosted relay (src/__mocks__/api-handlers-openrouter.ts). The mock
 * answers `GET ?catalogue` in the real route's shape and, like the relay,
 * refuses a model the caller's tier can't use, so a wrong id fails the turn
 * as well as the assertion on what was sent. What these read is the relay
 * request itself: the `model` the browser asked for.
 *
 * The ids are restated, not imported: a spec takes types only from
 * src/__mocks__ (#2255), and these are the wire values the relay knows
 * (netlify/functions/_lib/aiModels.js FREE_MODELS_ALIAS, the mock catalogue's
 * Pro model).
 */
const IFC_PATH = '/share/v/p/index.ifc?feature=assist'
const FREE_MODELS_ALIAS = 'bldrs/free'
const DEFAULT_MODEL = 'qwen/qwen3.7-flash'
const PRO_MODEL = {id: 'x-ai/grok-4.7', name: 'SpaceXSI: Grok 4.7', price: '$4.00 / $12.00 per M tokens'}
const RELAY_PATH = '/.netlify/functions/ai-chat'


describeMobileAndDesktop('Assistant model choice', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('signed out, turning on free models sends the free alias, and the choice survives a reload', async ({page}) => {
    await openViewer(page)
    const sent = watchRelayModels(page)
    await openAssistant(page)
    await page.getByTestId('BotSettings-OpenButton').click()
    // No Pro menu for a signed-out user: the default, the switch, and a hint.
    await expect(page.getByRole('combobox', {name: 'Model'})).toHaveCount(0)
    await expect(page.getByTestId('BotSettings-ProHint')).toContainText('Pro adds a choice of models.')
    const toggle = page.getByRole('checkbox', {name: 'Free models (experimental)'})
    await expect(page.locator('#bot-free-models-note')).toContainText('may be rate-limited')
    await expect(page.locator('#bot-free-models-note')).toContainText('may log or train on prompts')
    await toggle.check()
    await page.getByTestId('BotSettings-OkButton').click()

    await sendAndWaitForReply(page, 'hello there')
    expect(sent).toEqual([FREE_MODELS_ALIAS])

    await page.reload({waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    await pauseViewerRendering(page)
    await openAssistant(page)
    await page.getByTestId('BotSettings-OpenButton').click()
    await expect(page.getByRole('checkbox', {name: 'Free models (experimental)'})).toBeChecked()
  })

  test('a Pro user picks a model from the menu, and the next turn asks for it', async ({page}) => {
    await setupAuthenticationIntercepts(page)
    await openViewer(page)
    await auth0Login(page)
    await page.evaluate(() => {
      const w = window as unknown as {store?: {getState: () => {setAppMetadata: (m: object) => void}}}
      if (!w.store) {
        throw new Error('Zustand store not on window: test build flag missing')
      }
      w.store.getState().setAppMetadata({subscriptionStatus: 'sharePro'})
    })
    // The mock relay serves the catalogue model to Pro only, as the relay does.
    await setRelay(page, {tier: 'pro'})
    const sent = watchRelayModels(page)
    await openAssistant(page)

    await sendAndWaitForReply(page, 'hello there')
    expect(sent).toEqual([DEFAULT_MODEL])

    await page.getByTestId('BotSettings-OpenButton').click()
    await page.getByRole('combobox', {name: 'Model'}).click()
    const option = page.getByRole('option', {name: new RegExp(PRO_MODEL.name)})
    await expect(option).toContainText(PRO_MODEL.price)
    await option.click()
    await expect(page.getByRole('combobox', {name: 'Model'})).toContainText(PRO_MODEL.name)
    await page.getByTestId('BotSettings-OkButton').click()

    await sendAndWaitForReply(page, 'hello again', 2)
    expect(sent).toEqual([DEFAULT_MODEL, PRO_MODEL.id])
    await expect(page.getByTestId('BotChat-Error')).toHaveCount(0)
  })
})


/** @param page */
async function openViewer(page: Page) {
  await page.goto(IFC_PATH)
  await waitForModelReady(page)
  await pauseViewerRendering(page)
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
 * @return the `model` of every chat request to the relay, as it is made
 */
function watchRelayModels(page: Page): string[] {
  const models: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === RELAY_PATH) {
      models.push((request.postDataJSON() as {model: string}).model)
    }
  })
  return models
}


/**
 * @param page
 * @param knob what the mock relay reports next
 */
async function setRelay(page: Page, knob: MockAiRelay) {
  await page.evaluate((value) => {
    (window as unknown as {__mockAiRelay?: MockAiRelay}).__mockAiRelay = value
  }, knob)
}


/**
 * @param page
 * @param text
 * @param replies how many fallback replies the chat shows once this one is in
 */
async function sendAndWaitForReply(page: Page, text: string, replies = 1) {
  await page.getByRole('textbox', {name: 'Message the assistant'}).fill(text)
  await page.keyboard.press('Enter')
  await expect(page.getByText(SCRIPT.fallback)).toHaveCount(replies)
}
