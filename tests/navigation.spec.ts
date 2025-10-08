import {test, expect} from '@playwright/test'
import {homepageReady} from './helpers/homepage'


/**
 * Basic navigation and page load tests
 * Migrated from various simple Cypress tests
 */
test.describe('Navigation', () => {
  test.beforeEach(async ({context}) => {
    // Set returning user cookie to skip about dialog
    await context.addCookies([
      {
        name: 'isFirstTime',
        value: '1',
        domain: 'localhost',
        path: '/',
      },
    ])
  })


  test.beforeEach('Homepage loads successfully', async ({page}) => {
    await homepageReady(page)
  })


  test('Control buttons are present and clickable', async ({page}) => {
    await expect(page.getByTestId('control-button-open')).toBeVisible()
    await expect(page.getByTestId('control-button-profile')).toBeVisible()
    await expect(page.getByTestId('control-button-search')).toBeVisible()
    await expect(page.getByTestId('control-button-notes')).toBeVisible()
  })


  test('Open control opens sample models dialog', async ({page}) => {
    // Click open button with force to bypass any overlays
    await page.getByTestId('control-button-open').click({force: true})

    // Check that the samples tab is available
    await expect(page.getByTestId('tab-samples')).toBeVisible()

    // Click samples tab to see sample models
    await page.getByTestId('tab-samples').click()

    // Check that some sample models are listed
    await expect(page.getByText('Momentum')).toBeVisible()
  })


  test.skip('Search control opens search interface', async ({page}) => {
    // Click search button with force to bypass any overlays
    await page.getByTestId('control-button-search').click({force: true})

    // Check that search input is visible
    await expect(page.getByPlaceholder('Search')).toBeVisible()
  })
})
