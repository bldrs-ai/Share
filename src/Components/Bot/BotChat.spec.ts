import {Page, expect, test} from '@playwright/test'
import {SCRIPT} from '../../assist/openrouterSse.fixture'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {
  homepageSetup,
  pauseViewerRendering,
  returningUserVisitsHomepageWaitForModel,
  setIsReturningUser,
  waitForModel,
} from '../../tests/e2e/utils'


/**
 * The assistant panel driving the viewer (#1675). The model is MSW's
 * scripted OpenRouter stream (src/__mocks__/api-handlers-openrouter.ts):
 * for the select prompt it calls `model.query` for the proxies, then
 * `view.select` on the refs the REAL registry returned, then answers with
 * the count the select reported. So the selection these tests see in the
 * NavTree is the one the loop made, through the same tools a user's
 * session would use. Real openrouter.ai is blocked by the network guard
 * (homepageSetup) and refused by MSW.
 *
 * `index.ifc` is the Bldrs logo: seven `Together` IfcBuildingElementProxy
 * elements under Build / Every / Thing.
 */
const IFC_PATH = '/share/v/p/index.ifc?feature=assist'
const PROXY_LABEL = 'Together'
const PROXY_COUNT = 7
const DUMMY_KEY = 'sk-or-v1-playwright-dummy'
const {describe} = test


describeMobileAndDesktop('Assistant', (ff) => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await page.goto(IFC_PATH)
    await waitForModelReady(page)
    // These tests read the tree and the panel, not pixels.
    await pauseViewerRendering(page)
  })

  test('answers as it streams, selects through the tools, and Undo restores the selection', async ({page}) => {
    const realProviderRequests = watchRealProvider(page)
    // The user's own selection first, so Undo has something to restore.
    const tree = await openTree(page)
    await tree.locator(`[data-node-label="${PROXY_LABEL}"]`).first().click()
    await expect(tree.locator('[data-is-selected="true"]')).toHaveCount(1)
    await closeTreeOnPhone(page, ff.isMobile)

    await openAssistant(page)
    await enterKey(page)
    await page.getByRole('textbox', {name: 'Message the assistant'}).fill(SCRIPT.selectPrompt)
    await page.keyboard.press('Enter')

    // The reply streams in, around the actions it took.
    await expect(page.getByText(SCRIPT.preamble.trim())).toBeVisible()
    await expect(page.getByText(SCRIPT.selectedAnswer(PROXY_COUNT))).toBeVisible()
    // Each action's line is the tool's own report, not the model's.
    const actions = page.getByTestId('BotChat-Action')
    await expect(actions).toHaveCount(2)
    await expect(actions.nth(0)).toHaveText(`Found ${PROXY_COUNT} elements`)
    await expect(actions.nth(1)).toContainText(`Selected ${PROXY_COUNT} elements`)

    // The selection is in the tree: every proxy.
    let panel = await openTree(page)
    await expect(panel.locator('[data-is-selected="true"]')).toHaveCount(PROXY_COUNT)
    await closeTreeOnPhone(page, ff.isMobile)

    // Undo, by keyboard: the user's one-row selection is back.
    await showAssistant(page)
    const undo = page.getByRole('button', {name: `Undo: Selected ${PROXY_COUNT} elements`})
    await undo.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('BotChat-Undone')).toHaveText('Undone')
    await expect(undo).toHaveCount(0)
    panel = await openTree(page)
    await expect(panel.locator('[data-is-selected="true"]')).toHaveCount(1)
    await expect(panel.locator('[data-is-selected="true"]')).toHaveAttribute('data-node-label', PROXY_LABEL)

    expect(realProviderRequests).toEqual([])
  })

  test('Stop ends a reply mid-stream', async ({page}) => {
    await openAssistant(page)
    await enterKey(page)
    await page.getByRole('textbox', {name: 'Message the assistant'}).fill(SCRIPT.longPrompt)
    await page.getByRole('button', {name: 'Send'}).click()

    const reply = page.getByTestId('BotChat-Reply')
    await expect(reply).toContainText(SCRIPT.longWord.trim())
    await page.getByRole('button', {name: 'Stop the reply'}).click()
    await expect(page.getByText('Stopped.')).toBeVisible()
    await expect(page.getByRole('button', {name: 'Send'})).toBeVisible()
    // The reply stopped growing, well short of the whole story.
    const stopped = await reply.textContent() ?? ''
    expect(stopped.length).toBeLessThan(SCRIPT.longWord.repeat(SCRIPT.longWords).trim().length)
    await page.waitForTimeout(SCRIPT.longDelayMs * 5)
    expect(await reply.textContent()).toBe(stopped)
  })
})


