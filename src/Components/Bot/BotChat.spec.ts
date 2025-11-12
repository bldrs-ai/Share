import {expect, test} from '@playwright/test'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  setIsReturningUser,
  waitForModel,
} from '../../tests/e2e/utils'
import {expectScreen} from '../../tests/screens'


const {beforeEach, describe} = test
describe('BotChat', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
  })

  test('feature flag toggles BotChat visibility', async ({page}) => {
    await returningUserVisitsHomepageWaitForModel(page)
    await expect(page.getByTestId('control-button-bot')).toHaveCount(0)

    await page.goto('/share/v/p/index.ifc?feature=bot', {waitUntil: 'domcontentloaded'})
    await waitForModel(page)
    await expect(page.getByTestId('control-button-bot')).toBeVisible()
    await expect(page.getByTestId('BotPanelContainer')).toBeVisible()
  })

  test('sends a message and captures the assistant response', async ({page}) => {
    await setIsReturningUser(page.context())
    await page.goto('/share/v/p/index.ifc?feature=bot', {waitUntil: 'domcontentloaded'})
    await waitForModel(page)

    await page.getByPlaceholder('Paste your OpenRouter API Key…').fill('test-key')
    await page.getByPlaceholder('Type a message…').fill('Hello from Playwright')
    await page.getByTestId('BotChat-SendButton').click()

    await expect(page.getByText('Test received.')).toBeVisible()
    await expectScreen(page, 'BotChat-response.png')
  })
})

