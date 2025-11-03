import {expect, test} from '@playwright/test'
import {
  homepageSetup,
  visitHomepageWaitForModel,
} from '../../tests/e2e/utils'
import {expectScreen} from '../../tests/screens'


const {beforeEach, describe} = test

/**
 * Tests for OnboardingOverlay display behavior.
 * Tests that the onboarding overlay appears after About dialog for first-time users.
 *
 * @see https://github.com/bldrs-ai/Share/issues/TBD
 */
describe('OnboardingOverlay', () => {
  describe('First time user visits homepage', () => {
    beforeEach(async ({page}) => {
      await homepageSetup(page)
      await visitHomepageWaitForModel(page)
    })

    test('About dialog is displayed first, then OnboardingOverlay after closing - Screen', async ({page}) => {
      // First, verify that About dialog is displayed for first-time users
      const aboutDialog = page.getByRole('dialog')
      await expect(aboutDialog).toBeVisible()

      // Close the About dialog using the OK button
      const okButton = page.getByTestId('button-dialog-main-action')
      await okButton.click()

      // Wait for About dialog to close
      await expect(aboutDialog).toBeHidden()

      // Wait for onboarding overlay to appear (small delay in component)
      const onboardingOverlay = page.getByTestId('onboarding-overlay')
      await expect(onboardingOverlay).toBeVisible({timeout: 5000})

      // Verify the overlay content is displayed
      await expect(page.getByText('Drag and drop models into page to open')).toBeVisible()
      await expect(page.getByText('Click anywhere to continue')).toBeVisible()

      // Take snapshot
      await expectScreen(page, 'OnboardingOverlay-after-about.png')
    })
  })
})

