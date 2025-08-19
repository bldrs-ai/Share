import {test, expect} from '@playwright/test'


test('homepage loads', async ({page}) => {
  // Navigate to your app
  await page.goto('http://localhost:8080')

  // Check the title contains something
  await expect(page).toHaveTitle(/About — bldrs.ai/i)

  // Or check that a root element is visible
  await expect(page.getByText('Welcome to Bldrs - Share!')).toBeVisible()
})