describe('Assistant flag', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
  })

  test('is off by default; ?feature=assist and the old ?feature=bot both show it', async ({page}) => {
    await returningUserVisitsHomepageWaitForModel(page, {pauseRenderer: true})
    await expect(page.getByTestId('control-button-ai-assistant')).toHaveCount(0)

    for (const flag of ['assist', 'bot']) {
      await page.goto(`/share/v/p/index.ifc?feature=${flag}`, {waitUntil: 'domcontentloaded'})
      await waitForModel(page, {pauseRenderer: true})
      await expect(page.getByTestId('control-button-ai-assistant')).toBeVisible()
      await expect(page.getByTestId('BotChat')).not.toBeVisible()
    }
  })
})


/**
 * @param page
 * @return the URLs of every request to the real provider (the guard aborts them; none should be made)
 */
function watchRealProvider(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'openrouter.ai') {
      urls.push(request.url())
    }
  })
  return urls
}


/** @param page */
async function openAssistant(page: Page) {
  await page.getByTestId('control-button-ai-assistant').click()
  await expect(page.getByTestId('BotChat')).toBeVisible()
}


/**
 * Bring the assistant panel back after the tree covered it (on a phone the
 * panels are tabs of one drawer).
 *
 * @param page
 */
async function showAssistant(page: Page) {
  if (!await page.getByTestId('BotChat').isVisible()) {
    await page.getByRole('tab', {name: /AI Assistant/}).click()
  }
  await expect(page.getByTestId('BotChat')).toBeVisible()
}


/** @param page */
async function enterKey(page: Page) {
  await page.getByTestId('BotSettings-OpenButton').click()
  await page.getByLabel('Open Router API Key').fill(DUMMY_KEY)
  await page.getByTestId('BotSettings-OkButton').click()
  await expect(page.getByTestId('BotSettings')).not.toBeVisible()
}


/**
 * Open the NavTree and expand it down to the proxies.
 *
 * @param page
 * @return the panel
 */
async function openTree(page: Page) {
  const panel = page.getByTestId('NavTreePanel')
  if (!await panel.isVisible()) {
    const tab = page.getByRole('tab', {name: /Navigation/})
    if (await tab.count() > 0) {
      await tab.click()
    } else {
      await page.getByTestId('control-button-navigation').click()
    }
  }
  await expect(panel).toBeVisible()
  for (const label of ['Bldrs', 'Build', 'Every', 'Thing']) {
    const row = panel.locator(`[data-node-label="${label}"]`).first()
    if (await row.getAttribute('data-is-expanded') === 'false') {
      await row.getByTestId('NavTreeNodeToggle').click()
    }
  }
  await expect(panel.locator(`[data-node-label="${PROXY_LABEL}"]`)).toHaveCount(PROXY_COUNT)
  return panel
}


/**
 * On a phone the tree's drawer covers the rest; on a desktop it stays open
 * beside the assistant.
 *
 * @param page
 * @param isMobile the form factor's
 */
async function closeTreeOnPhone(page: Page, isMobile: boolean) {
  if (isMobile && await page.getByTestId('NavTreePanel').isVisible()) {
    await page.getByTestId('control-button-navigation').click()
    await expect(page.getByTestId('NavTreePanel')).not.toBeVisible()
  }
}
