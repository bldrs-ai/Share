import {test, expect} from '@playwright/test'
import {homepageSetup, returningUserVisitsHomepageWaitForModel} from './tests/e2e/utils'


test.describe('Homepage', () => {
  test.beforeEach(async ({page, context}) => {
    await homepageSetup(page, context)
  })

  test.describe('View model', () => {
    test.beforeEach(async ({page, context}) => {
      await returningUserVisitsHomepageWaitForModel(page, context)
    })

    test('about button is visible', async ({page}) => {
      // Or check that a root element is visible
      await expect(page.getByTestId('control-button-about')).toBeVisible()
    })
  })
})
