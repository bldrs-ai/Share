import {test, expect} from '@playwright/test'
import {homepageSetup, returningUserVisitsHomepageWaitForModel} from './tests/e2e/utils'


test.describe('Homepage', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
  })

  test.describe('View model', () => {
    test.beforeEach(async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page)
    })

    test('about button is visible', async ({page}) => {
      // Or check that a root element is visible
      await expect(page.getByTestId('control-button-about')).toBeVisible()
    })
  })
})
