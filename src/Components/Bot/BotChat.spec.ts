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
    await expect(page.getByRole('button', {name: 'chat'})).toHaveCount(0)

    await page.goto('/share/v/p/index.ifc?feature=bot', {waitUntil: 'domcontentloaded'})
    await waitForModel(page)
    await expect(page.getByRole('button', {name: 'chat'})).toBeVisible()
  })

  test('sends a message and captures the assistant response', async ({page}) => {
    await setIsReturningUser(page.context())
    await page.goto('/share/v/p/index.ifc?feature=bot', {waitUntil: 'domcontentloaded'})
    await waitForModel(page)

    const chatButton = page.getByRole('button', {name: 'chat'})
    await expect(chatButton).toBeVisible()
    await chatButton.click()

    await page.getByPlaceholder('Paste your OpenRouter API Key…').fill('test-key')
    await page.getByPlaceholder('Type a message…').fill('Hello from Playwright')
    await page.getByTestId('SendIcon').locator('..').click()

    await expect(page.getByText('Test received.')).toBeVisible()
    await expectScreen(page, 'BotChat-response.png')
  })
})

