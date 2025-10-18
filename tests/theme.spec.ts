import {test, expect} from '@playwright/test'


const THEME_TRANSITION_TIMEOUT = 500

/**
 * Migrated from cypress/e2e/profile-100/theme.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/1070
 */
test.describe('Theme Switching', () => {
  test.beforeEach(async ({page, context}) => {
    // Set returning user cookie to skip about dialog
    await context.addCookies([
      {
        name: 'isFirstTime',
        value: '1',
        domain: 'localhost',
        path: '/',
      },
    ])

    // Navigate to homepage and wait for main container
    await page.goto('/')

    // Wait for the main container to be visible
    await expect(page.locator('[data-testid="cadview-dropzone"]')).toBeVisible()
  })

  test('Profile menu can be opened', async ({page}) => {
    await page.goto('/')

    // Wait for model to be ready to avoid overlay issues
    await expect(page.locator('[data-testid="cadview-dropzone"][data-model-ready="true"]'))
      .toBeVisible({timeout: 5000})

    // Click profile control button with force to bypass overlays
    await page.getByTestId('control-button-profile').click({force: true})

    // Check that the theme toggle buttons are available
    await expect(page.getByTestId('change-theme-to-night')).toBeVisible()
  })

  test('Can access theme switching controls', async ({page}) => {
    await page.goto('/')

    // Wait for model to be ready to avoid overlay issues
    await expect(page.locator('[data-testid="cadview-dropzone"][data-model-ready="true"]'))
      .toBeVisible({timeout: 5000})

    // Click profile control button with force to bypass overlays
    await page.getByTestId('control-button-profile').click({force: true})

    // Verify both theme options are available
    const nightThemeButton = page.getByTestId('change-theme-to-night')
    await expect(nightThemeButton).toBeVisible()
    await expect(nightThemeButton).toContainText('Night')

    // Click night theme and check that day theme button appears
    await nightThemeButton.click({force: true})

    // Close and reopen profile menu to check theme switched
    await page.getByTestId('control-button-profile').click({force: true})
    await page.getByTestId('control-button-profile').click({force: true})

    // Now day theme button should be visible
    const dayThemeButton = page.getByTestId('change-theme-to-day')
    await expect(dayThemeButton).toBeVisible()
    await expect(dayThemeButton).toContainText('Day')
  })

  test('Theme switching changes background color', async ({page}) => {
    await page.goto('/')

    // Wait for model to be ready to avoid overlay issues
    await expect(page.locator('[data-testid="cadview-dropzone"][data-model-ready="true"]'))
      .toBeVisible({timeout: 5000})

    // Get initial background color
    const initialBgColor = await page.locator('body').evaluate((el) =>
      getComputedStyle(el).backgroundColor,
    )

    // Click profile control and switch to night theme
    await page.getByTestId('control-button-profile').click({force: true})
    await page.getByTestId('change-theme-to-night').click({force: true})

    // Wait a moment for theme to apply
    await page.waitForTimeout(THEME_TRANSITION_TIMEOUT)

    // Get background color after theme change
    const nightBgColor = await page.locator('body').evaluate((el) =>
      getComputedStyle(el).backgroundColor,
    )

    // Colors should be different
    expect(initialBgColor).not.toBe(nightBgColor)

    // Switch back to day theme
    await page.getByTestId('control-button-profile').click({force: true})
    await page.getByTestId('change-theme-to-day').click({force: true})

    // Wait a moment for theme to apply
    await page.waitForTimeout(THEME_TRANSITION_TIMEOUT)

    // Background should return to original color
    const finalBgColor = await page.locator('body').evaluate((el) =>
      getComputedStyle(el).backgroundColor,
    )

    expect(finalBgColor).toBe(initialBgColor)
  })
})
