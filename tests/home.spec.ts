import {test, expect} from '@playwright/test'
import {homepageReady} from './helpers/homepage'


test.describe('Homepage', () => {
  test.beforeEach('Homepage loads successfully', async ({page}) => {
    await homepageReady(page)
  })


  test('homepage loads', async ({page}) => {
    // Check the title contains something
    await expect(page).toHaveTitle(/About — bldrs.ai/i)

    // Or check that a root element is visible
    await expect(page.getByText('Welcome to Bldrs - Share!')).toBeVisible()
  })
})
